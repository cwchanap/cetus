# HPA-533 — Skia GameCanvas, Snake and wave 2: single-PR implementation plan

**Status:** Planning draft, 2026-11-15; all implementation and verification checkboxes are future work unless marked checked.
**Linear:** [HPA-533](https://linear.app/cwchanap/issue/HPA-533/build-the-skia-gamecanvas-with-snake-and-port-the-wave-2-games)
**Design:** [Native GameCanvas / wave 2 specification](../specs/2026-11-15-hpa-533-skia-wave2-mobile-design.md)
**Baseline:** `main` after merged [HPA-425 / PR #105](https://github.com/cwchanap/cetus/pull/105).
**PR rule:** **One Linear ticket = one PR.** All docs, native modules, eight ports, fixes and verification changes land as successive commits on this **same** branch. Stage boundaries are reviewable commits, *not* additional PRs. No new artwork or SFX is required; create a separate ticket if needed later.

## Stage 0 — Dependency, source and tooling inventory

- [x] Confirm HPA-533 is Backlog and unblocked by completed HPA-179/HPA-393; HPA-535 and HPA-199 remain downstream.
- [x] Confirm #105 is merged; `main` contains wave-1 host/registry/chrome and 8/23 playable games; no dedicated HPA-533 PR/branch existed before this planning branch.
- [x] Inspect `apps/mobile/src/games/{NativeGameHost.tsx,NativeGameChrome.tsx,registry.ts}`, the Expo route, portable engines, and web Snake loop. Verify that existing score/auth/reward contracts must be reused.
- [x] Confirm there are no Linear-attached mockups for HPA-533. Use current web renders and shared mobile tokens for automated visual comparison.
- [ ] Record `main` baseline gates: `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`, `bun run --cwd apps/mobile test --runInBand`. Record failures as preexisting if reproducible; do not weaken checks.
- [ ] Verify the available iOS simulator/dev-client build path and whether the fixed HTTPS API/auth origin supports authenticated device checks. Guest gameplay and deterministic score-response tests must **not** depend on provider setup.

**Commit checkpoint:** the documentation only (this PR starts here). No claim of iOS/Android native verification.

## Stage 1 — Native module and minimal reusable frame/canvas primitives

**Commit 1: dependency/native-build smoke.**

- [ ] Add an SDK-57-compatible `@shopify/react-native-skia` dependency in `apps/mobile/package.json` (start with Expo SDK 57's recommended 2.6.2, not `latest`). Use `expo install` from the mobile workspace and update the root `bun.lock`. If importing Worklets `scheduleOnRN` directly, declare the compatible `react-native-worklets` dependency explicitly rather than relying on an incidental transitive resolution.
- [ ] Ensure one `GestureHandlerRootView` wraps navigation without disrupting the current `VariableContextProvider` / token context. Keep existing dev-client, Expo Router and NativeWind configuration.
- [ ] Mount a temporary Skia `Canvas` rectangle and simple tap/pan in the existing mobile app, build/load on an iOS simulator using a rebuilt development client, and check Metro does not import web Pixi/DOM or bundle a second React copy. Test Android bundling in CI. **Do not** use `makeImageFromView`; SDK-57's recommended Skia has a reported RN-0.86 issue in that particular API. If actual required primitives fail, capture a minimal reproduction before considering a tested alternate Skia version.
- [ ] Remove the temporary canvas after the real Snake pilot consumes the dependency; no permanent demo screen unless existing dev gallery needs it.

**Commit 2: the tiny platform-neutral stepper.**

- [ ] Add `packages/games/src/core/GameStepper.ts`: `createGameStepper(update: (deltaSeconds: number) => void)` returning `tick(timestampMs)` and `reset()`. Reject initial/invalid/out-of-order times; cap a single stall delta at ~0.05 s and **never** replay catch-up frames. Do not add a fixed-physics accumulator (Asteroid Drift and Gravity Flip already own substeps).
- [ ] Add portable Vitest: zero on first frame; 16-ms → ~0.016-second update; 1000-ms stall capped; reset/restart no jump; duplicate/backward timestamps ignored.
- [ ] Add `apps/mobile/src/games/canvas/useGameFrameDriver.ts`: one Reanimated `useFrameCallback`, schedules **JS** `stepper.tick` with `scheduleOnRN`, no second rAF or interval, and no worklet captures of a `BaseGame` instance. Start/stop based on lifecycle and `AppState`; pause foreground-only games on background, restore only an auto-paused game, clear held controls and reset step timing. Add a bounded backlog policy if scheduling stalls. Make the bridge work with installed Reanimated 4 / Worklets, not removed v3 helpers.
- [ ] Add `apps/mobile/src/games/canvas/GameCanvas.tsx` plus a pure coordinate transform helper: logical scene dimensions, aspect ratio, touch-to-world conversion with letterbox exclusion, Skia children and optional composable gestures. **No game-ID switch, physics, scene store or renderer registry** in this wrapper.
- [ ] Jest test coordinate transform on narrow/tall displays, touch bounds, frame stop/background/unmount and event teardown. Verify a stub screen can supply its own children, gestures and frame callback without changing `GameCanvas`.

**Checkpoint:** simplest possible canvas API is reusable and SDK-57 native build is verified before porting seven Skia scenes.

## Stage 2 — Snake pilot: exercise the whole vertical pipeline

**Commit 3: Snake end to end.**

- [ ] Add `[GameID.SNAKE]` to **existing** `NATIVE_GAMES` with `SnakeGame({ submitScore, platform })` and `createStableProjector` that copies only head/body/food/direction/grid and relevant HUD data. Preserve the current `NativeGameHost` identity-bound submitter/forwarder and `NativeGameChrome`; do not create a second game lifecycle.
- [ ] Add `apps/mobile/src/games/boards/SnakeBoard.tsx`: `GameCanvas` at logical 500×500/20×20, Skia cells, Gesture Pan swipe directions, existing `SnakeGame.changeDirection`; drive `game.update(deltaSeconds)` through the frame driver while honoring `SnakeGame`'s own wall-clock move interval. Mark processed redraws through existing `markRendered()` so the model doesn't emit redundant scene updates.
- [ ] Verify Start → swipe → moving body/food → collision/timeout → provisional result → saved/unconfirmed result → replay, all via existing host. Pause stops both model motion and frame dispatch; navigation/unmount removes callbacks and destroys game once; user identity change remounts without carrying previous state or banners.
- [ ] Add Jest smoke for valid/reverse swipes, scaled swipe threshold, score submitter/platform, stale-run/identity guards, held app background, timer teardown and replay. Test the Canvas primitive without mocking the entire existing game host.

**Checkpoint:** Snake is runnable in the iPhone simulator with existing native HUD and server-contract semantics. If this fails, repair this stage before spreading the pattern.

## Stage 3 — Turn/interval-driven wave 2 ports

**Commit 4: 2048 (native views, deliberately no Skia).**

- [ ] Add `[GameID.GAME_2048]` using the existing `GameID.GAME_2048` enum member from `@cetus/shared/games` and `Game2048` from `@cetus/games/2048/Game2048`. Do not add a second game catalog.
- [ ] Build `boards/Game2048Board.tsx` from RN views (4×4 grid) and existing Reanimated for tile position/merge/spawn transitions. Swipe `move(direction)`, Undo `undo()`; respect `won`, `stuck` and model score. Use a `createStableProjector` for copied cells and a lightweight elapsed `projected.clock` so the HUD does not show the model's giant countdown duration. Keep model tile ID identity for animation; never reproduce merge logic.
- [ ] Jest: swipes/undo, rapid gesture rejection or serialization while animating, win/stuck presentation, save/replay, tile snapshot stability across clock ticks.

**Commit 5: Reflex and Signal Switch (model-owned timers).**

- [ ] `ReflexBoard.tsx`: 12×12 Skia board, tap mapping to `handleCellClick(row,col)`, existing spawn interval and hit/miss score. **No** added frame driver/spawn timer where model already schedules objects.
- [ ] `SignalSwitchBoard.tsx`: Skia lanes/gates/drones; tap `cycleGate(laneIndex)`, use frame driver for model movement. Reject taps outside locked/visible lanes.
- [ ] Both get native registry ports, stable visible-state projections, result labels if needed and Jest start/input/end/score tests. Keep one score path via `BaseGame` and `NativeGameHost`.

**Checkpoint:** 12/23 native games are playable; 2048 uses no Skia; interval/turn-driven games have no unnecessary update loop.

## Stage 4 — Drag/touch real-time ports

**Commit 6: Evader and Path Navigator.**

- [ ] `EvaderBoard.tsx`: Skia arena and model objects; touch drag pad translates into `pressKey/releaseKey(_, 'touch')`. Use frame driver for `update(deltaSeconds)`; release held keys on cancel/blur/pause/unmount. Do not change collision/spawn/scoring code.
- [ ] `PathNavigatorBoard.tsx`: Skia path and cursor; drag positions transformed from measured canvas to model coordinates, passed to `updatePlayerPosition(x, y)`. Start at actual model cursor and display model collision/end feedback. No custom path-collision implementation and no frame driver (input-driven).
- [ ] Jest verifies drag/world-space mapping, touch cancellation/return, pause and one final result per game.

**Commit 7: Gravity Flip.**

- [ ] `GravityFlipBoard.tsx`: Skia corridor/hazards/stars/player, full-canvas tap `flipGravity()`; frame driver only calls existing `GravityFlipGame.update(deltaSeconds)`. Preserve its internal substeps and model scoring, including stars/flips.
- [ ] Jest: flip, paused input ignored, collision/timeout, replay, and no background delta jump.

**Checkpoint:** 15/23 games playable. New game-specific input logic lives in each board, not `GameCanvas`.

## Stage 5 — Asteroid Drift, momentum and result parity

**Commit 8: Asteroid Drift.**

- [ ] `AsteroidDriftBoard.tsx`: Skia ship, asteroids and orbs using native logical bounds and existing `AsteroidDriftGame`. Provide a left directional stick and a right press-and-hold thrust button. While held, translate stick axes to the model's existing touch held-direction set via `pressDirection/releaseDirection`; release all on cancel, game finish, pause and unmount. Without thrust, allow the model's own drag/inertia to continue. Never add a second velocity integrator.
- [ ] Use the shared frame driver, preserving the game's own max-physics-step logic; use cloned, visible scene data for smooth drawing. Verify portrait safe area and touch targets.
- [ ] Jest: diagonals, stick direction changes, release/thrust gating, movement momentum and timeout/collision result, score/save/rewards, app background.
- [ ] Confirm `NATIVE_GAMES` lists **16/23**, leaving the exact seven HPA-535 IDs unplayable; no routing changes needed.

**Checkpoint:** wave 2 is feature-complete on one PR. The HPA-535 team can create a trivial dummy canvas screen without changing `GameCanvas` or core frame API.

## Stage 6 — Automated acceptance and cleanup

- [ ] Run `bun install --frozen-lockfile`; `bun run lint`; `bun run format:check`; `bun run turbo run typecheck`; `bun run test:coverage` (retain existing 90% project/patch gates); `bun run --cwd apps/mobile test --runInBand`; `bun run build`; `bun run test:e2e`.
- [ ] Run Expo production exports/bundle validation for **both iOS and Android** in CI, including Skia native import-graph and GestureHandler wiring checks. Android/Linux have **CI-only validation**, not manual sign-off.
- [ ] Automated **iOS simulator** end-to-end run for all eight: navigate hub → game → start → characteristic input → finish/result → replay → leave. Verify no leftover timers/held controls on route change. Exercise a controlled authenticated test-server response with saved score and achievements/challenges, plus a failed/unconfirmed response, asserting one POST and no automatic retry.
- [ ] Automated screenshot/visual check on iOS for each game in active play plus representative idle/paused/result screens: compare against existing web layouts/shared Cetus tokens and check aspect ratios, touch-target placement, nav header/safe-area, clipping, readable labels/contrast and animation glitches. If a Linear UI mockup is subsequently attached, include side-by-side comparison with it; there is **no mockup attached now**.
- [ ] Check gameplay on iPhone simulator at common compact/large dimensions: Snake directional timing, Evader held controls, Path Navigator coordinate fit, Gravity Flip hit areas, and Asteroid Drift inertia. Use automated input and visual artifacts; **no human approval criterion**.
- [ ] Distinguish automated score-contract checks from **actual** authenticated device/backend parity, which depends on the fixed HTTPS login/EAS/provider setup still unverified in #105. Perform an authenticated iOS end-to-end check when available and record the evidence, otherwise leave it explicitly pending and keep HPA-199's cross-platform release parity gate intact. Never claim a real backend or production award check passed on the basis of a stub.
- [ ] Confirm the web still uses Pixi and all 23 web routes; no browser-only dependency entered `@cetus/games` or mobile. No duplicate frame source, no new database/API/auth endpoints, no new art/SFX and no changes to HPA-535's seven games.
- [ ] Update `README.md`/development notes only where wave-2 availability or Expo/Skia setup is now outdated. Keep this PR as Draft until the relevant automated acceptance checks can be evidenced.

## Acceptance ledger (fill with concrete evidence during implementation)

| End-to-end criterion | Platform / method | Evidence | Status |
| --- | --- | --- | --- |
| 16/23 native games registered and playable; other seven disabled | iOS simulator + Jest | Route and registry test, simulator flow | Pending |
| All eight start, accept input, end, replay and release resources | iOS simulator automation | Eight named game flows/logs | Pending |
| Score saved/unconfirmed and rewards displayed correctly without double POST | iOS simulated server + Jest integration | Network trace, screenshots and test output | Pending |
| Gesture, scale, orientation, safe areas and touch controls usable | iOS simulator visual/interaction | Automated screenshots against web/UI tokens (and Linear mockup if later provided) | Pending |
| Wave-3 dummy scene reuses Canvas/frame API unchanged | Jest/TypeScript | Adapter contract test | Pending |
| Native bundles and Android coverage | CI only (iOS/Android export and unit) | CI checks | Pending |
| Existing web regressions and coverage still pass | CI | Lint/type/unit/coverage/build/Playwright | Pending |
| Real authenticated backend/device parity (if access exists) | iOS test path; HPA-199 release gate | Authenticated device trace or explicitly 'not verified' | Not verified |

**Platform exclusions:** this is an Expo iOS/Android app, **not a macOS or Windows app**. Do not invent desktop E2E sign-offs. Do not add Android/Linux manual acceptance criteria or human review sign-off. A single PR serves this ticket from design through implementation.
