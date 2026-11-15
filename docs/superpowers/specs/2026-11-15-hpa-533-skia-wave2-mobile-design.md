# HPA-533 — Native GameCanvas, Snake pilot and wave 2 games: design specification

**Status:** Planning draft, 2026-11-15. This commit contains documentation only; no native implementation or device testing is claimed.
**Linear:** [HPA-533](https://linear.app/cwchanap/issue/HPA-533/build-the-skia-gamecanvas-with-snake-and-port-the-wave-2-games)
**Base:** `main` after merged [HPA-425 / #105](https://github.com/cwchanap/cetus/pull/105).
**Delivery:** One issue, **one draft PR**, used for this design, the staged implementation commits, review fixes and tests.

## 1. Goal, exact scope and boundaries

Make **eight** more existing Cetus games playable on native mobile using the existing game rules and score contracts:

| Game | Rendering | Input / model API |
| --- | --- | --- |
| Snake | Skia | Swipe; `SnakeGame.changeDirection(direction)` |
| 2048 | **React Native views + Reanimated** (no Skia) | Swipe; `Game2048.move(direction)`, existing undo |
| Reflex | Skia | Tap grid cell; `ReflexGame.handleCellClick(row, col)` |
| Evader | Skia | Drag virtual movement pad; `EvaderGame.pressKey/releaseKey(key, 'touch')` |
| Path Navigator | Skia | Drag along the displayed path; `PathNavigatorGame.updatePlayerPosition(x, y)` |
| Signal Switch | Skia | Tap active lane; `SignalSwitchGame.cycleGate(laneIndex)` |
| Gravity Flip | Skia | Tap; `GravityFlipGame.flipGravity()` |
| Asteroid Drift | Skia | Virtual direction stick + held thrust button; `AsteroidDriftGame.pressDirection/releaseDirection(direction, 'touch')` |

After the PR: the existing eight wave-1 games plus these eight = **16 playable of 23**; leave the seven wave-3 games visibly unavailable until [HPA-535](https://linear.app/cwchanap/issue/HPA-535/port-the-wave-3-games-to-mobile-7-heavy-canvas-games).

**Non-goals:** Porting wave 3, modifying server APIs/scoring rules, a generic scene graph/renderer abstraction, replacing `BaseGame`, new auth/retry queues, new game designs, creating art/SFX, changing web Pixi rendering, or store submission (HPA-199). Reuse existing theme tokens and simple procedural shapes. If new art/SFX becomes necessary, track it in a **separate Linear task**, not this coding PR.

## 2. Verified baseline and constraints

- `apps/mobile` uses Expo **57.0.31**, React Native **0.86.3**, Reanimated **4.5.1** and Gesture Handler **2.32.0**; `@shopify/react-native-skia` is not yet installed.
- [HPA-425 / #105](https://github.com/cwchanap/cetus/pull/105) created the sole `NATIVE_GAMES` registry, `NativeGameHost`, `NativeGameChrome` and `/games/[gameId]/play` route. `NativeGameHost` already binds each game to the **last settled user identity**, an identity-verified `createScoreSubmitter`, `Platform.OS`, a `createBaseGameSession` adapter and account-scoped reward forwarder. Preserve its teardown order and its guest/revalidation behavior; do not build a second host.
- `@cetus/games` holds all eight DOM-free rule engines. Their web `initFramework` and Pixi renderers stay under `apps/web` and cannot enter the native import graph.
- `@cetus/app-core/createStableProjector` already stabilizes **copied visible state**, not mutable model references; use it for new ports. Result sheets already distinguish pending/saved/unconfirmed scores and show server-confirmed rewards. No native persistence queue.
- `BaseGame.update(deltaTime)` documents **seconds**. Snake currently ignores the delta and uses `Date.now()` for its own movement cadence; Asteroid Drift, Gravity Flip, Evader and Signal Switch consume delta seconds. **Do not copy the web Snake rAF caller's millisecond delta to those games.** Reflex uses its own spawn interval, Path Navigator is input-driven, 2048 is turn-driven.
- HPA-533 has **no Linear attachments or linked UI mockups**. Use current web game appearance and existing native shared tokens as the visual reference; do not invent an approved mockup.
- PR #105 recorded real iOS/Android guest-flow checks but **not** authenticated device/backend reward parity. HPA-199 remains the full release parity gate; this ticket still verifies the native request/result/award path and marks external checks pending if credentials are unavailable.

## 3. Minimal native architecture

### Existing host + registry are the only route into a game

Extend `apps/mobile/src/games/registry.ts` with eight more computed `[GameID.X]` entries. Each `createGame({submitScore, platform})` instantiates its existing class; each `project(state, game)` copies only visible model data (objects, player, cells, obstacles, HUD), exposing the correct model action in the board component by casting the host-provided live `game` to that concrete class. Include `resultOutcomeLabel` only where the game's stats require it. No parallel lookup or hardcoded playable IDs in the hub/detail route.

Keep `NativeGameHost` responsible for identity/score/session/rewards and `NativeGameChrome` responsible for shared start/pause/reset/replay/result UI. New boards own **only** rendering and input. A projected snapshot is never mutated, and the renderer never reimplements collisions, spawning, timers, physics or scoring. For 2048, expose a projected elapsed `clock` rather than rendering its effectively-infinite countdown duration.

### Reusable `GameCanvas` and input geometry

Create `apps/mobile/src/games/canvas/GameCanvas.tsx`: a small Skia `Canvas` wrapper, logical game width/height, aspect-preserving letterbox sizing, common dark background/border and **optional** gesture composition. Its children are normal Skia drawing primitives (one game draws its own scene). Measured view size produces scale and offsets; a pure `toGamePoint(localX, localY)` helper rejects touches outside the playable rectangle and maps others back to logical model coordinates. Draw native game shapes and existing colors; avoid CanvasKit, Pixi, shaders or an asset pipeline.

Use `GestureDetector` + per-board `Gesture.Pan` / `Gesture.Tap`; game commands execute on the RN JavaScript runtime, never inside a Reanimated worklet. Configure gesture callbacks for JS execution where appropriate. Keep on-canvas controls independent of existing native start/pause/result buttons. Mount `GestureHandlerRootView` once at the app root if not already present. Derive touch thresholds from display scale, not hard-coded device pixels; release all held inputs on pan cancellation, pause, reset, unmount or app background.

The **wave-3 extension point** is intentionally small: the canvas accepts Skia children, measured coordinates and optional gestures; its simulation driver accepts a callback. Wave 3 may provide different scenes/state adapters, but must not need a `GameCanvas` API rewrite. Avoid registering game IDs or game-specific conditional branches inside `GameCanvas`.

### One frame source, one portable stepper

Create exactly one **platform-neutral** `createGameStepper(update)` in `packages/games/src/core/GameStepper.ts` with `tick(timestampMs)` / `reset()`. Convert monotonic frame milliseconds to **delta seconds**; first/invalid/out-of-order frames do nothing; cap large deltas (e.g. 50 ms) to avoid background-time catch-up. This is a thin delta normalizer, **not** a second physics/substep engine: Asteroid Drift and Gravity Flip already substep internally.

On native, a tiny `useGameFrameDriver(game)` uses Reanimated 4 `useFrameCallback` as the **sole** per-game frame source. Its UI worklet schedules a JS-runtime callback using Worklets `scheduleOnRN`; the JS callback owns `stepper.tick(frameTimestamp)` and calls the existing `game.update(deltaSeconds)`. Do **not** capture/call a mutable `BaseGame` object from a worklet or start a competing JS rAF/interval. Bound scheduling to one callback per displayed frame; discard superseded/stale frames if the JS runtime falls behind rather than queueing an unbounded backlog. Gate frames to an active, unpaused, foreground game; reset the stepper on pause/resume/background or identity teardown. Auto-pause on app background and auto-resume only when this driver caused the pause (never override an explicit user pause). Dispose subscriptions/frame callbacks on unmount. Tests cover lifecycle and temporal units.

Use that driver for Snake, Evader, Signal Switch, Gravity Flip and Asteroid Drift; Reflex owns its existing interval, and Path Navigator and 2048 are input-driven. With the existing app-core event/snapshot path, a game's `state-change` updates its Skia scene; stabilize copied scene props to avoid board redraw on HUD-only ticks. Mark Snake's drawn snapshots with its existing `markRendered()` mechanism so its `needsRedraw` flag cannot trigger redundant frame updates. Prefer straightforward React/Skia drawing first; use Reanimated shared-value animations for view-only transitions if demonstrated necessary, not a second scene-state store.

### Per-game behavior

- **Snake:** preserve 20×20 grid and built-in food, collision and direction reversal rules. Swipe directions are mapped to `changeDirection` on JS; `SnakeGame.update` remains the only move/collision step.
- **2048:** use the existing native host but a 4×4 React Native tile board with Reanimated position/merge feedback keyed by the model's tile IDs. Swipe calls `move`, undo calls `undo`; use `maxTile`, `won` and `stuck` from model. No Skia and no duplicate merge algorithm. Stabilize the board projection separately from elapsed-time HUD updates.
- **Reflex:** build a 12×12 touch grid with tap-to-cell mapping, model-controlled object spawn/lifetime and a simple visible hit reaction. Do not add a second spawn timer.
- **Evader:** drag on a virtual pad to set/release the existing directional keys; game logic already integrates movement, objects and score. Release when touch ends or is interrupted.
- **Path Navigator:** inverse-transform drag points to the model's logical path coordinates and call `updatePlayerPosition`. Start from the model's current/start cursor. No separate collision detector.
- **Signal Switch:** draw live lanes, gates and drones, allow tapping active gates via `cycleGate`; model owns lane unlocking and collisions.
- **Gravity Flip:** tap calls `flipGravity`; model owns gravity physics, hazards, stars and end conditions.
- **Asteroid Drift:** virtual stick emits discrete held cardinal directions through the existing `pressDirection/releaseDirection('touch')` API. The separate thrust button **gates those held inputs**; releasing it stops acceleration while retaining model-owned momentum/friction. Show stick/thrust on screen; do not introduce a new engine thrust mode, duplicate velocity or change scoring. Test diagonal combinations, cancellation, pause and repeated directions.

## 4. Data, rendering and account lifecycle

Score submission stays **one POST** to the existing endpoint from the per-host identity-bound submitter. Keep `ScoreData.platform` as `ios` / `android`, the existing server achievement/challenge evaluation, provisional completion followed by confirmed/unconfirmed result, and one account-scoped reward banner. A network error is **not** proof a score failed to commit; do not auto-retry. On guest → signed-in or user switch, the route's existing settled-identity key tears down the old game's driver, gesture state, session, forwarder and model before creating a new one. Routine auth revalidation must not restart a live game.

For time-based games, active scenes update through existing `state-change` events. Avoid continuous tree-wide React updates for HUD-only clock ticks. Use direct Skia primitives and shared theme colors; keep virtual controls large enough for iPhone touch. Portrait is the current app orientation; letterbox landscapes in canvas coordinates without changing global orientation.

## 5. Native dependencies / early risk gate

Use **Expo SDK 57** compatibility as the starting point, not the latest global Skia package. Expo's [SDK 57 Skia entry](https://docs.expo.dev/versions/v57.0.0/sdk/skia/) currently recommends **2.6.2**. A [reported issue](https://github.com/expo/expo/issues/50733) identifies `makeImageFromView` incompatibility with RN 0.86 in that line, fixed upstream in 2.11.1; this design does **not** use `makeImageFromView`. First test a minimal Skia rectangle and gesture in the **existing development build** on iOS; rebuild the dev client once for the native module. If the required primitive APIs actually fail, evaluate a targeted Skia pin and Expo version-check exemption with a documented repro, **not** an opportunistic Expo/RN migration. Declare `react-native-worklets` directly if importing `scheduleOnRN`. See [Reanimated useFrameCallback](https://docs.swmansion.com/react-native-reanimated/docs/advanced/useFrameCallback/) and [Worklets scheduleOnRN](https://docs.swmansion.com/react-native-worklets/docs/0.9/threading/scheduleOnRN/).

## 6. Validation, ownership and acceptance policy

- **Portable Vitest:** stepper seconds conversion/capping/reset/out-of-order frames; existing 8 game engines' deterministic input/physics/scoring regressions.
- **Mobile Jest:** registry **16/23**, route availability, host/remount/revalidation, per-board input mapping, coordinate letterboxing, 2048 undo, Asteroid Drift thrust/held directions, frame pause/background/teardown, result/reward/save outcomes; add a dummy scene/gesture contract proving a later wave-3 board can reuse `GameCanvas` unchanged.
- **Build/CI:** existing lint, format, full workspace typecheck, root coverage, mobile Jest, production web build + Playwright, and **both** iOS/Android Metro/Expo bundle or export checks. Android validation is **CI only**, never a manual Android acceptance gate.
- **iOS end-to-end acceptance:** on iPhone simulator (or automated connected iPhone flow), each of the eight can start, accept its characteristic input, complete or end, show a result, replay and navigate away without an active timer. Use a controlled test score responder to assert exactly one saved/unconfirmed result plus award/banner handling; report separately whether real authenticated backend parity was exercised. For Asteroid Drift verify momentum, release and orientation/safe areas; for 2048 verify undo and tile animations.
- **Visual check:** capture automated iOS screenshots for idle, playing, pause/result states; compare layout, contrast, touch targets and clipping against the current web game screen and shared native UI. If Linear later provides a UI mockup, include a screenshot comparison with that mockup; none is attached as of this spec.
- macOS and Windows are **not app targets** for this Expo-native issue; web regressions run in CI. No human sign-off or Android/Linux manual acceptance criteria.

**Completion condition:** all eight native games work on iOS, Android build/automated validation is green, score and award contracts retain web semantics, and a wave-3 stub uses `GameCanvas` without API changes. Any blocked external/provider check is reported as **unverified**, never recorded as passed. Implementation, fixes and plan revisions remain in this same PR.
