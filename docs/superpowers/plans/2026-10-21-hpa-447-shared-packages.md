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

1. Create private `@cetus/shared` workspace package with explicit `exports`, `typecheck`, `test` and `build` scripts as actually needed for source-export workspaces. Use root `@cetus/config` and one Zod version; no extra package manager/build system.
2. Move `GameID`, catalog and organism metadata, challenge definitions, login rewards, and portable achievement definitions into shared; preserve IDs, rewards and calculation results. Move the associated tests with them.
3. Resolve both actual dependency leaks: `UserAchievementRecord` comes from a Kysely/DB file; keep that DB projection in web instead of importing it into shared. Current `games/shared/types.ts` has type-only imports from game-local types: extract the minimal game-result DTOs needed by shared's achievement predicates without introducing `shared -> games` imports. Do not fork duplicate public DTO definitions.
4. Move Zod request schemas and types from `server/validations.ts` into shared. Keep `validateBody(request)`/`validateQuery(url)` next to web API routes, reusing shared schema exports. Preserve unknown-field policy, transformed values, platform default, Ice Slide contextual-size checks and error messages.
5. Split preference types/defaults from `window`/storage/event functions; split the pure UTC/activity helpers from Tailwind `cn`. Web-specific public helpers remain in web but import shared domain types.
6. Establish the **actual** API contract inventory: 12 app paths, 14 methods. Define **plain TypeScript response DTOs** (plus existing request-schema-derived types) for all 14 operations, preserving `bestScore: number | null`, challenge/reward/profile/settings/avatar responses and JSON date strings. Add only a minimal Zod error-envelope parser for code paths which branch on server error codes. **Do not** duplicate 14 successful response shapes as runtime Zod schemas, add route generator tooling, or invent profile-read APIs.
7. Redirect web and server imports to shared; use a temporary **intra-stage** migration sequence if helpful, but the finished PR must have no compatibility re-export files solely to preserve legacy paths.

**Stage 1 tests:** moved pure suites green; existing route tests remain the authoritative successful-response fixtures and compile against the shared response types where practical; test the small runtime error schema only for error cases that need it. No imports from `apps/web`, Astro, Pixi, Kysely or browser globals; web server route tests remain green.

**Suggested commit:** `refactor(HPA-447): extract portable domain and API contracts`.

## Stage 2 — Portable game package and score injection

**Files:** `packages/games/{package.json,tsconfig.json,src/**}`; `apps/web/src/lib/games/**`; web game initializers, adapters and their tests; score submission types from shared.

1. Inventory `core`, `shared`, and each game folder. Use `git mv` to move only logic, state, generators, constants, RNG/geometry and portable tests. Keep `init*.ts`, renderer files, `GameInitializer.ts`, `BaseRenderer.ts`, `renderers/**` and DOM/animation/audio controllers in web, even if they currently live beside game logic. Retain each game folder's recognizability on both sides.
2. Replace package-internal `@/lib/**` and web-relative imports with local or `@cetus/shared` imports. Move renderer-related types out of `core/types.ts` into the web host boundary. Keep portable `BaseGame` lifecycle and the 3 distinct handle-based game APIs unchanged.
3. Move `ScoreData`, `ScoreSubmissionResult`, `ScoreSubmitter`, `ScorePlatform` and challenge update DTOs to shared. Remove `ScoreManager`'s import of the web `scoreService` and its implicit browser transport. Make score submission **compile-time required at the actual saving boundary**: BaseGame's instantiable runtime config / public concrete constructors must require a `ScoreSubmitter` and `ScoreManager.saveFinalScore` must require a submitter (either as a required method argument or via an equivalently strict save-capable config). Do not permit zero-argument game constructors or `Partial<Config>` defaults to bypass this requirement. Keep `TRANSPORT_UNAVAILABLE` only as a defensive runtime outcome for untyped callers; preserve score snapshotting and stale-run guards. Satellite Sync uses `ScoreManager` to track points but saves separately, so do not require a dummy submitter to instantiate a scoring-only manager.
4. Update **every web concrete-game construction site** to explicitly supply the same existing web score submitter through the required typed constructor/config. Keep static `DEFAULT_*_CONFIG` gameplay values portable (for example `Omit<GameConfig, 'submitScore'>`) and compose them with a host-provided submitter at instantiation; avoid process-global registration and new service containers. Include targeted **negative typecheck fixtures (`@ts-expect-error`)** proving missing submitters fail to compile for representative concrete games and save calls, and run a source/constructor audit for all 20 BaseGame games. The 3 handle-based games retain their explicit `saveGameScore` flow until the API migration stage.
5. **Do not add `createGameLoop` in HPA-447.** No web caller will use it, so any interface would be speculative and synthetically tested. Leave current `update(delta)` and working web rAF loops unchanged; define a small platform-specific scheduling/stepping adapter when a real mobile game-canvas consumer needs it (likely HPA-533; validate dependency order at that time).
6. Set the portable game's TypeScript `lib` to an ES baseline **without DOM** and run its typecheck in isolation. Fix any actual browser-type leakage by moving only the adapter-facing parts back to web. Keep `apps/web` renderers' Pixi/DOM dependencies and their imports pointed into `@cetus/games`. If a package cycle appears, fix ownership instead of adding a broad `paths` escape hatch.
7. Update existing game tests to import the new game entry points and mock the injected transport rather than `apps/web` scoreService. Preserve route and renderer tests in `apps/web`.

**Stage 2 tests:** 23 game imports resolve; deterministic game behavior and scoring tests pass; injected submitter sends exactly one finished-run snapshot; **TypeScript rejects missing submitters at concrete BaseGame construction/save call sites**; the defensive runtime `TRANSPORT_UNAVAILABLE` result remains tested for an explicitly untyped/invalid call; scoring-only Satellite Sync still constructs its manager normally; paused/end/stale runs behave as before; all portable files typecheck without DOM and no game package references `apps/web`, Pixi or Astro.

**Suggested commit:** `refactor(HPA-447): extract game rules and inject web score transport`.

## Stage 3 — Typed API client and web consumption

**Files:** `packages/api-client/{package.json,tsconfig.json,src/**}`; `apps/web/src/lib/services/scoreService.ts`, affected browser page scripts and adapters, browser/route tests.

1. Introduce a single `createApiClient({ baseUrl?, fetchImpl?, getHeaders? })` and tiny private request helper. Use **shared TypeScript response DTOs, existing request schemas and existing wire payloads**, not runtime schemas for every success; no OpenAPI pipeline, retries, caches, local-storage credentials, new global context or middleware framework. Merge per-request headers with `getHeaders`; supply an absolute URL from a mobile host later.
2. Implement and test all **14 current methods**:
   - `POST /api/scores`; `GET /api/scores/best`, `/history`, `/api/leaderboard`.
   - `GET /api/challenges`, `/api/challenges/xp`, `/api/login-rewards`; `POST /api/login-rewards/claim`.
   - `GET` and `POST /api/settings`; `POST /api/user/profile`.
   - `POST` and `DELETE /api/user/avatar`; `POST /api/user/update-streaks`.
3. Read successful first-party JSON as **typed response DTOs**; do not add 14 runtime response parsers. Validate only the compact error envelope when branching on server-supplied codes, handle query serialization and optional body, multipart `FormData`, non-JSON errors and network failure. Preserve score public error codes (`UNAUTHENTICATED`, `SCORE_CONTEXT_UNAVAILABLE`, `NETWORK_ERROR`, `TRANSPORT_UNAVAILABLE`) and ordinary HTTP failure behavior. Do **not** eagerly fail the old `getUserBestScore`/history web UI if a request fails: keep their documented `null`/`[]` fallbacks in a thin web adapter.
4. Switch `scoreService.submitScore` to delegate to client (with browser relative-base behavior), then other browser `fetch('/api/...')` call sites, including settings, rewards, leaderboards and user actions. Move common API response DTOs to shared, but keep DOM toasts, rendering, preferences storage and Better Auth session handling in web. Avoid introducing a profile GET the server does not expose.
5. Test typed successful response consumption against existing route fixtures, the exact JSON body of a score POST with platform and context, a GET with encoded params, 401 and 503 coded error-envelope failures, invalid JSON, network errors, avatar multipart POST and DELETE, and `getHeaders` / `fetchImpl` injection. Do not add duplicate per-route successful-response Zod schemas just to support tests.

**Stage 3 tests:** mocked fetch covers each existing route+method; browser client code has no hand-built application `fetch('/api/...')` except intentionally documented framework/auth/server-only calls; all existing score/history display semantics stay intact.

**Suggested commit:** `feat(HPA-447): add typed API client and route web requests through it`.

## Stage 4 — Integration checks, docs and rollout

1. Declare `@cetus/shared` and `@cetus/games` as workspace dependencies of web and `@cetus/shared` as a dependency of `@cetus/api-client`; ensure one Bun lockfile remains. Add only scripts necessary for source-workspace TS resolution or a build prerequisite. Avoid inventing public package publishing.
2. Wire all portable package `test`, `typecheck` and `build` tasks into Turbo with dependency edges; keep root developer commands working (especially `bun run test:run`, `bun run typecheck`, `bun run build`). Adjust CI only where a package was previously skipped; protect the existing Codecov 90% gates and keep the current Playwright file-DB initialization.
3. Update `README.md` and the canonical `CLAUDE.md` (also shown as `AGENTS.md`) with the dependency direction, where new game rules versus web renderers live, and how to run checks. **Fix both stale profile method listings under Key API Endpoints:** replace nonexistent `GET /api/user/profile` and `PUT /api/user/profile` with the actual **`POST /api/user/profile`** for profile updates. The existing profile page reads session/auth data; do not invent a GET route. Change paths under `apps/web` used by workflow jobs/coverage if tests move.
4. Run the full regression matrix from the repository root and record **actual** outputs and regressions in the PR:
   - `bun install --frozen-lockfile`
   - `bun run lint` and `bun run format:check`
   - `bun run turbo run typecheck test` (all packages)
   - `bun run typecheck`, `bun run test:run`, `bun run build`
   - `bun run test:e2e` against the existing local/CI isolated database setup
   - source-boundary grep/TS checks (no DOM lib in games; no server imports in shared/API client); 23 game IDs, route-method coverage, no package dependency cycle
5. Verify production score and achievement flows in an authenticated Vercel preview, when available; browser and mobile parity is a **future** phase gate, not an assertion for this PR. Keep draft until implementation, tests and essential preview/CI evidence are complete; the docs-only PR does not demonstrate any passing tests.

**Suggested commit:** `chore(HPA-447): wire package checks and document shared boundaries`.

## Reviewer checklist (merge criteria)

- [ ] One PR implements all three shared packages; no parallel per-package PRs for HPA-447.
- [ ] `apps/web` imports all portable game/domain logic through packages and retains renderers, DOM, Astro, auth and DB.
- [ ] `@cetus/shared` has no imports from `@cetus/games` or server/browser code; `@cetus/games` typechecks without DOM.
- [ ] `@cetus/api-client` has TypeScript DTOs/mock-fetch coverage for 12 application paths / 14 methods, with Zod parsing limited to necessary error envelopes; no imagined profile GET.
- [ ] Score submission is **required by the TypeScript constructor/save contract** for all 20 BaseGame games (including default-constructor/test paths); scoring-only `ScoreManager` users remain viable without a fake submitter. Runtime and stale-save behavior matches pre-extraction behavior.
- [ ] No remaining hand-written application API fetch in browser modules; Better Auth/framework/server calls documented as exceptions.
- [ ] All package and web test/typecheck/build commands and the Playwright suite pass; regression outputs are recorded.
- [ ] `CLAUDE.md` / `AGENTS.md` profile route documentation uses the actual POST method only; unused `createGameLoop` is deferred until there is a real consumer.
- [ ] No schema or DB migration, gameplay/reward rebalance, React/Expo/Skia conversion or artwork/SFX work mixed into the extraction.

## Implementation stop conditions

If game-data DTOs cannot be made cycle-free by a small extraction, or if splitting a particular file forces behavior changes, stop **that move** and document the exact dependency. Keep the logic on the appropriate side until the owned type/interface can be separated; do not weaken the no-DOM gate or ship an untested transport replacement for the sake of mechanically moving every file.
