# HPA-447 — Shared Packages Implementation Plan

**Linear:** [HPA-447](https://linear.app/cwchanap/issue/HPA-447/extract-the-cetusgames-cetusshared-and-cetusapi-client-packages)  
**Design:** [2026-10-21-hpa-447-shared-packages-design.md](../specs/2026-10-21-hpa-447-shared-packages-design.md)  
**Baseline:** `main` `16fa956826a1f1cd6b1e0f14f62df9ddc9f9a9a3`, after HPA-446.  
**Delivery:** Continue **this one draft PR** for design, implementation, tests and CI updates. Stage commits to simplify review; do not open per-package implementation PRs for the same ticket. Re-check `main` before implementation and rebase the draft branch if necessary.

## Prerequisites (no new work ticket)

- HPA-444 and HPA-446 are marked Done and the monorepo files are on `main`. Confirm latest workspace manifest/lockfile, Vercel root and current CI status before beginning. The HPA-446 preview/CI notes may describe remote checks still awaiting human verification; record any unresolved deployment gate rather than asserting it passed.
- Run and record baselines: `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:run`, `bun run build`, `bun run lint`, `bun run format:check`, and `bun run test:e2e` where test DB/credentials are available. Do not claim these have run in the **docs-only draft**.
- Identify real direct browser API requests via search in `apps/web/src`, and classify game source files as **logic/data** versus **renderer/host**. Preserve the 23-game inventory and current server JSON fixtures. List any web services imported only for types before moving source.
- During implementation use `git mv` for relocations, keep original tests near their module, and run targeted checks after each stage before proceeding.

## Stage 1 — Shared domain, DTOs and validation schemas

**Files:** `packages/shared/{package.json,tsconfig.json,src/**}`; source/test files moved from `apps/web/src/lib/{games,organisms,achievements,challenges,loginRewards,preferences,utils}`; `apps/web/src/lib/server/validations.ts` and callers; web storage/styling adapters.

1. Create private `@cetus/shared` workspace package with source subpath exports (`"./*": "./src/*.ts"` where appropriate), isolated `typecheck`, and only the scripts needed for source-export workspaces. Reuse `@cetus/config` and one Zod version; set its TypeScript `lib` to ES only **without DOM**, not just the games package. Use equivalent wildcard subpath exports later for `@cetus/games`; do not hand-maintain a per-file export manifest.
2. Move `GameID`, catalog and organism metadata, challenge definitions, login rewards, and portable achievement definitions into shared; preserve IDs, rewards and calculation results. Move the associated tests with them.
3. Resolve both actual dependency leaks: `UserAchievementRecord` comes from a Kysely/DB file; keep that DB projection in web instead of importing it into shared. Current `games/shared/types.ts` has type-only imports from game-local types: extract the minimal game-result DTOs needed by shared's achievement predicates without introducing `shared -> games` imports. Do not fork duplicate public DTO definitions.
4. Move Zod request schemas and types from `server/validations.ts` into shared. Keep `validateBody(request)`/`validateQuery(url)` next to web API routes, reusing shared schema exports. Preserve unknown-field policy, transformed values, platform default, Ice Slide contextual-size checks and error messages.
5. Split preference types/defaults from `window`/storage/event functions; split the pure UTC/activity helpers from Tailwind `cn`. Web-specific public helpers remain in web but import shared domain types.
6. Establish the **actual** API contract inventory: 12 app paths, 14 methods. Define **plain TypeScript response DTOs** (plus existing request-schema-derived types) for all 14 operations, preserving `bestScore: number | null`, challenge/reward/profile/settings/avatar responses and JSON date strings. **No new response/error Zod parser:** the existing `scoreService.ts` pattern of narrowing `unknown` by checking `body?.code === 'SCORE_CONTEXT_UNAVAILABLE'` is sufficient. Avoid response schema duplication, generator tooling and speculative profile-read APIs.
7. Wire shared DTOs to **all current app-route response literals** via explicit `jsonResponse<SpecificResponseDto>(...)` generic types (or `satisfies` for an awkward shape). Every route already reuses `apps/web/src/lib/server/api-utils.ts`; type its `codedErrorResponse` success/error envelope against the shared `{ error, code }` DTO as well. Route `astro check` must reject drift between a response payload and its shared DTO; do not leave the contract enforcement as optional. Preserve existing HTTP codes and payload shape.
8. Before extracting the first test, add a **root** `vitest.config.ts` with Vitest 3 `test.projects` covering `apps/web` and the TS-bearing `packages/*` projects, keeping web's current jsdom/setup/aliases and giving package projects **Node** as environment. Change root `test:run` and `test:coverage` scripts to use that config; aggregate coverage in a single root `coverage/` report and point Codecov's CI upload there (protect existing 90% project/patch gates). Do not allow packages to disappear from the report because the old `apps/web` Vitest `include: src/**` excludes them. Avoid competing per-package Turbo Vitest invocations for canonical coverage.
9. Add persistent **root ESLint `no-restricted-imports` scoped to `packages/**`** before introducing portable code. Forbid `pixi.js`, `astro`/`astro:*`, Better Auth, Kysely/LibSQL, web `@/` aliases and imports into `apps/web` so Bun's hoisted install and TS `skipLibCheck` cannot hide invalid boundaries. Redirect web/server imports to shared; use temporary **intra-stage** migrations if helpful but no compatibility re-export files solely for legacy paths.

**Stage 1 exit:** moved pure suites and all existing route tests green under **root** `bun run test:run` and `bun run test:coverage`. Root `coverage/` must include moved shared source; verify the Codecov upload picks up that path. All 12 route files compile against shared response DTOs; coded errors remain typed and the client can safely discriminate the existing `unknown` envelope without a new parser. Both shared's no-DOM typecheck and the persistent lint boundary pass; no imports from Astro/Pixi/DB/browser globals. Run and record **`bun run typecheck && bun run build`** after Stage 1 (and isolated workspace typechecks).

**Suggested commit:** `refactor(HPA-447): extract portable domain and API contracts`.

## Stage 2 — Portable game package and score injection

**Files:** `packages/games/{package.json,tsconfig.json,src/**}`; `apps/web/src/lib/games/**`; web game initializers, adapters and their tests; score submission types from shared.

1. Inventory `core`, `shared`, and each game folder. Use `git mv` to move only logic, state, generators, constants, RNG/geometry and portable tests. Keep `init*.ts`, renderer files, `GameInitializer.ts`, `BaseRenderer.ts`, `renderers/**` and DOM/animation/audio controllers in web, even if they currently live beside game logic. Retain each game folder's recognizability on both sides.
2. Replace package-internal `@/lib/**` and web-relative imports with local or `@cetus/shared` imports. Move renderer-related types out of `core/types.ts` into the web host boundary. Keep portable `BaseGame` lifecycle and the 3 distinct handle-based game APIs unchanged.
3. Move `ScoreData`, `ScoreSubmissionResult`, `ScoreSubmitter`, `ScorePlatform` and challenge update DTOs to shared. Remove `ScoreManager`'s web `scoreService` import and implicit browser fallback. **Pick a single explicit design:** `BaseGameConfig.submitScore: ScoreSubmitter` (required); remove `ScoreManagerConfig.submitScore`; change the sole save API to `saveFinalScore(submitScore: ScoreSubmitter, gameData?: Record<string, unknown>, score: number = this.currentScore)`, with the required argument **first**, passed by `BaseGame.end()` from its config. Wrap/bind the host callback as needed to preserve methods' `this` receiver. Satellite Sync uses `ScoreManager` for point counting only, so it remains valid with no fake submitter. Retire the obsolete `TRANSPORT_UNAVAILABLE` producer/code/tests once the default transport is removed and no callers remain; preserve score snapshots, stale-run guards, 401/context-unavailable/network semantics.
4. For concrete BaseGame games, type **every** public `config` parameter as `Partial<SpecificGameConfig> & Pick<BaseGameConfig, 'submitScore'>`, with no `= {}` default, and type static `DEFAULT_*_CONFIG` as `Omit<SpecificGameConfig, 'submitScore'>`. In each web initializer/caller, provide the same existing web score submitter; TypeScript errors should locate all missed construction sites (do **not** add a redundant manual 20-game audit or negative fixtures per game). Add **one** `@ts-expect-error` regression test for required `BaseGameConfig.submitScore`. Keep the three handle-based games' explicit save flow; avoid service containers, globals or other layering.
5. **Do not add `createGameLoop` in HPA-447.** No web caller will use it, so any interface would be speculative and synthetically tested. Leave current `update(delta)` and working web rAF loops unchanged; define a small platform-specific scheduling/stepping adapter when a real mobile game-canvas consumer needs it (likely HPA-533; validate dependency order at that time).
6. Set the portable game's TypeScript `lib` to ES **without DOM** (and enforce the same in shared). Move the known DOM-only `isEditableTarget(EventTarget)` function from `games/shared/utils.ts` to a web keyboard helper; update its importers so game logic remains usable without `HTMLElement`. Run isolated package typechecks **and** persistent `no-restricted-imports` lint; the hoisted linker allows Pixi/Astro to resolve even without a declaration, and `skipLibCheck` does not protect the boundary. Keep web renderers on Pixi/DOM, importing logic from `@cetus/games`. Resolve any dependency cycles at the source, without broad `paths` escape hatches.
7. Update existing game tests to import the new game entry points and mock the injected transport rather than `apps/web` scoreService. Preserve route and renderer tests in `apps/web`.

**Stage 2 exit:** all 23 game imports resolve and deterministic rules/score suites run under root Vitest and enter root Codecov coverage. TypeScript rejects missing submitters at concrete construction/save sites (the compiler error list is the migration gate); one `BaseGameConfig` negative fixture guards the required field. Scoring-only Satellite Sync remains valid; finished-run snapshot, paused/end/stale and rewards behavior stay intact. Run **`bun run typecheck && bun run build`**, root tests/coverage, and an **authenticated Playwright score-submit smoke** for one BaseGame game and one handle-based game against the isolated E2E DB (record any auth/environment blocker instead of asserting a pass). Both `games` and `shared` typecheck without DOM, with no package imports from Astro/Pixi/web.

**Suggested commit:** `refactor(HPA-447): extract game rules and inject web score transport`.

## Stage 3 — Typed API client and web consumption

**Files:** `packages/api-client/{package.json,tsconfig.json,src/**}`; `apps/web/src/lib/services/scoreService.ts`, affected browser page scripts and adapters, browser/route tests.

1. Introduce a single `createApiClient({ baseUrl?, fetchImpl?, getHeaders? })` and tiny private request helper. Use **shared TS response DTOs** checked at the actual route literals in Stage 1, existing request schemas and existing wire payloads. No runtime Zod response/error parser, OpenAPI pipeline, retries, caches, credential storage, global context or middleware framework. Merge per-request headers with `getHeaders`; a native host supplies an absolute base URL later.
2. Implement and test all **14 current methods**:
   - `POST /api/scores`; `GET /api/scores/best`, `/history`, `/api/leaderboard`.
   - `GET /api/challenges`, `/api/challenges/xp`, `/api/login-rewards`; `POST /api/login-rewards/claim`.
   - `GET` and `POST /api/settings`; `POST /api/user/profile`.
   - `POST` and `DELETE /api/user/avatar`; `POST /api/user/update-streaks`.
3. Read successful first-party JSON as typed DTOs, not 14 runtime validators. For errors, copy the existing guarded `unknown`-body property check from `scoreService.ts` to the client (`SCORE_CONTEXT_UNAVAILABLE`) and map 401, 503, malformed JSON/network failures appropriately. Do **not** keep `TRANSPORT_UNAVAILABLE` alive just to exercise a nonexistent fallback: once all saves take an injected callback, remove its producer and public type. Keep the live `getUserBestScore(): number | null` error fallback in a thin web adapter; **delete** unused browser `scoreService.getUserGameHistory` instead of migrating its `[]` fallback (confirm no live browser imports; the similarly named profile lookup is a server query).
4. Switch `scoreService.submitScore` to delegate to client (with browser relative-base behavior), then other browser `fetch('/api/...')` call sites, including settings, rewards, leaderboards and user actions. Move common API response DTOs to shared, but keep DOM toasts, rendering, preferences storage and Better Auth session handling in web. Avoid introducing a profile GET the server does not expose.
5. Test typed successful response consumption against existing route fixtures, exact score JSON with platform/context, encoded GET params, 401 and 503 coded errors using a guarded unknown-body check, invalid JSON, network errors, avatar multipart POST/DELETE and headers/fetch injection. Implement all 14 methods even when some have no existing browser caller (`scores/history`, `challenges/xp`, settings GET, `user/update-streaks`), but avoid web adapter facades for those methods. No duplicate per-route response schemas.

**Stage 3 exit:** mocked fetch covers every existing app route+method; root tests/coverage include all three packages; browser client code has no hand-built application `fetch('/api/...')` except documented auth/framework/server calls. Live best-score fallback stays intact; deleted dead history helper has no callers. Run **`bun run typecheck && bun run build`**, lint and root tests before the next stage.

**Suggested commit:** `feat(HPA-447): add typed API client and route web requests through it`.

## Stage 4 — Integration checks, docs and rollout

1. Declare `@cetus/shared`, `@cetus/games` and `@cetus/api-client` as workspace dependencies of web and `@cetus/shared` as a dependency of both portable packages; ensure one Bun lockfile remains. Reuse wildcard subpath exports for source modules and add only genuinely required workspace build scripts. Avoid public publishing.
2. Confirm the **Stage 1** root Vitest projects + coverage wiring still captures *all* moved test files and all three packages in a **single** `coverage/` report uploaded by the already-updated CI job. Wire isolated package `typecheck` and actual `build` prerequisites through Turbo; per-package Turbo `test` scripts are optional because root Vitest is the canonical suite. Keep root `bun run test:run`, `bun run test:coverage`, `bun run typecheck` and `bun run build` working; protect Codecov 90% project/patch gates and Playwright's existing file DB.
3. Update `README.md` and the canonical `CLAUDE.md` (also shown as `AGENTS.md`) with the dependency direction, where new game rules versus web renderers live, and how to run checks. **Fix both stale profile method listings under Key API Endpoints:** replace nonexistent `GET /api/user/profile` and `PUT /api/user/profile` with the actual **`POST /api/user/profile`** for profile updates. The existing profile page reads session/auth data; do not invent a GET route. Change paths under `apps/web` used by workflow jobs/coverage if tests move.
4. Run the full regression matrix from the repository root and record **actual** outputs and regressions in the PR:
   - `bun install --frozen-lockfile`
   - `bun run lint` and `bun run format:check`
   - `bun run turbo run typecheck` (all portable packages; Turbo `test` optional when root Vitest handles all projects)
   - `bun run typecheck`, `bun run test:run`, `bun run test:coverage`, `bun run build`
   - `bun run test:e2e` against the existing local/CI isolated database setup
   - persistent root ESLint package import restrictions plus isolated no-DOM typechecks for **shared and games** (and API-client as portable), 23 game IDs, server-checked response DTOs, route-method coverage, no dependency cycle; verify Codecov's aggregate report actually includes moved files
5. Verify production score and achievement flows in an authenticated Vercel preview, when available; browser and mobile parity is a **future** phase gate, not an assertion for this PR. Keep draft until implementation, tests and essential preview/CI evidence are complete; the docs-only PR does not demonstrate any passing tests.

**Suggested commit:** `chore(HPA-447): wire package checks and document shared boundaries`.

## Reviewer checklist (merge criteria)

- [ ] One PR implements all three shared packages; no parallel per-package PRs for HPA-447.
- [ ] `apps/web` imports all portable game/domain logic through packages and retains renderers, DOM, Astro, auth and DB.
- [ ] `@cetus/shared` has no imports from `@cetus/games` or server/browser code; **both** `@cetus/shared` and `@cetus/games` typecheck without DOM, with a persistent restricted-import lint rule to catch hoisted dependencies.
- [ ] Every app-route response literal is typed against a shared TypeScript DTO and coded errors use the shared envelope; `@cetus/api-client` has mocked-fetch coverage for 12 paths / 14 methods and guarded unknown-body error handling without a new Zod parser. No profile GET.
- [ ] `BaseGameConfig` requires `submitScore`; concrete constructors require it, `saveFinalScore(submitScore, ...)` takes it as the first required argument, and `ScoreManagerConfig` does **not** have a submitter. A single negative fixture protects the type invariant; scoring-only managers need no fake transport; stale-run/save behavior matches baseline.
- [ ] No remaining hand-written application API fetch in browser modules; Better Auth/framework/server calls documented as exceptions.
- [ ] Root `test:run`/`test:coverage` include web and **all** moved package suites, CI uploads consolidated Codecov coverage with existing 90% gates; all stage-by-stage typechecks/builds and the Stage 2 two-game score smoke pass (or blockers recorded), then full Playwright and integration checks pass.
- [ ] `CLAUDE.md` / `AGENTS.md` profile route documentation uses the actual POST method only; unused `createGameLoop` is deferred until there is a real consumer.
- [ ] No schema or DB migration, gameplay/reward rebalance, React/Expo/Skia conversion or artwork/SFX work mixed into the extraction.

## Implementation stop conditions

If game-data DTOs cannot be made cycle-free by a small extraction, or if splitting a particular file forces behavior changes, stop **that move** and document the exact dependency. Keep the logic on the appropriate side until the owned type/interface can be separated; do not weaken the no-DOM gate or ship an untested transport replacement for the sake of mechanically moving every file.
