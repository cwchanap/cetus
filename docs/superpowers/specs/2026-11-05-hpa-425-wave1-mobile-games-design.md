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

1. Keep the existing catalog and game-detail page. Enable Play **only** for the eight wave-1 `GameID`s, leaving the other 15 visibly "not yet playable".
2. Tap Play to navigate to `/games/[gameId]/play`, a single Expo Router leaf hosting the selected native game. Unknown IDs and unported games show an explicit unavailable state and a return action.
3. A slim `NativeGameHost` handles header/back, score + time, start/pause/reset/replay controls when supported, and the completed-run result with score-save status. It does not implement game rules.
4. Eight small native view components own their own board/inputs and invoke the existing concrete game methods. Do not add an abstract renderer interface, custom draw engine, global store or second scoring subsystem.
5. After completion, the user sees outcome, score, persistence state, and any server-confirmed achievements/challenge updates. Play again instantiates/resets a legal new run without double-submitting the old one.

Anonymous gameplay remains playable (matching web), but show "Sign in to save future scores" when the API rejects a guest submission. Never imply an anonymous run was persisted.

## Architecture and ownership

| Layer | Responsibility | Files |
| --- | --- | --- |
| Mobile route/catalog | Route only the eight enabled IDs; leave other entries disabled | `apps/mobile/app/games/[gameId].tsx`, `app/games/[gameId]/play.tsx`, catalog |
| Native session host | Instantiate/destroy one concrete game on mount/account change, use `createBaseGameSession` + `useGameSession`, expose actions and result chrome | Small `apps/mobile/src/games` host/helpers |
| Per-game native view | Render board, bind taps/long presses/keypad/tiles; never calculate score or award achievements | Eight components under `apps/mobile/src/games` |
| Portable rules | Existing model, timer, stats, `getGameData` and score transport seam | `packages/games`; only narrow event/result fixes if verified |
| API and rewards | `api.submitScore` with existing Better Auth cookie; existing server score/achievement/challenge rules | No new mobile API; reuse `packages/api-client` and `POST /api/scores` |

**Session lifecycle:** Add `@cetus/games` as a direct mobile workspace dependency. Create game with `submitScore: data => api.submitScore(data)` and `platform: Platform.OS` (validate `ios`/`android`). Never import web initializer, PixiJS, DOM or window-bound services. Create the session adapter once per mounted run; on navigation/unmount or account identity change, dispose the adapter first and call `game.destroy()` to stop `GameTimer`, cancel per-game delayed callbacks and remove listeners. Use `useSessionGuard` / stable account key from `apps/mobile/src/lib/session.ts` for private reward scope; after sign-out or switching users, discard the old game UI and never send its unfinished run with the new account's cookie. Server-side in-flight requests still belong to whichever session authenticated that request.

**Projection consistency:** `BaseGame.getState()` is a shallow copy and some game methods mutate nested boards. Projections for the game views must publish a *new* immutable board/visible-field snapshot on relevant `state-change` events, yet retain a stable reference when nothing changed so `useSyncExternalStore` does not rerender indefinitely. Keep this logic per game or in one tiny tested helper, not a generalized event bus.

**Event gaps:** Quick Math's `generateNextQuestion` and Word Scramble's `generateNextChallenge` currently call game-specific callbacks but not `state-change`; an incorrect answer may not trigger a score event either. Add a narrow shared `state-change` notification on question/challenge updates (and tests), while retaining existing callbacks, so native projections advance reliably. Verify reset/new-game transitions for all eight.

## Game-specific interaction contract

| Game | Reuse exact model API/state | Native input + important parity |
| --- | --- | --- |
| **Memory Matrix** | `MemoryMatrixGame.flipCard({row,col})`; 6×8 cards, flipped/matched flags | Tap cards; ignore taps while resolving pair; preserve delayed flip/reset and result accuracy |
| **Mine Grid** | `MineGridGame.revealCell(row,col)` / `toggleFlag(row,col)`; existing easy/medium/hard presets (8×8 / 10×10 / 12×12) | Tap reveal; long-press flag **and** explicit Reveal/Flag mode for accessibility; prevent long-press also revealing; first-reveal safety, preset/reset parity |
| **Pattern Pulse** | `PatternPulseGame.pressPad(0..3)`; phase, active pad, sequence, mistakes | Four accessible pads; animate playback from model state, reject input outside input phase; lightweight optional `expo-haptics`, no new sound files |
| **Potion Sorter** | `PotionSorterGame.activateTube(index)`, `undo()` and `canUndo()` | Tap source/target tube; selected/invalid/undo affordances; existing difficulty presets, move/undo counters |
| **Chromatic Tide** | `ChromaticTideGame.chooseColor(color)`, 12×12 board and palette | Tap palette; captured territory and moves shown; preserve flood-fill/scoring without duplicating board logic |
| **Sudoku** | `SudokuGame.selectCell`, `placeNumber`, `clearSelectedCell`, `newGame` | Nine-by-nine tap board, 1–9 pad and erase; given/conflict/selection states; display **elapsed** time rather than the enormous internal countdown duration; difficulty and pause |
| **Quick Math** | `QuickMathFrameworkGame.submitAnswer(string)` / `getCurrentQuestion()` | Number pad with delete/submit; preserve answer submission and per-question updates; no browser form import |
| **Word Scramble** | `WordScrambleGame.submitAnswer(string)` / `skipCurrentChallenge()` / `getCurrentChallenge()` | Tap/reorder scrambled letter tiles, remove/clear/submit; correct/incorrect/skip feedback; reset tiles per new challenge |

Use reusable scrollable boards or hit-slop for compact grids on narrow phones; do not shrink controls into unusable touch targets just to fit a 12×12 board. Provide accessible labels for cells, colors (not color-only), cards, numbers and control states. Use the existing dark tokens/NativeWind and native animations only where feedback materially improves play. No CSS/DOM renderer imports.

## Score persistence and rewards: correctness first

The server already validates `ScoreData`, stores a `platform` label, awards achievements and updates challenges via `POST /api/scores`. For these eight standard-mode runs, preserve each game's existing `getGameData()` and omit invented daily/competition context. **No new mobile score endpoint or schema.**

The current `BaseGame.end()` publishes a provisional result immediately but its final structured event contains rewards without save success. Make the smallest shared change: attach the actual `ScoreSubmissionResult` (or equivalently a typed, narrow save outcome) to the structured `end` event and project it through `GameSessionResult`. Show:
- *Saving…* while the final request is pending;
- *Saved* only when `success === true`; only then display newly awarded achievements and challenge progress from the server response;
- *Save not confirmed* with actionable description for `success === false`, including `UNAUTHENTICATED` (sign-in CTA), `SCORE_CONTEXT_UNAVAILABLE` and `NETWORK_ERROR` (possibly ambiguous).

Never submit again from the result overlay or double-dispatch achievement banners. A `NETWORK_ERROR` can represent a failed response parse **after a committed HTTP 2xx**, so it must not be interpreted as proof that the server did not save. The server may also have saved on some 5xx paths. The native UI should say "not confirmed", not "definitely lost".

**No AsyncStorage, offline queue, automatic replay or claim of exactly-once delivery in the default scope.** Reassess after the first real game integration. Only if durable retry is demonstrated necessary, add a reviewed subsection and implement it in **this same HPA-425 PR** after defining server-side idempotency, account isolation, nonretryable outcomes and UTC daily/`competitionKey` validity. Without those contracts, prefer visible failure and a fresh next run; a blind retry risks duplicate scores and misattributed rewards.

## Acceptance and checks

- All eight listed games can start, play, finish, reset/replay on iOS and Android; remaining catalog entries stay disabled. Route/deep-link/error fallbacks behave correctly.
- Each native input produces the same state transitions, final score and `gameData` as the portable web rules for deterministic fixtures. Mine Grid long press does not also reveal; Pattern Pulse ignores taps during playback; Quick Math/Word Scramble advance after wrong answers; Sudoku elapsed time and game completion are correct.
- Signed-in scores use `platform: 'ios' | 'android'`, appear in existing score history/leaderboards, and trigger the same server-defined achievement/challenge behavior as equivalent web submissions. Guest and failed requests are not presented as saved. Stale in-flight results never update a different run or user.
- Jest/jest-expo tests cover routes, every game's representative input/completion/reset path, timer/cleanup behavior, save pending/success/failure, reward rendering and account switching. Vitest covers changes to portable event/result contracts and web regression. No native import leaks browser dependencies.
- Run root `bun run lint`, `bun run format:check`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run build`, relevant Playwright e2e, and `bun --cwd apps/mobile test --runInBand`. Preserve existing Codecov gates; native tests stay outside root Vitest.
- **Manual external gate:** one real iOS and one Android dev-client/preview smoke test (tap/long press, haptics, small screens, background/foreground, sign-in/API, reward visibility). HPA-179's fixed HTTPS OAuth/provider/EAS setup was not verified by the prior PR; do not claim this gate passed without evidence. Keep PR draft until required manual acceptance is recorded.

## Alternatives rejected

- Reimplement each rules engine in React Native: divergent scoring and eight maintenance burdens.
- Port every web `GameScreen`/CSS/renderer: browser dependencies and unused UI components.
- Introduce Skia now: these games are view/text-based; Skia belongs to HPA-533.
- Create eight independent PRs: violates the one-issue/one-PR rule; use reviewable commits **within one draft PR** instead.
- Add a persistent score queue before an idempotency contract: duplicate and stale-context risk disproportionate to this hobby project's MVP.
