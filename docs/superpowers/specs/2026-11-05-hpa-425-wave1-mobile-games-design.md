# HPA-425 — Wave 1 native games: design specification

**Status:** Planning draft (2026-11-05); no gameplay implementation in this commit.
**Linear:** [HPA-425](https://linear.app/cwchanap/issue/HPA-425/port-wave-1-games-to-mobile-8-view-based-games)
**Dependency:** HPA-182 / [PR #103](https://github.com/cwchanap/cetus/pull/103), merged to `main`; HPA-179 foundation is also merged.
**Delivery:** One issue, **one draft PR** for the spec, plan, subsequent implementation, tests, and review fixes.

## Goal, scope and non-goals

Make the following **eight** existing games playable on both iOS and Android, using React Native views and their existing portable rules engines. Preserve their web rules, scoring payloads, achievement eligibility and challenge progression by submitting results to the existing server endpoint with an explicit `ios` or `android` platform.

Wave 1: Memory Matrix, Mine Grid, Pattern Pulse, Potion Sorter, Chromatic Tide, Sudoku, Quick Math and Word Scramble. Do **not** port the 15 canvas games, introduce Skia, rebuild game logic for mobile, add a new database/auth service, or split this ticket into eight PRs. HPA-533/HPA-535 own the canvas waves; HPA-199 owns store release/parity gating. Reuse existing visual tokens; any new art/SFX belongs to a separate future ticket, not the code task.

**Existing baseline (verified on `main` after HPA-182):**
- `apps/mobile/app/(tabs)/index.tsx` lists all 23 games and marks every entry unplayable. `apps/mobile/app/games/[gameId].tsx` displays game details with a disabled Play button.
- `apps/mobile/src/lib/api.ts` already exports the cookie-bound, typed `api` client. `packages/api-client/src/api-client.ts` already implements `submitScore` to the existing `POST /api/scores` endpoint.
- All eight DOM-free game rule classes live under `packages/games/src/<game>/`; the web host's `apps/web/src/lib/games/*/initFramework.ts` is **browser-only** and must not be imported by mobile.
- `packages/app-core` already exposes `createBaseGameSession` and `useGameSession`; `GameSessionSnapshot` carries status, score, time, game-specific projection and a provisional/final result.
- `BaseGameConfig.submitScore` is already required, and `platform` is supported. `ScoreManager.saveFinalScore` returns `ScoreSubmissionResult`. The existing `BaseGame` structured `end` event does **not** currently expose save success/failure; native results must not silently label an unsaved score "saved".
- Native `@cetus/ui` Button, Card, Badge, Heading and other screen-consumed primitives already exist. `expo-haptics` and Reanimated are installed. Mobile uses Jest/jest-expo; root Vitest excludes `*.native.tsx` from coverage.


## Proposed user flow

1. Existing catalog/detail screens read one typed `NATIVE_GAMES: Partial<Record<GameID, NativeGameEntry>>` registry, keyed by imported enum members such as `[GameID.MEMORY_MATRIX]` (not string-literal IDs); **only** its eight entries enable Play. Other 15 remain honestly unavailable. A single `/games/[gameId]/play` route refuses missing/unported IDs.
2. The play route uses `useSessionGuard()`; while `isPending` is true, show a loading state **without mounting a game**. Once resolved, mount `<NativeGameHost key={sessionKey ?? 'guest'} gameId={gameId} />`. In particular, a **guest → signed-in** transition remounts the host, disposes the guest forwarder/session and destroys its timers before mounting an authenticated game; guest run state and late guest rewards must not be attributed to the user. A normal session renewal does not remount.
3. The host owns start/pause/reset/replay, score/time (with optional per-game `projected.clock` override for Sudoku elapsed time), a completed-run result with save status, and one lightweight achievement/challenge banner. Concrete React Native boards call existing model APIs only.
4. On completion, show result + `Saving…`, `Saved` or `Save not confirmed`. A same-account quick replay **does not discard** delayed server-confirmed achievements from the old run; a different account must never receive them. The banner/event forwarder delivers rewards once; the result sheet does not duplicate notifications.
5. Guest play is allowed. On 401, show "Sign in to save future scores"; do not attempt to replay the just-finished POST. Stop all game timers/listeners on unmount and account changes.


## Architecture and ownership

| Layer | Responsibility | Files |
| --- | --- | --- |
| Mobile route/catalog | One typed `NATIVE_GAMES` registry is the only source of playable IDs; route/catalog/CTA consult it | `apps/mobile/src/games/registry.ts`, existing catalog/detail, `app/games/[gameId]/play.tsx` |
| Native host | `useSessionGuard` pending gate + `key={sessionKey ?? 'guest'}`; create/dispose game and session; score/time/result chrome; one reward banner | `apps/mobile/src/games/NativeGameHost.tsx` and a tiny host helper |
| Eight game views | Native board/control components select immutable visible state and invoke existing model methods; no scoring logic | `apps/mobile/src/games/*` |
| Game/session contracts | Existing `BaseGame`, `createBaseGameSession`, `useGameSession`; narrow save outcome, stable projector, state-change event fixes and portable reward forwarder | `packages/games`, `packages/app-core` |
| API and rewards | Existing `api.submitScore`/cookie authentication and `POST /api/scores` server awards | No new server endpoint/schema; reuse `packages/api-client` and existing web rules |

**Lifecycle:** Add `@cetus/games` as a direct mobile workspace dependency; instantiate the concrete game with `submitScore: data => api.submitScore(data)` and `platform: Platform.OS` (`ios` or `android`). Use one `createBaseGameSession(game, project)` and `useGameSession(session)`. One effect owns the game, subscription and reward forwarder; cleanup removes the forwarder, calls `session.dispose()`, then `game.destroy()`. On a session-key remount, no previous-user UI/state survives. A request already committed by the server still belongs to the identity that authenticated it, and no old-account banner is shown after the old host is destroyed.

**Stable board projections — decided:** Implement exactly one `createStableProjector(select)` in `@cetus/app-core`. Each `select` returns freshly copied, plain serializable **visible** game data (grid/cell values, selected flags and relevant HUD fields). The helper compares the new projection structurally with the last one and **returns the previous reference when equal**; a compact JSON structural comparison is enough for the at-most-12×12 boards. Never cache/refer to mutable `BaseGame.getState()` nested arrays directly. All eight views use this helper; leave existing web HUD projectors unchanged. A Vitest fixture must mutate a nested cell in place (Memory Matrix/Mine Grid/Sudoku pattern) and prove a new projected value on `state-change`, while timer-only ticks retain the projection reference for games with unchanged visual state.

**Sudoku clock/render separation:** `SudokuGame.getElapsedTime()` changes once per second and is exposed as optional `projected.clock` for generic host chrome. Keep the **9×9 board's visible-data projection separately stabilized**, e.g. a nested `createStableProjector(selectGrid)` whose result is passed as a stable `grid` prop to a `React.memo` board view with stable input callbacks. A clock tick may change the lightweight top-level HUD projection, but must **not** change the board prop reference or rerender all cells. Test grid identity/render count across timer-only ticks and an actual in-place edit. No new timer store or global abstraction.

**Shared event fixes:** Quick Math's `generateNextQuestion` and Word Scramble's `generateNextChallenge` call callbacks without `state-change` today. Emit that event on relevant model transitions (including incorrect answer/skip/reset where needed), retaining existing callbacks, and test no duplicated score saves. Format native countdown/elapsed time with existing `formatTime` from `@cetus/games/shared/utils`.

**Reward parity:** Reuse the existing web `forwardBaseGameResults` semantics for a **same-account** quick replay: server-confirmed rewards may arrive from an old run even when its score/stats are correctly rejected by the session adapter's stale-`runId` guard. Extract the listener logic to `@cetus/app-core` with injected `{ onAchievements, onChallenges }` sinks. Keep a thin web adapter at the existing web forwarder path that supplies its `window.showAchievementAward`/`window.showChallengeComplete` sinks; avoid rewriting every web call site. Mobile supplies a small in-app banner sink that exists only for the mounted account. The forwarder ignores bare timer `end` and never re-posts scores; it owns reward notifications, while the results sheet owns score/save status.


## Game-specific interaction contract

| Game | Reuse exact model API/state | Native interaction + parity |
| --- | --- | --- |
| **Memory Matrix** | `MemoryMatrixGame.flipCard({row,col})` | Tap 6×8 cards; lock while pair resolves; delayed mismatch and matched flags; **in-place board update pilot** |
| **Mine Grid** | `MineGridGame.revealCell(row,col)` / `toggleFlag(row,col)`; existing easy/medium/hard presets | Tap reveal; long-press flag and native `Toggle` Reveal/Flag mode; native `Select` difficulty; test `Pressable`'s built-in suppression of `onPress` after long press, do not hand-roll a suppressor |
| **Pattern Pulse** | `PatternPulseGame.pressPad(0..3)`; phase/sequence/mistakes | Four accessible pads; model-driven playback and input phase; optional installed `expo-haptics` |
| **Potion Sorter** | `PotionSorterGame.activateTube(index)`, `undo()`, `canUndo()` | Tap source/target; selected/invalid/undo affordances; native `Select` preset |
| **Chromatic Tide** | `ChromaticTideGame.chooseColor(color)` and 12×12 board | Tap palette; captured territory, moves and timer; **first pilot** for session/save/reward flow |
| **Sudoku** | `SudokuGame.selectCell`, `placeNumber`, `clearSelectedCell`, `newGame` | 9×9 tap board, number pad, erase, `Select` difficulty; show **elapsed** time by `projected.clock`, not the huge internal countdown; memoize the grid against clock-only ticks |
| **Quick Math** | `QuickMathFrameworkGame.submitAnswer(string)` / `getCurrentQuestion()` | Number pad, backspace/submit; source `state-change` after correct **and wrong** answers |
| **Word Scramble** | `WordScrambleGame.submitAnswer(string)`, `skipCurrentChallenge()`, `getCurrentChallenge()` | Letter tiles (including repeats), remove/clear/submit/skip; source `state-change` on challenge changes |

Use a readable scrollable grid/board on small phones, accessible cell/colour labels, and existing dark tokens/NativeWind. Do not shrink all touch targets or add a custom renderer. `Pressable` handles long-press cancellation of `onPress`; test real event behavior.


## Score persistence and rewards: correctness first

The existing `POST /api/scores` already validates `ScoreData`, accepts `platform` and updates scores, achievements and challenges. Reuse each game's `getGameData()` and the existing typed `api.submitScore`; these eight standard-mode runs do not invent daily/competition context. **No new API endpoint, database table or server idempotency work.**

**Settle the event contract now (pure packages, Stage 1):** `BaseGame.end()` already holds `saveResult`; append `save: { success: saveResult.success, code: saveResult.code }` to its structured `end` payload. In `GameSessionResult`, define `saveStatus: 'pending' | 'saved' | 'unconfirmed'` and optional `saveCode`. The existing provisional result maps to `pending` without another state machine. The structured result maps `success: true` to `saved` and `success: false` to `unconfirmed`. `ScoreManager.saveFinalScore` can catch a throwing submitter and return `{success:false}` **without a code**, so the UI must have a generic failure description too. Keep the adapter's stale-`runId` result rejection and no re-POST from the UI.

Show `Saving…`, `Saved`, or `Save not confirmed`; distinguish `UNAUTHENTICATED` (future-play sign-in CTA), `SCORE_CONTEXT_UNAVAILABLE`, and ambiguous `NETWORK_ERROR` (HTTP 2xx may already have saved before JSON parsing failed). Never say the request definitely failed to persist; never blindly retry. Only server-confirmed achievement/challenge payloads go to the **single forwarder banner**. Continue forwarding old-run awards for a **same-account** quick replay; suppress old-account awards after account change/unmount.

**No persistent offline/next-launch queue or retry gate in HPA-425.** If real usage later demonstrates a compelling need, it is a **separate** scoped ticket after determining server idempotency and UTC/`competitionKey` semantics; don't start that project inside this eight-game port. No new ticket is needed now.


## Acceptance and checks

- All eight games are playable in **iOS and Android simulator/emulator guest smoke tests** (plus real devices when available); the other 15 are disabled. Input, lifecycle, replay and UX states work without web/DOM imports. Test the **in-place board mutation** pilot (Memory Matrix) after the Chromatic Tide pilot and before duplicating the view pattern.
- Each native view has a focused Jest test proving tap/press -> **correct existing model method arguments** -> **updated visible projection**, plus completion/reset and one representative error/path-specific case. Existing portable game rule suites remain the source of truth for scores and `gameData`; **no second cross-host parity harness**.
- One host-level test verifies `Platform.OS` maps to `platform: 'ios' | 'android'` and `submitScore` is called exactly once per finished run. Reuse existing `apps/web/src/pages/api/scores.test.ts` coverage for the server platform/award path; add server tests only for a real new behavior. Focus portable Vitest on the new save/event/projector/forwarder contracts.
- Check provisional pending vs saved/unconfirmed/no-code error, old-run score/status rejection, same-account delayed reward forwarding **once**, cross-account reward suppression, timer vs game end, **guest → signed-in remount during an active run**, session pending and unmount teardown. Verify Sudoku clock ticks do not rerender unchanged grid cells. No duplicate reward display.
- Run root lint, format, Turbo typecheck, Vitest/Codecov, web build/relevant Playwright and mobile Jest. Confirm Expo Metro iOS/Android bundles contain no browser code.
- **Explicit acceptance fallback (external OAuth/EAS unavailable):** HPA-425 can be considered **implementation-complete** after automated native host/score/reward contract checks, existing server score/achievement tests, and successful guest playthroughs of all eight games **on both iOS simulator and Android emulator**. Report authenticated **device-to-backend persistence/award** as *not verified* and transfer that release-gate validation to existing **HPA-199**; do not claim it passed. If fixed HTTPS OAuth and signed-in devices are available during HPA-425, validate them here instead. Do not close the ticket merely for writing the plan or passing mocks without guest gameplay on both platforms.

## Alternatives rejected

- Reimplement each rules engine in React Native: divergent scoring and eight maintenance burdens.
- Port every web `GameScreen`/CSS/renderer: browser dependencies and unused UI components.
- Introduce Skia now: these games are view/text-based; Skia belongs to HPA-533.
- Create eight independent PRs: violates the one-issue/one-PR rule; use reviewable commits **within one draft PR** instead.
- Add a persistent score queue before an idempotency contract: duplicate and stale-context risk disproportionate to this hobby project's MVP.
