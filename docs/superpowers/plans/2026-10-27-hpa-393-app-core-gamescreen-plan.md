# HPA-393 — single-PR stepwise implementation plan

Status: **planning only** (2026-10-27)  
Design: [HPA-393 app-core/GameScreen spec](../specs/2026-10-27-hpa-393-app-core-gamescreen-design.md)  
Linear: https://linear.app/cwchanap/issue/HPA-393/build-cetusapp-core-and-move-all-23-web-game-pages-onto-gamescreen

## Execution rule

**Exactly one PR for this Linear ticket.** This PR begins with the two planning documents, then the implementation lands as a sequence of commits on the **same branch/PR**. Do not split by game or by package. Rebase/check `main` before implementation because HPA-379 (#97) merged immediately before planning. At each checkpoint, prefer deletion of migrated controllers over compatibility shims. No new art/SFX is required.

## Stage 0 — baseline, inventory and regression harness

1. Confirm `main` contains merged `@cetus/ui`, portable games and API client. Record baseline root tests/coverage, Astro/build, lint and Playwright outcomes (and known pre-existing flaky tests) before touching game screens.
2. Capture concise per-game checklist: game id/path; initializer/result type; BaseGame vs handle; container mount; input + rAF ownership; special HUD/modes/overlay; score/achievement path; debug global and cleanup. Cover **1 Snake + 15 standard + 3 handles + 4 plates = 23**, not a new registry.
3. Extend existing smoke tests where thin: verify authenticated score/achievement+challenge notification flow, DOM mount/unmount, keyboard/touch and restart on Snake; later parameterize smoke checks across the 23 routes. Capture comparison screenshots at desktop (1280px) and mobile (390px), specifically each bespoke plate.
4. Inspect `packages/ui/src/components/game-*` and current `apps/web/src/components/games/GamePage.astro` props/IDs. Confirm which labels/slots can map directly into React and which panels remain per-game.

**Gate:** baseline documented; 23-game migration checklist complete.

## Stage 1 — introduce app-core with no UI/browser ownership

1. Add `packages/app-core/package.json`, `tsconfig.json`, `src/index.ts`; depend on React peer, `@cetus/shared`, `@cetus/games` only if needed for adapter typing, and `@cetus/api-client`. Add an app-core **Node** project to root Vitest and existing coverage; extend root ESLint package dependency direction and DOM-global checks. No separate test runner, bundler or cache library.
2. Define a small session adapter contract and BaseGame adapter in `app-core`: snapshot/actions/subscription cleanup; map `onEnd` local completion versus validated structured `'end'` result-after-submit without double submission. Ensure old-run award notifications cannot escape after reset/restart. Add an adapter seam for handles without importing web initializers.
3. Implement `useGameSession` with stable subscription, state snapshot, controls and teardown. Add `useLeaderboard`, `useChallenges`, `useLoginRewards` using the real API-client methods; implement `useProfile` and `useAchievements` against passed initial SSR data + existing mutations/reward events (there are no GET endpoints for them). Keep APIs simple and refetch on demand.
4. Test with a Node-compatible DOM-free React renderer and mocked session/API client: start/pause/resume/end/reset, pause restrictions, score/time, event ordering, duplicate `end` events, zero/failed saves, late async response after unmount, stale/new query and no duplicate notifications. Avoid building a generic caching state machine.

**Gate:** app-core package independent typecheck + Node hooks tests; root tests/coverage still include it; lint intentionally rejects a temporary forbidden import.

## Stage 2 — Snake pilot and reusable web GameScreen boundary

1. Add `apps/web/src/components/islands/GameScreen.tsx` and a small per-game loader mapping ID -> `import()`, using existing `@cetus/shared` catalog IDs. Implement the common React chrome with existing `@cetus/ui` and web-only notification forwarder. Keep Astro layout/SEO.
2. Refactor `apps/web/src/lib/games/snake/initFramework.ts` into a host-element/callback adapter: use passed `ref` (not `document.getElementById('snake-container')`), preserve the **single** existing rAF path, injected `submitScore`, renderer, input and unload warnings. Remove its own HUD/button/overlay DOM writes and listeners; let the React screen own these.
3. Move `apps/web/src/pages/snake/index.astro` to an Astro route with `<GameScreen game="snake" client:load />`, no inline root `<script>`. Preserve Snake special stats and keyboard help in React; register/clear the original `window.snakeGame` debug result.
4. Add React integration tests for the screen and Playwright checks for keyboard movement, 60-second/early end, play again, score submission, reward notifications and repeated mount/unmount.

**Gate:** Snake gameplay and post-run UX match baseline; score saved once, awards shown once, cleanup verified, desktop/mobile screens visually comparable.

## Stage 3 — the 15 other standard GamePage games

Migrate in small **commits inside this PR**, reusing the Snake lifecycle boundary and per-game adapters; keep rules in `@cetus/games`:
- Puzzle/view: Memory Matrix, Mine Grid, Pattern Pulse, Potion Sorter, Chromatic Tide, Sudoku, Quick Math, Word Scramble, Reflex.
- Canvas/arcade: Evader, Path Navigator, Signal Switch, Gravity Flip, Asteroid Drift, Rhythm Reactor.

For each game: replace Astro game markup/script with a thin `GameScreen` route; pass mount `ref` and callbacks; move HUD/controls/overlay/menu/game-specific stats into React; remove the old DOM writes/handler ownership; preserve touch/keyboard/game input and game-specific reset/pause behavior; expose the existing debug handle. Move page-script **rule logic** into `@cetus/games` with focused tests only where actually found. Avoid giant shared-config objects for differences that exist in only one game.

**Gate after each small batch:** package/web typecheck, relevant unit tests, route smoke, game completion + score/award regression. Do not leave two controllers attached to one game.

## Stage 4 — handle-based exceptions

1. Circuit Hacker: keep `initializeCircuitHackerGame(container, callbacks)` and the existing start(difficulty)/stop/cleanup/getGame semantics, but emit UI state via callbacks rather than mutating `#game-over-overlay`/buttons/stats. React owns tier selection, errors and result panel.
2. Satellite Sync: preserve its pointer/keyboard input, level progression, stop/cleanup and scoring. Map callbacks into a small handle adapter; avoid a BaseGame conversion.
3. Ice Slide: preserve Campaign, Daily and seeded Expedition runs, route choices, Undo, results, score contexts and per-day leaderboard; adapt its existing handle actions as capabilities, not generic functions in all games. Honor stale run/save guards.
4. Remove the old page-root controllers and migrate each route to `GameScreen`. Assert cleanup/re-entry (including a pending async score save) and debug handles.

**Gate:** all three play and finish identically; no duplicate save/toast or stale overlay, including Ice Slide mode switching.

## Stage 5 — four custom field-plate screens

1. Migrate Tetris, 2048, Bejeweled and Bubble Shooter individually. Move each 1,200–2,100-line inline script into a **dedicated React component/controller module**; separate true rules into `@cetus/games` with tests, while leaving renderer/audio, menus and app API orchestration web-owned.
2. Keep their special plate headers, CSS, accessible dialogs, panel routing/focus, sound/ghost/reduced-motion settings, undo/hold/aim controls, local+remote bests, challenges/log/rewards and telemetry exactly as built. Use `@cetus/ui` when it matches; do **not** homogenize field plates into a GamePage sidebar.
3. Replace id-based DOM mutations in portions React owns with props/state. Renderer may operate on its own passed canvas host; never mutate the React-managed HUD. Preserve existing use of `getLeaderboard`/`getChallenges`/`getBestScore` from shared API client through app-core hooks where useful; no duplicate fetching abstraction.
4. Test each page against its existing E2E controls and desktop/mobile snapshot, plus dialog Escape/focus, restart, guest/auth scores, achievements, navigation teardown and debug globals.

**Gate:** four complete Playwright journeys and visual parity; no inline game-controller script in any of 23 Astro pages.

## Stage 6 — remove migration shell, final verification

1. Delete `apps/web/src/components/games/GamePage.astro` after the last page migrates, plus orphaned wrapper tests and dead controller/test stubs (replace worthwhile assertions with GameScreen/React tests). Keep `AppLayout.astro`, SSR SEO and active web notifications.
2. Search all 23 routes for `<script>` game initialization, `DOMContentLoaded`, superseded `getElementById` HUD writes, duplicate global keyboard handlers, dangling renderer/dispose and missing `window.<game>Game`. Do a final strict-mode/remount stress smoke.
3. Full gates: `bun run format:check`, `bun run lint`, `bun run turbo run typecheck`, `bun run typecheck`, `bun run test:run`, `bun run test:coverage` (unchanged >=90% Codecov goals), `bun run build` and `bun run test:e2e`; review any coverage deltas instead of relaxing thresholds. Check authenticated Vercel preview, all game routes, score API and console errors before ready-for-review.
4. Update this PR checklist and Linear HPA-393 with factual outcomes; keep the PR draft until implementation and CI/preview acceptance pass. Do not mark the ticket Done from the planning commit.

## Risks to watch

- **Double save/award:** BaseGame submits internally and emits both timer-forwarded and structured `end`; distinguish local end from save-complete result.
- **React/imperative conflict:** never keep old controllers mutating React-owned HUD/overlay DOM.
- **Race during routing:** cleanup async Pixi init, rAF, globals, and stale responses on unmount; no duplicate canvases/listeners.
- **Page-specific semantics:** field plates and Ice Slide contain legitimately different modes/UI, not reasons to inflate the generic abstraction.
- **Data hooks:** no GET profile/achievement endpoints exist; reuse server data and existing API calls instead of inventing endpoints.

## Deliverables checklist

- [ ] `@cetus/app-core` with documented small interfaces and Node hook tests
- [ ] `GameScreen` boundary + Snake validated
- [ ] Fifteen standard game routes migrated
- [ ] Three handle-based game routes migrated
- [ ] Four field-plate routes migrated
- [ ] Obsolete `GamePage.astro` and inline controllers removed
- [ ] Debug handles, score/reward semantics, input/accessibility and visuals preserved
- [ ] Root lint/typecheck/unit/coverage/build/Playwright + authenticated preview green
