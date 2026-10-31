# HPA-393 — single-PR stepwise implementation plan

Status: **planning only; round-2 review incorporated (2026-10-27)**  
Design: [HPA-393 app-core/GameScreen spec](../specs/2026-10-27-hpa-393-app-core-gamescreen-design.md)  
Linear: https://linear.app/cwchanap/issue/HPA-393/build-cetusapp-core-and-move-all-23-web-game-pages-onto-gamescreen

## Execution rule

**One Linear ticket = one GitHub PR (#99).** Keep all implementation commits on this draft branch; no early Snake merge or separate ticket/PR. Re-check `main` before implementation and each large batch. Staged commits require **explicit human review acknowledgement in PR #99 before proceeding**: after Snake, after each standard-games batch, after the three handle games, and after *each* of the four individually reviewable field plates. Passing CI alone is not a review. No new image art/SFX, general-purpose state library, API endpoint or back-compat scaffolding.

## Hard contracts across every migration commit

1. Preserve all 23 existing route paths, gameplay, controls, guest/auth score behavior, achievements/challenges, accessibility, field-plate UX and `window.<game>Game` **names and live method/return shapes** (not merely name strings). Existing E2E selectors are frozen: `#start-btn`, `#end-btn`, `#game-over-overlay`, `#score`, `#time-remaining`, `#pause-btn`, `#play-again-btn` and game-specific selectors. **Never silently update existing specs to fit changed markup**; newly added specs are fine, and any necessary existing test edit must be justified and highlighted at the human checkpoint.
2. Preserve **one score submitter and one toast source** per game. `BaseGame.end()` already saves and emits structured results after `onEnd`; timer also forwards a bare `end`. One BaseGame-only web notification forwarder replaces the per-game listeners **on the 16 React-controlled BaseGame screens (Snake + 15 standard games)**. The **four hosted BaseGame field plates keep their existing initializer forwarding** and never install that new forwarder while the old one remains. The three handle games retain `saveGameScore` toast delivery. GameScreen must never forward handle or hosted-plate results; every screen has exactly one toast owner. Test one toast per saved award and suppress old-run results.
3. Shared `GameScreen` is a **presentational React component**, not a 23-entry game-ID loader island. Every Astro route statically imports its own **named React island** (e.g. `SnakeScreen`) for stable SSR chrome/IDs; that island dynamically imports its own renderer/controller **inside the mount effect**, avoiding Pixi/DOM imports on the server.
4. Shared `@cetus/ui` GameOverlay/GameControls/GameStats gain **optional controlled props**, preserving existing HTML IDs, markup and default imperative/SSR behavior until the final `GamePage.astro` user migrates. Do not duplicate these components under GameScreen.
5. The field plates are **hosted imperative DOM controllers**, not hybrid React rewrites. Their host island owns mount/teardown only; controller owns every DOM child and all panel/HUD mutations. Keep the host subtree static/non-reconciling while controller runs. Existing `createApiClient()` calls stay in controllers; **do not build unused `useLeaderboard`, `useChallenges`, `useProfile`, `useAchievements`, or `useLoginRewards` hooks**. Only `useGameSession` is necessary in app-core.
6. No `ClientRouter`, View Transitions or `transition:persist` exist. Do not add Playwright unmount/remount/route-transition harnesses. Test teardown via React Testing Library `unmount()` (per session kind) and preserve ordinary full-page navigation coverage. Desktop/mobile screenshots are manual comparison artifacts, **not blocking automated canvas snapshots**.

## Stage 0 — baseline and contracts (no new runtime abstractions)

1. Reconfirm merged HPA-379 (#97) and HPA-447 (#95) are in current `main`. Record baseline `bun run` format/lint/typecheck/unit/coverage/build and `bun run test:e2e` results; list known flakes rather than broadening this task.
2. Keep a **PR checklist** (not a generated runtime manifest) for all 23 game pages: route, init handle, board host element, keyboard/pointer/RAF owner, score-toasts owner, overlay/HUD IDs, debug global and cleanup. Breakdown: Snake (1), standard (15), handle (3), field plates (4). Note that **19 use `GamePage.astro`** and four field plates do not.
3. Reuse `apps/web/e2e/games/play-coverage.spec.ts` and existing game-specific specs as the **blocking baseline**. Snapshot visual state manually at desktop 1280px and mobile 390px; no `toHaveScreenshot` framework.
4. Verify existing `@cetus/ui` game components: overlay defaults to hidden/0; controls hide end button; stats expose initial time only. Record existing IDs and E2E/debug-handle method usage before editing them.

**Checkpoint:** baseline and contracts reviewed. No new loader registry.

## Stage 1 — build app-core **with** its first consumer, Snake

1. Add `packages/app-core/{package.json,tsconfig.json,src/index.ts}` with React peer dependency and only the portable dependencies actually imported. Add app-core to the **existing** root Vitest/coverage projects, using the installed `@testing-library/react` `renderHook` and jsdom for React hooks and `// @vitest-environment node` for pure adapter files. Extend package import/DOM-global lint bans and production no-DOM TypeScript typecheck; no `react-test-renderer`, extra runner or provider.
2. Define the **minimal Snake-driven** session adapter: subscribe/getCachedSnapshot/actions/dispose, a local-completion event versus structured save result, and optional control capabilities only where Snake requires them. Build the BaseGame adapter and `useGameSession(session)` simultaneously with Snake, rather than designing a speculative handle/data API.
3. **Cache projected snapshots:** `BaseGame.getState()` returns a *new object*, so never pass it through `useSyncExternalStore` as an uncached snapshot. Project status, score, time and the game's necessary HUD fields (e.g. length), keep the same object reference for unchanged projections and notify only when a projected value changes. Test stable snapshot reference across repeated reads and state-change bursts.
4. Extend existing `packages/ui/src/components/game-{overlay,controls,stats}.tsx` with **optional** controlled `open/score/onButtonClick`, `running/paused/onStart/onPause/onEnd/onReset`, and `score/time` props, respectively. Check default/SSR markup, existing IDs, legacy hidden state and button behavior remain unchanged in still-Astro routes.
5. Create `apps/web/src/components/islands/games/SnakeScreen.tsx` to compose shared `GameScreen` and its Snake-specific stats/help. Its effect dynamically imports `apps/web/src/lib/games/snake/initFramework.ts`, passes the board `ref` instead of a hard-coded mount ID, subscribes to the BaseGame adapter, and tears down RAF, keyboard/unload listeners and Pixi renderer once. React owns the controlled HUD/buttons/overlay, so delete superseded imperative updates in that initializer.
6. Replace the Snake route with `<SnakeScreen client:load />` and no root game `<script>`. Keep `window.snakeGame` result methods and clear only that instance's reference on teardown.
7. Use **one BaseGame-only web notification forwarder** for saved structured results and remove Snake's old toast listener as part of its migration. Never forward the timer's bare `end`; preserve the BaseGame's stale-run filtering and no second score submission.
8. Test hook + adapter behavior (start/pause/resume/end/restart; unchanged snapshot identity; one award toast; stale save, duplicate listener prevention) with RTL/jsdom and pure Node tests. RTL `unmount()` proves listeners, RAF and debug handle cleanup; use existing Snake gameplay/score Playwright journeys for live behavior (no artificial route remount E2E).

**Checkpoint:** Snake score and notifications are unchanged, standard UI default props still work, existing selectors/handle shape intact, CI gates pass and **human review of Snake commits is acknowledged** before moving on.

## Stage 2 — fifteen other standard games, in reviewed batches

- **Puzzle/view (9):** Memory Matrix, Mine Grid, Pattern Pulse, Potion Sorter, Chromatic Tide, Sudoku, Quick Math, Word Scramble, Reflex.
- **Canvas/arcade (6):** Evader, Path Navigator, Signal Switch, Gravity Flip, Asteroid Drift, Rhythm Reactor.

For each: add a route-specific `<GameNameScreen client:load />` using shared `GameScreen` chrome and optional controlled `@cetus/ui` props; dynamically load only the corresponding browser initializer in its effect; pass host `ref`; move HUD/overlay/button ownership to React, delete the old DOM writers and listeners; preserve all game-specific keyboard/touch, Play Again, debug and score behavior. Reuse the **single BaseGame-only** notification forwarder in place of the game's legacy listener. Move only *actual* page-embedded game rules to `@cetus/games` with tests when found.

**Checkpoint after every small batch:** typecheck, relevant unit + Playwright gameplay/score/notification tests, frozen selector/handle contract audit, and explicit human review of that batch before the next. No two controllers on the same DOM elements.

## Stage 3 — three existing handle-based games

1. Circuit Hacker: keep `initializeCircuitHackerGame(container, callbacks)` and `start(difficulty)/stop/cleanup/getGame`; bridge UI callbacks into the game session and React-controlled chrome. Its `saveGameScore` still owns persistence and achievement/challenge toasts.
2. Satellite Sync: preserve the existing level progression, pointer/keyboard controls, score save and debug handle; bridge callbacks to controlled chrome without a BaseGame rewrite.
3. Ice Slide: preserve Campaign/Daily/Expedition, seeded run context, choices, Undo, result/error messages and per-day leaderboard behavior; keep `saveGameScore` and stale-run guards.
4. Add the small **handle adapter seam now, with these real consumers**; test one toast per successful handle save and that a display-result event does not forward another toast. Replace `setText/showOverlay/resetButtons` in each handle initializer for React-owned HUD nodes; keep the actual Pixi board imperative.
5. Convert each of the three routes to its **own** named React island, keeping existing IDs and handle methods. Assert teardown through RTL instead of new Playwright remount tests.

**Checkpoint:** all three games' normal play, end/save, errors and Ice Slide modes pass E2E; no double toast; human review acknowledged.

At this point, **all 19 consumers of `apps/web/src/components/games/GamePage.astro` are migrated**. Remove that shell and replace its orphaned tests **here**, without waiting for four unrelated field-plate routes.

## Stage 4 — four hosted field plates, one independently reviewed extraction each

Tetris, 2048, Bejeweled and Bubble Shooter have bespoke page layout/controllers and **do not use GamePage.astro**. Keep that UI, rather than rewriting ~5,500 lines of imperative logic in React.

For **each plate, in its own commit or self-contained commit group**:

1. Move the existing page-root `<script>` controller into `apps/web/src/lib/games/<game>/controller.ts`, exposing a mount entrypoint such as `mount(host: HTMLElement, signal: AbortSignal): Cleanup | void`. Adapt top-level DOM lookups and template updates to stay inside the supplied host (only genuinely global listeners live outside the host). Reuse the existing AbortController pattern and cleanup of Pixi/audio/timers.
2. Introduce a dedicated `<TetrisScreen client:load />`, `<Game2048Screen client:load />`, `<BejeweledScreen client:load />`, or `<BubbleShooterScreen client:load />` (names illustrative) whose static React markup is identical to the existing plate. The host's descendants belong **exclusively** to the imperative controller: **do not use React state to render/reconcile the same subtree**, and ensure changes to parent session state do not re-render its plate markup. React owns the lifecycle, not a second UI state controller.
3. Keep existing controller-owned `createApiClient()` leaderboard/challenges fetches, template cloning, dialog focus/escape, sound, reduced motion, best-score/undo/hold/aim, notifications, UX and debug handle *shapes*. No new data hooks, internal React panel rewrite or duplicate account fetch.
4. Replace the Astro root script with the named island and verify existing `play-coverage.spec.ts` / plate-specific E2E unchanged, including selectors. **Keep the existing per-plate BaseGame initializer notification listener; the hosted island must not also register the shared BaseGame forwarder.** Capture optional manual desktop/mobile comparison images. Verify cleanup via RTL.
5. **Stop for human review of this plate** before starting the next; flag any proposed changes to legacy specs explicitly.

**Checkpoint:** four plate routes migrated as hosted controllers; their visual DOM/UX and gameplay behavior are unchanged, and no page has leftover inline game-controller scripts.

## Stage 5 — delete dead initializer and final verification

1. Search every route for inline game bootstrapping, old HUD mutations and duplicate notification paths; verify one controller + one toast owner per game. Ensure only static Astro route/layout markup remains, and all per-game islands render expected SSR IDs.
2. **Delete the unused** `apps/web/src/lib/games/core/GameInitializer.ts` and its own test, remove its class/type re-exports from `core/index.ts`, and remove the now-stale ESLint exclusion. Confirm no live production importer before deletion. **Keep** `BaseRenderer`, `RendererFactory` and their live renderer consumers. Update `CLAUDE.md` to remove the stale “do not delete”/initializer guidance and describe the new session adapter/host architecture; earlier ticket's instruction concerned earlier migrations, not this replacement.
3. Run the full existing gates: `bun run format:check`, `bun run lint`, `bun run turbo run typecheck`, `bun run typecheck`, `bun run test:run`, `bun run test:coverage` (unchanged >=90% Codecov threshold), `bun run build`, `bun run test:e2e`. Preserve existing E2E selectors/handle shapes; any existing-spec modifications must be called out for human review.
4. Check normal full-page navigation and an authenticated Vercel preview for score, error/notification behavior, accessibility and all 23 routes. Manually compare representative 1280px/390px screens if needed. **No new Playwright remount/StrictMode browser scenarios or screenshot diff harness.**
5. Update PR checklist and Linear HPA-393 with verified implementation outcomes; remain draft until reviews, CI and preview checks are complete. Planning commits do not satisfy implementation completion.

## Review decisions (2026-10-27, round 2)

Accepted all nine actionable findings from the latest PR #99 comment:
- Hosted **single-owner** field-plate controllers rather than hybrid React/DOM rewrites; this removes the need for the two previously planned data hooks.
- BaseGame-only forwarding replaces **the 16 React-controlled screens'** legacy bridges; **four hosted BaseGame plates keep their existing forwarding**, while the three handle games keep score-service forwarding.
- Freeze E2E IDs and debug-handle shapes so the regression tests are independent of migration changes.
- Design the session adapter, cached snapshot and hook **with Snake**; defer handle adapters until Stage 3.
- One per-route named React island with dynamic browser renderer import; no 23-entry `import()` loader registry.
- Add optional controlled props to existing `@cetus/ui` game chrome without changing its old SSR contract.
- Cache projected snapshots to avoid unnecessary renders and `useSyncExternalStore` identity loops.
- Use RTL unmount tests (no production ClientRouter), not new Playwright route-transition tests.
- Delete the unused `GameInitializer` and reconcile `CLAUDE.md` once migration code is landed.

**Single PR retained**, with explicit human checkpoints; no second PR or extra task.

## Deliverables checklist

- [ ] 23-game baseline inventory + frozen existing E2E/debug contracts
- [ ] `@cetus/ui` optional controlled props with existing default SSR output preserved
- [ ] `@cetus/app-core` minimal cached BaseGame adapter + `useGameSession` implemented with Snake; jsdom hook tests, pure Node tests, no-DOM source lint/typecheck
- [ ] 15 standard game routes migrated and reviewed in batches
- [ ] 3 handle-based routes adapted; exactly one score toast per reward
- [ ] `GamePage.astro` deleted after its 19 consumers are migrated
- [ ] 4 bespoke field-plate controllers hosted as exclusive DOM owners and individually reviewed
- [ ] Legacy `GameInitializer`/test/exports removed after importer check; `CLAUDE.md` updated
- [ ] Root lint/typecheck/tests/coverage/build + existing Playwright + preview verification green
