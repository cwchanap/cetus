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
6. Establish the **actual** API contract inventory: 12 app paths, 14 methods. Define minimal schemas/types for the response payloads; include success/error envelopes, `bestScore: number | null`, challenge and reward data, profile/settings/avatar responses, and date strings. Avoid route generator tooling, schema duplication in controllers or a speculative profile-read route.
7. Redirect web and server imports to shared; use a temporary **intra-stage** migration sequence if helpful, but the finished PR must have no compatibility re-export files solely to preserve legacy paths.

**Stage 1 tests:** moved pure suites green; payload/schema fixtures from existing route tests parse under shared contracts; no imports from `apps/web`, Astro, Pixi, Kysely or browser globals; web server route tests remain green.

**Suggested commit:** `refactor(HPA-447): extract portable domain and API contracts`.

## Stage 2 — Portable game package and score injection

**Files:** `packages/games/{package.json,tsconfig.json,src/**}`; `apps/web/src/lib/games/**`; web game initializers, adapters and their tests; score submission types from shared.

1. Inventory `core`, `shared`, and each game folder. Use `git mv` to move only logic, state, generators, constants, RNG/geometry and portable tests. Keep `init*.ts`, renderer files, `GameInitializer.ts`, `BaseRenderer.ts`, `renderers/**` and DOM/animation/audio controllers in web, even if they currently live beside game logic. Retain each game folder's recognizability on both sides.
2. Replace package-internal `@/lib/**` and web-relative imports with local or `@cetus/shared` imports. Move renderer-related types out of `core/types.ts` into the web host boundary. Keep portable `BaseGame` lifecycle and the 3 distinct handle-based game APIs unchanged.
3. Move `ScoreData`, `ScoreSubmissionResult`, `ScoreSubmitter`, `ScorePlatform` and challenge update DTO types to shared. `ScoreManager` must not import `scoreService`; an absent transport returns the explicit `TRANSPORT_UNAVAILABLE` outcome (as HPA-444 documents for non-browser hosts). Preserve score snapshotting and stale-run guards.
4. Update every web game creation path with the **same existing** web score submitter. Prefer injecting via each initializer/config where the HPA-444 seam already exists; avoid process-global registration and new service containers. The 3 handle-based games retain the current explicit `saveGameScore` flow until the API migration stage.
5. Add the smallest platform-agnostic `createGameLoop(game, tick)` stepping helper that a host calls with delta time; it must not request rAF, DOM or Skia, and must not replace functioning game-specific render loops just to use the abstraction.
6. Set the portable game's TypeScript `lib` to an ES baseline **without DOM** and run its typecheck in isolation. Fix any actual browser-type leakage by moving only the adapter-facing parts back to web. Keep `apps/web` renderers' Pixi/DOM dependencies and their imports pointed into `@cetus/games`. If a package cycle appears, fix ownership instead of adding a broad `paths` escape hatch.
7. Update existing game tests to import the new game entry points and mock the injected transport rather than `apps/web` scoreService. Preserve route and renderer tests in `apps/web`.

**Stage 2 tests:** 23 game imports resolve; deterministic game behavior and scoring tests pass; injected submitter sends exactly one finished-run snapshot; missing submitter returns the defined failure; paused/end/stale runs behave as before; all portable files typecheck without DOM and no game package references `apps/web`, Pixi or Astro.

**Suggested commit:** `refactor(HPA-447): extract game rules and inject web score transport`.

## Stage 3 — Typed API client and web consumption

**Files:** `packages/api-client/{package.json,tsconfig.json,src/**}`; `apps/web/src/lib/services/scoreService.ts`, affected browser page scripts and adapters, browser/route tests.

1. Introduce a single `createApiClient({ baseUrl?, fetchImpl?, getHeaders? })` and tiny private request helper. Use the **shared schemas and existing payloads**; no OpenAPI pipeline, retries, caches, local-storage credentials, new global context or middleware framework. Merge per-request headers with `getHeaders`; supply an absolute URL from a mobile host later.
2. Implement and test all **14 current methods**:
   - `POST /api/scores`; `GET /api/scores/best`, `/history`, `/api/leaderboard`.
   - `GET /api/challenges`, `/api/challenges/xp`, `/api/login-rewards`; `POST /api/login-rewards/claim`.
   - `GET` and `POST /api/settings`; `POST /api/user/profile`.
   - `POST` and `DELETE /api/user/avatar`; `POST /api/user/update-streaks`.
3. Parse successful JSON with response schemas; handle query serialization and optional body, multipart `FormData`, and non-JSON errors. Preserve score public error codes (`UNAUTHENTICATED`, `SCORE_CONTEXT_UNAVAILABLE`, `NETWORK_ERROR`, `TRANSPORT_UNAVAILABLE`) and ordinary HTTP failure behavior. Do **not** eagerly fail the old `getUserBestScore`/history web UI if a request fails: keep their documented `null`/`[]` fallbacks in a thin web adapter.
4. Switch `scoreService.submitScore` to delegate to client (with browser relative-base behavior), then other browser `fetch('/api/...')` call sites, including settings, rewards, leaderboards and user actions. Move common API response DTOs to shared, but keep DOM toasts, rendering, preferences storage and Better Auth session handling in web. Avoid introducing a profile GET the server does not expose.
5. Test the exact JSON body of a score POST with platform and context, a GET with encoded params, 401 and 503 coded failures, invalid JSON, network errors, avatar multipart POST and DELETE, and `getHeaders` / `fetchImpl` injection. Reuse existing API test fixtures where possible instead of mocking a new imaginary contract.

**Stage 3 tests:** mocked fetch covers each existing route+method; browser client code has no hand-built application `fetch('/api/...')` except intentionally documented framework/auth/server-only calls; all existing score/history display semantics stay intact.

**Suggested commit:** `feat(HPA-447): add typed API client and route web requests through it`.

## Stage 4 — Integration checks, docs and rollout

1. Declare `@cetus/shared` and `@cetus/games` as workspace dependencies of web and `@cetus/shared` as a dependency of `@cetus/api-client`; ensure one Bun lockfile remains. Add only scripts necessary for source-workspace TS resolution or a build prerequisite. Avoid inventing public package publishing.
2. Wire all portable package `test`, `typecheck` and `build` tasks into Turbo with dependency edges; keep root developer commands working (especially `bun run test:run`, `bun run typecheck`, `bun run build`). Adjust CI only where a package was previously skipped; protect the existing Codecov 90% gates and keep the current Playwright file-DB initialization.
3. Update `README.md` and `CLAUDE.md`/AGENTS guidance with the dependency direction, where to put new game rules versus web renderers, and how to run the checks. Change paths under `apps/web` used by workflow jobs/coverage if tests move.
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
- [ ] `@cetus/api-client` has typed/mock-fetch coverage for 12 application paths / 14 methods; no imagined profile GET.
- [ ] Web score transport is injected at all relevant BaseGame creation paths, and error/stale-save behavior matches pre-extraction behavior.
- [ ] No remaining hand-written application API fetch in browser modules; Better Auth/framework/server calls documented as exceptions.
- [ ] All package and web test/typecheck/build commands and the Playwright suite pass; regression outputs are recorded.
- [ ] No schema or DB migration, gameplay/reward rebalance, React/Expo/Skia conversion or artwork/SFX work mixed into the extraction.

## Implementation stop conditions

If game-data DTOs cannot be made cycle-free by a small extraction, or if splitting a particular file forces behavior changes, stop **that move** and document the exact dependency. Keep the logic on the appropriate side until the owned type/interface can be separated; do not weaken the no-DOM gate or ship an untested transport replacement for the sake of mechanically moving every file.
