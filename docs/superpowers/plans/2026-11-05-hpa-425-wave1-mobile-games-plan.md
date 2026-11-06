# HPA-425 — Wave 1 native games: single-PR implementation plan

**Status:** Planning draft (2026-11-05); checkboxes below refer to **future implementation**, not completed work.
**Linear:** [HPA-425](https://linear.app/cwchanap/issue/HPA-425/port-wave-1-games-to-mobile-8-view-based-games)
**Design:** [Wave 1 design spec](../specs/2026-11-05-hpa-425-wave1-mobile-games-design.md)
**Baseline:** `main` after merged [HPA-182 / PR #103](https://github.com/cwchanap/cetus/pull/103); recheck head and open PRs before coding.
**PR rule:** The docs, all eight game ports, tests, and review responses go on **one branch / one PR**. Stages below mean commits/checkpoints, **not separate PRs**.

## Gate 0 — Confirm repository and external assumptions

- [ ] Re-read HPA-425 description and the last HPA-182 handoff. Confirm dependencies HPA-179 and HPA-182 are Done; check that there is still no overlapping feature PR or branch.
- [ ] Verify the real `main` head. Inventory `apps/mobile/app/(tabs)/index.tsx`, `app/games/[gameId].tsx`, `apps/mobile/src/lib/api.ts`, `src/lib/session.ts`, `packages/app-core/src/{createBaseGameSession,useGameSession,types}.ts`, `packages/games/src/*` and `packages/shared/src/scores.ts`. Update docs if the code has changed.
- [ ] Record baseline `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`, and `bun --cwd apps/mobile test --runInBand`. Separate existing failures from this feature.
- [ ] Determine whether an iOS and Android development build plus fixed HTTPS API/auth origin are actually available. HPA-179/HPA-182 merged with **external device/OAuth/EAS acceptance unverified**; do not label real-device or sign-in tests passed until run.
- [ ] Confirm no new art/SFX is needed. If later desired, plan it as a separate task (reuse an appropriate cancelled/duplicate Graveyard ticket); it is not part of this PR.

**Checkpoint:** design matches the *current* repo and the ticket, not assumptions from an older mobile migration document.

## Stage 1 — Mobile dependency, routing and minimal session host

- [ ] Add `"@cetus/games": "workspace:*"` to `apps/mobile/package.json` and update the **single root** `bun.lock`. Do not add Skia, a new animation engine, AsyncStorage, Redux, or a second API client.
- [ ] Define one explicit constant of the eight supported `GameID`s and a small typed registry mapping to native screens. Change catalog labels and `/games/[gameId]` Play CTA **only** for those IDs; other 15 remain disabled. Add `apps/mobile/app/games/[gameId]/play.tsx` with unknown/unported ID handling and a normal back path. Keep the existing intro route.
- [ ] Make a small `apps/mobile/src/games` game-host helper/component. Construct each concrete `@cetus/games` class with `{ submitScore: data => api.submitScore(data), platform: Platform.OS }`, then `createBaseGameSession(game, stableProjector)` and `useGameSession(session)`. Do not import `apps/web` initializers, `window`/`document`, DOM classes, or any Pixi renderer.
- [ ] Scope game instance to the mounted route and stable authenticated account identity. Dispose session **before** calling `game.destroy()` on unmount, account switch or route replacement; ensure restart does not leave a timer/listener behind. Allow guest play but communicate that guest scores do not persist.
- [ ] Implement the smallest shared native score/time/start/reset/replay/result chrome consumed by the pilot; reuse existing native Button/Card/Heading/Badge. Use per-game controls only where needed. Add native variants of web `GameStats`/`GameControls`/`GameOverlay` **only when there is a real consumer**; no blanket port of `GameTitle`, `GameBreadcrumb` or decorative DOM effects.
- [ ] Add Jest coverage for registry gating (8 enabled / 15 disabled), unknown paths, account-scoped lifecycle, unmount cleanup, and the native package import graph. Verify Metro iOS/Android bundle resolves game subpaths without browser dependencies; avoid a second native development-client rebuild unless a new native module actually requires one.

**Checkpoint:** navigation to a stubbed native game screen works; existing 15 games still say unavailable; no new score/reward API is invented.

## Stage 2 — First playable game and trustworthy score results

**Pilot = Chromatic Tide:** small tap-based API, fixed palette and board; proves shared game/session/API lifecycle before replicating it seven times.

- [ ] Implement the `ChromaticTideGame` native board/palette using model state and `chooseColor`. Render captured territory, timer, moves and completion with NativeWind tokens. Add accessible color names and scalable board layout.
- [ ] Ensure a model `state-change` yields a fresh immutable projected board; `time-update`/score-only changes retain stable projection references when board contents are unchanged. Add tests that flood-fill visibly updates the board and that reset/replay creates a valid new run.
- [ ] Examine the real `ScoreSubmissionResult` flow: `ScoreManager.saveFinalScore` -> `BaseGame.end` -> structured `end` -> `createBaseGameSession` -> native result. Right now the structured end does not report success. Extend it **narrowly** with save success/failure/code; set projected result status to `pending` while save is in flight, then `saved` or `unconfirmed`. Preserve the existing stale-`runId` filter; never re-POST from the UI.
- [ ] Render saved status, server-confirmed `newAchievements` and `challengeUpdates`; otherwise render an honest "not confirmed" state. For `UNAUTHENTICATED`, offer sign-in to save *future* scores, not a replay of the old request. For `NETWORK_ERROR`, explicitly allow that the server may already have committed; do not introduce one-tap blind resubmission or AsyncStorage.
- [ ] Add focused **portable** tests for pending/success/failure end payloads, stale result suppression, no extra score POST on replay, and native Jest tests for the result screen. Reuse `api.submitScore`, with platform set by game config to `ios`/`android`; verify it reaches the existing endpoint.
- [ ] With a real signed-in backend fixture, confirm the pilot score persists and server awards the same achievement/challenge updates as web. If a device/HTTPS OAuth is unavailable, leave this checkpoint **blocked/external** (automated API tests can still run) rather than mark it done.
- [ ] **Retry decision gate:** document any actual evidence that next-launch/offline retry is essential. Default: **no persistent queue**. If proven necessary, first design idempotent server admission, same-account binding, UTC date/competition validity, permanent error behavior and duplicate-prevention tests, then implement within **this PR**. A `NETWORK_ERROR` does not establish that the POST was uncommitted.

**Checkpoint:** one working game end-to-end, with accurate save/pending/error/reward UI. Obtain review before copying the host pattern to seven screens.

## Stage 3 — Remaining seven native games (commits, not PRs)

Implement each entry as a small view backed by its existing rules class. Add its Jest interaction test and, only if game logic requires a change, a portable Vitest regression test **in the same commit**. After each commit the app must still launch; do not create seven new Linear tickets or PRs.

- [ ] **Memory Matrix:** `flipCard({row,col})`; responsive 6×8 board, one/two flipped cards, async mismatch delay, matched state, time and accuracy. Test processing guard and reset while a delayed match is pending.
- [ ] **Mine Grid:** `revealCell(row,col)`, `toggleFlag(row,col)`, `newGame(difficulty)`; preset 8×8/10×10/12×12 sizes, safe first tap, timer, flags and game-over. Use `Pressable.onLongPress` plus a visible Reveal/Flag toggle for discoverability and accessibility. Suppress the follow-up `onPress` so a flag gesture never reveals that cell. Test both touch sequences and mode changes.
- [ ] **Pattern Pulse:** `pressPad(0..3)`, phase/sequence feedback and mistake count. Show sequence via the model's active pad; accept input only during the input phase. Use already-installed `expo-haptics` for optional discrete feedback, never add required audio assets. Test timed phase changes, wrong input and teardown of scheduled callbacks.
- [ ] **Potion Sorter:** `activateTube(index)`, `undo`, `canUndo`; selectable tube, valid/invalid pour indication, difficulty preset, move/undo counts, solved/timeout. Test rejection of illegal pours and undo after a valid move.
- [ ] **Sudoku:** `selectCell`, `placeNumber`, `clearSelectedCell`, `newGame`; 9×9 tap board, 1–9 pad, erase, immutable projected grid, conflict/given/highlight indicators. UI time is elapsed time (`getElapsedTime()`), **not** the internal `Number.MAX_SAFE_INTEGER` countdown; keep pause/reset semantics. Test editing a given cell is rejected, difficulty reset, finished state.
- [ ] **Quick Math:** `QuickMathFrameworkGame.submitAnswer(string)` and `getCurrentQuestion()`; native keypad with clear/backspace/submit, score, accuracy. First add/verify a narrow `state-change` event when `generateNextQuestion()` replaces the question; its current callback-only notification otherwise misses wrong-answer UI updates in `useGameSession`. Keep existing callbacks. Test wrong and correct answer both advance.
- [ ] **Word Scramble:** `WordScrambleGame.submitAnswer(string)`, `skipCurrentChallenge()` and `getCurrentChallenge()`; selectable letter tiles with undo/clear, submit, skip and counters. Emit a narrow `state-change` when `generateNextChallenge()` changes the model (currently callback-only), without double-publishing reward events. Test repeated letters, wrong answer, skip and reset.

**Projection note:** `BaseGame.getState()` shallow-copies state; board arrays/cells may be mutated in place. Do not pass the mutable model object as an unchanged snapshot and assume React will rerender. Copy necessary visible fields for each board update, and memoize unchanged projection values. Keep one local projector per game unless a tiny shared projector actually reduces code.

**Interaction note:** On narrow phones, preserve touch targets and labels. Use horizontal/vertical scroll or focused viewport for large grids; don't reduce every 12×12 cell below a usable target just to fit. For long press, offer a visible tap alternative. Test app background/foreground and navigation to ensure timers, delayed reveals and submissions do not leak to an abandoned screen.

## Stage 4 — Cross-platform score and reward verification

- [ ] Drive the same deterministic model runs with the web and native submitter and compare `score` and `getGameData` (especially achievements input fields). Keep score submission exactly **once** per completed run and ensure account switching cannot attribute an old run to the new user.
- [ ] Test the existing `POST /api/scores` with `platform: ios` and `platform: android`, persisted history and leaderboard visibility. Server awards achievements/challenges; native simply displays response data. Include 401, 400, network/ambiguous result and successful reward payload cases.
- [ ] Test stale structured end after reset/new run; empty or delayed successful response; logout during a pending save; anonymous play; and a changed account identity while game screen is open. No stale reward banner may appear for another run/account.
- [ ] Mobile Jest/jest-expo: every game has at least a play/action/complete-or-error/reset scenario, and the host has pending/saved/unconfirmed reward scenarios. Portable game changes get Vitest tests; preserve existing web GameScreen behavior and root Codecov gate.
- [ ] Verify no race or double end from timer completion and explicit game-completion callbacks; observe actual `BaseGame.destroy` behavior. If an AppState/background edge case is real, fix the specific timer/session interaction, not with a new global task scheduler.

## Stage 5 — Final validation, manual sign-off and handoff

- [ ] Root: `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`. Mobile: `bun --cwd apps/mobile test --runInBand` and an actual Metro/dev build on both platforms. Recheck Jest native export conditions, dependency bans and no accidental browser import. Record actual outputs/sha and pre-existing failures in this plan or PR body.
- [ ] Manual **iOS** smoke: all 8 game loops; memory flip, mine long-press, pulse playback, potion undo, tide color, Sudoku keypad, math pad, word tiles; tiny screen/safe area, VoiceOver, sign-in and score/reward status.
- [ ] Manual **Android** smoke: repeat the same input/control/score checks, including Android long-press vs tap suppression, back/navigation, app background/foreground and auth cookie.
- [ ] Compare persisted score/leaderboard/achievement/challenge state with an equivalent web run, not just client screenshots. If OAuth fixed HTTPS host/EAS/devices are unavailable, mark **manual/external validation incomplete**, not successful.
- [ ] Update [HPA-425](https://linear.app/cwchanap/issue/HPA-425/port-wave-1-games-to-mobile-8-view-based-games) with the final PR and checklist evidence. Keep the PR **draft** until implementation and required acceptance are actually checked. Mark the ticket Done only after its two Done-when conditions are evidenced.

## Expected file touch list (approximate, adjust from live code)

| Area | Expected changes |
| --- | --- |
| `apps/mobile/package.json`, `bun.lock` | `@cetus/games` workspace dependency, no speculative native libs |
| `apps/mobile/app/(tabs)/index.tsx` and `app/games/[gameId].tsx` | Eight enabled game entries/Play CTA, 15 honestly unported |
| `apps/mobile/app/games/[gameId]/play.tsx` | Shared play leaf/unknown game fallback |
| `apps/mobile/src/games/*` | Small host/result components and eight view-based boards |
| `apps/mobile/__tests__/*` | Host/router/game interaction, platform score and account lifecycle tests |
| `packages/games/src/core/BaseGame.ts`, `packages/app-core/src/{createBaseGameSession,types}.ts` and tests | Narrow score-result signaling, preserving the stale-run guard |
| `packages/games/src/{quick-math,word-scramble}/*` and tests | Missing question/challenge `state-change` notifications, only if confirmed |
| `packages/ui/src/*` | Optional native chrome pieces **only** if at least one port consumes them |
| `apps/web/src/*` / `packages/api-client/*` | No anticipated production changes; touch tests/code only if an actual parity defect is found |

## Explicit deferrals and risks

- **Not in HPA-425:** Skia, game waves 2/3, App Store/Play Store submission, generic offline queues, idempotency schema by default, broad refactors, a new score service, duplicated game rules, new art/SFX, ornamental animation system.
- **Known risk: ambiguous commit.** The client can report `NETWORK_ERROR` after an HTTP 2xx response is persisted but parsing fails; auto-replay can duplicate rows. Default to "not confirmed" feedback.
- **Known risk: daily/context rollover.** Retry of a future contextual score could use a stale `competitionKey`/UTC day; never promise a durable retry without server validation.
- **Known risk: external acceptance.** Prior mobile PRs merged without proven OAuth/device/EAS setup. Automated tests do not substitute for real iOS + Android playability.
- **Known risk: mutable projected state.** Root app-core snapshots must reflect game `state-change` even when models mutate nested boards. Add focused tests instead of a new state management framework.
- **Known risk: callback-only games.** Quick Math/Word Scramble can advance without a score event. Fix portable event signaling narrowly; don't compensate with duplicate native domain state.

**Single-PR review cadence:** first design, then routing/host, pilot score result, each of the seven game views, and final parity evidence as successive commits **to this existing PR**. Keep the docs aligned with Linear as review findings evolve; do not split implementation into a second PR.
