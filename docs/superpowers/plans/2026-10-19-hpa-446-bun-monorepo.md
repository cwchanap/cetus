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
2. Inventory all root-relative paths (test fixtures, `process.cwd()`, SQL initialization, environment loading, static assets, action uploads, docs and tool config). Search for `src/`, `scripts/`, `e2e/`, `public/`, `db/`, `coverage/`, `dist/`, `.astro/` and `.env` references, classifying each as repo-root or web-root. **Include the new `scripts/init-e2e-db.ts`, `e2e:db:init` alias, `playwright.config.ts` webServer command, `better-auth_migrations/2026-10-19-game-scores-platform.sql`, score-schema file tests and `codecov.yml` ignore globs.** Do not use bulk unreviewed replacements.
3. Confirm Tailwind v4 actual CSS entry/import flow and whether the legacy JS config is loaded. Capture screenshots or browser references for homepage, representative game page and profile before edits.
4. Verify merged HPA-444 portable-logic ESLint selector (`src/lib/games/**/*.ts`), score transport path, platform migration/DDL and schema tests; carry behavior forward unchanged. Confirm Playwright's new Better Auth migration initializer has a green baseline before moving it.

**Pass:** Known working baseline and finite move map, including the CI and Vercel paths.

## Step 2 — Mechanical `apps/web` move

1. Use `git mv` for `src`, `public`, `e2e`, `scripts` (**including `init-e2e-db.ts`**), `better-auth_migrations` (**including dated score-platform SQL**), `astro.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `tailwind.config.js`, `tsconfig.json`, `components.json`, `env.d.ts` and other verified web-only config. Leave GitHub workflows, docs, hooks and central project guidance at root.
2. Create minimal private `apps/web/package.json` for the existing Astro app and a minimal private root workspace manifest. Put application dependencies under web and shared tooling where root scripts can resolve it; avoid version upgrades.
3. Put `workspaces: ["apps/*", "packages/*"]` at root and retain `packageManager: "bun@1.3.14"` plus the same Bun version in CI. Run Bun install to update the **single** `bun.lock`. Name the web package `@cetus/web`.
4. Preserve `@/*` and test aliases in web-local config. Move relative development database into `apps/web/db`. Keep local secrets untracked and document moving an existing root `.env` to `apps/web/.env`.
5. Make root `dev`, `build`, `lint`, `typecheck`, `test:run`, `test:e2e`, `e2e:db:init` and `format:check` proxy to workspace scripts through the existing Turbo setup; retain root operator shortcuts. Use workspace-local cwd for runtime/test steps. Keep Playwright's `webServer.command` running `bun run e2e:db:init` **before** starting the web/dev server; its initializer relies on `process.cwd()` for the DB and SQL paths.
6. Update `turbo.json` cache outputs, persistent tasks and global dependencies for `bun.lock`. Avoid fan-out to absent packages and do not cache e2e.

**Pass:** From repository root `bun run dev` serves Astro on port 4325 and starts local Turso; unit tests, build and typecheck can run with current styling. If this stage fails, fix workspace pathing before touching theme values.

## Step 3 — Shared config, without new frameworks

1. Add `packages/config/package.json`, `tsconfig.base.json`, `eslint.base.mjs`, `prettier.config.mjs`. Transfer only truly common current settings. Avoid new React plugins.
2. Have web `tsconfig.json` extend the shared base **and** retain its Astro-specific `astro/tsconfigs/strict` behavior (use a shallow web override/extends order compatible with TS 6 and verify). Keep web `eslint.config.js` with Astro parser/plugin rules; import the shared base. Retain the entire merged HPA-444 `no-restricted-globals` list/exemptions and verify its `src/lib/games/**/*.ts` scope still matches after relocation (run ESLint from the web cwd or adjust the glob explicitly, not both).
3. Move the current root `.prettierrc` semantics (including Astro parser override and 4-space TS formatting) into the shared preset, exporting a simple root Prettier config that all workspaces inherit. Keep only one source of formatter options and make sure Prettier's directory resolution is tested from root.
4. Keep `.husky/pre-commit` in root and lint-staged operating on the staged paths across workspaces. Do not add separate hooks.

**Pass:** Representative TS, Astro and config files format and lint identically to baseline. `bun run lint`, `typecheck` and `format:check` pass, including game logic restrictions.

## Step 4 — Minimal semantic tokens

1. Add `packages/tokens/src/index.ts` exporting current stable default/abyssal `--cetus-*` values and font stacks (no redesign). Do not extract all generic Tailwind/shadcn CSS or game-specific decoration.
2. Add one small deterministic `generate-css.ts` emitting static `packages/tokens/theme.css` from these TS values, plus a `--check` path. Commit emitted CSS and verify regeneration is idempotent.
3. Import this generated CSS from `apps/web/src/styles/global.css` in a valid Tailwind v4 `@import` position. Remove moved declarations from web CSS while retaining generic variables, `@theme inline` mapping, CSS selectors, animation and scoped override order. Treat `tailwind.config.js` as legacy unless usage proves otherwise; if active, import only needed token exports and verify Tailwind output.
4. Update `global.test.ts` and `abyssal-shell.test.ts` to read shared generated token CSS for token assertions while continuing to assert global selectors/behavior against web CSS. Add a parity test/check preventing divergent TS and generated CSS.
5. Compare computed values and key visual regions on default and abyssal themes. Don't "fix" unrelated styles or refactor one-off classes.

**Pass:** No changed theme value/appearance; token parity and existing shell tests pass; token module is importable as plain TS.

## Step 5 — CI, docs, ignored paths and Vercel preview

1. Update `.github/workflows/ci.yml` and `e2e-tests.yml` for web-local `.env`, coverage, Playwright and build artifact directories; keep Bun 1.3.14 in each job. Retain `apps/web/scripts/init-e2e-db.ts` (Better Auth `getMigrations()/runMigrations()` + `init-db.sql` + contextual/platform column backfill) as the **single canonical Playwright DB initialization** under web cwd. Replace/remove the pre-existing E2E workflow `sqlite3 db/db.sqlite < scripts/init-db.sql` step rather than running two independent schema initializers; ensure `e2e:db:init` runs before server startup through the Playwright webServer command. Preserve score-schema file tests that read both the consolidation and dated platform migration. Draft PR checks are currently skipped by workflow `if` conditions; do not infer success from a skipped draft check.
2. Validate Bun **1.3.14** root `bun install --frozen-lockfile` and shared-lockfile behavior, avoiding 1.3.1's CI lock drift. Keep Dependabot's Bun directory `/` for the shared lockfile; only add another directory if proved necessary for workspace dependency updates. Leave Actions updater at root. Update `codecov.yml`'s `scripts/**` exclusion as needed for `apps/web/scripts/**` **without lowering the 90% project/patch coverage gates**; confirm reported paths before modifying the glob.
3. Update `AGENTS.md` and `CLAUDE.md`, shadcn config path, ignores/format excludes and README command paths where facts changed. Keep unrelated game docs intact.
4. After branch implementation builds locally, coordinate Vercel project Root Directory = `apps/web`, keep Astro preset and existing env vars, and trigger/inspect a **branch preview**. Avoid a simultaneous production build against mismatched settings. Merge only once branch preview is good; check production after merge.
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
# Verify deterministic theme.css generation with packages/tokens check command
# Verify git history on one representative moved file with git log --follow
```

Also verify: 23 catalog entries/routes, score/achievement flow from HPA-444, homepage default and abyssal screenshots, one Pixi/canvas game, profile, mobile viewport, CI artifacts and Vercel preview. If Playwright/preview requires credentials or external env, record that explicitly rather than marking unchecked items passing.

Before switching the draft to ready for review, update the PR body with exact commands/results, preview URL, outstanding deployment settings and known limitations. Mark Linear HPA-446 In Progress when implementation actually begins; complete only after merged and preview/production checks. Do not re-scope later-phase tasks into this PR.

## Risk ledger / guardrails

- **Resolved upstream migration:** HPA-444's score/DDL changes and portable-logic lint are now in main. Keep those exact semantics during the file moves; do not reimplement score submission or lose the dated platform migration.
- **cwd drift / E2E init:** test fixtures, score schema SQL, new `init-e2e-db.ts`, local db, CI SQL paths and Playwright artifacts are path-sensitive. Ensure Better Auth's migration runner executes before the dev server with web cwd, avoid duplicate CI schema setups, and run checks from root *and* inspect workspace cwd.
- **CSS drift:** Tailwind v4 and current literal CSS tests are tightly coupled. Extract only shared semantics, generate CSS deterministically and compare visuals.
- **Vercel root change:** project configuration cannot be made atomic with a Git commit. Coordinate the root switch and preview verification before merge.
- **Scope expansion:** no mobile app, React lint, API client, broad tokens, new build system, art/SFX, or second implementation PR.

## Deliverable

**One HPA-446 PR:** first commit(s) add only this design and plan; later implementation commits on this same branch fulfill the acceptance criteria. Do not split the Linear task over multiple PRs.
