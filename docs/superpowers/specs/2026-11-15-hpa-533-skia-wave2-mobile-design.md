# HPA-533 — Native GameCanvas and eight wave-2 ports: revised design specification

**Status:** Design-review revision, 2026-11-15. Documentation only; no gameplay code or device checks were run in this revision.
**Linear:** [HPA-533](https://linear.app/cwchanap/issue/HPA-533/build-the-skia-gamecanvas-with-snake-and-port-the-wave-2-games)
**Base:** `main` after [HPA-425 / PR #105](https://github.com/cwchanap/cetus/pull/105).
**Delivery:** One Linear ticket, one [draft PR #108](https://github.com/cwchanap/cetus/pull/108) from design through implementation, tests and review fixes.
**Review:** [PR #108 design review](https://github.com/cwchanap/cetus/pull/108#pullrequestreview-5912173255). The revisions deliberately remove overgeneralized components and use existing runtime patterns.

## Goal, games and explicit non-goals

Make eight more catalog games playable in the **existing** Expo app, reaching 16 of 23 native-playable games. Preserve each existing `@cetus/games` rule engine and server score/achievement contract.

| Game | Rendering | Native input → existing model command |
| --- | --- | --- |
| Snake | Skia | Swipe → `SnakeGame.changeDirection` |
| Gravity Flip | Skia | **Labelled Flip Gravity button** (optional canvas tap) → `GravityFlipGame.flipGravity` |
| 2048 | RN views + Reanimated; **not Skia** | Swipe → `Game2048.move`; Undo → `undo` |
| Reflex | Skia | Grid tap → `ReflexGame.handleCellClick(row, col)` |
| Signal Switch | Skia | Four **labelled gate buttons** → `SignalSwitchGame.cycleGate(index)` |
| Evader | Skia | Four-button held D-pad → `EvaderGame.pressKey/releaseKey(key, 'touch')` |
| Path Navigator | Skia | Drag on path → `PathNavigatorGame.updatePlayerPosition(x,y)` |
| Asteroid Drift | Skia | Four-button held D-pad, each press is **thrust in that direction** → `AsteroidDriftGame.pressDirection/releaseDirection(dir, 'touch')` |

**Non-goals:** the seven heavy wave-3 games (HPA-535), a new renderer/scene graph/physics engine, a new platform-neutral stepper module without a second consumer, web Pixi replacement, extra data stores or API/auth endpoints, any score retries, store release (HPA-199), or new art/SFX. Reuse procedural shapes and existing Cetus tokens. If new art/SFX is desired, track it in a **separate task**, not this PR.

## Confirmed current architecture

- Expo SDK **57.0.31**, RN **0.86.3**, Reanimated **4.5.1**, Gesture Handler **2.32.0**. Skia is not installed yet.
- `apps/mobile/src/games/registry.ts` contains the **sole** native registry; `NativeGameHost.tsx` constructs each model with an identity-bound `createScoreSubmitter` and `Platform.OS`, one `createBaseGameSession` + `useGameSession`, plus `forwardBaseGameResults`; `NativeGameChrome.tsx` shows start/pause/reset, score, time, provisional/final saved/unconfirmed results and rewards. The play route keys the host by last settled identity and ignores routine revalidation. **Extend; do not replace.**
- `createBaseGameSession.refresh` checks `status`, `score`, `timeRemaining`, projection **reference**, and result before notifying React. `createStableProjector` compares small copied data via `JSON.stringify`; it was designed for <=12×12 boards, not 60-Hz moving-object scenes.
- `BaseGame.update(deltaTime)` takes **seconds**. Snake uses `Date.now()` internally and ignores delta. Gravity Flip, Signal Switch and Asteroid Drift clamp delta internally; Evader does not. Reflex has a model-owned spawn interval; 2048 and Path Navigator are input-driven.
- `BaseGame.pause()` is a no-op when `config.pausable === false`: **Gravity Flip, Signal Switch and Asteroid Drift are not pausable**. Never promise to pause them or restore them on foreground.
- Wave-1 native import-graph checks already live in `apps/mobile/__tests__/NativeGameImportGraph.test.ts` (Pixi/DOM restrictions). Existing `NativeGameHost.test.tsx` verifies one score POST and account/score lifecycle. Extend these, not a parallel suite.
- The issue contains **no linked UI mockup**. Visual acceptance uses screenshots of the current native app against explicit shared-token, contrast, safe-area and layout requirements, not a new web-vs-native pixel-diff harness.

## Architecture: two scene-update paths, one host

### Common host, controls and lifecycle

Add eight `[GameID.*]` entries to the existing `NATIVE_GAMES` map (2048 uses the verified `GameID.GAME_2048`). Retain `NativeGamePort.createGame`, `createProjector`/ `project`, `view` and optional `resultOutcomeLabel`. Boards receive the **live** game from `NativeGameHost` and call its existing methods, never duplicate game mechanics.

The host remains the only owner of identity/transport/session/reward cleanup; boards own their drawing, action controls and (if necessary) a local frame loop. On remount, cleanup still removes reward listeners, disposes the session and destroys the model; each board cancels its loop and releases held inputs on unmount. Ordinary auth revalidation does not remount a game. On guest/account change the old game and reward banner do not cross to a new identity. The score is submitted once by the injected `submitScore`, with `platform: ios|android`, and the result is *pending* then server-confirmed *saved* or *unconfirmed*. Network failure may mean the server already received the POST; never auto-retry.

### Minimal `GameCanvas`, coordinate helper and JS frame loop

Add `apps/mobile/src/games/canvas/GameCanvas.tsx`: a reusable Skia `Canvas` with logical dimensions, measured aspect-preserving letterboxing (`onLayout`), a `Group` transform for game shapes, and an exported pure `toGamePoint(localX,localY)` that rejects touches in the margin. Boards supply their own `GestureDetector` only when needed (Reflex tap and Path Navigator drag). The canvas must **not** contain game-specific logic, input registrations, a scene manager or an optional gesture API. Use density-independent-point gesture thresholds, not scale-dependent thresholds.

For the five continuously simulated games (Snake, Gravity Flip, Signal Switch, Evader, Asteroid Drift), add one **small native** `useGameLoop(game, onFrame)` based on React Native's global **JS-thread** `requestAnimationFrame` / `cancelAnimationFrame`. All `game.update` and React/Skia scene rendering work is already on JS; a Reanimated `useFrameCallback` → `scheduleOnRN` roundtrip would add complexity and backlog without benefit. There is **no second rAF, `setInterval` game stepper, portable `createGameStepper`, worklets bridge, frame queue or fixed physics accumulator**. Export of a shared platform-neutral stepper is deferred until a real second runtime needs it. This is the deliberate HPA-533 scope correction recorded in Linear.

The loop uses the single last-frame timestamp. If active and not paused, compute `deltaSeconds = last === null ? 0 : Math.min(Math.max(0, timestampMs - last) / 1000, 0.1)`, set `last = timestampMs`, and call `game.update(deltaSeconds)` (skipping the zero initial step is fine). Reset `last` when not running/after resuming so a foreground delta cannot jump; cancel the rAF on unmount. **0.1 seconds is the web game's existing upper clamp**, not the proposed 0.05: Asteroid Drift compares simulated time with a wall-clock countdown to award `survivedFullRun`. A 50-ms cap would throw away time on ordinary 60–100-ms JS hitches and cause false `expired` outcomes/achievement omissions. The model still clamps internally. Even with 0.1, pauses/hitches longer than 100 ms can produce simulation-vs-wall-clock drift; **preserve web semantics** in this ticket, regression-test the 0.1 boundary and record such limitations rather than claiming every delayed frame is recoverable.

**Scene/HUD separation is required:** a continually moving scene must **not** be projected into the host's `useGameSession` snapshot each frame. Frame-driven entries use `createProjector` for small, value-stabilized **HUD-only** fields (outcome, lives, distance, counters), using a compact small-object comparison, so frequent model `state-change` events do not notify the shared host unless HUD/time/score/result changed. The board loop reads `game.getState()` and copies its visible primitive scene objects into **board-local** state once per frame, so only the board/Skia scene re-renders at 60 Hz. The scene snapshot must not retain references to arrays or objects later mutated by the model. Check small-screen performance on the first delta-driven pilot before copying this approach; optimize per-board only if measurements demand it. Snake may render on real movement/redraw events instead of always committing a frame, and should preserve `markRendered()`.

By contrast, **event-/interval-driven boards** (2048, Reflex, Path Navigator) continue to project copied visible board data through the existing `createStableProjector` and `NativeGameHost` path; no extra frame loop for these.

### One app-background policy in NativeGameHost

Add **one** `AppState` change listener in `NativeGameHost` (reuse `apps/mobile/src/lib/refetch.ts` subscription idiom). On leaving `active`, invoke the session's existing `actions.pause()` only when `capabilities.pausable` is true. **Never auto-resume**; the existing Resume button is user-controlled. This applies to **all native games**, including Reflex and wave 1, not just five canvas drivers.

For non-pausable Gravity Flip, Signal Switch and Asteroid Drift, the wall-clock timer keeps counting while backgrounded; the RN animation loop is suspended, the first frame on return is bounded/skipped, and the game can time out while away, matching the web hidden-tab policy. Do not invent a background-pause flag for these models. A single host-level Jest test covers pause-eligible vs non-pausable behavior and no auto-resume; per-board loop tests cover frame cancellation.

### Reuse web's accessible controls

A single `HeldDpad` component contains four RN `Pressable` arrows, with `accessibilityLabel`, `onPressIn` and `onPressOut` callbacks; board-specific adapters call **Evader's Arrow-key methods** or **Asteroid Drift's cardinal-direction methods**, respectively. `onPressOut` releases on touch interruption; unmount/blur also releases held directions. No joystick, gated thrust button or extra acceleration logic. In Asteroid Drift each held D-pad direction itself applies the model's existing thrust; inertia after release remains model-owned.

Signal Switch uses four labelled `Pressable` lane/gate controls; native touch points do **not** hit-test moving Skia lanes. Gravity Flip uses a labelled button; optional full-canvas tap only if it does not conflict. Snake and 2048 share one small swipe-direction helper (RNGH pan threshold in dp/points, never a scale conversion). Reflex and Path Navigator use `toGamePoint` for grid and path coordinates. Each board makes its existing play instructions accessible without relying exclusively on visual canvas shapes.

### Specific pilot sequence

1. **Native module gate:** confirm the Expo SDK 57 recommended Skia line and build a minimal rectangle/tap on a rebuilt **iOS** dev client. Avoid `makeImageFromView` (reported compatibility issue with RN 0.86); don't upgrade Expo/RN merely to avoid an unused API. Add `GestureHandlerRootView` once at app root.
2. **Snake + Gravity Flip** in the same pilot stage. Snake exercises gestures, grid redraw and the host's lifecycle, but its delta is ignored; Gravity Flip exercises **the actual JS delta-seconds loop, moving-scene-only rerender, internal substeps and a non-pausable timer** before other boards reuse this pattern.
3. **2048** uses RN views and Reanimated purely for tile animations; the existing synchronous `move`/ `undo` methods own the rules. Show elapsed time through `projected.clock` like Sudoku, not the model's effectively infinite duration. No gesture serialization queue.
4. **Reflex** uses its existing spawn interval and tapped 12×12 cells. **Signal Switch** uses the loop and labelled lane controls.
5. **Evader** uses the loop + HeldDpad; **Path Navigator** uses direct drag/world-space coordinates without a frame loop.
6. **Asteroid Drift** uses the loop + HeldDpad, retaining its exact momentum, collisions and scoring. Verify a full-duration non-collision run's `survived` result and `survivedFullRun` award metadata with deterministic model tests.

## Build, test, visual and completion evidence

- **CI on draft PRs:** current `.github/workflows/ci.yml` and `e2e-tests.yml` explicitly skip drafts. In Stage 1 add an **independent** `mobile-export` job *without* that draft guard running `bunx expo export --platform all` from `apps/mobile` after `bun install --frozen-lockfile` on Ubuntu. Expo CLI documents `all` for iOS+Android; each export proves **Metro JS/assets resolution only**, not successful native Skia build. Existing CI tests remain draft-gated and must be executed locally until ready for review (or later enabled). Android **native compilation/runtime remains unverified** without an EAS/CI native build and is ultimately a HPA-199 release check. Do not call export results native build proof.
- **Unit/integration:** Jest for `useGameLoop` (0.016 seconds, 0.1 cap, reset/inactive, cancellation), HUD/scene separation without host 60-Hz rerenders, guest/session lifecycles, host AppState, swipes, 2048 undo, Reflex/Path tap mapping, HeldDpad press/release and Asteroid Drift end/award. Extend `NativeGameImportGraph.test.ts` and existing score/identity suites. No speculative wave-3 dummy scene contract: the seven actual Skia boards demonstrate reuse.
- **iOS end-to-end acceptance:** per-game **guest simulator play and screenshot evidence in its own stage**, following the proven HPA-425 approach. Capture screenshots using `xcrun simctl io booted screenshot` (or equivalent simulator automation already available), and validate start → characteristic input → finish/result → replay and cleanup. Host-level score result / one POST / reward success/failure are automated in Jest with fake responders; do **not** invent a new Maestro/Detox framework or promise an absent authenticated simulator backend harness. Record real-auth parity as **unverified** until the separate HPA-199 release gate is run.
- **Visual check (iOS):** capture idle, active and result examples, check expected game objects/controls, layout fit on compact/large iPhone simulators, clipped borders, safe-area avoidance, shared color tokens, readable labels and button hit areas. No pixel-diff against the web: layouts differ. **There is no Linear UI mockup now**; if one is attached, add screenshot-versus-mockup inspection criteria.
- **Android/Linux:** CI validation only; no manual Android/Linux acceptance or claimed device checks. **macOS/Windows:** not native targets of this Expo app, so no desktop E2E gates. Web regressions still run in existing CI when PR is ready.
- **Complete when:** eight new games are playable on iOS simulator, current web rules/score contracts are unchanged, 16/23 catalog entries enable Play, iOS screenshot/input verification and Jest are green, iOS+Android JS exports pass in CI, and `GameCanvas` is consumed by seven actual Skia boards without game-specific branches. Full Android native runtime and authenticated cross-platform leaderboard/achievement parity remain HPA-199 release criteria. Keep this PR in Draft until implementation evidence is recorded; never claim a check passed when unrun.
