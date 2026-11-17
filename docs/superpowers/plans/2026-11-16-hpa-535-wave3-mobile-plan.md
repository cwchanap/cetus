# HPA-535 — Port seven wave-3 games to Expo: single-PR implementation plan

**Status:** Proposal / docs-only first commit (2026-11-16). All implementation and verification checkboxes remain unchecked.
**Linear:** [HPA-535](https://linear.app/cwchanap/issue/HPA-535/port-the-wave-3-games-to-mobile-7-heavy-canvas-games) · **Design:** [Wave-3 design](../specs/2026-11-16-hpa-535-wave3-mobile-design.md)
**Base:** current `main` after [HPA-533 / PR #108](https://github.com/cwchanap/cetus/pull/108); mobile **16/23** playable.
**Delivery:** **One PR for HPA-535.** This draft starts with the two docs; all stages below become *commits within this same PR*. No per-game PRs. Keep the existing `NATIVE_GAMES`, `NativeGameHost`, `NativeGameChrome`, `GameCanvas`, `useGameLoop`, `createHandleSession`, `@cetus/api-client` and `@cetus/games`. No new general framework.
**Separate asset task:** [HPA-1140](https://linear.app/cwchanap/issue/HPA-1140/create-an-original-60-second-rhythm-reactor-metronome-audio-asset) delivers original rhythm audio independently; no music, image or SFX creation in the code PR.
**Release follow-on:** [HPA-199](https://linear.app/cwchanap/issue/HPA-199/verify-cross-platform-parity-and-release-on-the-app-store-and-google) owns **real cross-platform authenticated** parity, Android native/device verification and store release.

## Stage 0 — Baseline and source-of-truth check

- [ ] Rebase the draft branch on latest `main`. Confirm the existing 16-game registry, Skia native imports, no pre-existing wave-3 branch/PR, and existing callback contract for Circuit Hacker, Satellite Sync, Ice Slide. Check whether HPA-1140 audio asset is ready before scheduling the final Rhythm integration step.
- [ ] Capture baseline commands/results: `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run --cwd apps/mobile test --runInBand`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`. Never weaken a gate to make the branch pass; distinguish pre-existing failures.
- [ ] Verify a bootable **iOS simulator + current Skia development client** and MCP-based simulator interaction/screenshot capability. No attached Linear UI mockup; compare native screens to the existing Cetus chrome/theme using captured screenshots, not manual acceptance.
- [ ] Record a 16-game regression screenshot baseline, where useful. Keep every new board's screen/layout implementation in the same PR as its game model binding.

**Checkpoint:** source and testing prerequisites recorded. Docs are proposed, not evidence that a simulator/test has run.

## Stage 1 — Minimal native adapter for three callback/handle games

**Goal:** Add the missing native seam once without replacing the working BaseGame host.

- [ ] In `apps/mobile/src/games/registry.ts`, add a small **explicit handle-port** option beside the existing BaseGame port; preserve all 16 BaseGame entries unchanged. Handle-port creation gets the already identity-bound `submitScore` and `Platform.OS` from the host; returns a `createHandleSession` session, model/board binding and idempotent cleanup. A registry entry must pick exactly one variant.
- [ ] In `NativeGameHost.tsx`, choose either existing `createBaseGameSession` or the new handle session after the same `createScoreSubmitter(settledUserId)`. Feed **both** into the same `useGameSession` and `NativeGameChrome`, with the same reward banner and identity-keyed remount. Do not add a separate handle-game screen or score client.
- [ ] Provide a small handle-run result helper **only if needed by all three models**. Map callbacks to `createHandleSession.handlers`, publish pending/saved/unconfirmed when a score is submitted, and forward rewards once; games that deliberately do not save show an end result without a fake saved flag. Bind each async completion to a local run token + mounted identity. Preserve completed older-run server submissions while suppressing stale UI. Never retry a submit automatically.
- [ ] Handle stop/reset/replay by invoking **real model methods**, not fake `BaseGame` methods. Three callback models have no generic `pause`; hide Pause for them. Cleanup calls `cleanup()`/stop on the model and tears down active timers, rAF, listeners and pending view effects.
- [ ] Add focused Jest for two variants using the **same host/chrome**: BaseGame still works, handle can start/finish/reset/replay, score result statuses, one POST, awards once, guest vs identity binding, account switch/unmount, run-token stale callbacks, timer disposal and no fabricated Pause. Keep unrelated 16 board files untouched.

**Checkpoint:** isolated handle pilot tests pass; **0** new games registered yet. No new endpoint, database or global state store.

## Stage 2 — First three native BaseGame boards (16 → 19)

Commit/register each game with its board and its registry + hub tests, so `NativeGamesRegistry.test.ts` and `GamesHub.test.tsx` remain green **after each commit**, not only at the end. Existing `NativeGameImportGraph.test.ts` must cover the new runtime import path without any web/Pixi import.

### Tetris (16 → 17)

- [ ] Build `TetrisBoard.tsx` with Skia 10×20 playfield + next/held previews. Use existing `TetrisGame`, `useGameLoop` and an explicitly copied board-local scene; the portable model owns gravity via `Date.now()`, line clear, hold rules and score.
- [ ] Swipe left/right to move, swipe down for soft drop; labelled Rotate, Hold and Hard drop touch buttons. Do **not** map tap/gesture release to duplicate moves. Display `projected.clock` as elapsed time instead of `Number.MAX_SAFE_INTEGER` countdown.
- [ ] Jest: one gesture→one move, model rotation/hold cooldown/hard drop/top-out, paused input refusal, result/save once and lifecycle reset. MCP iOS play + active/result screenshot check.

### Bejeweled (17 → 18)

- [ ] Build `BejeweledBoard.tsx` using Skia for 8×8 cells. Swipe between neighboring cells via the existing `clickCell` two-step selection; taps are an accessible fallback. Use `setAnimator` to implement modest swap/undo/clear feedback; the model controls cascade timings/scoring.
- [ ] Block touch during `isAnimating`; do not duplicate scoring rules in animations. Ensure unmount/reset invalidates ongoing visual animation work, and all scene values are copied from model state.
- [ ] Jest: valid/invalid adjacent swaps, cascade, guarded taps, async swap reset/unmount cleanup and score/achievement results. MCP iOS play + screenshot check.

### Bubble Shooter (18 → 19)

- [ ] Build `BubbleShooterBoard.tsx` using Skia, project the shooter and actual existing hex geometry. Convert pan to logical space using `GameCanvas.toGamePoint`; update `setAimAngle` while dragging and `shoot()` **exactly once** when released inside valid board. The model owns projectile physics, wall bounces, attachment and group clears; no second geometry/collision engine.
- [ ] Use existing `useGameLoop` seconds-capped update with board-local projection; never fire from outside the board, cancelled gesture or during active projectile.
- [ ] Jest: aim clamp, shoot once, projectile attachment, popped-group score, pause/reset, result/replay and single saved/unconfirmed submission. MCP iOS play + aim/active/result screenshots.

**Checkpoint:** registry/hub counts **19 playable / 4 disabled**; three scenario suites and simulator screenshots recorded. No changes to shared host scene scheduling.

## Stage 3 — Circuit Hacker and Satellite Sync handle pilots (19 → 21)

### Circuit Hacker (19 → 20)

- [ ] Add `CircuitHackerBoard.tsx` using Skia tile grid and labels, pre-run difficulty selection and `rotateTile(row,col)` touch mapping. Grid is generated **at Start**, not in constructor. No frame loop: redraw on model callbacks/ticks.
- [ ] Create the game's handle session with `onGameStart`, `onTimeUpdate`, `onRotation`, `onSolved`, `onFail`; wire Start, manual Stop, Replay and cleanup. A solved run submits **once** with `difficulty, secondsRemaining, rotationsUsed, solved`; timeout/manual fail produces result **without score submission** per existing web behavior.
- [ ] Jest: locked tile no-op, rotate/connect solve, timeout/manual fail, score gameData, one POST on solve, no POST on fail, stale score response after reset/unmount. MCP iOS stage solve and fail + screenshots.

### Satellite Sync (20 → 21)

- [ ] Add `SatelliteSyncBoard.tsx`: Skia orbits, satellites, target receivers/obstacles and beam status. Map pan begin/move/end to model `beginAim`, `updateAim(worldAngleDegrees)` and `endAim` via existing portable geometry helpers; don't implement a new orbital math engine.
- [ ] Use the existing one board-local JS rAF. **Convert `deltaSeconds * 1000` before calling `SatelliteSyncGame.update(deltaMs)`**; all other BaseGame games still receive seconds. Copy moving scene locally, stable host HUD projection.
- [ ] Bind `onGameStart`, score/time/locks/combos/level clear, `onFail` and `onWin` to the handle session. **Both** loss and win submit exactly once with `game.getGameData()`; Stop aborts the run and clears screen without a fabricated score save.
- [ ] Jest: 16ms frame passes 16ms, target movement and lock snapping, level transition deferred entity swap, timeout and win save once, timer cleanup and stale response guards. MCP iOS target lock/level progress/result + screenshots.

**Checkpoint:** registry/hub counts **21 playable / 2 disabled**; both handle models proved through same native host.

## Stage 4 — Ice Slide with all web modes (21 → 22)

- [ ] Build `IceSlideBoard.tsx` using Skia cell geometry, swipe-to-`move(Direction)`, live player/crystals/hazards, level progress and score. Provide board-local Start/Stop/Undo/Reset Level controls and clear stage-result presentation; model owns physics and solvability.
- [ ] Add a compact mode chooser: **Campaign** (`game.start()`), **Daily** (`createIceSlideDailyRunDefinition(toIceSlideUtcDateKey(new Date()))` fixed once at Start), and **Expedition** (`createIceSlideExpeditionRunDefinition(seed)`). Display/copy Expedition seed for Retry and keep its run definition on retry; expose **safe/risky** route choices at stage 2/4 and charged Undo using existing `chooseExpeditionRoute/canUndo/undo`.
- [ ] At the existing model end/stop boundaries, submit once (when eligible) using `game.getGameData()` and **exact** score context:
  - Campaign: no extra mode context.
  - Daily: `{mode:'daily', competitionKey:runKey, rulesetVersion}` (never device-local date).
  - Expedition: `{mode:'expedition', rulesetVersion}`.
  - Daily early Stop: **no score POST**. Campaign/Expedition early Stop: **only score > 0**. A completed positive run submits once.
- [ ] Show **per-day leaderboard** by calling the existing `api.getLeaderboard({gameId: GameID.ICE_SLIDE, mode:'daily', competitionKey:runKey, limit})`; distinguish loading, rows, empty, service error and Retry. No new backend API, schema, URL or score partition logic.
- [ ] Jest: deterministic UTC Daily key and run signatures, Expedition seed and route choice replay, score/no-score stop matrix, context payloads/achievement data, one POST, unconfirmed/guest handling, scoped leaderboard requests and states.
- [ ] MCP iOS simulator: Campaign move + result, Daily run + leaderboard, Expedition route-choice/Undo and retry seed; take active/mode/result/leaderboard screenshots and verify safe-area/controls.

**Checkpoint:** registry/hub **22 playable / 1 disabled**; original web Ice Slide contexts remain unchanged.

## Stage 5 — Rhythm Reactor, local audio and calibration (22 → 23)

- [ ] Integrate the **separately produced HPA-1140 original 60-second click track**; do not create or edit the audio art under HPA-535. Use `bunx expo install expo-audio` (Expo SDK57-compatible version), update **only root `bun.lock`**, rebuild iOS dev-client and verify native audio output. A JS bundle alone is not a native audio runtime check.
- [ ] Add `RhythmReactorBoard.tsx`: four Skia falling-note lanes, labelled touch lane buttons, a simple latency adjustment with a visible bounded millisecond offset, start/reset/result and audio unavailable status. Keep the chart and score predicates in `RhythmReactorGame` without duplicating judgment logic.
- [ ] Align the chart to `expo-audio`'s **real player timeline**. Because the current `RhythmReactorGame.update(deltaSeconds)` caps at 0.1s, add a **small, tested portable sync-to-absolute-playback-time method** or equivalent monotonic model seam; keep `update` intact for web. Player position drives both falling-note presentation and model's judgment clock. Calibration shifts *input-hit offset*, not the chart or score payload. No second scheduler/state store.
- [ ] Handle preload, playback failure, output/input latency, count-in 2s, end/Replay, app background and unmount: stop/release audio and reset timeline; never leave a running sound after leaving game. Retain non-pausable model truth.
- [ ] Jest with fake media clock: 60s chart/cue, ±0.08/±0.16 perfect/good/miss windows, latency adjustment sign, 200ms hitch (no silent dropped timeline), single tap, end/cleanup and old-run rewards. E2E iOS MCP **actual audio playback** / lane hit / calibration / result and active/result screenshots.
- [ ] Add the last registry port and update exact registry/hub IDs/counts **in same commit**: 23 playable, 0 disabled.

**Checkpoint:** **all 23** web catalog games have a working native Play entry. Rhythm acceptance requires the separately sourced audio and a real iOS dev-client run.

## Stage 6 — Executable acceptance and evidence ledger

**Functional regression checks (automated):**
- [ ] `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run --cwd apps/mobile test --runInBand`, `bun run test:coverage`, `bun run build`, `bun run test:e2e` all pass on the implementation commit; **do not infer pass from this docs-only draft**. Preserve existing web 23-game routes and Playwright e2e.
- [ ] New native regression/Jest tests prove 23/23 registry and catalog, correct game constructors/handle lifetimes, no web/Pixi imports, no host per-frame 60Hz rerenders, each input, model end state, no duplicate score POST, score platform and proper `gameData`/`context`, rewards, guest identity binding, stale async response safety, timers/gestures/audio cleanup and honest result statuses.
- [ ] Handle-specific controller tests verify `createHandleSession` status semantics, game-specific stop/replay/timeout, and every callback subscription canceled on unmount.
- [ ] **MCP-driven iOS simulator e2e for all seven games**: Games hub → detail Play enabled → Start → game-specific interaction → visible progress/end → correct result state → Replay → back; assert no stale game motion/audio/timer and no missing safe areas. Run at least one functional path per game and the additional targeted mode/animation/audio scenarios above. **Do not require a human to accept results.**
- [ ] **Visual screenshot acceptance**: after each game flow, save screenshots of game-active and result (plus mode/calibration/leaderboard as appropriate). The Linear issue has **no attached UI mockup**, so use objective screenshot-based checks against current Cetus mobile visual conventions: consistent chrome, text contrast/legibility, no clipped Skia board or letterbox hit target, touch controls reachable/labelled, safe-area insets, stable portrait layout; attach evidence to PR and compare again after UI changes.
- [ ] **Automated UI checks** on iOS suffice for this shared RN implementation without platform-specific UI changes. `mobile-export` CI runs **iOS+Android JS/assets on every draft push** using the placeholder origin. Other lint/test/build workflows are **draft-gated**; verify their local commands and then require full CI on Ready for Review. Android **native** compile/device and actual Google/Apple login + server cross-platform parity remain **HPA-199**, not claims from Metro/Jest.
- [ ] Manual account setup, Apple/Google provider credentials, store approval, new art/SFX, backend migrations and broad security hardening are not acceptance criteria for HPA-535.

### Seven game end-to-end evidence checkpoints

| Game | MCP-controlled interaction | Visual proof | Automated score/lifecycle proof |
| --- | --- | --- | --- |
| Tetris | swipe → Rotate → Hold → Hard drop → finish/replay | board, next/hold, result | elapsed clock, top-out, single POST |
| Bejeweled | adjacent swipe → cascade → replay | jewel selection, falling tiles, result | model combo, animation reset, one save |
| Bubble Shooter | drag aim → release → pop/finish/replay | hex geometry, aiming line, active/result | model physics, cancelled gesture guard, score |
| Circuit Hacker | select difficulty → rotate → solve; separately fail | grid power paths, result/fail | save only on solve, cleanup |
| Satellite Sync | aim beam → lock target → complete/lose | rings/beam, lock and result | ms time step, level transition, one save |
| Ice Slide | Campaign + Daily + Expedition mode, route/Undo, retry | grid, mode chooser, daily rank | UTC runKey/context, save/early-stop matrix |
| Rhythm Reactor | audio count-in → tap lane → calibrate → finish | falling notes, calibration, result | absolute clock, hit windows, audio cleanup |

### Evidence ledger (populate during implementation, not this planning commit)

| Evidence | Artifact/CI reference | Status |
| --- | --- | --- |
| Mobile Jest + portable model tests | pending | Not run |
| Web Vitest + Playwright e2e | pending | Not run |
| Lint, formatting, typechecks, build | pending | Not run |
| Draft-PR iOS+Android Expo JS export | pending | Not run |
| MCP iOS simulator functional flows × 7 | pending | Not run |
| MCP iOS screenshot visual checks × 7 | pending | Not run |
| iOS native `expo-audio` playback/calibration | pending HPA-1140 asset | Not run |
| Cross-platform real-auth/server parity + Android native device | HPA-199 | **Out of scope / unverified** |

**Definition of done:** seven native boards integrated and enabled (**23/23**), game-specific semantics/score contexts preserved, the HPA-1140 asset integrated by the coding stage, MCP-driven **iOS simulator e2e plus screenshot visual checks**, automated model/Jest/web regressions and build/type/lint gates all passing with links to evidence. This docs-only PR is not yet a completion claim; implementation commits remain in **this same PR**.
