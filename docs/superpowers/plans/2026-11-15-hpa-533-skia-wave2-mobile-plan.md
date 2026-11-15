# HPA-533 — Skia GameCanvas + eight wave-2 games: single-PR implementation plan (revised)

**Status:** Design-review revision, 2026-11-15; implementation and executable checks are **not yet performed**.
**Linear:** [HPA-533](https://linear.app/cwchanap/issue/HPA-533/build-the-skia-gamecanvas-with-snake-and-port-the-wave-2-games)
**Design:** [Revised design specification](../specs/2026-11-15-hpa-533-skia-wave2-mobile-design.md)
**Review:** [PR #108 design review](https://github.com/cwchanap/cetus/pull/108#pullrequestreview-5912173255)
**Base:** Current `main` after merged [HPA-425 / PR #105](https://github.com/cwchanap/cetus/pull/105).
**Delivery rule:** **One Linear ticket, one draft PR (#108).** Stages below are commits/checkpoints within that same PR; do not create additional implementation PRs. Reuse existing game shapes and tokens; if new image art/SFX is needed, plan it as a **separate task**, not a mixed coding commit.

## Stage 0 — Confirm real contracts and baseline

- [x] Recheck Linear: HPA-533 is unblocked (HPA-179/HPA-393 complete); HPA-535 and HPA-199 depend on its output.
- [x] Inspect merged wave-1 native `registry.ts`, `NativeGameHost.tsx`, `NativeGameChrome.tsx`, `app/games/[gameId]/play.tsx`, `createBaseGameSession`, game models, web controls and web animation loops.
- [x] Check model update units: `BaseGame.update` takes seconds; web physics loops clamp at 0.1 seconds; Snake ignores delta; Gravity Flip/Signal Switch/Asteroid Drift also clamp internally; Evader needs the loop's clamp.
- [x] Confirm Gravity Flip, Signal Switch and Asteroid Drift are **non-pausable**, existing app CI skips draft PRs, there is no native export step or Maestro/Detox flow, and HPA-533 has no linked UI mockup.
- [ ] Record baseline: `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`, `bun run --cwd apps/mobile test --runInBand`. Treat pre-existing failures separately; no gate weakening.
- [ ] Confirm iPhone simulator/dev-client availability. Authenticated provider/backend parity is not assumed; run all guest gameplay checks without external OAuth setup.

**Checkpoint:** The reviewed plan matches `main`, not the earlier speculative worklets/stepper path.

## Stage 1 — Skia native module, focused CI, and a single JS frame loop

**Commit 1: install Skia and establish honest draft-PR CI proof.**

- [ ] Install Expo SDK 57-compatible `@shopify/react-native-skia` with `expo install` in `apps/mobile`, updating **one root `bun.lock`**. Start with Expo's recommended 2.6.2 and verify against actual installed SDK; avoid the incompatible/unneeded `makeImageFromView` API. No `react-native-worklets` dependency or broad Expo/RN upgrade.
- [ ] Wrap the app root in `GestureHandlerRootView` while preserving `VariableContextProvider`, safe area, fonts and theme.
- [ ] Rebuild the current iOS development client once; render one Skia rectangle and exercise a basic gesture. Fail early if native Skia prerequisites are missing; document a minimal reproduction before changing package pins. Remove the temporary scene after the Snake pilot.
- [ ] Add a **separate, unconditional `mobile-export` job** to `.github/workflows/ci.yml`. It runs on `pull_request` including Draft, not behind the existing draft jobs' `if`, and runs `bun install --frozen-lockfile` plus `bunx expo export --platform all` with `working-directory: apps/mobile` for export. Expo CLI `--platform all` covers iOS **and** Android JS/assets bundles. The export must not be represented as Android native compilation, Skia runtime testing or device readiness.
- [ ] Extend the **existing** `apps/mobile/__tests__/NativeGameImportGraph.test.ts` to prevent DOM/Pixi imports through new Skia ports. Keep the existing tests and existing app runtime dependency checks. No second import graph checker.

**Commit 2: tiny canvas/loop primitives and host background behavior.**

- [ ] `apps/mobile/src/games/canvas/GameCanvas.tsx`: Skia `Canvas` + `Group` letterbox transform and measured layout; pass logical width/height and child drawing elements. Expose pure `toGamePoint` only for Reflex and Path Navigator. No `GameCanvas` gesture API; each board owns its own `GestureDetector`.
- [ ] Add a tiny shared `swipeDirection` helper for Snake/2048 using a fixed threshold in **density-independent points** (RNGH already provides them); no scaling or input queue.
- [ ] Add `apps/mobile/src/games/canvas/useGameLoop.ts`: **one JS-thread** `requestAnimationFrame` with `cancelAnimationFrame`, stable frame callback and last timestamp retained in a ref, `deltaSeconds = first ? 0 : Math.min(Math.max(0, now - last) / 1000, 0.1)`. Only `game.update(deltaSeconds)` for active, unpaused models; reset timestamp after stopped/paused/foreground. Dispose promptly when the board unmounts and avoid re-creating the loop on every React scene update. Do **not** add portable `createGameStepper`, UI worklets, backlog handling, fixed physics or a second scheduler. Keep the 0.1 web cap to preserve Asteroid Drift's simulated-time survival/achievement semantics as closely as the current web does.
- [ ] In `NativeGameHost`, subscribe to `AppState` **once per mounted host** and call existing `actions.pause()` when leaving active *only for pausable games*. Never auto-resume; user uses Resume. For non-pausable games, continue wall-clock timer semantics and suspend/limit visual frame updates. Do not falsely claim a non-pausable game is paused.
- [ ] Jest: `toGamePoint` letterbox/on-margin rejects; swipe directions; one loop frame at ~0.016 s, first frame 0, 0.1 cap (including a 0.08-s hitch), inactive/pause/resume/unmount timestamp reset and no second loop; host-level AppState **pausable vs non-pausable**, one pause call and no auto-resume. Ensure host-level test mocks retain current account/score behavior.

**Checkpoint:** Skia *actually boots* on an iPhone simulator, CI export runs on this Draft PR, and the JS loop/HUD separation is ready before more ports.

## Stage 2 — Two pilots: Snake **and Gravity Flip**

**Commit 3: first two registry ports and board implementations.**

- [ ] Add `[GameID.SNAKE]` and `[GameID.GRAVITY_FLIP]` to the existing `NATIVE_GAMES`, with the same identity-bound `createGame({submitScore,platform})`/result contracts as wave 1. Use existing host/chrome/reward paths.
- [ ] **Snake:** 20×20 Skia cells/food/body at logical 500×500, swipe → `changeDirection`, one `useGameLoop`; obey existing `Date.now()` movement cadence and `markRendered()` redrawing. Reversal is rejected by the model, not reimplemented.
- [ ] **Gravity Flip:** Skia corridor/player/obstacles/stars at model logical dimensions; an accessible `Flip gravity` button invokes `flipGravity`, with `useGameLoop` calling the existing `update(deltaSeconds)`. The model owns substeps, collisions, spawn, score and non-pausable timer.
- [ ] **Critical scene/HUD separation (prove here, not in later stages):** both ports' `createProjector` returns small stable **HUD-only** data (clock/status/score already covered by common snapshot); no full moving-scene arrays in the host projector. Inside each board, `useGameLoop` reads current model state and copies visible primitives to **board-local** React state; only the scene updates every frame. Existing `createBaseGameSession.refresh` equality avoids host/chrome React rerender when model HUD/time/score did not change. A timer/score update still propagates normally.
- [ ] Add Jest/model integration for Snake direction/reset/end/result, Gravity Flip frame physics/collision/finish, HUD renderer counts across 60 same-HUD frames, cleanup/stale account transitions, single score POST, awards and unconfirmed status.
- [ ] **iOS simulator acceptance here:** guest Start → swipe/flip → visible movement → finish → replay → leave; capture `xcrun simctl io booted screenshot` for Snake and Gravity Flip active/result states. Check Gravity Flip still advances physics under normal frame timing and doesn't fake a pause on background.

**Checkpoint:** both input-driven Snake and **delta-driven, non-pausable** Gravity Flip validate the pattern before any other real-time ports.

## Stage 3 — 2048, Reflex and Signal Switch

**Commit 4: 2048 RN views, not Skia.**

- [ ] Add `[GameID.GAME_2048]` with `Game2048`; render a 4×4 board using RN views and existing Reanimated tile positioning/merging keyed from model tile IDs. Swipe `move(direction)`, Undo `undo()`, read `won/stuck/maxTile` from the model. **No Skia and no new gesture serialization/animation input queue**; model moves are synchronous.
- [ ] Use a copied, stable board projection and a separate elapsed-time `projected.clock` in the chrome (Sudoku precedent). Don't show the effectively infinite countdown.
- [ ] Jest: horizontal/vertical moves, invalid move, undo, duplicate final-score suppression, board identity across clock tick, result/replay.
- [ ] iOS guest simulator play + screenshot; check tile alignment, safe-area, animated tile readability and Undo placement.

**Commit 5: Reflex (interval) and Signal Switch (frame).**

- [ ] **Reflex:** 12×12 Skia shapes with `toGamePoint` tap-to-row/col → `handleCellClick`. Model's existing spawn/lifetime interval remains the only scheduler; use `createStableProjector` for copied board data. No `useGameLoop`.
- [ ] **Signal Switch:** Skia lanes/drones/gates with the existing `useGameLoop` for physics and **four labelled RN gate `Pressable`s** → `cycleGate`; disabled for locked lanes. Keep moving scene local to the board, host projection HUD-only, model-owned unlock/collision behavior.
- [ ] Jest: Reflex hit/miss/start/end; Signal Switch lane gate cycling/unlock, 0.1-second physics step, non-pausable background semantics and finish/replay.
- [ ] iOS guest simulator play and screenshots for both games, checking accessible gate labels, lane colors and tap hit regions.

**Checkpoint:** 13/23 native-playable games and the event-driven vs frame-driven split is exercised without adding a second store/scheduler.

## Stage 4 — Evader and Path Navigator

**Commit 6: shared labelled `HeldDpad`, Evader and Path Navigator.**

- [ ] Add a single small `HeldDpad` RN component with four `Pressable` directions, descriptive `accessibilityLabel`s, `onPressIn`/ `onPressOut` and explicit unmount/blur held-state release. It has no game/engine imports; each board maps directions to its own model interface.
- [ ] **Evader:** Skia arena/objects/player; `HeldDpad` maps directions to the existing Arrow-key inputs via `EvaderGame.pressKey/releaseKey(key, 'touch')`. The shared loop handles seconds with the 0.1 cap; model still owns spawn interval/score/collisions. Board-local scene, host HUD-only.
- [ ] **Path Navigator:** Skia authored paths + cursor; `Gesture.Pan` transforms touches using `toGamePoint` to `updatePlayerPosition(x,y)`. Read model cursor/start, collision, win/out-of-bounds; **no separate frame loop or collision logic**. Use stable projected board data.
- [ ] Jest: two simultaneous D-pad directions, press/release, interruption/teardown, Evader model movement/clamping, Path Navigator accurate position after letterbox and margin touch ignored.
- [ ] iOS guest simulator play/screenshot for both, verifying held buttons, path fit and result/replay.

**Checkpoint:** 15/23 playable; the HeldDpad can serve Asteroid Drift directly.

## Stage 5 — Asteroid Drift

**Commit 7: reuse D-pad, test outcome/achievement semantics.**

- [ ] Add `[GameID.ASTEROID_DRIFT]`; Skia arena/ship/asteroids/orbs with board-local scene from `game.getState()`; HUD-only projection; existing `useGameLoop` and current model physics.
- [ ] Reuse `HeldDpad`. Each pressed arrow invokes `pressDirection(dir, 'touch')`, each release invokes `releaseDirection(dir, 'touch')`. These are the model's **existing thrust directions**, not a separate stick/thrust gate. Validate diagonal held inputs, interruption and inertia after release without reimplementing velocity/collision/scoring.
- [ ] Jest / portable existing model regression: frame 80 ms -> 0.08 s (not truncated at 0.05); 0.1 s clamp at a larger JS hitch; survival-time result `survivedFullRun` and existing deep-space/long-haul achievement data on an uninterrupted 90-second deterministic run; correct `expired` outcome if simulated time genuinely falls behind; network saved/unconfirmed states, one score POST and no double award.
- [ ] iOS guest simulator play/screenshot for held-direction movement, coast/inertia, avoiding obstacles, result and replay. Document that background hitches longer than 0.1 s have the web's simulation-vs-wall-clock limitation, not a new mobile guarantee.

**Checkpoint:** 16/23 playable; all **seven actual Skia boards** share `GameCanvas` without a game-specific branch. Wave-3 has a validated practical pattern; no speculative stub/contract test.

## Stage 6 — Final automated acceptance and regression gates

- [ ] Root and mobile quality: `bun install --frozen-lockfile`; `bun run lint`; `bun run format:check`; `bun run turbo run typecheck`; `bun run --cwd apps/mobile test --runInBand`; `bun run test:coverage`; `bun run build`; `bun run test:e2e`. Existing Codecov project/patch targets remain unchanged; check native-only Jest is picked up correctly.
- [ ] **Draft-PR verification:** `mobile-export` CI job runs on each pushed draft commit. Other CI/e2e jobs currently skip draft; run those commands locally before finishing and use full CI when PR is marked ready. Record actual evidence rather than treating skipped checks as green. Expo CLI `bunx expo export --platform all` produces iOS+Android **JS/assets bundles only**.
- [ ] **iOS simulator end-to-end guest acceptance:** for **each of the eight games**, validate hub/detail Play enabled → Start → game-specific input → visible progress → game finishes/result (saved/unconfirmed separately tested via Jest) → Replay → navigate back, with cleanup. Collect per-game screenshot(s) as they land, not a speculative all-at-end Maestro/Detox implementation. If automation is already available, use it to drive taps; otherwise record deterministic simulator flow execution and screenshot artifacts, **without making human sign-off an acceptance criterion**.
- [ ] **Native visual checks on iOS:** screenshots of idle/active/result representative screens at compact and large iPhone simulator sizes; board fits within safe areas, logical aspect ratio and letterbox hold, labelled D-pad/gates/flip button not clipped, canvas elements visible and contrast tokens match existing Cetus UI. Check against a Linear ticket UI mockup **only if supplied** (none attached now). No new pixel-diff comparison with desktop web or unbounded visual harness.
- [ ] **Contract tests (Jest):** one score submit call, `Platform.OS`, saved vs unconfirmed result, post-save award notification and account isolation; do not overclaim a working **real authenticated provider/backend** run. Host-level tests already cover most contracts and must be extended for new ports. Real-authenticated iOS score/leaderboard parity remains a distinct release gate for HPA-199.
- [ ] **Android/Linux:** validation through CI export/automated tests only; **Android native Skia compile/runtime remains unverified** without a later Android native CI/EAS build, explicitly tracked under HPA-199. No manual Android/Linux acceptance.
- [ ] **macOS/Windows:** Expo mobile app does not target them; no invented native desktop criteria. The existing web build/Playwright regressions remain in scope.
- [ ] Web remains all 23 game routes with Pixi unchanged; native remains 16 playable/7 unavailable; no game-specific registry inside canvas, no extra scheduler/stepper/worklets, no new API, no new art/SFX. Update README only for factual native game availability and Skia dev-client prerequisites.

## Acceptance evidence ledger (fill with artifacts, not approvals)

| End-to-end requirement | Platform and method | Evidence to collect | Status |
| --- | --- | --- | --- |
| All eight new games start/input/progress/finish/replay/navigate back | iOS simulator, each stage | Per-game command/log and screenshot | Pending |
| Full-motion Snake and Gravity Flip pilots prove canvas/frame/host separation | iOS + Jest | Native screenshots and board-vs-host render-count tests | Pending |
| 2048 tile animations/undo, Reflex taps, Signal lanes, Evader D-pad, Path drag, Gravity Flip and Asteroid inertia work | iOS simulator | Gameplay screenshots + Jest controls/state tests | Pending |
| Native UI geometry/accessibility against current Cetus tokens; compare Linear mockup if later attached | iOS screenshot review | Screenshot set, visible unclipped controls and logical aspect-fit assertions | Pending |
| Score POST/result/award contract, no retry and account isolation | Mobile Jest with stubbed responses | Test logs + assertion names | Pending |
| 16 playable / 7 unavailable, all web games intact | Jest + existing web CI | Registry test and web CI | Pending |
| iOS+Android Expo JS/assets bundles resolve on **draft** PR | CI `mobile-export` | CI job links (does not prove native build) | Pending |
| Android native compile/device parity | HPA-199 CI/EAS release gate | **Not claimed for HPA-533** | Unverified |
| Real authenticated cross-platform score and achievement parity | HPA-199 release gate | **Not claimed by guest/Jest tests** | Unverified |

**Done-for-this-PR criterion:** all eight wave-2 games play on iOS simulator with recorded gameplay/visual evidence; backend score-contract unit assertions and established web checks pass; the new always-on draft CI job exports iOS and Android JS bundles; registration is 16/23; existing wave-3 is untouched. Leave real Android native runtime/store submission and real cross-platform authenticated parity as explicitly **unverified HPA-199 gates**. No human acceptance/sign-off checklist.
