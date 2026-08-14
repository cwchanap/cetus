# Ice Slide Daily Leaderboard — Design

- **Date:** 2026-08-13
- **Linear:** HPA-488 — Add the per-day Ice Slide leaderboard and best-per-player ranking
- **Repository:** `cwchanap/cetus`
- **Dependencies:** HPA-484 complete; HPA-487 merged in PR #61 on 2026-08-13
- **Status:** Implementation design

## 1. Summary

HPA-488 completes the competitive half of Ice Slide Daily without creating another leaderboard subsystem.

HPA-484 already provides persisted score context plus a scoped best-per-user query. HPA-487 submits completed Daily runs with `mode='daily'`, the captured run key as `competitionKey`, ruleset version, and full Ice Slide game data. The remaining work is narrow:

1. centralize the frozen Daily run-key grammar and remove the weaker `init.ts` date parser;
2. reject malformed or mismatched Ice Slide Daily score submissions before persistence;
3. require an exact Daily competition key for Ice Slide Daily leaderboard reads while leaving HPA-484's ranking query unchanged;
4. derive current-viewer metadata from the authenticated user the middleware already stored in `Astro.locals`;
5. render and refresh one Ice-Slide-specific Daily leaderboard through a small unit-tested client module.

No new database table, endpoint family, ranking query, shared leaderboard framework, persistence service, auth round-trip, or generic game-mode registry is needed.

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
- Unit-test the page-local request-token/render behavior instead of making Playwright its first proof.
- Keep one frozen `2026-08-12` direction fixture shared by its unit replay and Playwright consumer.

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
- Read-repair or migration of pre-HPA-488 malformed scoped rows.
- Refactoring unrelated game time formatters.

## 4. Approaches considered

### A. Reuse the scoped query and specialize the existing score/leaderboard routes — selected

Keep `/api/scores` and `/api/leaderboard` as the only network seams. Add Ice Slide Daily semantic checks to score admission, exact-key enforcement to the existing leaderboard validation/route seam, and one Ice-Slide-specific client helper module for testable panel behavior.

**Why selected:** it reuses every expensive piece already delivered by HPA-484, touches the fewest abstractions, and leaves generic scoped ranking available for future modes.

### B. Add `/api/ice-slide/daily-leaderboard`

This would make the Daily contract obvious but duplicate request validation, ranking DTO assembly, unavailable handling, and tests already present in `/api/leaderboard`.

**Rejected:** more surface area with no product capability gain.

### C. Fetch generic scoped rows and filter/validate them only in the browser

This would avoid server changes but would allow malformed Daily submissions into persisted/ranked data and would keep the mode-only cross-date query footgun.

**Rejected:** the ticket owns server admission and competitive isolation.

## 5. Competition identity contract

The Daily run key is also the competition key:

```text
ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
```

`run.ts` owns both parsing and formatting of that grammar:

```ts
export interface IceSlideDailyRunIdentity {
    dateKey: string
    generatorVersion: number
    rulesetVersion: number
}

export function parseIceSlideDailyRunKey(
    runKey: string
): IceSlideDailyRunIdentity | null

export function formatIceSlideDailyRunKey(
    identity: IceSlideDailyRunIdentity
): string
```

`formatIceSlideDailyRunKey()` validates the UTC date and positive integer versions before returning the key. The parser rejects malformed keys, trailing garbage, non-positive versions, and calendar-invalid dates. Unit tests cover parse/format round trips.

Every consumer that interprets a Daily key uses `parseIceSlideDailyRunKey()`:

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

`daily.ts` retains ownership of the current Daily generator version and imports `formatIceSlideDailyRunKey()` to expose the current-version convenience helper:

```ts
export function createIceSlideDailyCompetitionKey(dateKey: string): string {
    return formatIceSlideDailyRunKey({
        dateKey,
        generatorVersion: ICE_SLIDE_DAILY_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
    })
}
```

`createIceSlideDailyRunDefinition()` uses that helper for `run.runKey`. The idle Daily page uses the same helper to ask for the current UTC competition before a run starts. A started run still uses its captured `runKey`, so crossing UTC midnight cannot move the result to a new board.

This changes no generator-v1 output; it only removes duplicate grammar construction.

## 6. Score admission

Keep the generic Zod score transport schema unchanged. Ice Slide Daily semantics run after generic validation and game-ID resolution in `src/pages/api/scores.ts`.

The domain check is pure and lives beside the Daily-key parser in `run.ts`:

```ts
export type IceSlideDailyAdmissionReason =
    | 'missing-context'
    | 'context-mode-mismatch'
    | 'missing-competition-key'
    | 'malformed-competition-key'
    | 'missing-game-data'
    | 'game-data-mode-mismatch'
    | 'unsolved'
    | 'run-key-mismatch'
    | 'generator-version-mismatch'
    | 'game-data-ruleset-mismatch'
    | 'context-ruleset-mismatch'
    | 'invalid-elapsed-seconds'
    | 'invalid-total-moves'

export interface IceSlideDailyAdmissionError {
    reason: IceSlideDailyAdmissionReason
}

export function iceSlideDailyAdmissionError(
    context: {
        mode: string
        competitionKey?: string
        rulesetVersion: number
    } | undefined,
    gameData: Record<string, unknown> | undefined
): IceSlideDailyAdmissionError | null
```

The route calls it only when `validatedGameId === GameID.ICE_SLIDE`. `run.ts` therefore imports neither server validation types nor the global game registry.

A payload claims Daily identity when either `context?.mode === 'daily'` or `gameData?.mode === 'daily'`. A non-Daily Ice Slide payload returns `null`. A Daily claim is accepted only when all of these are true:

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

The helper returns the first violated closed-union reason in a fixed order. Unit tests assert the exact reason for each invalid fixture, so removing one invariant cannot stay green because another overlapping check rejected the same payload.

The route maps every reason to the same existing public 400 body:

```text
Invalid Ice Slide Daily score data
```

and does not call persistence. The server may log only the reason string for development diagnostics; it does not echo score payloads or create a new public error-code family.

The helper unit tests include malformed competition keys and negative elapsed/move metrics even though generic Zod already rejects negative metrics when context is present. That keeps the domain invariant independent of route validation order.

This deliberately does **not** regenerate the Daily, recompute score, inspect stage rows, or verify move history.

Campaign behavior is unchanged because Campaign submits without competitive context. Future Expedition context is unaffected unless it claims Daily identity.

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

The existing `leaderboardQuerySchema.superRefine()` owns parameter-presence relationships. Extend it with:

- when `gameId === GameID.ICE_SLIDE && mode === 'daily'`, `competitionKey` is required.

This sits beside the existing generic rules that `mode` requires `gameId` and `competitionKey` requires both `gameId` and `mode`.

The validation schema checks presence/transport shape only. It does **not** import Ice Slide domain parsing. A short comment points to the route's semantic companion.

After generic query validation succeeds, the leaderboard route parses the exact key with `parseIceSlideDailyRunKey()` for Ice Slide Daily. Malformed/calendar-invalid keys return the existing bad-request shape. Another short comment points back to the schema presence rule.

The unchanged scoped query receives exactly:

```ts
{ gameId, mode, competitionKey, limit }
```

This prevents mode-only Ice Slide Daily reads from mixing dates/versions while preserving HPA-484's mode-only behavior for other games/modes.

### 7.3 Viewer metadata from middleware locals

`src/middleware.ts` already calls `auth.api.getSession()` for every request and stores the result in `context.locals.user` / `context.locals.session`. `env.d.ts` types `locals.user` as `User | null`.

The leaderboard route therefore consumes the established request context instead of authenticating a second time:

```ts
export const GET: APIRoute = async ({ url, locals }) => {
```

After a successful scoped ranking query:

```ts
const viewerUserId = locals.user?.id ?? null
```

The public scoped row keeps its existing fields and gains:

```ts
isCurrentUser: boolean
```

Every scoped response gains:

```ts
viewerAuthenticated: boolean
```

`isCurrentUser` is computed by comparing the private DB `userId` with `viewerUserId` before combining it with `toPublicScopedLeaderboardEntry(row)`. The raw user ID remains absent from the response.

There is no route-local auth import, no `getViewerUserId()` helper, and no compatibility branch for tests that omit `request`. Route tests pass `locals: { user: null }` or a minimal user object, matching existing API-route test patterns.

The middleware's auth lookup remains the single auth lookup for the request. If it fails, normal middleware error behavior applies; HPA-488 does not add a second best-effort session policy that cannot be reached after middleware failure.

Because viewer metadata is additive to **all scoped responses**, existing scoped Tetris API assertions are updated deliberately. Unscoped Campaign responses retain their current shape.

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

The controller is a small closure, not a shared store or class hierarchy. It owns one monotonically increasing request token and exposes only `load(competitionKey)` and `hide()`.

Unit tests in `daily-leaderboard.test.ts` execute the real loader under jsdom, including delayed stale responses. Playwright remains integration coverage rather than the first proof of token gating.

For leaderboard elapsed display, `formatDailyLeaderboardElapsed()` maps `null` to `—` and otherwise reuses `src/lib/games/shared/utils.ts::formatTime`.

HPA-488 does **not** replace the existing private `init.ts::formatTime()`. That helper uses unbounded `M:SS`, whereas the shared helper switches to `H:MM:SS` after one hour. Changing the in-run HUD at that boundary is unrelated to Daily ranking and stays out of scope.

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

`createDailyLeaderboardController()` owns one request token. Every load increments/captures the token and parses the competition key.

If the key cannot be parsed, the controller shows the panel's `unavailable` state instead of silently returning and leaving stale rows visible.

For a valid key, responses render only when the token remains current. `hide()` invalidates the token before hiding the panel.

Switching to Campaign or loading a newer Daily invalidates older requests. No `AbortController`, global store, event bus, or shared run guard is added for this one caller.

A 503/error switches only the leaderboard panel to unavailable. It never calls the game `failRun` path and never hides the local completion overlay.

The Astro script remains wiring only: mode selection, Start, Play Again, Change Mode, captured run-key handoff, and `onScoreSaved` refresh.

## 9. Frozen Daily playthrough fixture

The deterministic `2026-08-12` playthrough exists once in the existing test-only fixture module:

```ts
// src/lib/games/ice-slide/test-fixtures.ts
export const ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS = [
    ['S', 'E', 'S'],
    ['N', 'W', 'N', 'W'],
    ['W', 'N', 'E', 'S', 'W', 'N'],
    ['S', 'W', 'N', 'E', 'S', 'W'],
    ['E', 'S', 'W', 'N', 'E', 'S'],
] as const satisfies readonly (readonly Direction[])[]
```

A unit test replays this exact fixture through `IceSlideGame` with `createIceSlideDailyRunDefinition('2026-08-12')`, advancing each non-final stage through the normal game API and asserting the final run reaches `status='won'` with `solved=true`.

For each stage, the test also compares the fixture length with `solveIceSlideBoard(stage, { maxStates: ICE_SLIDE_DAILY_SOLVER_MAX_STATES }).minMoves`. The solver does not produce a path, so this is an optimal-length assertion rather than a second source of directions.

The E2E spec imports the same fixture and derives browser keys through one local map:

```ts
const DIRECTION_TO_KEY = {
    N: 'ArrowUp',
    E: 'ArrowRight',
    S: 'ArrowDown',
    W: 'ArrowLeft',
} as const
```

No arrow-key sequence is hardcoded separately in Playwright.

Stages with `collect_all_crystals` still treat that objective as optional; the fixture proves deterministic completion and shortest-goal length, not every optional star.

## 10. File boundaries

Expected implementation files:

```text
src/lib/games/ice-slide/run.ts
src/lib/games/ice-slide/run.test.ts
src/lib/games/ice-slide/daily.ts
src/lib/games/ice-slide/daily.test.ts
src/lib/games/ice-slide/test-fixtures.ts
src/pages/api/scores.ts
src/pages/api/scores.test.ts
src/lib/server/validations.ts
src/lib/server/validations.test.ts
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
src/middleware.ts
env.d.ts
```

The one new production module is justified by executable unit coverage of the page-local async/render state; it is intentionally game-specific and not a reusable component framework.

## 11. Test strategy

### Pure/unit

- valid and invalid Daily competition-key parsing;
- parse/format round trip for Daily identity;
- `assertValidIceSlideRunDefinition()` and every `init.ts` date extraction use the same parser;
- current-version key construction preserves generator-v1 output;
- pure Daily admission accepts the exact HPA-487 payload;
- every invalid Daily admission fixture asserts an exact closed-union reason;
- malformed keys, omitted context/data, mode mismatch, unsolved runs, run/generator/ruleset mismatch, missing/negative metrics, and Expedition masquerading as Daily are independently pinned;
- score route maps admission reasons to the same 400/no-persist behavior;
- `onScoreSaved` fires once after a current successful save and never on stale/error/unauthenticated paths;
- Daily leaderboard URL/state/row/elapsed helpers run in jsdom;
- controller tests prove loading/empty/unavailable/signed-out rendering, invalid-key behavior, and stale-response suppression;
- the single frozen direction fixture replays to a solved Daily and matches each stage's solver minimum-move count.

### API

- `leaderboardQuerySchema` requires `competitionKey` specifically for `ice_slide + daily` while preserving generic mode-only forms for other games;
- malformed/calendar-invalid exact Ice Slide Daily keys are rejected semantically by the route;
- the scoped query is called with only `{ gameId, mode, competitionKey, limit }`;
- current-viewer rows gain `isCurrentUser=true` from `locals.user` without exposing `userId`;
- signed-out scoped responses use `locals.user=null` and return `viewerAuthenticated=false`;
- no leaderboard API test imports or mocks `@/lib/auth` for HPA-488;
- existing scoped Tetris response assertions are updated for the additive viewer fields;
- Campaign/unscoped API tests keep their current response shape.

### Browser

Use the existing Ice Slide Playwright section. Add route-backed assertions for:

- Daily selection loads the exact active key and renders empty/signed-out states;
- ranked rows render all required metrics and the `YOU` marker;
- a leaderboard 503 shows unavailable while Start/Daily play remains usable;
- a successful current-run save triggers a second fetch for the same captured key;
- a delayed stale leaderboard response cannot reappear after switching to Campaign/newer identity.

The browser completion helper imports `ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS` and derives keys from `DIRECTION_TO_KEY`; it never owns a second copy of the sequence.

## 12. Acceptance mapping

- **Different dates/generator/ruleset versions do not mix:** exact key required; one parser/formatter owns identity grammar; unchanged query filters exact key.
- **One row per user / better retries:** reused HPA-484 partitioned query.
- **Tie-break order:** reused HPA-484 SQL and deterministic DB tests.
- **Incomplete/mismatched/malformed/Expedition submissions cannot rank:** rejected before persistence with independently tested reasons.
- **Campaign compatibility:** Campaign writes and unscoped read branch remain unchanged.
- **Viewer highlighting:** uses existing middleware-authenticated `locals.user`; private `userId` never enters the public DTO.
- **Local play survives failures:** leaderboard errors are controller-local; score errors retain HPA-487 behavior.
- **Authenticated/anonymous/empty/failure/success coverage:** split across API, init/controller, markup, and Playwright tests.
- **Deterministic completion fixture:** one directions source is unit-replayed before Playwright consumes it.

## 13. Self-review

- No placeholder requirement remains.
- The design adds no schema, endpoint, ranking query, auth request, or shared UI framework.
- `run.ts` owns Daily key grammar in both directions; `daily.ts` supplies only current version constants.
- `getScopedGameLeaderboard()` remains unchanged.
- Middleware auth is reused instead of repeated.
- Admission reasons independently freeze semantic invariants while preserving one public 400 response.
- The new leaderboard uses shared time formatting without changing existing Ice Slide HUD behavior.
- The async panel logic is unit-testable; Astro remains structure/wiring.
- Historical navigation, anti-cheat, Expedition ranking, and current-user rank-beyond-top-N remain out of scope.
