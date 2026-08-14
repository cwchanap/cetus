# Ice Slide Daily Leaderboard — Design

- **Date:** 2026-08-13
- **Linear:** HPA-488 — Add the per-day Ice Slide leaderboard and best-per-player ranking
- **Repository:** `cwchanap/cetus`
- **Dependencies:** HPA-484 complete; HPA-487 merged in PR #61 on 2026-08-13
- **Status:** Implementation design

## 1. Summary

HPA-488 completes the competitive half of Ice Slide Daily without creating another leaderboard subsystem.

HPA-484 already provides persisted score context plus a scoped best-per-user query. HPA-487 now submits completed Daily runs with `mode='daily'`, the captured run key as `competitionKey`, ruleset version, and full Ice Slide game data. The remaining work is narrow:

1. centralize the already-frozen Daily run/competition-key interpretation and remove the weaker `init.ts` date parser;
2. reject malformed or mismatched Ice Slide Daily score submissions before persistence;
3. require an exact Daily competition key for Ice Slide Daily leaderboard reads while reusing HPA-484's query unchanged;
4. add current-viewer metadata without exposing user IDs;
5. render and refresh one Ice-Slide-specific Daily leaderboard through a small testable client module.

No new database table, endpoint family, ranking query, shared leaderboard framework, persistence service, or generic game-mode registry is needed.

## 2. Goals

- Rank only completed, internally consistent Ice Slide Daily submissions.
- Keep each UTC date/generator/ruleset combination isolated by exact competition key.
- Keep one best displayed result per player while retaining all attempts in history.
- Preserve the existing ranking order: score descending, elapsed seconds ascending, total moves ascending, submission time ascending.
- Show rank, player, score, elapsed time, and total moves on the Ice Slide page.
- Highlight the authenticated viewer's row when it is present in the returned top results.
- Show clear loading, empty, signed-out, and unavailable states.
- Refresh the active Daily ranking after a successful Daily score save.
- Keep Campaign leaderboard behavior and `/api/leaderboard?gameId=ice_slide` unchanged.
- Keep local Daily play/completion usable when score saving or leaderboard loading fails.
- Give the page-local request-token/render behavior unit coverage rather than making Playwright its first proof.

## 3. Non-goals

- Historical Daily calendar/navigation.
- A second Ice Slide-specific leaderboard endpoint.
- A materialized best-score table or cache.
- A current-user rank query when the user is outside the returned top-N rows.
- One-attempt-only Daily restrictions.
- Server replay verification, score recomputation, or broader anti-cheat.
- Cross-seed Expedition ranking.
- A shared client leaderboard component for other games.
- Changes to the global leaderboard page.
- Read-repair or migration of any pre-HPA-488 malformed scoped rows.

## 4. Approaches considered

### A. Reuse the scoped query and specialize the existing score/leaderboard routes — selected

Keep `/api/scores` and `/api/leaderboard` as the only network seams. Add Ice Slide Daily semantic checks to score admission, exact-key enforcement to the scoped leaderboard branch, and one Ice-Slide-specific client helper module for testable panel behavior.

**Why selected:** it reuses every expensive piece already delivered by HPA-484, touches the fewest abstractions, and leaves generic scoped ranking available for future modes.

### B. Add `/api/ice-slide/daily-leaderboard`

This would make the Daily contract obvious but duplicate request validation, ranking DTO assembly, unavailable handling, and tests already present in `/api/leaderboard`.

**Rejected:** more surface area with no product capability gain.

### C. Fetch generic scoped rows and filter/validate them only in the browser

This would avoid server changes but would allow malformed Daily submissions into persisted/ranked data and would keep the mode-only cross-date query footgun.

**Rejected:** the ticket explicitly owns server admission and competitive isolation.

## 5. Competition identity contract

The existing Daily run key is also the competition key:

```text
ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
```

`run.ts` remains the single owner of that syntax. Export:

```ts
export interface IceSlideDailyRunIdentity {
    dateKey: string
    generatorVersion: number
    rulesetVersion: number
}

export function parseIceSlideDailyRunKey(
    runKey: string
): IceSlideDailyRunIdentity | null
```

The parser rejects malformed keys, trailing garbage, zero/non-positive versions, and calendar-invalid dates.

Every consumer that interprets a Daily key uses this parser:

- `assertValidIceSlideRunDefinition()`;
- the Ice Slide Daily score-admission helper;
- Ice Slide Daily leaderboard request admission;
- `init.ts` HUD/Play-Again date extraction;
- the Daily leaderboard client module.

The current `init.ts` helper:

```ts
function extractDailyDateKey(runKey: string): string | null
```

is removed. Its callers use:

```ts
parseIceSlideDailyRunKey(runKey)?.dateKey ?? null
```

This prevents HUD and rollover logic from accepting a weaker key grammar than server admission.

`daily.ts` also exports:

```ts
export function createIceSlideDailyCompetitionKey(dateKey: string): string
```

`createIceSlideDailyRunDefinition()` uses this helper for `run.runKey`. The idle Daily page uses the same helper to ask for the current UTC competition before a run starts. A started run still uses its captured `runKey`, so crossing UTC midnight cannot silently move the result to a new board.

Changing these helpers does not change generator-v1 output; they centralize the already-frozen format.

## 6. Score admission

Keep the generic Zod transport schema unchanged. Ice Slide Daily semantics run after generic validation and game-ID resolution in `src/pages/api/scores.ts`.

The domain check is pure and lives beside the Daily-key parser in `run.ts`:

```ts
export function iceSlideDailyAdmissionError(
    context: {
        mode: string
        competitionKey?: string
        rulesetVersion: number
    } | undefined,
    gameData: Record<string, unknown> | undefined
): string | null
```

The route calls it only when `validatedGameId === GameID.ICE_SLIDE`. `run.ts` therefore does not import server validation types or the global game registry.

A payload claims Daily identity when either `context?.mode === 'daily'` or `gameData?.mode === 'daily'`. Such a claim is accepted only when all of these are true:

- context exists and `context.mode === 'daily'`;
- `context.competitionKey` exists and parses as a valid Ice Slide Daily run key;
- `gameData` exists;
- `gameData.mode === 'daily'`;
- `gameData.solved === true`;
- `gameData.runKey === context.competitionKey`;
- `gameData.generatorVersion` equals the generator version encoded in the competition key;
- `gameData.rulesetVersion === context.rulesetVersion`;
- `context.rulesetVersion` equals the ruleset version encoded in the competition key;
- `gameData.elapsedSeconds` is a non-negative integer;
- `gameData.totalMoves` is a non-negative integer.

Invalid Daily claims return the existing HTTP 400 bad-request shape and are not persisted. No new public error-code family is required; the existing score client already maps a 400 response to invalid score data.

The helper unit tests name malformed competition keys and negative elapsed/move metrics explicitly even though generic Zod already rejects negative metrics when context is present. That keeps the domain invariant true independently of route validation order.

This deliberately does **not** regenerate the Daily, recompute score, inspect stage rows, or verify move history. That remains outside HPA-488.

Campaign behavior is unchanged because Campaign still submits without competitive context. Future Expedition context is also unaffected unless it incorrectly claims Daily identity.

## 7. Scoped ranking and API contract

### 7.1 Query reuse

`getScopedGameLeaderboard()` remains the only best-per-user ranking implementation and is not modified by HPA-488.

The exact competition key already encodes date, generator version, and ruleset version. After score admission, a newly persisted Ice Slide Daily row cannot have a competition key whose encoded identity disagrees with its stored context/game data. HPA-488 therefore does **not** add a second `rulesetVersion` filter to `ScopedLeaderboardQuery`.

The existing query continues to require `ruleset_version IS NOT NULL` and retains its window-function order:

1. score descending;
2. elapsed seconds ascending, valid values before missing values;
3. total moves ascending, valid values before missing values;
4. `created_at` ascending;
5. row ID ascending only as an internal deterministic fallback when all documented fields tie exactly.

HPA-484's database integration suite remains authoritative for best-per-user selection and all tie-break levels. HPA-488 does not duplicate or rewrite it.

Rows written before semantic Daily admission are not a compatibility target. HPA-488 adds no read-repair or alternate identity channel for them.

### 7.2 Ice Slide Daily read admission

`GET /api/leaderboard` keeps all existing forms, except the Ice Slide Daily combination becomes stricter:

```text
/api/leaderboard?gameId=ice_slide&mode=daily&competitionKey=<exact-key>&limit=10
```

For `gameId=ice_slide&mode=daily`:

- `competitionKey` is required;
- it must parse as a valid Ice Slide Daily key;
- the unchanged scoped query receives `{ gameId, mode, competitionKey, limit }`.

This prevents the existing generic mode-only query from combining multiple Ice Slide Daily dates or versions. Other games/modes retain HPA-484's generic mode-only behavior.

### 7.3 Viewer metadata

The scoped API branch performs an optional session lookup after a successful ranking query. Public leaderboard access remains public.

`GET` must destructure both `url` and `request`:

```ts
export const GET: APIRoute = async ({ url, request }) => {
```

The public scoped row keeps its existing fields and gains:

```ts
isCurrentUser: boolean
```

Every scoped response gains:

```ts
viewerAuthenticated: boolean
```

`isCurrentUser` is computed by comparing the private DB `userId` with the session user ID before combining it with `toPublicScopedLeaderboardEntry(row)`. The raw user ID remains absent from the response.

An auth lookup failure degrades to an unauthenticated viewer rather than failing an otherwise available public leaderboard. The unscoped Campaign response shape is untouched.

Because viewer metadata is additive to **all scoped responses**, existing scoped Tetris API assertions are updated deliberately; only unscoped responses retain byte/shape compatibility.

## 8. Ice Slide page UX

Add one `Card` below the existing Daily metadata in `src/pages/ice-slide/index.astro`. Astro owns all durable structure and state containers.

The panel contains:

- heading and active competition date;
- signed-out note: the player may view rankings but must sign in to submit;
- loading state;
- empty state;
- unavailable state;
- ranked row list.

Each ranked row shows:

```text
#rank  Player [YOU]
score  elapsed  moves
```

The viewer row receives both a visible `YOU` label and a visual border/background treatment, so identity is not communicated by color alone.

No avatar/profile-link system is pulled into this game-local panel; the ticket only requires player identity plus ranking metrics.

### 8.1 Testable Daily leaderboard module

The client fetch/render/token logic does not live as a large inline Astro-script block. Add one game-specific module:

```text
src/lib/games/ice-slide/daily-leaderboard.ts
```

It owns only the Ice Slide Daily panel behavior:

```ts
buildIceSlideDailyLeaderboardUrl(competitionKey)
formatDailyLeaderboardElapsed(seconds)
createDailyLeaderboardRowElement(entry, document)
setDailyLeaderboardPanelState(elements, state)
createDailyLeaderboardController(elements, fetcher?)
```

The controller is a small closure, not a shared store or class hierarchy. It owns one monotonically increasing request token and exposes only the operations the page needs, such as `load(competitionKey)` and `hide()`/invalidation.

Unit tests in `daily-leaderboard.test.ts` execute the real loader under jsdom, including a delayed stale response. Playwright remains integration coverage rather than the first proof of token gating.

For elapsed formatting, reuse the existing `src/lib/games/shared/utils.ts::formatTime`. Remove the duplicate local `formatTime()` from `init.ts` and import the shared helper there too. The leaderboard wrapper maps `null` to `—` before calling the shared formatter.

### 8.2 Loading lifecycle

Before a run starts, selecting Daily loads the key produced from the current UTC date.

When a Daily starts, the page reloads using the run's captured `runKey`. This matters around UTC rollover: a run started at 23:59:59 remains attached to the old competition even if it finishes after midnight.

`initializeIceSlide()` gains one optional UI-only callback:

```ts
onScoreSaved?: (gameData: IceSlideGameData) => void
```

It fires only after `saveGameScore()` reports success and the run guard says the response is still current. The page refreshes the leaderboard using `gameData.runKey` only when `gameData.mode === 'daily'`.

Anonymous completion does not fire this callback because the score was not persisted; the local result remains intact and the signed-out leaderboard note stays visible.

### 8.3 Stale requests and failure isolation

`createDailyLeaderboardController()` owns one request token. Every load captures the token and competition key; responses render only when the token remains current. `hide()` invalidates the token before hiding the panel.

Switching to Campaign or starting/loading a newer Daily invalidates older requests. No `AbortController`, global store, event bus, or shared run guard is added for this one caller.

A 503/error switches only the leaderboard panel to unavailable. It never calls the game `failRun` path and never hides the local completion overlay.

The Astro script remains wiring only: mode selection, Start, Play Again, Change Mode, captured run-key handoff, and `onScoreSaved` refresh.

## 9. File boundaries

Expected implementation files:

```text
src/lib/games/ice-slide/run.ts
src/lib/games/ice-slide/run.test.ts
src/lib/games/ice-slide/daily.ts
src/lib/games/ice-slide/daily.test.ts
src/pages/api/scores.ts
src/pages/api/scores.test.ts
src/pages/api/leaderboard.ts
src/pages/api/leaderboard.test.ts
src/lib/games/ice-slide/init.ts
src/lib/games/ice-slide/init.test.ts
src/lib/games/ice-slide/daily-leaderboard.ts
src/lib/games/ice-slide/daily-leaderboard.test.ts
src/pages/ice-slide/index.astro
src/pages/game-board-markup.test.ts
e2e/games/play-coverage.spec.ts
```

Not modified:

```text
src/lib/server/db/scoped-leaderboard.ts
src/lib/server/db/scoped-leaderboard.integration.test.ts
```

The one new production module is justified by executable unit coverage of the page-local async/render state; it is intentionally game-specific and not a reusable component framework.

## 10. Test strategy

### Pure/unit

- valid and invalid Daily competition-key parsing;
- `assertValidIceSlideRunDefinition()` and every `init.ts` date extraction use the same parser;
- key construction preserves generator-v1/run-key output;
- pure Daily admission accepts the exact HPA-487 payload;
- pure Daily admission rejects omitted context, unsolved data, mode mismatch, malformed/mismatched run key, generator mismatch, ruleset mismatch, missing/negative metrics, and Expedition masquerading as Daily;
- score route returns 400/no-persist for representative semantic failures after generic validation;
- `onScoreSaved` fires once after a current successful save and never on stale/error/unauthenticated paths;
- Daily leaderboard URL/state/row/elapsed helpers run in jsdom;
- controller tests prove loading/empty/unavailable/signed-out rendering and stale-response suppression.

### Database/API

- HPA-484's unchanged real-LibSQL best-per-user/tie-break suite remains green;
- Ice Slide Daily leaderboard requests require and validate the exact `competitionKey`;
- the scoped query is called with only `{ gameId, mode, competitionKey, limit }`;
- current-viewer rows gain `isCurrentUser=true` without exposing `userId`;
- signed-out and auth-failure scoped responses return `viewerAuthenticated=false`;
- existing scoped Tetris response assertions are updated for the additive viewer fields;
- Campaign/unscoped API tests keep their current response shape.

### Deterministic Daily playthrough fixture

Before Playwright depends on hard-coded keypresses, a unit test replays the exact five `2026-08-12` sequences through `IceSlideGame` using `createIceSlideDailyRunDefinition('2026-08-12')` and asserts the run reaches `status='won'` with `solved=true`.

The known shortest goal sequences are:

```text
S E S
N W N W
W N E S W N
S W N E S W
E S W N E S
```

Stages 3 and 4 have `collect_all_crystals` as an optional bonus objective; these sequences are allowed to miss that bonus and still clear the run. The unit replay exists to prove the browser fixture clears the materialized boards, not to require every optional star.

### Browser

Use the existing Ice Slide Playwright section. Add deterministic route-backed assertions for:

- Daily selection loads the exact active key and renders empty/signed-out states;
- ranked rows render all required metrics and the `YOU` marker;
- a leaderboard 503 shows unavailable while Start/Daily play remains usable;
- a successful current-run save triggers a second fetch for the same captured key;
- a delayed stale leaderboard response cannot reappear after switching to Campaign/newer identity.

Existing HPA-487 rollover/Play Again tests remain the source of truth for captured Daily identity.

## 11. Acceptance mapping

- **Different dates/generator/ruleset versions do not mix:** exact competition key is mandatory for Ice Slide Daily reads and is validated by the one parser; accepted writes must match that key's encoded identity.
- **One row per user / better retries:** reused HPA-484 partitioned query unchanged.
- **Tie-break order:** reused HPA-484 SQL and deterministic DB tests unchanged.
- **Incomplete/mismatched/malformed/Expedition submissions cannot rank:** rejected before persistence by the pure Ice Slide Daily admission helper.
- **Campaign compatibility:** Campaign writes and unscoped read branch remain unchanged.
- **Local play survives failures:** leaderboard errors stay inside the Daily leaderboard controller; score errors retain HPA-487 behavior.
- **Authenticated/anonymous/empty/failure/success coverage:** split across API, init, jsdom controller, and Playwright tests.

## 12. Self-review

- No placeholder requirement remains.
- There is one Daily-key parser and one current-version key constructor.
- The existing scoped ranking query is reused without a redundant identity field.
- Semantic admission is pure domain logic rather than a large route-local closure.
- The single new client module is game-specific and exists to make async/token/render behavior directly testable.
- No database schema, endpoint, shared UI abstraction, replay verifier, historical browser, Expedition ranking, or current-user rank-beyond-top-N query is added.
