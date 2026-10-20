# HPA-446 — Bun Workspace Monorepo Implementation Plan

**Linear:** [HPA-446](https://linear.app/cwchanap/issue/HPA-446/convert-the-repo-to-a-bun-workspaces-monorepo-with-shared-tokens-and)
**Design:** [HPA-446 design](../specs/2026-10-19-hpa-446-bun-monorepo-design.md)
**Approach:** Single PR, staged commits, tests after each logical stage. This planning-only draft becomes the same HPA-446 implementation PR later; do not open an additional implementation PR.

## Preconditions and explicit gate

- **Resolved prerequisite:** [HPA-444 / GitHub PR #85](https://github.com/cwchanap/cetus/pull/85) merged into main on 2026-10-19 (America/Vancouver). Implementation can now start on the rebased HPA-446 branch; its portable-game lint rule, injected score transport and platform score migration/tests must be preserved.
- Reconcile conflicting paths after refresh. Work on this PR's single head branch; rebase cleanly, no merge commits.
- Do not change Vercel project settings while the PR contains only docs.

## Step 1 — Lock the baseline and path inventory

1. Use **Bun 1.3.14**, now pinned in `package.json` and both GitHub workflows. From freshly updated main, run `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test:run`, `bun run build` and available Playwright checks. Record any pre-existing failure.
2. Inventory all root-relative paths (test fixtures, `process.cwd()`, SQL initialization, environment loading, static assets, action uploads, docs and tool config). Search for `src/`, `scripts/`, `e2e/`, `public/`, `db/`, `coverage/`, `dist/`, `.astro/` and `.env` references, classifying each as repo-root or web-root. **Include `scripts/init-e2e-db.ts`, `e2e:db:init`, `playwright.config.ts` webServer command, platform migration/score-schema tests, `codecov.yml`, anchored `.gitignore` `/db` and `.prettierignore` `/db/`.** Confirm local Playwright currently uses `npm run dev` (which would resolve to the web package after relocation). Do not use bulk unreviewed replacements.
3. Confirm Tailwind v4's actual CSS entry/import flow and inspect for `@config` in styles (none is currently present). After `bun run build`, **save the compiled CSS bytes from `dist/client/_astro/*.css` as a baseline artifact, indexed independently of hashed asset filenames**. Inspect emitted selectors/keyframes for `.font-orbitron` and `@keyframes float` (not merely their class names in markup/comments). Record their absence before removing legacy `tailwind.config.js`; if present, trace the importer. The same CSS baseline is the primary 23-game utility/class preservation check; keep only a quick human home/game/profile spot check.
4. Verify merged HPA-444 portable-logic ESLint selector (`src/lib/games/**/*.ts`), score transport path, platform migration/DDL and schema tests; carry behavior forward unchanged. Confirm Playwright's new Better Auth migration initializer has a green baseline before moving it.

**Pass:** Known working baseline and finite move map, including the CI and Vercel paths.

## Step 2 — Mechanical `apps/web` move

1. Use `git mv` for `src`, `public`, `e2e`, `scripts` (**including `init-e2e-db.ts`**), `better-auth_migrations` (**including dated score-platform SQL**), `astro.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `components.json`, `env.d.ts` and other verified web-only config. **Delete** `tailwind.config.js` after Step 1 confirms that it is unloaded; do not move it or accidentally activate its dead utility definitions. Leave GitHub workflows, docs, hooks and central project guidance at root.
2. Create minimal private `apps/web/package.json` for the existing Astro app and a minimal private root workspace manifest. Put application dependencies under web and shared tooling where root scripts can resolve it; avoid version upgrades.
3. Put `workspaces: ["apps/*", "packages/*"]` at root, retain `packageManager: "bun@1.3.14"` plus the same CI version, and add root `bunfig.toml` containing `[install]` / `linker = "hoisted"`. That explicit setting prevents a freshly regenerated `bun.lock` from silently switching to isolated installs (`configVersion: 1` instead of the existing hoisted layout). Run Bun install to update the **single** `bun.lock`, then verify `bun install --frozen-lockfile` from a clean workspace. Name the web package `@cetus/web`.
4. Preserve `@/*` and test aliases in web-local config. Move relative development database into `apps/web/db`; unanchor `.gitignore` `/db` and `.prettierignore` `/db/` to `db/` and verify `apps/web/db/db.sqlite` is ignored/untracked. Keep local secrets untracked and document moving an existing root `.env` to `apps/web/.env`.
5. Keep root `dev` as Turbo's database+web entry point; proxy `build`, `typecheck`, `test:run`, `test:e2e`, `e2e:db:init` and other operator commands into the web workspace. **Keep root `lint` as `eslint .`** to include root files and packages under ESLint 10's nearest-config rules. Use web-local cwd for runtime/test steps. Replace Playwright `webServer.command`'s environment-dependent `npm run dev` with **`bun run e2e:db:init && bun run web:dev`** under the web cwd for both CI and local E2E; normal root `bun run dev` still starts the Turso+Astro pair. Verify tests use the initialized local-file DB fallback.
6. Update `turbo.json` cache outputs, persistent tasks and global dependencies for `bun.lock`. Avoid fan-out to absent packages and do not cache e2e.

**Pass:** Root `bun run dev` serves Astro on port 4325 and starts local Turso; unit tests/build/typecheck run without styling changes. **Run root `bun run e2e:db:init` and one fast Playwright smoke spec if practical** before proceeding; inspect `apps/web/db/db.sqlite` for Better Auth/game/score-platform schema. Compare the rebuilt compiled CSS bytes to Step 1's baseline **ignoring emitted asset hash filenames**: no missing selectors/utilities or CSS content differences are allowed for this mechanical step. If differences occur, investigate Tailwind scanner root and relative imports before touching tokens.

## Step 3 — Shared config, without new frameworks

1. Add a **thin** `packages/config/package.json`, `tsconfig.base.json` and `eslint.base.mjs` for truly common settings. **Retain a root `eslint.config.js`** containing/re-exporting this shared JS+TS base for root files and `packages/*`; ESLint 10 finds the nearest config from each source file, so moving the sole flat config into `apps/web` would break package lint and root lint-staged. Keep root `.prettierrc` shared by directory resolution and avoid React plugins.
2. Have web `tsconfig.json` extend the shared base **and** retain `astro/tsconfigs/strict` semantics (TS 6 `extends` order must be validated). Web `apps/web/eslint.config.js` imports/spreads the shared base, adds Astro parser/plugin rules and retains all HPA-444 restricted-global exemptions. **Keep its `src/lib/games/**/*.ts` selector exactly as-is:** the globs are relative to the config file, not command cwd. Add `astro-eslint-parser` as a **direct dependency of the web workspace** (the existing config imports it explicitly but the root manifest currently only gets it transitively). Confirm root Prettier can load `prettier-plugin-astro` through declared root dev tooling.
3. **Leave root `.prettierrc` in place**, retaining its Astro parser override and 4-space TypeScript formatting. Prettier already resolves it from nested workspaces; verify that with one moved Astro/TS file and avoid workspace-specific Prettier copies or re-export files.
4. Keep `.husky/pre-commit` in root and lint-staged operating on the staged paths across workspaces. Do not add separate hooks.

**Pass:** Representative root and `packages/*` TypeScript, web TS/Astro, and config files format/lint identically to baseline; `bun run lint` (`eslint .`), typecheck, `format:check` and **root lint-staged on a staged `packages/*` TS file** pass. Assert the HPA-444 no-browser-globals rule still fires in game logic and not in exempt web initializer/renderer paths.

## Step 4 — CSS-only semantic token package

1. Create `packages/tokens/package.json` with `"exports": { "./theme.css": "./theme.css" }` and **hand-authored** `packages/tokens/theme.css`. Move the existing default `:root` and abyssal `.theme-abyssal` `--cetus-*` declarations and relevant font-stack custom properties **verbatim** from web `global.css`; the stylesheet is the source of truth.
2. Import `@cetus/tokens/theme.css` from `apps/web/src/styles/global.css` in a valid Tailwind v4 `@import` position. Keep generic shadcn tokens, `@theme inline` mappings, structural `.theme-abyssal` background/color rules, active animations and all game-specific CSS within web. Preserve selector order and inheritance (dark class on `<html>`, abyssal theme on `<body>`). **Do not** resurrect dormant utilities from deleted `tailwind.config.js`.
3. Retarget `global.test.ts` and `abyssal-shell.test.ts` token-value assertions to the shared `theme.css`, preserve web CSS shell/behavior assertions, and add exactly one assertion proving the shared package stylesheet is imported. **No `src/index.ts`, generator, temporary-file drift test or generated CSS** — CSS-only is sufficient until a native consumer exists.
4. Rebuild and diff compiled `apps/web/dist/client/_astro/*.css` against the Step 1 baseline (ignore hashed filenames). Review/normalize only the expected relocation of custom-property blocks from web to the imported token stylesheet; **no changed token values, class/utility selector inventory, animation availability or computed semantics**. Keep a brief visual spot check of home, one canvas game and profile. Treat unexplained differences as failures rather than weakening tests.

**Pass:** The hand-authored token CSS is the only token source, existing shell tests pass unchanged in meaning, and the built-CSS diff shows no behavior/style regressions. No extra TypeScript token infrastructure is installed before HPA-447/HPA-379 actually needs native values.

## Step 5 — CI, docs, ignored paths and Vercel preview

1. Update `.github/workflows/ci.yml` and `e2e-tests.yml` for web-local `.env`, coverage, Playwright and build artifact directories; keep Bun 1.3.14 in each job. Retain `apps/web/scripts/init-e2e-db.ts` (Better Auth `getMigrations()/runMigrations()` + `init-db.sql` + contextual/platform column backfill) as the **single canonical Playwright DB initialization** under web cwd. Replace/remove the pre-existing E2E workflow `sqlite3 db/db.sqlite < scripts/init-db.sql` step rather than running two independent schema initializers; ensure `e2e:db:init` runs before server startup through the Playwright webServer command. Preserve score-schema file tests that read both the consolidation and dated platform migration. Draft PR checks are currently skipped by workflow `if` conditions; do not infer success from a skipped draft check.
2. Validate Bun **1.3.14** root `bun install --frozen-lockfile` and shared-lockfile behavior, avoiding 1.3.1's CI lock drift. Keep Dependabot's Bun directory `/` for the shared lockfile; only add another directory if proved necessary for workspace dependency updates. Leave Actions updater at root. Update `codecov.yml`'s `scripts/**` exclusion as needed for `apps/web/scripts/**` **without lowering the 90% project/patch coverage gates**; confirm reported paths before modifying the glob.
3. Update `AGENTS.md` and `CLAUDE.md`, shadcn config path, the now-unanchored DB ignore patterns, format excludes and README command paths where facts changed. Explicitly check `git status --ignored` and Prettier ignores for `apps/web/db/`. Keep unrelated game docs intact.
4. After branch implementation builds locally, coordinate Vercel project **Root Directory = `apps/web`** and verify **Include files outside the Root Directory** is enabled so `packages/tokens/theme.css` resolves. Keep Astro preset and existing env vars, and trigger/inspect a branch preview. **Current Vercel project has SSO protection on all preview deployments** (`prod_deployment_urls_and_all_previews`): test from an authenticated browser or Vercel-authorized request such as `vercel curl`, **not an anonymous curl probe**. Avoid a simultaneous production build against mismatched settings. Merge only after the authenticated preview is good; check production after merge.
5. Smoke-test home → game → score/result and auth/profile; check asset URLs, API routes and local/preview database connectivity.

**Pass:** Both GitHub workflows use correct paths and produce artifacts; Vercel preview loads the complete web app. Vercel project settings are a deployment step, not Git-managed in this PR.

## Step 6 — Final verification and completion

Run from repository root:

```bash
# Use Bun 1.3.14 (matching packageManager and CI)
bun install --frozen-lockfile
bun run lint
bun run format:check
bun run typecheck
bun run test:run
bun run test:coverage
bun run build
bun run test:e2e
# Validate CSS import/token assertions and diff compiled CSS against saved baseline; no generator check
# Verify git history on one representative moved file with git log --follow
```

Also verify: 23 catalog entries/routes, score/achievement flow from HPA-444, the compiled CSS selector/value preservation diff (baseline vs mechanical move vs token extraction), brief home/game/profile visual spot checks, local DB initialized from web cwd, CI artifacts and an **authenticated** Vercel preview (with outside-root files included). If Playwright/preview requires credentials or external env, record that explicitly rather than marking unchecked items passing.

Before switching the draft to ready for review, update the PR body with exact commands/results, preview URL, outstanding deployment settings and known limitations. Mark Linear HPA-446 In Progress when implementation actually begins; complete only after merged and preview/production checks. Do not re-scope later-phase tasks into this PR.

## Risk ledger / guardrails

- **Resolved upstream migration:** HPA-444's score/DDL changes and portable-logic lint are now in main. Keep those exact semantics during the file moves; do not reimplement score submission or lose the dated platform migration.
- **cwd drift / E2E init:** test fixtures, score schema SQL, `init-e2e-db.ts`, local DB, CI SQL and Playwright artifacts are path-sensitive. Ensure Better Auth migrations run before `web:dev` with web cwd. Avoid the old local `npm run dev` ambiguity, duplicate CI schema setups and anchored DB ignores; verify root commands plus web workspace cwd.
- **CSS scanner/cascade / dormant utilities:** Tailwind v4's scanner could miss classes after moving `src`; diff pre/post-build CSS independent of hashed filenames. Prove the old JS config is unloaded, delete it, preserve CSS selector order, and do not activate its dormant utilities. CSS-only tokens require no generator or redundant token-parity pipeline.
- **Vercel root change / access:** project configuration cannot be made atomic with a Git commit. Confirm outside-root file access for the tokens workspace, coordinate the root switch, and validate the SSO-protected preview as an authenticated user before merge.
- **Scope expansion:** no mobile app, React lint, API client, broad tokens, new build system, art/SFX, or second implementation PR.

## Deliverable

**One HPA-446 PR:** first commit(s) add only this design and plan; later implementation commits on this same branch fulfill the acceptance criteria. Do not split the Linear task over multiple PRs.
