# HPA-393 — app-core hooks and 23 React GameScreens: design

Status: **proposed / planning only** (2026-10-27)  
Linear: https://linear.app/cwchanap/issue/HPA-393/build-cetusapp-core-and-move-all-23-web-game-pages-onto-gamescreen  
Base: current `main` after merged HPA-447 (#95) and HPA-379 (#97). One implementation PR for this single Linear issue.

## Goal

Turn every game page into a thin Astro route that mounts a React GameScreen island, while keeping all game rules and score persistence canonical in `@cetus/games` and `@cetus/api-client`. Extract **only the platform-neutral React hooks needed by current game pages** into `@cetus/app-core`; Expo can reuse the proven hooks later. Preserve existing URLs, features, game feel, responsive styling, accessible interactions, submission/reward semantics and each existing `window.<game>Game` debug handle.

## Verified starting point

- Bun workspace and `@cetus/{shared,games,api-client,ui,tokens,config}` exist. Astro 5 with `@astrojs/react` and React 19 is already integrated. Do not repeat HPA-379 or HPA-447.
- `apps/web/src/components/games/GamePage.astro` remains by design, with six named slots and SSR-only React GameTitle/GameStats/GameControls/GameOverlay. Its game scripts live at page root because Astro drops scripts nested in named slots. HPA-393 owns removing this compatibility shell.
- `apps/web/src/pages/snake/index.astro` has an imperative root `DOMContentLoaded` script calling `initSnakeGameFramework()`, and `apps/web/src/lib/games/snake/initFramework.ts` uses `document.getElementById('snake-container')`, imperatively updates HUD/overlay/buttons, owns keyboard/unload handlers and a single rAF loop. `SnakeGame` itself is portable in `packages/games`.
- `BaseGame` already injects its mandatory `submitScore` callback and saves in `end()`, emitting a structured end result **after** save completion. Its `onEnd` callback is called **before** awaiting save. A `'end'` event is also forwarded from the timer without a structured payload. Never treat all `end` events as a saved result or submit the score a second time.
- `apps/web/src/lib/services/scoreService.ts` is an existing web adapter over `createApiClient()`, and the shared `AppNotifications` island installs `window.showAchievementAward` and `window.showChallengeComplete`. Preserve the web-only notification boundary and stale-run suppression.
- Fifteen ordinary pages besides Snake use the `GamePage.astro` pattern. Three exception pages (Circuit Hacker, Satellite Sync, Ice Slide) own `start/stop/cleanup/getGame` handles and already have web-side callbacks / score saving. Four pages (Tetris, 2048, Bejeweled, Bubble Shooter) use bespoke field-plate layout, dialog/focus logic and large inline controllers; they must retain that UX, not be squeezed into the generic sidebar.
- `@cetus/api-client` exposes typed `getLeaderboard`, `getChallenges`, `getChallengeXp`, `getLoginRewardStatus`, `claimLoginReward`, `getBestScore`, `getScoreHistory`, `updateProfile`, `uploadAvatar`, `deleteAvatar` and `submitScore`. It has **no GET profile or GET achievements** method. Profile/achievement read state starts from server-provided serializable data or existing user/session state; do not invent endpoints.
- Root Vitest aggregates web, UI, shared, games and API-client projects; root coverage collects `packages/*/src/**` with a >=90% gate. Existing Playwright navigates every game and tests score/auth flows. Root ESLint enforces package direction; extend it, do not invent a second boundary checker.

## Design decisions

### 1. Ownership and package structure

- Create `packages/app-core` (TypeScript/TSX source exports, React peer dependency, dependencies only on `@cetus/shared`, `@cetus/games` where structurally required, and `@cetus/api-client`; no Pixi, Astro, Better Auth, DB, web alias, `window`, `document`, `HTMLElement` or browser UI runtime). React hook implementations can use `useEffect`, `useReducer` and `useSyncExternalStore` only when a concrete need arises; do not introduce Zustand, Redux, SWR, React Query or a general service container.
- `apps/web/src/components/islands/GameScreen.tsx` owns the hydrated screen boundary, HUD/controls/overlay presentation, page-specific React panels, renderer mount `ref`, and subscription/teardown. The web layer injects the existing typed API client and score submitter. `@cetus/ui` remains presentational and does not import `@cetus/app-core` or game engines.
- Keep `apps/web/src/lib/games/<game>` as web-only Pixi / DOM / keyboard/pointer renderer adapters. They take an owned host element (`HTMLElement`) and callbacks, never look up their mount container by a global hard-coded ID. Preserve existing renderer timing and game physics. Any rules accidentally embedded in a page controller move to `@cetus/games` with a unit test.
- Define the **smallest necessary interface** between app-core and web: a game session adapter with start, pause/resume/reset/end, subscribe-to-snapshot/results and dispose, with optional capabilities only where that game actually supports them. A wrapper maps BaseGame events/getState to this contract; the three handle-based games each use thin callbacks-to-session adapters. Do not rewrite the 20 BaseGame engines into the handle model or vice versa.
- Use explicit game-id-to-`import()` loaders and existing catalog metadata to load only the game module requested by a route. Keep typed per-game adapter modules where necessary rather than a mega switch with 23 game-specific conditionals. No new plugin registry or codegen; no eager bundle of all games.

### 2. Hook behavior and API contracts

- `useGameSession(session)` tracks started/paused/finished, score, remaining time and final stats from a stable adapter. Subscribe once per session; unsubscribe on change/unmount; update React only on meaningful UI state changes, **not every Pixi frame**. Return straightforward actions and session snapshot; handle unavailable capabilities by hiding controls, not by adding fake methods. Reset/Play Again semantics are game-specific and must not accidentally auto-start.
- A BaseGame end invokes `onEnd` for immediate local completion, then emits saved achievements/challenge updates once the injected score call resolves. Observe the **structured** end payload for saved rewards and treat missing payload as non-result (timer event). Preserve the existing run guard behavior: do not show older-run rewards after a restart. Do not double-submit or double-toast. Handle errors and zero/guest-score behavior exactly as before.
- **Only `useLeaderboard` and `useChallenges` are in scope as data hooks**, because Tetris, 2048 and Bejeweled currently request leaderboards and challenge data. `useLeaderboard` delegates to existing `getLeaderboard(query, {signal})`; `useChallenges` delegates to `getChallenges({signal})` and only calls `getChallengeXp` if a migrated view actually needs it. Use existing typed DTOs. **Defer `useProfile`, `useAchievements`, and `useLoginRewards`**: no migrated game page consumes these hooks. Existing account/session data, app-wide achievement notifications and dashboard login-reward modal remain with their existing owners; add those hooks in a future consumer ticket only when needed. No new endpoints, speculative DTOs, generalized caches or global polling.
- **Use plain parameter injection; no context/provider or hook factory.** `useLeaderboard(client, query)` and `useChallenges(client, ...)` accept an `ApiClient` typed instance (or the narrow existing method subset, if useful). `useGameSession(session)` takes the session adapter directly. Web GameScreen creates one stable client instance and supplies it; tests pass mocks. The game's score submitter stays injected through its already-required `BaseGameConfig.submitScore`, never through another hook. Guest/loading/failed-save behavior remains responsive; responses after unmount/changed query cannot overwrite newer state. Abort where the existing method accepts a signal; otherwise use a request generation guard.
- **Runtime portability is not the test environment.** Use the already-installed React 19-compatible `@testing-library/react` / `renderHook` under the existing **jsdom Vitest** pattern for hook behavior; do not introduce deprecated `react-test-renderer` (React 19) or a separate renderer. Test the pure session adapter/event normalization in Node (`// @vitest-environment node` for focused files). Extend the root Vitest project list and consolidated coverage for app-core; enforce **no DOM in production app-core source** through package-boundary lint, an app-core `no-restricted-globals` rule for DOM globals, and a no-DOM TypeScript lib where possible. Test mocks, jsdom and testing-library dependencies are dev/test-only; no browser globals in the exported runtime.

### 3. Web screen composition and rendering

- `AppLayout.astro` continues SSR, metadata, session extraction and site-wide notifications. Every route retains its public path and only passes serializable props (game id, user/display data and page-specific static options) to `<GameScreen game="..." client:load />`. No root-level inline game initializer script survives. Astro React hydration lifecycle is the only controller mount boundary.
- The common chrome composes existing `@cetus/ui` GameTitle, GameStats, GameControls, GameOverlay, Badge/Card and specific stats/instructions panels. Preserve DOM semantics, focus, keyboard shortcuts, accessible labels, touch behaviors and responsive dimensions. React owns HUD and overlay state; old DOM writes/listeners must be deleted when migrating a game. No React reconciliation over DOM mutated by an old imperative controller.
- The four **field plates** retain their dedicated headers, modal/dialog panels, CSS, motion/audio settings, reduced-motion behavior, focus restoration, accessibility and daily/leaderboard account panels. Use four dedicated React screens **inside the same GameScreen session boundary** (and shared small helpers only when actual duplication is established), not a redesign to the generic GamePage shell.
- The renderer stays imperative behind a host `ref`. Mount exactly once per active island; on unmount/route transition, cancel rAF and timers, remove global keyboard/pointer/beforeunload listeners, destroy Pixi resources, invalidate stale async callbacks, and clear only the debug handle owned by that instance. Avoid side effects during render. StrictMode double mount and Astro navigation should not leak listeners or canvases.
- Preserve `window.<game>Game` names and useful return shapes for debugging; expose from the **web adapter**, not app-core. Keep `window.showAchievementAward` / `window.showChallengeComplete` exclusively in AppNotifications. No extra global event bus.
- For handle-based games, pass their existing `container` and UI callbacks into `initializeCircuitHackerGame` / `initializeSatelliteSync` / Ice Slide init; remove their `setText`/`showOverlay`/`resetButtons` mutations once React owns those nodes. Preserve Ice Slide Campaign/Daily/Expedition mode, Undo/route choices/score context and save notifications. Never centralize those rules into a generic GameScreen.
- Keep existing styles and tokens. Import field-plate CSS where it is actually used and add a precise Tailwind `@source` only if the new web files fall outside the already-scanned web tree. Do not create new art or sound assets.

### 4. Migration inventory and boundaries

**One pilot:** Snake.

**Fifteen standard GamePage games:** Memory Matrix, Mine Grid, Pattern Pulse, Potion Sorter, Chromatic Tide, Sudoku, Quick Math, Word Scramble, Reflex, Evader, Path Navigator, Signal Switch, Gravity Flip, Asteroid Drift, Rhythm Reactor.

**Three handle-based games:** Circuit Hacker, Satellite Sync, Ice Slide.

**Four bespoke field plates:** Tetris, 2048, Bejeweled, Bubble Shooter.

That is 1 + 15 + 3 + 4 = **23**. For each, track current route, initializer, mount node, controls, keyboard/pointer listeners, score submitter, rewards, last-run overlay, debug handle and cleanup ownership in the PR checklist; do not build a permanent manifest or migration framework.

## Tradeoffs and explicit exclusions

- Prefer a shared **lifecycle** and a few real reused UI elements, not 23 wholly identical layouts. Existing field-plate style is intentional.
- Keep the current typed API and score-saving ownership. The hooks are UI state synchronization, not another persistence layer.
- No Expo app/native component work (HPA-179/HPA-182/HPA-425), Skia or new game loop abstraction (HPA-533), major game mechanic rebalance, database schema change, external state/cache library, SFX or image generation.
- **One PR for HPA-393** with staged commits, not two PRs or a new ticket. To control review risk, request explicit human review of the Snake pilot before Stage 3, each standard-game batch before continuing, the handle batch before Stage 5, and **each of the four field-plate commits individually** before moving to the next plate. Record the reviewer acknowledgment/checkpoint outcome in the PR; CI alone does not count as review. Re-check/rebase against `main` before each large batch to limit drift. No compatibility shims for unpublished consumers.

## Acceptance and verification

1. `@cetus/app-core` typechecks with **no browser-global runtime dependencies**. Pure adapter tests run in Node, while React hook behavior uses existing React Testing Library + jsdom to remain compatible with React 19. Test duplicate listener prevention, cleanup, start/pause/end/reset, result/achievement timing, stale response suppression, guest/error behavior and handle adapters. Package ESLint/TypeScript restrictions catch DOM / Astro / Pixi use in production app-core source (verify with a temporary forbidden import and DOM-global access).
2. All **23** routes are thin Astro shells around `GameScreen`; `GamePage.astro` and obsolete page-root init scripts/controllers are deleted only when the last consumer is migrated. No duplicate listeners or DOM ownership; no route/slug change. Every `window.<game>Game` debug contract is preserved.
3. Snake, every other standard page, all three handle-based games and all four field plates play, pause/restart, conclude, save scores and surface achievements/challenge completion with the same timing and errors as before. Ice Slide run modes, Tetris/2048/Bejeweled/Bubble Shooter custom panels and guest behavior remain intact.
4. Existing keyboard/touch accessibility, modal focus/escape behavior, mobile+desktop layout, app notifications and back/forward navigation pass targeted Playwright tests; test unmount/remount while a run and score save are active. Reuse `apps/web/e2e/games/play-coverage.spec.ts` and existing per-game journeys as **blocking gates**. Desktop/mobile screenshots are **manual comparison artifacts only**, not snapshot/pixel-diff CI gates; do not introduce `toHaveScreenshot` or a Pixi canvas screenshot harness.
5. Run root format/lint, `turbo run typecheck`, web Astro check, consolidated unit/coverage (>=90% existing gates), build, and full Playwright (including all-games navigation + authenticated score submissions); document any **pre-existing** flakes separately instead of silently broadening scope.

## Review decisions (2026-10-27, PR #99)

- Accepted scope reduction: only `useGameSession`, `useLeaderboard` and `useChallenges` plus their minimal adapters; defer three unused hooks until real consumers exist. This intentionally narrows the older Linear scope without reducing the 23-game migration.
- Accepted plain parameter-injected API client rather than a React provider/hook factory.
- Accepted React Testing Library + jsdom for hook tests, pure adapter tests in Node; **portable runtime** is the no-DOM invariant, not a Node-only React test renderer.
- Accepted non-blocking local visual comparisons and existing Playwright gameplay assertions as blocking gates.
- Accepted staged mandatory human reviews **within the same PR**. Declined the proposed multi-PR alternative, following the one-ticket/one-PR project rule.
