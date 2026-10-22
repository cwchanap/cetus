# HPA-447 — Cross-platform Shared Packages Design

**Linear:** [HPA-447](https://linear.app/cwchanap/issue/HPA-447/extract-the-cetusgames-cetusshared-and-cetusapi-client-packages)  
**Baseline:** `main` at `16fa956826a1f1cd6b1e0f14f62df9ddc9f9a9a3` (2026-10-21, America/Vancouver); HPA-444 and HPA-446 are Done.  
**Delivery:** One PR for **one Linear ticket**, with reviewable sequential implementation commits. This supersedes the ticket text's "one PR per package"; three independent PRs would split a single task and complicate dependency ordering. This draft initially changes docs only.

## Goal

Make the existing Astro web app consume three portable workspace packages so an eventual Expo host can reuse **game rules**, **domain contracts**, and **API requests** without importing Astro, Pixi renderers, browser globals, web server services, or Turso. **Preserve the behavior of all 23 web games, authentication, scoring, achievements and leaderboards.** This is an extraction, not the React or mobile implementation.

## Verified code inventory

- Bun 1.3.14 workspaces already cover `apps/*` and `packages/*`; `apps/web`, `packages/config`, and `packages/tokens` exist. Root scripts still forward most checks to `apps/web`; Turbo has tasks for `build`, `test`, and `typecheck`.
- `apps/web/src/lib/games/core/ScoreManager.ts` and `core/types.ts` import **web** `scoreService` and `server/validations` types. `BaseGame.ts` imports `GameID` from web `games.ts`. These are real package-boundary leaks after HPA-444.
- `scoreService.ts` contains both browser `fetch('/api/scores')` and presentation-oriented helpers, while `ScoreManager` defaults to that browser transport. The injection seam from HPA-444 exists, but production callers commonly rely on its default.
- `apps/web/src/lib/achievements.ts` uses a DB-derived `UserAchievementRecord` type; `games/shared/types.ts` aliases types from several game-local modules. Moving those files naively would create `shared -> games -> shared` dependencies.
- `apps/web/src/lib/server/validations.ts` mixes Zod schemas/types (portable) with `validateBody(Request)` and `validateQuery(URL)` helpers (HTTP host adapters). `preferences.ts` mixes portable types/defaults with `window`, storage and DOM event utilities. `utils.ts` mixes `cn` (Tailwind-specific) with pure date/contribution-grid helpers.
- There are **12 application API paths and 14 methods**: scores POST, scores/best GET, scores/history GET, leaderboard GET, challenges GET, challenges/xp GET, login-rewards GET, login-rewards/claim POST, settings GET/POST, user/profile POST, user/avatar POST/DELETE, user/update-streaks POST. The original ticket's "13 routes" is not the current file-level inventory. `api/auth/[...all]` is Better Auth's owned interface and `api/dev/add-test-scores` is development-only. Neither belongs in the application client. The current profile route has **POST only**; profile reads use the existing auth/session view, not a new GET endpoint.
- The web has 20 BaseGame-based games plus 3 intentionally handle-based games (Circuit Hacker, Satellite Sync, Ice Slide). Their existing game/initializer patterns are preserved. `GameInitializer` has no production importers and stays web-side rather than undergoing a speculative rewrite.

## Package dependency direction

```text
apps/web (Astro routes, UI, web adapters, renderers, auth, DB)
  ├─> @cetus/api-client ──> @cetus/shared
  ├─> @cetus/games ───────> @cetus/shared
  └─> @cetus/shared

@cetus/shared -> zod (and small dependency-free domain utilities)
@cetus/games -> @cetus/shared
@cetus/api-client -> @cetus/shared
```

No inverse import edges; no package imports from `apps/web`, `@/lib`, Astro, Better Auth, DOM/Pixi, or a server database module. Reuse existing `@cetus/config`, root ESLint/Prettier, workspaces, lockfile, and Turbo; no bundler, publishing pipeline, code generation, runtime plugin registry, or new framework.

### `@cetus/shared`: identity, domain and wire contracts

- Move `games.ts` (`GameID`, `GAMES`, metadata), `organisms.ts`, `challenges.ts`, `loginRewards.ts`, and the **pure** portions of `achievements.ts`, `preferences.ts`, and `utils.ts`, with their tests.
- Define portable game-result/achievement-check DTOs on the shared side of the package boundary. Detach any `UserAchievementRecord` database dependency (keep the DB-specific enrichment type/adapter in web), and avoid the `games/shared/types.ts` aliases pointing back to `@cetus/games`. Keep a single canonical DTO definition where possible; move game-local, runtime-only types with the game. Preserve the current achievement condition functions and results.
- Move the Zod schemas (`scoreSubmissionSchema`, `scoreContextSchema`, `scorePlatformSchema`, `leaderboardQuerySchema`, `profileUpdateSchema`, `paginationQuerySchema`) into `@cetus/shared`. Move *only* the schemas and portable types, not HTTP/body parsing helpers; retain `validateBody` and `validateQuery` in `apps/web/src/lib/server` importing shared schemas.
- Add small explicit request/response schemas and inferred types for the actual 14 application API operations, reusing the current response JSON shapes, including nullable scores, leaderboard shapes, error codes and profile/upload payloads. Avoid mirroring the database schema or inventing server features. Normalize the existing wire format where JSON serializes dates as strings.
- Keep client preference storage, `matchMedia`, browser event dispatch, `cn`, styling and user/avatar UI inside web.

### `@cetus/games`: game simulation only

- Move the portable core (`BaseGame`, `GameTimer`, `ScoreManager`, emitter, errors as applicable, run guard and core contracts), shared geometry/grid/randomness helpers, and all 23 games' **game state, rules, generators and pure data** with adjacent tests.
- Keep `init*.ts`, `*Renderer.ts`, `renderer.ts`, `BaseRenderer`, `RendererFactory`, `GameInitializer`, `renderers/**`, any DOM controllers (e.g. Ice Slide daily-leaderboard view) and audio/browser integrations inside `apps/web`. Resolve cross-file imports explicitly: renderers import logic from `@cetus/games`, not the reverse. Preserve the two styles of game lifecycle (BaseGame and handle-based).
- Replace all game-core web imports with `@cetus/shared` portable types. In particular, **do not import** `apps/web`'s `scoreService` from `ScoreManager`: take the HPA-444 `ScoreSubmitter` contract from shared and return the existing `TRANSPORT_UNAVAILABLE` result if no submitter was supplied. Web game initialization injects the web/api-client submitter; native will inject its own later. Do not silently skip score saving or change when `BaseGame.end()` publishes local completion.
- Implement the ticket's `createGameLoop(game, tick)` as a **small scheduler-free frame-step helper** (the host passes delta time and owns rAF/Skia timing and cleanup); do not migrate/rewrite the existing web frame loops merely to use it. Existing games may continue to use `update(delta)` directly.
- Configure `packages/games/tsconfig.json` with ES libraries and **no DOM lib**, plus an isolated `typecheck` script; prevent cross-package relative/alias imports. Keep any source-only exports explicit and stable.

### `@cetus/api-client`: one typed transport for the app routes

- A simple `createApiClient({ baseUrl?, fetchImpl?, getHeaders? })` factory with typed per-route operations. Default `baseUrl` behaves as a relative URL for web; a native caller supplies an absolute host. Inject `fetchImpl` for tests and `getHeaders` for the future mobile session cookie; do not implement a second authentication system.
- Reuse shared request/response Zod schemas on success, preserving the current payload and HTTP semantics. Handle non-2xx, 401, 400, retryable `SCORE_CONTEXT_UNAVAILABLE` / 503, malformed JSON and network failure without losing the existing public score error codes. Retain the existing web-facing `getUserBestScore(): number | null` and history `[]` fallbacks at the **web adapter** boundary, not inside the strict API client.
- For avatar POST use `FormData` without manually setting multipart `Content-Type`; avatar DELETE stays supported. Do not parse Better Auth endpoints as application routes.
- Migrate direct `/api/*` fetch call sites in web browser scripts and `scoreService` through the client, preserving toast ordering, stale-run suppression and display behavior. The server's own internal calls and Better Auth transport are not part of this "no handwritten fetch" goal.

## Validation and out of scope

**Invariant checks:** the package graph has no cycle or reverse dependency; an isolated no-DOM games typecheck passes; shared/API-client do not import web/server/DOM; web remains the renderer and authentication owner; 23 game IDs remain stable; 12 application routes / 14 operations have typed-client tests.

**Behavior checks:** the same score payload and error code reaches the same API route from web; injected submitter works with BaseGame and handle-based games; local end/replay remains unblocked by pending POST; stale achievements stay suppressed; contextual Ice Slide leaderboard and all existing game tests stay green; Playwright covers game navigation, score, preferences and auth paths.

**Excluded:** Expo and native UI/Skia, React conversion, new endpoints (especially nonexistent `GET /api/user/profile`), DB migrations, changes to Better Auth, new game mechanics, artwork/audio assets, arbitrary state-machine frameworks and backward-compatibility shims.

## Decisions and risks for implementation review

1. **Portable DTO type cycles:** resolve at the source, not with TS path aliases that hide a cycle. Confirm the type-only dependencies in `achievements.ts` and `games/shared/types.ts` before moving files.
2. **Score injection coverage:** all 20 BaseGame game constructors/initializers need a working web submitter after removing `ScoreManager`'s web default. Tests that mock the old web service must move to the actual client or injected seam. The 3 handle-based games retain their explicit submission path.
3. **API mismatch:** code inventory beats the ticket's "13 routes". Cover the existing 14 methods. Do not add a profile GET just to match wording.
4. **No DOM types:** if a supposedly portable game file mentions a browser/Pixi type, leave the browser-facing adapter in web and expose a plain type at the boundary rather than widening the entire game's tsconfig to include DOM.
5. **No behavior refactor:** retain scores, challenges, achievement results, date serialization and current caller-facing fallbacks. Save incidental cleanups for a future ticket.

See the matching [implementation plan](../plans/2026-10-21-hpa-447-shared-packages.md).
