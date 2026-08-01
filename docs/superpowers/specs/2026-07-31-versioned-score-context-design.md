# Versioned Game Score Context and Scoped Leaderboards — Design

- **Date:** 2026-07-31
- **Status:** Approved for implementation planning
- **Repository:** `cwchanap/cetus`
- **Linear issue:** [HPA-484 — Persist versioned game score context and add scoped leaderboard queries](https://linear.app/cwchanap/issue/HPA-484/persist-versioned-game-score-context-and-add-scoped-leaderboard)
- **Canonical parent design:** [Ice Slide Replayability, Daily Challenge, and Seeded Expedition](https://linear.app/cwchanap/document/ice-slide-replayability-daily-challenge-and-seeded-expedition-design-261fb6695310)

## 1. Summary

Cetus currently stores only `user_id`, `game_id`, `score`, and `created_at` for a game submission. Optional `gameData` reaches the score API and is used transiently for achievements, but it is not persisted. That model cannot isolate Campaign, Daily, Expedition, ruleset versions, or date-specific competitions without creating game-specific score tables or polluting existing leaderboards.

This design adds optional, versioned score context to the shared `game_scores` table while preserving the existing unscoped path. Legacy submissions remain unscoped and continue to power Campaign leaderboards and personal-best semantics. Contextual submissions may persist bounded game data and participate in explicitly scoped, best-per-user leaderboard queries.

The platform keeps a deliberate semantic split:

- **Campaign-oriented competition and best-score-derived progress** consider only unscoped rows.
- **Achievement awarding at submission time** still evaluates every successful legacy or contextual play against the submitted score and `gameData`.
- **Platform activity, aggregate statistics, score history, and existing daily challenges** continue to count both unscoped and scoped submissions.
- **Game-specific competitive admission**, such as requiring a solved Ice Slide Daily run with a matching run key, remains outside this generic persistence layer.

## 2. Current State and Constraints

The current implementation has these relevant properties:

- `game_scores` has four meaningful columns: user, game, score, and timestamp.
- `saveGameScoreWithAchievements()` calls the single `saveGameScore()` write path, then evaluates score-threshold and in-game achievements from the submitted score and transient `gameData`.
- The score API subsequently updates platform daily-challenge progress.
- `getGameLeaderboard()` returns score rows directly, ordered by score descending; repeated attempts from one user may occupy multiple positions.
- `/api/leaderboard` supports both a single-game response and an all-games response when `gameId` is omitted.
- The leaderboard route currently parses query parameters manually. The existing `leaderboardQuerySchema` requires `gameId` and therefore does not model the route's all-games path.
- `getUserBestScore()` and compatibility aliases are reused by the personal-best API and achievement-progress calculations.
- History, activity, aggregate-score, and challenge queries intentionally derive data from the complete `game_scores` activity stream.
- Each score updates existing aggregate-stat side effects, including total score and favorite-game assignment.
- Public history queries select explicit fields, but the internal `GameScore` type and `getUserRecentScores().selectAll()` will widen after the schema change; public boundaries must not pass those rows through.
- The database layer already uses defensive, lazy, idempotent LibSQL migrations with process-local single-flight promises and retry after incomplete migration.
- Database behavior is tested both through mocked Kysely chains and real in-memory LibSQL integration tests.
- The current score schema already requires `gameData` to be an object through Zod's record schema, but it does not impose a serialized-byte limit.
- Repository search finds two non-test schema creation surfaces for `game_scores`: `scripts/init-db.sql` and `better-auth_migrations/2025-07-06-schema-consolidation.sql`. Other matches are historical documentation or test fixtures.
- The current branch has no Ice Slide runtime producer for `elapsedSeconds` or `totalMoves`; HPA-487 owns the first producer and must follow the units pinned by this contract.

The change must preserve those contracts unless this design explicitly changes them.

### 2.1 Existing game-data size audit

Current game-owned payloads are JSON objects and are generally compact. Most contain only scalar counters. Reflex is the largest naturally bounded payload: it records `gameHistory`, but the default game lasts 60 seconds and spawns at one-second intervals. Word Scramble records a list of correct words during a 60-second game, but neither its client logic nor the public score API provides a universal server-enforced upper bound on the number of entries a modified client could submit.

Therefore, repository inspection cannot prove that every valid legacy request is below an arbitrary new 16 KiB threshold. The byte-size limit introduced by this design applies only when `gameData` will be persisted as part of a contextual submission. Legacy transient `gameData` keeps its existing validation behavior.

## 3. Goals

1. Persist optional score mode, competition identity, required audit version, and bounded contextual game data.
2. Keep every existing submission caller valid without modification.
3. Keep historical and new Campaign scores comparable through the existing unscoped leaderboard.
4. Prevent Daily and Expedition rows from changing Campaign leaderboards, personal bests, or best-score-derived Campaign progress.
5. Keep current achievement awarding behavior for contextual submissions unless a game-specific issue explicitly opts out.
6. Continue counting scoped submissions toward platform activity, aggregate statistics, history, favorite-game updates, and existing daily challenges.
7. Provide a reusable scoped query that returns one deterministic best attempt per user.
8. Migrate existing and partially migrated LibSQL schemas without table rebuilds or destructive rewrites.
9. Make malformed stored JSON and partial migration states fail safely.
10. Keep raw authentication identifiers and stored game JSON out of public API responses.
11. Keep Ice Slide-specific completion and run-identity verification outside the shared score layer.

## 4. Non-goals

- Ice Slide mode selection, generation, objectives, or scoring.
- Daily leaderboard presentation or current-user highlighting.
- Server-authoritative replay, anti-cheat, or score recomputation.
- Migrating existing games to contextual submissions.
- Normalizing arbitrary game-specific data into dedicated columns.
- Creating a generic ranking expression language for arbitrary future metrics.
- Historical Daily navigation, seasonal leagues, or cross-seed Expedition ranking.
- Redesigning the existing score-insert/stat-update transaction boundary.
- Changing platform daily-challenge definitions or challenge rotation.
- Publishing Better Auth user IDs for leaderboard highlighting or profile navigation.
- Adding a second mode-only ranking index before a measured use case requires it.
- Introducing Campaign-only achievement rules into the shared score layer.

## 5. Fixed Product and Platform Decisions

| Decision | Requirement |
|---|---|
| Legacy path | A submission without `context` uses the current unscoped path and existing input-validation contract. |
| Context presence | `context` is omit-only: omitted means legacy; `null` is invalid. |
| Context ownership | Context is an explicit sibling of `gameData`; it is never inferred from game data. |
| Game-data persistence | `gameData` is persisted only for a validated contextual submission. |
| Contextual data bound | The 16 KiB serialized limit applies only to contextual game data that may be stored. |
| Campaign ranking | Default/global leaderboards include only unscoped rows. |
| Personal best | Existing best-score queries and best-score-derived Campaign progress include only unscoped rows. |
| Achievement awarding | Scoped submissions still run score-threshold and in-game achievement checks against the submitted score and `gameData`. |
| Platform activity | Scoped rows still count toward history, activity, aggregates, favorite-game updates, and existing daily challenges. |
| Unscoped ranking | Existing leaderboards remain raw-attempt lists; one user may appear multiple times. |
| Scoped ranking | Scoped leaderboards return one deterministic best row per user. |
| Public identity | Public scoped output exposes display identity but never raw `user_id`. |
| Ruleset column | `ruleset_version` is required audit/display metadata, not a ranking predicate or tie-break. |
| Tie-break projection | `elapsedSeconds` and `totalMoves` are the v1 allowlisted metrics; other game metrics remain in stored JSON. |
| Daily admission | Ice Slide-specific solved/run/version checks belong to HPA-488. |
| Invalid context | Reject with `400`; never silently downgrade to an unscoped score. |
| Write failures | The single write path returns a discriminated result so context capability failures remain distinguishable from generic database failures. |
| Missing schema | Legacy operations continue where safely confirmed; contextual operations fail explicitly with `500`. |

## 6. Alternatives Considered

### 6.1 Recommended: nullable context columns plus bounded JSON

Add reusable scope/version columns and persist game-specific tie-break data as JSON. Use a LibSQL window query to select one best row per user.

**Advantages**

- Additive and compatible with all existing rows.
- Reusable by multiple games and competition shapes.
- Avoids schema changes for every game-specific metric.
- Supports deterministic best-per-user selection in the database.

**Costs**

- Tie-break extraction requires guarded SQLite JSON functions.
- The exact-key index does not fully order mode-only queries.
- The public v1 projection recognizes only two metric keys.

### 6.2 Normalize elapsed time and moves into shared columns

Rejected because it overfits the shared score table to Ice Slide's first ranking contract and makes every future ranking metric a schema decision.

### 6.3 Fetch all attempts and deduplicate in application code

Rejected because work and memory grow with historical attempts, applying `limit` before deduplication is incorrect, and relational ranking belongs in the database.

### 6.4 Apply the contextual byte limit to legacy requests

Rejected because it changes an existing API validation contract unrelated to persistence and repository inspection cannot prove an absolute upper bound for modified clients or future legacy callers.

### 6.5 Publish raw user IDs for highlighting

Rejected because HPA-488 can compare an internal row to the authenticated session server-side and expose `isCurrentUser` without publishing Better Auth identifiers.

## 7. Data Model

Add nullable columns to `game_scores`:

```sql
mode TEXT NULL,
competition_key TEXT NULL,
ruleset_version INTEGER NULL,
game_data_json TEXT NULL
```

Add the scoped filtering index:

```sql
CREATE INDEX IF NOT EXISTS idx_game_scores_scoped_ranking
ON game_scores (
    game_id,
    mode,
    competition_key,
    score DESC,
    created_at ASC
);
```

Exact competitive callers such as Ice Slide Daily encode generator and ruleset identity into `competition_key`. `ruleset_version` is intentionally non-indexed and non-filtered in HPA-484; it is required so every contextual row records explicit audit/version metadata independently of key parsing. Version isolation is enforced through an exact `competition_key`, not through an implicit ruleset predicate.

The index is a scope-filter/prefix helper, not a covering representation of the complete ranking order. JSON-derived elapsed time and moves plus row ID are absent from the index. Implementations must filter the candidate scope and then apply the authoritative window ordering; they must not assume an index scan already satisfies ranking.

A mode-only query uses the `(game_id, mode)` prefix but cannot use this index to provide the complete score ordering because `competition_key` lies between `mode` and `score`. That path may require a temporary sort. This is accepted because the shipped Daily ranking path always supplies an exact key, while mode-only ranking is a generic, non-latency-critical primitive with no current UI consumer. A second index is deferred until query plans and measured production volume justify its write/storage cost.

Update Kysely types additively:

```ts
export interface GameScoresTable {
    id: ColumnType<number, never, never>
    user_id: string
    game_id: string
    score: number
    mode: string | null
    competition_key: string | null
    ruleset_version: number | null
    game_data_json: string | null
    created_at: ColumnType<Date, never, never>
}
```

`GameScore` therefore includes the new nullable fields for internal database use. Public history and activity DTOs remain explicitly defined projections and never expose `mode`, `competition_key`, `ruleset_version`, or `game_data_json` unless a later issue deliberately changes that contract.

Both non-test schema/bootstrap definitions that create `game_scores`—`scripts/init-db.sql` and `better-auth_migrations/2025-07-06-schema-consolidation.sql`—must include the new nullable columns and index. Existing databases rely on the runtime compatibility guard.

## 8. Submission and Write Contracts

### 8.1 Client request shape

Extend the object request shape:

```ts
export interface ScoreSubmissionContext {
    mode: string
    competitionKey?: string
    rulesetVersion: number
}

export interface ScoreData {
    gameId: GameType
    score: number
    gameData?: GameData | Record<string, unknown>
    context?: ScoreSubmissionContext
}

export type ScoreSubmissionPublicErrorCode =
    | 'SCORE_CONTEXT_UNAVAILABLE'

export interface ScoreSubmissionResult {
    success: boolean
    code?: ScoreSubmissionPublicErrorCode
    // existing notification/update/error fields remain
}
```

`submitScore(scoreData)` remains the canonical object-based transport call. On non-2xx responses it parses the JSON body, copies only recognized public codes into `ScoreSubmissionResult.code`, and leaves `code` absent for transport failures or unrecognized server errors.

The existing client `saveGameScore(gameId, score, onSuccess, onError, gameData, options)` helper must not gain another positional argument. Extend its existing options bag instead:

```ts
export interface SaveScoreOptions {
    isStale?: () => boolean
    context?: ScoreSubmissionContext
}
```

The helper forwards `options.context` through `ScoreData`. Existing callers that omit it produce byte-equivalent request bodies.

### 8.2 Single server write path

Keep one database score-write function and one side-effect pipeline, but do not preserve the current boolean return because it cannot carry the required capability failure:

```ts
export interface PersistedScoreContext {
    mode: string
    competitionKey: string | null
    rulesetVersion: number
    gameDataJson: string | null
}

export type SaveGameScoreFailureCode =
    | 'SCORE_CONTEXT_UNAVAILABLE'
    | 'SCORE_WRITE_FAILED'

export type SaveGameScoreResult =
    | { success: true }
    | { success: false; code: SaveGameScoreFailureCode }

export async function saveGameScore(
    userId: string,
    gameId: string,
    score: number,
    context?: PersistedScoreContext
): Promise<SaveGameScoreResult>

export type SaveGameScoreWithAchievementsResult =
    | { success: true; newAchievements: string[] }
    | {
          success: false
          newAchievements: []
          code: SaveGameScoreFailureCode
      }
```

Requirements:

- The optional structured argument controls only additional inserted columns.
- A contextual call checks complete schema capability before insertion.
- Missing contextual capability returns `{ success: false, code: 'SCORE_CONTEXT_UNAVAILABLE' }`.
- Other insert/stat-update failures return `{ success: false, code: 'SCORE_WRITE_FAILED' }`; the function must not catch every failure and collapse it to bare `false`.
- Legacy calls insert the original columns and do not require the contextual schema.
- Both paths continue through the same existing `getUserStats()` / `upsertUserStats()` update block.
- `saveGameScoreWithAchievements()` delegates exactly once to this function, preserves its failure code, and runs achievement checks only after a successful write.
- Do not create a second contextual insert function with duplicated statistics or favorite-game behavior.
- Serialization and validation happen before entering the write function; it receives normalized values only.

### 8.3 Legacy submission

A request without `context`:

- inserts `user_id`, `game_id`, and `score` through the existing path;
- leaves all four context columns `NULL`;
- may include `gameData` for transient achievement evaluation;
- keeps the existing object-shape validation and does not add a serialized-byte limit;
- does not persist `gameData`;
- runs existing aggregate-stat, favorite-game, achievement, and challenge flows unchanged.

### 8.4 Contextual submission

A request with `context`:

- validates the complete context before any insert;
- validates and serializes `gameData` when supplied;
- requires serialized contextual `gameData` to fit the storage bound;
- inserts mode, optional competition key, ruleset version, and serialized game data;
- stores `NULL` in `game_data_json` when game data is omitted;
- runs the same aggregate-stat, favorite-game, score-threshold achievement, in-game achievement, and challenge side effects as a legacy submission.

A contextual high score may award an existing score-threshold achievement even though best-score-derived Campaign progress ignores that scoped score. Likewise, contextual `gameData` may award an existing in-game achievement. The `earned` flag remains authoritative; a best-score-derived percentage may remain below 100 after an achievement was earned from a scoped play. Game-specific Campaign-only unlock rules, if ever required, belong in a later issue rather than being inferred by this shared layer.

### 8.5 Validation

| Field | Validation |
|---|---|
| `mode` | Required in context; 1–32 characters; fully anchored `^[a-z][a-z0-9_-]*$` |
| `competitionKey` | Optional; 1–128 characters; fully anchored `^[A-Za-z0-9:._-]+$` |
| `rulesetVersion` | Required integer; `1..2_147_483_647` |
| `context` | Strict optional object; omitted is valid and `null` is rejected |
| `gameData` | Preserve current record/object validation; arrays and primitives remain rejected |
| contextual `gameData.elapsedSeconds` | When present, a non-negative integer count of whole elapsed seconds, computed as `Math.floor(totalElapsedMilliseconds / 1000)` |
| contextual `gameData.totalMoves` | When present, a non-negative integer move count |
| serialized contextual `gameData` | At most 16 KiB measured as UTF-8 bytes |

The competition-key charset covers the canonical parent format:

```text
ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
```

No `/` or `#` character is required by the approved Daily key contract.

The byte-size check runs only when `context` is present and `gameData` will be persisted. It must measure `TextEncoder().encode(serialized).byteLength` or an equivalent server-safe UTF-8 byte count, not JavaScript string length.

Malformed request JSON, `context: null`, invalid context, a fractional/negative allowlisted tie-break value, oversized contextual data, and unknown context fields return `400` before inserting a score or updating statistics. A contextual validation failure is never retried as a legacy submission. The query layer still normalizes malformed historical or externally written tie-break values to `NULL`.

## 9. Runtime Schema Compatibility

Introduce a focused, lazy `ensureGameScoresContextSchema()` guard independent of `ensureUserStatsSchema()`.

```ts
export interface GameScoresContextCapabilities {
    mode: boolean
    competitionKey: boolean
    rulesetVersion: boolean
    gameDataJson: boolean
    scopedIndex: boolean
}
```

### 9.1 Migration behavior

1. Inspect `PRAGMA table_info(game_scores)`.
2. Add each missing nullable column independently with `ALTER TABLE`.
3. Re-inspect or update known capabilities after each successful addition.
4. Create the scoped index only after all four columns exist.
5. Cache concurrent callers behind one process-local promise and retain the last confirmed capability snapshot; reads must not execute `PRAGMA` on every request.
6. Record success only for capabilities that actually exist.
7. Reset the shared promise when any required column migration is incomplete so a later request retries.
8. If only index creation fails, retain complete column capabilities and allow contextual reads/writes. Retry index creation lazily with process-local exponential backoff rather than on every request: start at one minute and cap the delay at one hour. A process restart may reset the backoff.

No path rebuilds or rewrites `game_scores`, and existing rows remain valid with `NULL` context.

### 9.2 Capability-dependent behavior

- Contextual inserts require all four columns. If any are unavailable, return `500` with public code `SCORE_CONTEXT_UNAVAILABLE`; do not insert an unscoped replacement.
- Scoped reads require all four columns. Missing capability or a scoped query failure returns `500` with public code `SCOPED_LEADERBOARD_UNAVAILABLE`, not an empty leaderboard or unscoped fallback.
- Public codes distinguish unavailable behavior from a legitimate empty result without exposing whether the internal cause was migration or query execution.
- Legacy inserts use the original column set and remain available when context migration is incomplete.
- Confirmed complete schema: default unscoped reads require both `mode IS NULL` and `competition_key IS NULL`.
- Confirmed legacy/incomplete schema: default unscoped reads use the legacy no-predicate query. The supported write path cannot create contextual rows until all four columns exist, so partial-column permutations do not need distinct read predicates.
- Unknown capability caused by a failed probe is **not** treated as confirmed legacy. Use the last cached confirmed snapshot when available; otherwise preserve each query's existing defensive failure result (`[]` for leaderboard reads, `null` for personal best) instead of failing open with an unfiltered query that could mix scoped rows after a process restart.
- An index failure affects performance only. Contextual reads and writes remain valid when the four columns exist.

This fallback is deliberately asymmetric: confirmed legacy schemas degrade gracefully, while unknown or requested contextual behavior never loses scope silently.

## 10. Query Semantics

### 10.1 Existing unscoped queries

`getGameLeaderboard(gameId, limit)` adds unscoped predicates when available and retains its current public result shape, score-descending ordering, and raw-attempt semantics. The same user may occupy multiple entries.

Every existing function that answers a user's best score for a game, including compatibility aliases and `/api/scores/best`, uses the same unscoped predicate. Best-score-derived achievement progress therefore remains Campaign-compatible.

The all-games leaderboard endpoint continues to call the unscoped query for every registered game.

### 10.2 Queries that intentionally include scoped rows

Do not add unscoped predicates to:

- recent and paginated score history;
- user activity calendars;
- aggregate total-score and activity statistics;
- the existing stored `total_games_played`, `total_score`, and `favorite_game` update path;
- games-played, unique-games, and total-score challenge queries;
- submission-time score-threshold and in-game achievement checks;
- existing daily-challenge progress updates.

### 10.3 Scoped best-per-user query

```ts
export interface ScopedLeaderboardQuery {
    gameId: string
    mode: string
    competitionKey?: string
    limit?: number
}

interface ScopedLeaderboardRow {
    userId: string // internal only; never serialized publicly
    name: string
    username: string | null
    image: string | null
    score: number
    created_at: string
    mode: string
    competitionKey: string | null
    rulesetVersion: number
    elapsedSeconds: number | null
    totalMoves: number | null
}

export type ScopedLeaderboardEntry = Omit<ScopedLeaderboardRow, 'userId'>
```

The query filters by exact `game_id`, `mode`, and `ruleset_version IS NOT NULL`; when `competitionKey` is supplied it also requires an exact `competition_key` match. The non-null check enforces the contextual-row invariant but does not select a particular ruleset version. A mode-only query intentionally spans competition keys and ruleset eras and must not add an equality predicate on `ruleset_version`. Mode-only output is a reusable diagnostic/aggregate view, not an official cross-era competition; no current UI consumes it.

Use parameterized staged CTEs and `ROW_NUMBER() OVER (PARTITION BY user_id ...)`. Apply `limit` only after selecting one row per user.

The API mapping removes `userId`. HPA-488 may compare the internal row to the session server-side and add `isCurrentUser`.

### 10.4 V1 tie-break projection

The shared query recognizes only these allowlisted JSON keys in v1:

- `elapsedSeconds`
- `totalMoves`

Unknown current or future game-specific metrics remain inside `game_data_json` and are not projected, filtered, or sorted until a later approved extension updates the allowlist and query contract.

Each recognized value is accepted only when it is a non-negative JSON integer. HPA-487 must emit `elapsedSeconds` as whole seconds using `Math.floor(totalElapsedMilliseconds / 1000)` and `totalMoves` as an integer count. The submission validator rejects fractional or negative allowlisted values with `400`; the query treats missing, malformed historical, or externally written invalid values as `NULL`.

A public `NULL` means **not available to this shared projection**. It may mean the game does not use that metric, the contextual submission omitted it, or the stored value was invalid. Consumers must use `gameId`/`mode` knowledge before labeling a null as “no time” or “no moves.”

Use staged CTEs:

1. Filter the requested scope and expose `game_data_json` only when `json_valid(game_data_json)=1`; invalid JSON becomes `NULL`.
2. Invoke `json_type`/`json_extract` only against the valid JSON value.
3. Normalize allowlisted values to nullable integers.
4. Apply the window ranking.

Do not depend on SQL boolean-expression short-circuiting to protect JSON functions.

### 10.5 Deterministic ranking order

Use the same order when selecting a user's best attempt and ordering the final best-per-user leaderboard:

1. `score DESC`
2. valid elapsed time before missing/invalid elapsed time
3. `elapsedSeconds ASC`
4. valid move count before missing/invalid move count
5. `totalMoves ASC`
6. `created_at ASC`
7. `id ASC`

The row ID is an internal final determinant for equal timestamps.

### 10.6 Public field naming and DTO isolation

Shared public leaderboard fields retain the existing contract, including `created_at`. New opt-in fields are additive:

```text
mode
competitionKey
rulesetVersion
elapsedSeconds
totalMoves
```

Public history and activity endpoints remain shape-identical. Implementations must select or map explicit fields at API/service boundaries and must never serialize `game_data_json`, raw `user_id`, or newly added context columns through an internal `selectAll()` result.

## 11. API Contracts

### 11.1 `POST /api/scores`

- Existing bodies without `context` remain valid under the legacy contract.
- `context: null` is invalid.
- The contextual byte limit does not apply when `context` is omitted.
- Contextual validation errors return `400` and insert nothing.
- Missing contextual schema capability returns `500` with `{ error, code: 'SCORE_CONTEXT_UNAVAILABLE' }`.
- `saveGameScore()` and `saveGameScoreWithAchievements()` preserve the discriminated failure code instead of collapsing it to `false`.
- The success response shape remains unchanged.
- Both submission forms use the single write path and identical aggregate-stat, favorite-game, achievement, and challenge sequencing.
- `submitScore()` reads a JSON error body for non-2xx responses, propagates recognized public `code` values through `ScoreSubmissionResult.code`, and distinguishes them from transport/network failures.

### 11.2 `GET /api/leaderboard`

Replace manual parameter parsing with one validation schema that models existing and scoped forms. The schema keeps `gameId` optional for all-games, parses/defaults `limit`, validates `mode` and `competitionKey`, and enforces:

- `mode` requires `gameId`;
- `competitionKey` requires `gameId` and `mode`.

| Query | Behavior |
|---|---|
| no scope parameters | Existing all-games unscoped raw-attempt leaderboards |
| `gameId` only | Existing single-game unscoped raw-attempt leaderboard |
| `gameId` + `mode` | Scoped best-per-user leaderboard spanning that mode |
| `gameId` + `mode` + `competitionKey` | Exact scoped best-per-user competition |
| `competitionKey` without `mode` | `400` |
| scope parameter without `gameId` | `400` |
| invalid game, limit, mode, or key | `400` |
| scoped capability/query unavailable | `500` with code `SCOPED_LEADERBOARD_UNAVAILABLE` |

The raw-attempt versus best-per-user difference is intentional and part of the public contract. HPA-488 must not assume Campaign/global entries are deduplicated.

The legacy query may retain its defensive empty-array behavior for compatibility. Scoped failure must remain distinguishable from a legitimate empty scoped competition.

## 12. Error Handling

- Invalid context or oversized contextual data fails before database mutation.
- Legacy game-data objects are not subject to the new contextual byte cap.
- Contextual migration failure is logged and surfaced through the discriminated save result; no unscoped substitute is written.
- A partial schema never causes a query to reference a missing column.
- Malformed persisted JSON becomes missing tie-break data rather than a query failure.
- Public error codes identify an unavailable capability without exposing serialized game data, raw user IDs, SQL details, or secrets.
- Existing side-effect ordering is preserved; transactional redesign remains out of scope.
- Unscoped empty-on-error and scoped fail-loud behavior are covered separately so later refactoring cannot accidentally “unify” them.

## 13. Testing Strategy

Use mocked query tests for call boundaries and real in-memory LibSQL tests for schema and ranking behavior.

### 13.1 Validation and client tests

- Legacy payload without context remains valid.
- `context: null` is rejected; omission is accepted.
- A legacy object larger than 16 KiB remains accepted by the score schema.
- Contextual payload with and without game data is valid.
- Mode, competition-key, and ruleset-version boundaries are covered.
- The fully anchored mode and competition-key regexes reject valid substrings with invalid prefixes/suffixes (for example `Ice Slide!daily`).
- The canonical Ice Slide key passes the competition-key regex; `/` and `#` are rejected.
- Unknown context fields are rejected.
- Arrays and primitives remain rejected as game data.
- Oversized contextual ASCII and multibyte UTF-8 payloads are rejected by encoded byte size.
- `submitScore()` forwards `ScoreData.context`.
- Client `saveGameScore()` forwards context through `SaveScoreOptions`, with no new positional argument and no change to legacy request bodies.

### 13.2 Migration and bootstrap tests

- Fresh initialization through each non-test schema surface contains all four columns and the index.
- A legacy four-column table gains all columns without rewriting existing rows.
- Confirmed complete schema uses both unscoped predicates; confirmed legacy/incomplete schema uses the legacy no-predicate query.
- Representative states missing `ruleset_version` or `game_data_json` fail contextual operations and complete on retry.
- Repeated calls are idempotent.
- Concurrent calls share one migration execution.
- Failed column addition retries.
- Failed index creation leaves columns usable and retries only after the configured backoff; repeated hot-path requests inside the delay do not reattempt DDL.
- A failed capability probe with no cached state returns existing defensive read results rather than executing an unfiltered query.
- Legacy operations continue during confirmed incomplete migration.
- Contextual operations fail rather than downgrade.

### 13.3 Real LibSQL query and side-effect tests

- Legacy and contextual submissions round-trip expected nullable columns through the same insert function.
- Contextual game data is persisted once; legacy data remains transient.
- Both paths execute the same aggregate-stat and favorite-game side effects.
- Both paths execute score-threshold and in-game achievement checks.
- A scoped score may award an achievement while unscoped best-score-derived percentage remains unchanged.
- Default game and all-games leaderboards exclude scoped rows and retain raw-attempt semantics.
- Every personal-best function and alias excludes scoped rows.
- History, activity, aggregate statistics, favorite-game updates, and daily-challenge sources include scoped rows.
- Mode and competition-key isolation are exact.
- Mode-only queries do not add `ruleset_version` equality predicates.
- `ruleset_version` round-trips as non-null metadata on every scoped result; malformed scoped rows with a null version are excluded.
- Each user appears at most once in scoped output.
- Better retries replace worse retries in output while all attempts remain stored.
- Every tie-break level is independently covered.
- Index presence is not treated as proof of complete ranking order.
- Valid allowlisted values sort before null/invalid values.
- Fractional contextual `elapsedSeconds` and `totalMoves` are rejected at submission; fractional historical/external fixtures normalize to `NULL`.
- Unknown JSON metrics remain unprojected.
- Malformed JSON does not abort the query.
- `limit` is applied after partitioning, including a fixture with at least 100 users and multiple attempts per user.
- Internal rows retain `userId`; public mapping omits it.
- Public history/activity DTOs remain shape-identical and omit all context/JSON fields.
- Scoped and unscoped public entries retain `created_at`.

### 13.4 API tests

- Existing all-games and single-game unscoped responses remain shape-compatible and raw-attempt based.
- Unified query validation accepts all-games and rejects every invalid scope combination.
- Scoped mode-only and exact-key requests return additive fields and best-per-user ranks.
- Scoped entries retain `created_at` and omit `userId`.
- Scoped null tie-break fields remain nullable and are not assigned game-independent labels by the backend.
- Contextual validation failures return `400`.
- Missing score-context capability survives both server result layers and returns `500` with `SCORE_CONTEXT_UNAVAILABLE`.
- The client parses and exposes `SCORE_CONTEXT_UNAVAILABLE`; a network failure has no server error code.
- Scoped leaderboard failure returns `500` with `SCOPED_LEADERBOARD_UNAVAILABLE`, never empty `200`.
- Existing side-effect calls still occur after successful legacy and contextual submissions.
- Public history endpoints do not leak context columns after `GameScore` widens.

End-to-end Daily UI coverage belongs to HPA-487 and HPA-488.

## 14. Implementation Boundaries

Likely touched areas:

```text
scripts/init-db.sql
better-auth_migrations/2025-07-06-schema-consolidation.sql
src/lib/server/db/types.ts
src/lib/server/db/queries.ts
src/lib/server/validations.ts
src/lib/server/api-utils.ts or scoped endpoint response helpers
src/lib/services/scoreService.ts
src/pages/api/scores.ts
src/pages/api/leaderboard.ts
src/pages/api/scores/history.ts and any public score/history mapping tests
focused unit, API, migration, legacy-schema, and LibSQL integration tests
```

Implementation constraints:

- Extend the existing `saveGameScore()` database write contract with one optional structured context argument and a discriminated result; do not retain `Promise<boolean>`.
- Keep `saveGameScoreWithAchievements()` as the single achievement pipeline.
- Extend `ScoreData` and the existing client options bag; do not add a seventh positional argument to client `saveGameScore()`.
- Public queries and endpoints use explicit DTO mapping; no internal `GameScore` pass-through.
- The scoped window order, not the index declaration, is authoritative.
- No Ice Slide runtime module depends on unfinished HPA-487 data shapes.

## 15. Delivery Sequence

1. Update both schema creation surfaces, Kysely types, the capability guard, and focused migration/bootstrap tests.
2. Add strict omit-only request context and contextual game-data storage bounds without tightening legacy validation.
3. Extend the single score-write function with a discriminated result, preserve the code through `saveGameScoreWithAchievements()`, and propagate recognized server codes through the client options/object path.
4. Isolate default leaderboard and personal-best queries to unscoped rows.
5. Add the scoped best-per-user query, v1 metric allowlist, internal/public DTO boundary, and deterministic tie-break tests.
6. Replace leaderboard manual parsing with one schema and stable scoped error categories.
7. Audit and test every public history/activity mapping after `GameScore` widens.
8. Run compatibility tests across fresh, legacy, representative partial, malformed-data, and high-attempt fixtures.

## 16. Acceptance Criteria

- Existing rows remain valid and no table is destructively rewritten.
- Both non-test schema creation surfaces include the new columns and index.
- Existing score callers require no changes.
- Client context is carried through the existing options/object contracts, not a new positional argument.
- Legacy `gameData` keeps its current validation contract, continues to power achievements, and is not persisted.
- `context: null` is rejected.
- A contextual submission round-trips mode, optional key, required ruleset version, and optional game data.
- Invalid context or oversized contextual data returns `400` and inserts nothing.
- Contextual schema failure remains distinguishable through the database result, achievement wrapper, route response, and client `ScoreSubmissionResult.code`; it returns explicit `500` without downgrade.
- One score-write function serves legacy and contextual inserts and preserves all existing side effects.
- Scoped submissions still award existing score-threshold and in-game achievements; only best-score-derived progress is unscoped.
- Default leaderboards and personal bests exclude scoped rows.
- Unscoped leaderboards remain raw-attempt lists; scoped leaderboards are best-per-user.
- History, activity, aggregate statistics, favorite-game updates, and current daily challenges include scoped rows.
- Public history/activity DTOs remain shape-identical and never expose context columns or stored JSON.
- Scoped public output preserves `created_at` and never exposes raw `user_id`.
- `ruleset_version` is non-null required metadata in scoped output and never an equality predicate for mode-only ranking or a tie-break.
- HPA-487 emits integer whole-second `elapsedSeconds` and integer `totalMoves`; fractional submitted values are rejected, while malformed historical values normalize to null.
- Only allowlisted v1 tie-break metrics are projected; unknown metrics remain stored-only.
- The index is used for filtering where possible, while window SQL defines complete ranking.
- All documented tie-breaks are deterministic and covered against real LibSQL.
- Missing or malformed tie-break JSON cannot crash the query.
- Scoped unavailable errors are distinguishable from legitimate empty results and recognized server codes are propagated by the client.
- Index retry uses bounded backoff and cannot execute performance-only DDL on every contextual request.
- Unknown capability state never fails open into an unfiltered legacy read.
- The leaderboard route enforces all parameter combinations through one schema.
- HPA-487 and HPA-488 can consume these primitives without adding Ice Slide rules to the shared database layer.

## 17. Resolved Decisions

- Scoped submissions still run score-threshold and in-game achievement awarding against the submitted score and `gameData`.
- Only personal-best/best-score-derived achievement progress is Campaign/unscoped; `earned` remains authoritative if the percentage differs.
- Scoped rows count as platform plays, aggregate-stat/favorite-game updates, and daily-challenge activity.
- Context is explicit, omit-only, and separate from game data.
- Legacy transient game data does not receive the contextual 16 KiB storage bound.
- One score-write function handles legacy and contextual persistence and returns a discriminated failure result; booleans are insufficient for the public capability contract.
- Contextual data is never silently discarded or downgraded.
- Unscoped ranking remains raw-attempt; scoped ranking is best-per-user.
- Mode-only ranking remains an approved reusable diagnostic/aggregate primitive, intentionally spans keys and ruleset eras, is not an official competition, and must not add a ruleset equality predicate.
- `ruleset_version` is required non-null audit/display metadata so rows are inspectable without parsing keys.
- The exact-key index assists filtering but does not define the complete ranking order.
- `elapsedSeconds` is a non-negative integer count of floored whole seconds and `totalMoves` is a non-negative integer count; HPA-487 must produce those units.
- `elapsedSeconds` and `totalMoves` are an Ice-Slide-first v1 projection allowlist; unknown metrics stay in JSON.
- Null tie-break values mean unavailable/not-applicable to the shared projection, not a universal gameplay statement.
- JSON tie-breaks are staged, guarded, nullable, and sorted after valid values.
- Public scoped output preserves `created_at` and strips raw user IDs.
- Public history/activity DTOs never pass through internal context or JSON fields.
- Client context extends `ScoreData` and `SaveScoreOptions`, not the positional helper signature.
- Scoped capability failures return stable public unavailable codes with HTTP 500, preserve the code through server result unions, and propagate recognized codes to the client.
- Performance-only index creation retries with bounded exponential backoff.
- Confirmed legacy/incomplete schema may use the legacy query; unknown capability without cache fails closed to existing defensive results.
- The leaderboard route uses one schema for all-games, single-game, and scoped forms.
- The canonical parent key format fits the approved competition-key charset.
- The two non-test schema creation surfaces are updated together.
- The shared layer does not decide whether an Ice Slide Daily submission is solved or trustworthy.

## 18. Spec Self-Review

- **Placeholder scan:** no TBD, TODO, unresolved field bound, or invented volume target remains.
- **Achievement semantics:** awarding and best-score-derived progress are explicitly separated.
- **Write-path consistency:** one insert function and one side-effect pipeline serve both submission forms, and discriminated failures survive every server/client layer.
- **Legacy compatibility:** contextual persistence limits do not change legacy transient input.
- **Migration safety:** contextual operations require complete capability; confirmed legacy schemas use the legacy query; unknown capability fails closed; performance-only index retry is backoff-bounded.
- **Determinism:** per-user selection and final ordering use the same complete sequence, including row ID.
- **API surface:** raw-attempt and best-per-user contracts are explicit; public DTOs retain casing and exclude raw IDs/JSON.
- **Version semantics:** exact keys isolate versions; `ruleset_version` is required metadata rather than a hidden predicate.
- **Metric extensibility:** the v1 allowlist and producer units are explicit; submitted fractions are rejected and malformed historical values have documented null semantics.
- **Bootstrap coverage:** both non-test creation paths and public history mappings are named.
- **Scope:** Ice Slide gameplay, semantic admission, highlighting, and UI remain in HPA-487/HPA-488.
