# HPA-446 — Bun Workspace Monorepo Design

**Linear:** [HPA-446](https://linear.app/cwchanap/issue/HPA-446/convert-the-repo-to-a-bun-workspaces-monorepo-with-shared-tokens-and)
**Status:** Design contract, planning-only draft; prerequisite [HPA-444 / PR #85](https://github.com/cwchanap/cetus/pull/85) merged on 2026-10-19 (America/Vancouver). Implementation may now start after rebasing PR #91 onto current main.
**Delivery:** One HPA-446 PR from these planning documents through implementation. The ticket's two-PR suggestion is superseded; separate commits within this PR may isolate mechanical moves from configuration changes.

## Goal and success criteria

Make the existing 23-game Astro web app the first Bun workspace, retain identical web behavior and appearance, and establish only the shared token/config seams required by the later Expo migration. This is a repository layout change, **not** a game rewrite or mobile app bootstrap.

Success means all root commands work, web builds/tests/e2e remain green, styles and score/auth behavior are unchanged, the Vercel preview is validated against the new project root, and subsequent packages can be added without another root migration.

## Verified baseline (main after HPA-444, 2026-10-19 local)

- Root package is `cetus` using Bun **1.3.14** (also pinned in GitHub Actions; do not downgrade to 1.3.1, which caused frozen-lockfile drift in CI). `turbo.json` already exists; root `bun run dev` starts `db:dev` and `web:dev` with Turbo.
- Astro config, src, public, e2e, scripts, Better Auth migrations, CSS, test configs and shadcn `components.json` are all web-specific at repository root.
- `src/styles/global.css` is Tailwind **v4 CSS-first** and contains both generic shadcn vars and scoped `--cetus-*` tokens. The legacy `tailwind.config.js` declares font/animation/gradient utilities, but there is **no `@config` directive in the CSS** and Astro loads `@tailwindcss/vite` without referencing that file. Treat the JS config as inactive pending a production-build CSS check; **do not copy its otherwise inert declarations into live CSS**, which would change appearance.
- `src/styles/global.test.ts` and `src/styles/abyssal-shell.test.ts` parse CSS text and assert concrete theme values/selectors. They must be updated intentionally if token declarations move.
- `vitest.config.ts`, score-schema migration tests, and multiple other tests assume `process.cwd()` is the Astro project root. `playwright.config.ts` uses `e2e/` and localhost:4325; its `webServer.command` now starts with `bun run e2e:db:init`, then runs web/dev, and the new `scripts/init-e2e-db.ts` reads `scripts/init-db.sql` and writes `db/db.sqlite` relative to cwd.
- Root GitHub workflows run Bun 1.3.14 installation, lint, tests, build, Playwright, coverage upload and a legacy `sqlite3 db/db.sqlite < scripts/init-db.sql` step in E2E CI. The Playwright web server **also** runs the newer `e2e:db:init` script, which uses Better Auth `getMigrations()/runMigrations()` before game SQL and backfills contextual/platform columns before creating indexes. Prefer that existing canonical script after relocation rather than duplicating raw SQL initialization. `.github/dependabot.yml` uses the root Bun package ecosystem.
- `.prettierrc` includes Astro and TS 4-space overrides. `.husky/pre-commit` calls lint-staged.
- HPA-444/PR #85 is **merged**. Carry forward its `ScoreSubmitter` seam, platform metadata and `better-auth_migrations/2026-10-19-game-scores-platform.sql`, plus its new platform/score-schema tests. The portable-game ESLint file selector currently targets `src/lib/games/**/*.ts` from the web root, so preserve its matching scope after the move. `codecov.yml` has 90% project/patch gates and `scripts/**` exclusion; check the new web script path after relocating coverage reports.

## Proposed layout

```text
/
  package.json            # private Bun workspace root; CLI entry points
  bun.lock                # one lockfile
  turbo.json              # workspace task orchestration
  bunfig.toml             # [install] linker = "hoisted" (explicit install contract)
  eslint.config.js        # root/base lint for packages and repo files
  .prettierrc             # single shared formatter config
  .github/ .husky/ docs/  # repository-wide
  AGENTS.md CLAUDE.md     # repository-wide guidance
  apps/
    web/
      package.json        # @cetus/web, private
      src/ public/ e2e/ scripts/          # includes init-e2e-db.ts
      better-auth_migrations/              # includes dated platform migration
      astro.config.mjs
      vitest.config.ts playwright.config.ts
      tsconfig.json
      components.json env.d.ts
      eslint.config.js
      .env                 # untracked, local only
      db/                  # untracked local SQLite
  packages/
    tokens/
      package.json
      theme.css            # source of truth: hand-authored semantic CSS
      package.json         # exports ./theme.css
    config/
      package.json
      tsconfig.base.json
      eslint.base.mjs
```

Preserve history with `git mv`. Keep project-level docs, existing root `.prettierrc`, and the GitHub/Husky folders at root. Move web-only shadcn configuration, style tests, E2E tests, application scripts, env declarations and migration SQL with the app. **After confirming the compiled CSS does not use its utilities, delete the inactive root `tailwind.config.js` instead of moving it**; leave existing markup classes untouched and defer any styling correction to a separate task. Root `.env` is untracked: document how to move local values to `apps/web/.env`, but do not commit secrets.

## Workspace / command contract

- Root `package.json`: `private: true`, `workspaces: ["apps/*", "packages/*"]` and Bun **1.3.14**; one `bun.lock`. Add root `bunfig.toml` with `[install]` and `linker = "hoisted"` to pin today's dependency layout even if the lockfile is regenerated. Root contains orchestration/dev tools only; `@cetus/web` declares its runtime dependencies. Declare each directly imported package, particularly web's `astro-eslint-parser`, rather than relying on hoisted transitive dependencies; keep `prettier-plugin-astro` available to root `.prettierrc`.
- Root `bun run dev` launches web plus local Turso via Turbo persistent uncached tasks, retaining port 4325. Web's `web:dev` and `db:dev` execute with cwd `apps/web` so relative SQLite, CSS test fixtures and Astro imports resolve normally.
- Root `bun run build`, `typecheck`, `test:run`, `test:e2e` and `format:check` delegate appropriately to workspace tasks. **Keep root `lint` as `eslint .`**, which uses the nearest ESLint 10 flat config per file. Preserve convenient existing root aliases (for example `web:dev` and `db:dev`) where practical.
- Reuse Turbo already present rather than adding another orchestrator. Update `turbo.json` task outputs and Bun lockfile dependency; never cache long-running dev or e2e tasks.
- Keep `@/*` alias local to web, and resolve Astro, Vitest, Playwright and shadcn paths relative to the web package. Package-to-package imports use workspace names, not cross-workspace source aliases.
- No cross-package runtime dependency is introduced to game logic yet; that belongs to HPA-447.

## Token and configuration boundaries

**@cetus/tokens** is intentionally **CSS-only for now**: move existing stable default/abyssal `--cetus-*` semantic declarations and existing font-stack declarations verbatim into **hand-authored, committed** `packages/tokens/theme.css`. Export it from the package as `"exports": { "./theme.css": "./theme.css" }`; web imports it using `@import '@cetus/tokens/theme.css'`. This stylesheet is the **single source of truth**, so do not add `src/index.ts`, a CSS generator, generator-diff tests, or build-time bootstrap. CSS expressions such as `var(...)`, gradients and animation shorthands are not portable React Native design-token values; create a TS/native mapping **only when the first native consumer exists** (HPA-447/HPA-379), using its actual requirements. There is no need to maintain duplicate CSS and TS representations today.

Keep generic shadcn `--background`/`--radius`, **already-active** CSS animations, HUD selectors and component styles in web CSS. Do not import dormant `tailwind.config.js` definitions or reactivate its legacy `.font-orbitron`, `.animate-float` or radial-gradient utilities. Do not migrate every color, shadow, gradient or one-off class just to enlarge the token package. Preserve scoped selector order (default, dark, abyssal), specificity, inheritance and CSS semantics, including `.dark` on `<html>` and `.theme-abyssal` on `<body>`. Keep structural/background rules in web CSS while moving only the relevant custom-property declarations. Theme tests should read the **shared token CSS** for token-value assertions and web `global.css` for shell utilities/selectors, and prove the package CSS is imported. NativeWind/React Native mapping is out of scope until a native consumer exists.

**@cetus/config** remains a **thin** workspace package because HPA-446 explicitly names it: only a shared TypeScript base and ESLint base. Keep a **root `eslint.config.js`** that exposes the generic JS/TS lint rules (directly or by re-exporting `@cetus/config`); ESLint 10 finds a config by walking upward from each source file, so packages/root files would be unlintable if the only ESLint config moved inside `apps/web`. `apps/web/eslint.config.js` extends the base and retains Astro parsing and the exact HPA-444 `src/lib/games/**/*.ts` restriction relative to **its own config path**, regardless of the calling cwd. Root `eslint .` and root lint-staged continue to cover all workspaces. Keep root `.prettierrc` as the single shared formatter config and its `prettier-plugin-astro` dependency in the root tooling environment. Keep React-specific presets out until HPA-379.

## CI and Vercel release sequencing

- Keep GitHub workflows at root and pinned to Bun 1.3.14. Install once with `bun install --frozen-lockfile`; root scripts fan into workspaces. Keep the existing `e2e:db:init` script as the canonical E2E DB initializer, executing from the web cwd so `apps/web/scripts/init-db.sql`, `apps/web/db/db.sqlite`, Better Auth migrations and platform-column backfill still work. Update or remove the now-redundant raw-`sqlite3` CI initialization instead of independently creating a second schema path. Update coverage/build/Playwright artifact paths to `apps/web/...`; write `apps/web/.env` in CI. Preserve all platform schema files and score-schema test fixtures.
- Keep Dependabot's Bun ecosystem rooted at `/` for the shared lockfile/workspace manifests; verify workspace dependency discovery before adding directory-specific entries. Retain GitHub Actions updater at `/`. Re-evaluate Codecov's existing `scripts/**` exclusion with `apps/web/scripts/**` paths after coverage moves, preserving both 90% coverage gates without accidentally excluding product source.
- Adjust project-relative paths in `AGENTS.md`, `CLAUDE.md`, `components.json` and ignored/generated paths. In particular, unanchor root-only `/db` in `.gitignore` and `/db/` in `.prettierignore` so `apps/web/db/` remains ignored. Make Playwright's web-server command explicitly use web's `web:dev` in both local/CI modes after `e2e:db:init`: `npm run dev` from web cwd would no longer invoke root Turbo `dev` and local Turso. Leave root `bun run dev` as the separate db+web developer workflow. Do not rewrite unrelated game documentation.
- Vercel must point **Root Directory** to `apps/web` (keeping framework Astro) and **Include files outside the Root Directory** must be enabled/verified so the app can import `packages/tokens`. These are **out-of-repo project settings** and cannot be completed by committing documentation. Vercel project settings currently report SSO protection for **all previews** (`prod_deployment_urls_and_all_previews`): preview smoke checks must use an authenticated browser or Vercel-authorized request such as `vercel curl`, not unauthenticated curl. Coordinate the Root Directory switch after implementation builds locally, validate its protected preview, then merge only after the deployment gate passes. Existing production should not be redeployed from the old root during the switch. Preserve existing production env variables.
- Do not treat a locally green build as proof of a working Vercel preview. No automatic cutover, domain or auth migration is included in this design.

## Non-goals and rejected approaches

No Expo app, React/Skia/NativeWind installation, package extraction for games/shared/API, auth rewrite, API contract change, game behavior change, db schema migration, separate build service, CSS-in-JS, broad new design system, compatibility shims for a nonexistent legacy monorepo, or multiple implementation PRs.

Rejected: two dependent PRs for the same Linear ticket; a bespoke multi-package build system; switching away from Tailwind 4; premature TypeScript token exports, CSS generators and drift tests without a native consumer; moving CSS decoration/animations into cross-platform tokens; implementing React lint before React exists.

## Acceptance tests

1. `bun install --frozen-lockfile` and all named root commands pass; Vitest, Astro TypeScript and Playwright see the same app.
2. All 23 game routes, score submission, login/profile, local Turso and assets behave as before. No generated files accidentally enter Git.
3. `global.test.ts`, `abyssal-shell.test.ts` and import-presence checks assert the exact moved CSS token values without weakening appearance assertions. Capture baseline built CSS (`dist/client/_astro/*.css`), **compare compiled CSS content** after the mechanical move (identical bytes when deterministic, independent of hashed asset filenames) and after token extraction (only expected relocation of token declarations; no utility/class disappearance or changed computed semantics). Confirm the unused Tailwind JS config's classes remain absent. Retain a brief human spot check of home, a canvas game and profile rather than a separate extensive visual-diff framework.
4. CI uses the new test artifact paths and validates a real Vercel **preview** with project Root Directory `apps/web`.
5. `git log --follow -- apps/web/src/...` retains the moved history; no code from HPA-444 is lost.
6. HPA-444 is already merged. Rebase the planning branch onto main before implementing; HPA-446 is ready to merge **only after** root/CI/E2E/preview gates pass and HPA-444 score/portable-lint behavior is retained.
