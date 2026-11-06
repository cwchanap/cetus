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


## Stage 1 — Shared contracts first, then mobile routing/session host

**Commit 1: all portable contract changes and Vitest regressions (no native screen required).** Settle the stable contracts before building eight views:

- [ ] Extend `BaseGame.end()` structured `end` with **`save: { success, code }`** from the existing `saveResult`. Add **optional** `saveStatus?: 'pending' | 'saved' | 'unconfirmed'` and `saveCode?` to the common `GameSessionResult`, because `createHandleSession` also uses this type for Circuit Hacker, Satellite Sync and Ice Slide display-only results with independent persistence. **Absent means the producer did not report save status**, not saved or pending. Require **`createBaseGameSession`** to populate `saveStatus` on *both* provisional (`pending`) and structured (`saved` / `unconfirmed`) results; mobile BaseGame UI/tests enforce that producer-specific contract. Reuse the existing provisional result; no second state machine. Handle the code-less `{success:false}` from `ScoreManager.saveFinalScore` on a throwing submitter. Do not change handle-based games or invent fake save confirmations.
- [ ] Add exactly one `createStableProjector(select)` helper in `@cetus/app-core`; `select` returns a new **plain serializable visible-state snapshot** (never mutable board references), compare structurally and reuse previous reference when unchanged. Use the lightweight serialized structural comparison suitable for 12×12-and-smaller boards. Vitest: mutate a nested cell **in place** and observe new projection; timer tick without board change retains prior reference. All 8 native views will consume this helper; do not refactor 16 web projectors. **Sudoku exception:** its changing elapsed-time `projected.clock` is a lightweight HUD field, not part of the stabilized board prop; a timer tick may change the top-level projection, but must not invalidate the memoized grid or its stable input callbacks. Test grid identity across clock ticks.
- [ ] Make Quick Math `generateNextQuestion` and Word Scramble `generateNextChallenge` emit `state-change` on relevant updates (wrong answers, skip, etc.) while keeping existing callbacks. Vitest: correct/wrong/skip and reset projection; no duplicate score calls.
- [ ] Extract `forwardBaseGameResults(game, { onAchievements, onChallenges })` with the existing structured-`end` filtering to `@cetus/app-core`. Keep a **thin adapter** at `apps/web/src/lib/games/core/notificationForwarder.ts` passing the web `window.*` sinks, so the existing web imports stay unchanged. On mobile, provide one mounted-account-scoped banner sink. Test bare `end` filtering, one reward delivery, **same-account stale-run reward forwarding**, and no listener after dispose; preserve the session adapter's stale-`runId` suppression of **score/results**.
- [ ] Run portable Vitest, **existing `createHandleSession` tests and the three handle-based web screen regressions**, plus existing web GameScreen/forwarder checks before touching native routing. Confirm handle results without `saveStatus` remain valid, while BaseGame provisional/final results always report it. No new event bus, reward store or backend API.

**Commit 2: native app integration and route gating.**

- [ ] Add `"@cetus/games": "workspace:*"` to `apps/mobile/package.json`; update the one root `bun.lock`. No Skia, AsyncStorage or new native dependency unless a concrete component actually needs one.
- [ ] Add exactly **one** `NATIVE_GAMES: Partial<Record<GameID, NativeGameEntry>>` map under `apps/mobile/src/games/registry.ts`, with computed keys **from imported enum members** (`[GameID.MEMORY_MATRIX]`, etc.), never bare strings such as `'memory_matrix'`. The Games hub, detail Play button and `apps/mobile/app/games/[gameId]/play.tsx` all consult it (use own-key check for unknown strings). Eight playable; 15 disabled; no second ID constant/list. Jest: verify each expected ID and all registry/catalog counts.
- [ ] In the play route use `useSessionGuard()` and gate **only the first unresolved auth read**. A tiny route-local "resolved once" ref/state becomes true after the first `isPending === false` and **never resets for revalidation**; keep an already-mounted host alive while `isPending` later flips true. Keep the **last settled** `sessionKey` while refreshing (avoid transient guest/unknown key churn), and remount `<NativeGameHost key={settledSessionKey ?? 'guest'} gameId={gameId} />` only on an actual newly settled identity change. Include explicit unknown/unported ID fallback; do not use renewal-sensitive `gateKey` or a new session abstraction. Jest: cold start pending -> guest/signed-in; **resolved guest `{data:null,isPending:false} → {data:null,isPending:true} → {data:null,isPending:false}`** preserves the *same* game instance, board and timer; active guest -> signed-in tears down old forwarder/session/game before new account game; signed-in -> guest changes host; ordinary session renewal never resets play.
- [ ] Create the concrete `@cetus/games` class with `submitScore: data => api.submitScore(data)` and `platform: Platform.OS`, then one `createBaseGameSession(game, projector)` and `useGameSession(session)`. One mount effect attaches the reward forwarder; cleanup **removes forwarder, disposes session and calls game.destroy() in that order**. On an account/session change the key remount drops old-account banners and game UI. Do not import web initializers, DOM or Pixi.
- [ ] Minimal shared native score/time/start/pause/reset/replay/result chrome only. Prefer optional `projected.clock` when provided (Sudoku elapsed time), else snapshot `timeRemaining`; use `formatTime` from `@cetus/games/shared/utils`. Reuse Button/Card/Badge/Heading; use native `Select` and `Toggle` where consumed. No blanket web chrome port.
- [ ] Jest: unknown route, account remount, **unchanged guest pending false→true→false without unmount/board/timer loss**, one `Platform.OS` score submitter contract test, cleanup/timer and package import-graph. Metro iOS/Android resolves native-only imports. No separate PR.

**Checkpoint:** all pure contract changes test green and the native route/host scaffolding is coherent. Review shared contract/event changes before screen proliferation.


## Stage 2 — Two pilot games: network flow **and** in-place board mutation

**Pilot 1 — Chromatic Tide (simple action + score save).**

- [ ] Render the 12×12 board, palette, captured territory and moves from the existing `ChromaticTideGame` state, using `createStableProjector(select)`; invoke `chooseColor`, not copied flood-fill rules. Test tap -> model call -> updated board, finish and reset.
- [ ] Display the Stage-1 save contract: provisional `pending` -> server-confirmed `saved`, otherwise `unconfirmed` with generic fallback if no `code`. For `NETWORK_ERROR` the message must allow that a request was committed; never auto-retry/re-POST. For 401, sign-in CTA applies to **future** scores only.
- [ ] Attach the portable event forwarder to the native host, routing achievements/challenges into **one** small banner. Keep the result sheet to outcome/score/save-status; avoid duplicate reward rendering from both. Test successful response, a rejected/error response, same-account quick replay during an in-flight save (old-run reward still visible **once**), and new-account remount (old-account reward not visible).
- [ ] Use the existing cookie-backed `api.submitScore` with `platform: 'ios' | 'android'`; do not create a new endpoint or persistence layer. Use the existing server score tests rather than duplicating them.

**Pilot 2 — Memory Matrix (mutating board + delayed callback).**

- [ ] Build the 6×8 card board with `flipCard({row,col})`, matched and processing flags, and the configured flip delay. The `select` callback **copies visible cell values** rather than returning mutated `board` references.
- [ ] Jest/Vitest: in-place card flip updates the projected board, two-card delayed mismatch clears visuals, rapid third tap blocked, reset during delayed match does not update the new run, `time-update` does not churn unchanged projection refs. Finish and replay work.

**Mandatory pilot-pair checkpoint:** review the app-core projector, reward-forwarder behavior, score flow and one **mutating-board** native view before copying the pattern to remaining games. No second PR.


## Stage 3 — Remaining **six** native games (commits, not PRs)

Implement each as a small React Native view over its existing class; **one reviewable commit per game within this PR**. Every view uses `createStableProjector(select)`, has a native Jest test for **tap/press -> concrete model method args -> updated visible projection**, and checks finish/reset. Continue passing all earlier screens after each commit.

- [ ] **Mine Grid:** `revealCell(row,col)`, `toggleFlag(row,col)`, `newGame(difficulty)`. Native `Select` for easy/medium/hard, `Toggle` for visible Reveal/Flag mode and RN `Pressable.onLongPress` for direct flagging. Let Pressability's existing cancellation suppress `onPress` on a successful long press; **test** it, don't hand-roll a flag-click suppression state machine. In-place cells need copied visible data; test safe first reveal, win, bad flag, reset.
- [ ] **Pattern Pulse:** `pressPad(0..3)`, phase/sequence, streak/mistakes; model drives active pad and feedback timings. Only input during allowed phase; optional already-installed `expo-haptics`, no new SFX. Test timing, wrong pad, cleanup/cancel.
- [ ] **Potion Sorter:** `activateTube(index)`, `undo()`, `canUndo()`; selected source, illegal pour indication, progress and `Select` difficulty. Test correct/incorrect pour, undo and solve/timeout.
- [ ] **Sudoku:** `selectCell`, `placeNumber`, `clearSelectedCell`, `newGame`; native 9×9 grid, 1–9 pad, erase, conflict/given/highlight and `Select` difficulty. Select a **separately stabilized grid** (e.g. `createStableProjector(selectGrid)`) and expose a cheap `projected.clock: game.getElapsedTime()` to the generic host. Pass the same grid reference and stable tap callback to a memoized board; clock ticks update the HUD without redrawing all 81 cells. Test unchanged grid ref/render count on timer-only ticks **and** changed grid after an in-place number edit; also test given-cell lock, finish, pause/reset.
- [ ] **Quick Math:** `QuickMathFrameworkGame.submitAnswer(string)` and `getCurrentQuestion()`; keypad/backspace/submit, accuracy and score. Stage-1 source event fixes already cover wrong-answer question progression; test both outcomes and reset.
- [ ] **Word Scramble:** `WordScrambleGame.submitAnswer(string)`, `skipCurrentChallenge()`, `getCurrentChallenge()`; letter tiles (incl. repeated letters), undo/clear/submit/skip and counters. Stage-1 event fixes already cover next-question propagation; test incorrect/skip and reset.

**UI rule:** Keep boards readable on narrow devices via scroll/viewport; don't shrink every 12×12 hit target to an inaccessible size. Reuse NativeWind tokens and existing `Select`/`Toggle`/Button/Card. Don't add another renderer layer or duplicate scoring.

**Checkpoint:** all eight games work with focused view/controller tests and minimal chrome. Keep implementation in PR #105.


## Stage 4 — Focused host/event integration tests (no duplicate parity harness)

- [ ] Add **one** native host Jest test that `Platform.OS` becomes `platform: ios/android` in the `ScoreData` passed to the injected `api.submitScore`, exactly once per completed run. Reuse existing `apps/web/src/pages/api/scores.test.ts` server tests for platform persistence and award rules; only add endpoint tests if a real server defect is found.
- [ ] Native Jest for each game's input -> concrete method arguments -> updated projection, and finish/reset (Stage 2–3 tests); no second web-vs-native deterministic rules harness. The two platforms run the **same** `@cetus/games` simulation covered by its existing portable tests.
- [ ] Portable/new host tests: **BaseGame** provisional `pending` and structured `saved`/`unconfirmed` (including code-less false), and **handle-based results with `saveStatus` absent**; no duplicate result/banner; stale-`runId` **score/results** dropped even if a newer run finishes; **same-account stale-run rewards forwarded once**; cross-account/replaced host rewards suppressed; guest/401; timer vs explicit completion emits no double submission.
- [ ] Verify **initial-only auth gating** prevents a premature cold-start game, but a **resolved guest refresh** (`isPending` false→true→false with unchanged null user) leaves the same instance/board/timer mounted. Keep the last settled identity while a refetch is pending; stable `sessionKey` does not reset on a normal renewal. A **guest→authenticated** settled identity must remount and clean the old host before new-account play. Cleanup removes forwarder, session listeners, timers and delayed callbacks. Add a Sudoku clock-only tick test proving the memoized board does not rerender. Test a route exit while save is in flight.
- [ ] Preserve existing web GameScreen and notification-forwarder behavior with focused regression checks; no broad refactor of 16 web projectors, no duplicate POST endpoint test suite.


## Stage 5 — Validation and honest external acceptance fallback

- [ ] Automated gates: `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run build`, relevant `bun run test:e2e`; `bun --cwd apps/mobile test --runInBand`; Metro/dev build for both iOS and Android. Record exact commands/outputs and any pre-existing failures. Check no browser/DOM renderer imports and unchanged Codecov gates.
- [ ] **Required HPA-425 playability gate:** run **guest** start/action/finish/reset on **all eight games on iOS simulator and Android emulator**. Check taps, memory mismatch delay, mine flag/long-press, pulse timing, potion undo, tide color, Sudoku keypad, math keypad and word tiles; small screen/safe area, navigation/back and background/foreground. Use real devices if available, but simulators satisfy this ticket's gameplay verification.
- [ ] **Required code-level score/reward gate:** one host test proves mobile `platform` and exactly one `api.submitScore` call; focused tests prove pending/saved/unconfirmed, rewards once after same-account quick replay, isolation after account change; existing server suite exercises score persistence/awards. This is **contract/integration evidence**, not proof of a signed-in phone-to-backend transaction.
- [ ] **Conditional signed-in device gate:** if fixed HTTPS origin, Google/Apple provider credentials, dev clients and EAS are available, perform authenticated end-to-end score/leaderboard/achievement/challenge verification on both devices now and record results. If not, document **not verified (external HPA-179 prerequisite)**, link the release-gate follow-up to **existing HPA-199**, and do **not** indefinitely block HPA-425's code-complete state on external sign-in setup. HPA-199 remains **blocked for release** until real authenticated device parity is proven. Don't claim end-to-end persistence succeeded based solely on mocks.
- [ ] Update Linear HPA-425 with the PR and evidence summary. Mark HPA-425 **Done** only after both platform guest playability and code-level score/reward tests pass; record any deferred signed-in device gap on HPA-199. The draft PR may become ready after these scoped HPA-425 gates, with release-device sign-off explicitly deferred; do not auto-merge on the basis of the plan.


## Expected file touch list (adjust from live code)

| Area | Expected changes |
| --- | --- |
| `packages/games/src/core/BaseGame.ts`, `packages/app-core/src/{types,createBaseGameSession}.ts`, tests | Narrow `save` payload, `saveStatus`/`saveCode`, stale-run regression |
| `packages/app-core/src/createStableProjector.ts`, tests | One serializable visible-data projector; mutable nested board fixture |
| `packages/app-core/src/forwardBaseGameResults.ts`, tests; `apps/web/src/lib/games/core/notificationForwarder.ts` | Portable forwarder with injected sinks and thin existing web `window` adapter (leave call sites alone) |
| `packages/games/src/{quick-math,word-scramble}/*`, tests | Missing `state-change` notification only |
| `apps/mobile/package.json`, `bun.lock` | `@cetus/games` direct dependency; no speculative native libs |
| `apps/mobile/src/games/registry.ts`, existing catalog/detail, `app/games/[gameId]/play.tsx` | Single 8-game map and supported/unported routing |
| `apps/mobile/src/games/*` | Tiny account-keyed host, result/banner and eight native views |
| `apps/mobile/__tests__/*` | Focused model-input/view projections, host lifecycle/score/reward tests |
| `apps/web/src/pages/api/scores.ts` and DB schema | **No planned changes**; existing endpoint/tests are sufficient |


## Explicit deferrals and risks

- **Firm exclusions:** No Skia, waves 2/3, store release, new auth/API/DB schema, broad refactors, second UI store, custom renderer, duplicate rules, art/SFX generation or persistent score queue. Do not turn a score-retry discussion into a server project inside HPA-425.
- **Deferred retry:** A failed response parse may be classified `NETWORK_ERROR` **after the server committed**. Blind replay can duplicate rows or use stale UTC/`competitionKey` context. Default to honest `not confirmed`. If real usage eventually justifies durable retry, plan a **separate** narrowly scoped future ticket (reuse a cancelled/duplicate Graveyard issue rather than creating a new one needlessly); no ticket now.
- **Mutable state:** Memory Matrix, Mine Grid and Sudoku mutate nested cells. All eight native views use the Stage-1 `createStableProjector`, and Memory Matrix is the second pilot to test the hard case before mass porting. Sudoku stabilizes the board separately from `projected.clock` so one-second clock updates do not rerender the grid.
- **Same-account delayed rewards:** The session adapter rightly discards stale **score/status** from a previous run, but the separately injected forwarder must deliver that run's committed awards **once** on the same account. Account-key remount removes the old forwarder, preventing other-user banners. No double delivery from a result overlay.
- **Session revalidation and shared result type:** Better Auth can set `isPending` again for an already-resolved anonymous session; the play route must gate only initial resolution and retain the settled key during refetches, not remove an active game. `GameSessionResult.saveStatus` must remain optional because handle-based games own persistence; the BaseGame adapter guarantees it, so native gameplay still has strict save-status presentation without fake values or an unrelated web migration.
- **External auth:** HPA-179 OAuth/EAS/device sign-in is not proven by merged mobile scaffolding. Require both-platform **guest simulator gameplay** plus automated score/award contract checks for this ticket; track actual authenticated device-to-backend parity as the existing HPA-199 release gate unless it can be proven now.
- **Single-PR review cadence:** portable contracts + routing first, Chromatic Tide **and Memory Matrix** pilot pair second, six further views as staged commits, focused contract tests and final sign-off — all inside PR #105. Keep Linear and docs aligned with review comments, do not open a second PR.

