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

- **Campaign-oriented competition and personal-best views** consider only unscoped rows.
- **Platform activity, aggregate statistics, score history, and existing daily challenges** continue to count both unscoped and scoped submissions.
- **Game-specific competitive admission**, such as requiring a solved Ice Slide Daily run with a matching run key, remains outside this generic persistence layer.

## 2. Current State and Constraints

The current implementation has these relevant properties:

- `game_scores` has four meaningful columns: user, game, score, and timestamp.
- `saveGameScoreWithAchievements()` first inserts the score, then evaluates score and in-game achievements from the submitted `gameData`.
- The score API subsequently updates platform daily-challenge progress.
- `getGameLeaderboard()` returns score rows directly, ordered by score descending; repeated attempts from one user may occupy multiple positions.
- `/api/leaderboard` supports both a single-game response and an all-games response when `gameId` is omitted.
- The leaderboard route currently parses query parameters manually. The existing `leaderboardQuerySchema` requires `gameId` and therefore does not model the route's all-games path.
- `getUserBestScore()` and compatibility aliases are reused by the personal-best API and achievement-progress calculations.
- History, activity, aggregate-score, and challenge queries intentionally derive data from the complete `game_scores` activity stream.
- Each score updates the existing aggregate-stat side effects, including total score and favorite-game assignment.
- The database layer already uses defensive, lazy, idempotent LibSQL migrations with process-local single-flight promises and retry after incomplete migration.
- Database behavior is tested both through mocked Kysely chains and real in-memory LibSQL integration tests.
- The current score schema already requires `gameData` to be an object through Zod's record schema, but it does not impose a serialized-byte limit.

The change must preserve those contracts unless this design explicitly narrows a query to unscoped rows.

### 2.1 Existing game-data size audit

Current game-owned payloads are JSON objects and are generally compact. Most contain only scalar counters. Reflex is the largest naturally bounded payload: it records `gameHistory`, but the default game lasts 60 seconds and spawns at one-second intervals. Word Scramble records a list of correct words during a 60-second game, but neither its client logic nor the public score API provides a universal server-enforced upper bound on the number of entries a modified client could submit.

Therefore, repository inspection cannot prove that every valid legacy request is below an arbitrary new 16 KiB threshold. To preserve the existing contract rather than rely on normal-play assumptions, the byte-size limit introduced by this design applies only when `gameData` will be persisted as part of a contextual submission. Legacy transient `gameData` keeps its existing validation behavior.

## 3. Goals

1. Persist optional score mode, competition identity, ruleset version, and bounded contextual game data.
2. Keep every existing submission caller valid without modification.
3. Keep historical and new Campaign scores comparable through the existing unscoped leaderboard.
4. Prevent Daily and Expedition rows from changing Campaign leaderboards, personal bests, or Campaign-oriented achievement progress.
5. Continue counting scoped submissions toward platform activity, aggregate statistics, history, and existing daily challenges.
6. Provide a reusable scoped query that returns one deterministic best attempt per user.
7. Migrate existing and partially migrated LibSQL schemas without table rebuilds or destructive rewrites.
8. Make malformed stored JSON and partial migration states fail safely.
9. Keep raw authentication identifiers out of public leaderboard responses.
10. Keep Ice Slide-specific completion and run-identity verification outside the shared score layer.

## 4. Non-goals

- Ice Slide mode selection, generation, objectives, or scoring.
- Daily leaderboard presentation.
- Server-authoritative replay, anti-cheat, or score recomputation.
- Migrating existing games to contextual submissions.
- Normalizing arbitrary game-specific data into dedicated columns.
- Historical Daily navigation, seasonal leagues, or cross-seed Expedition ranking.
- Redesigning the existing score-insert/stat-update transaction boundary.
- Changing platform daily-challenge definitions or challenge rotation.
- Publishing Better Auth user IDs for leaderboard highlighting or profile navigation.
- Adding a second mode-only ranking index before a measured use case requires it.

## 5. Fixed Product and Platform Decisions

| Decision | Requirement |
|---|---|
| Legacy path | A submission without `context` uses the current unscoped path and existing input-validation contract. |
| Context ownership | Context is an explicit sibling of `gameData`; it is never inferred from game data. |
| Game-data persistence | `gameData` is persisted only for a validated contextual submission. |
| Contextual data bound | The 16 KiB serialized limit applies only to contextual game data that may be stored. |
| Campaign ranking | Default/global leaderboards include only unscoped rows. |
| Personal best | Existing best-score queries and Campaign-oriented achievement progress include only unscoped rows. |
| Platform activity | Scoped rows still count toward history, activity, aggregates, favorite-game updates, and existing daily challenges. |
| Scoped ranking | One best row per user, selected and ordered deterministically. |
| Public identity | Public scoped output exposes display identity but never raw `user_id`. |
| Ruleset column | `ruleset_version` is audit/display metadata, not a ranking predicate or tie-break. |
| Daily admission | Ice Slide-specific solved/run/version checks belong to HPA-488. |
| Invalid context | Reject with `400`; never silently downgrade to an unscoped score. |
| Missing schema | Legacy operations continue where possible; contextual operations fail explicitly. |

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
- Indexes optimize scope and score, but not arbitrary JSON metrics.

### 6.2 Normalize elapsed time and moves into shared columns

Add dedicated `elapsed_seconds` and `total_moves` columns alongside the context fields.

**Advantages**

- Simpler ranking SQL and stronger database typing.
- Potentially indexable tie-break metrics.

**Rejected because**

- It overfits the shared score table to Ice Slide's first ranking contract.
- Future games may require different secondary metrics.
- The source design explicitly calls for persisted game data as the reusable extension.

### 6.3 Fetch all attempts and deduplicate in application code

Query scoped attempts, deserialize every payload, sort in TypeScript, and retain the best row per user.

**Advantages**

- Straightforward TypeScript implementation.
- No window-function SQL.

**Rejected because**

- Work and memory grow with all historical attempts.
- Applying `limit` before deduplication produces incorrect rankings.
- It moves a relational ranking problem out of the database and is harder to test for deterministic pagination behavior.

### 6.4 Apply the contextual byte limit to legacy requests

Apply the new 16 KiB UTF-8 limit to every `gameData` object, including transient legacy submissions.

**Rejected because**

- It changes an existing API validation contract unrelated to persistence.
- A code audit cannot prove an absolute upper bound for modified clients or future legacy callers.
- HPA-484 can bound newly stored data without tightening existing transient achievement input.

## 7. Data Model

Add nullable columns to `game_scores`:

```sql
mode TEXT NULL,
competition_key TEXT NULL,
ruleset_version INTEGER NULL,
game_data_json TEXT NULL
```

Add the scoped ranking index:

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

Exact competitive callers such as Ice Slide Daily encode generator and ruleset identity into `competition_key`. `ruleset_version` is intentionally non-indexed and non-filtered in HPA-484; it is retained as audit/display metadata so stored attempts remain inspectable without making it a second source of competition identity. Version isolation is enforced through an exact `competition_key`, not through an implicit ruleset predicate.

A mode-only query uses the `(game_id, mode)` prefix but cannot use this index to provide the complete score ordering because `competition_key` lies between `mode` and `score`. That path may require a temporary sort. This is accepted because the shipped Daily ranking path always supplies an exact key, while mode-only ranking is a generic, non-latency-critical primitive with no current UI consumer. A second index is deferred until query plans and measured production volume justify its write/storage cost; the design does not invent an unsupported row-volume estimate.

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

`GameScore` therefore includes the new nullable fields. Existing public history DTOs retain their current response shapes unless a later issue explicitly exposes context.

Both checked-in schema/bootstrap definitions that create `game_scores` must include the new nullable columns and index. Existing databases rely on the runtime compatibility guard described below.

## 8. Submission Contract

Extend the client and server request shape with an optional strict context object:

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
```

### 8.1 Legacy submission

A request without `context`:

- inserts `user_id`, `game_id`, and `score` through the existing unscoped path;
- leaves all four context columns `NULL`;
- may include `gameData` for transient achievement evaluation;
- keeps the existing object-shape validation and does not add a new serialized-byte limit;
- does not persist `gameData`;
- runs the existing statistics, achievement, and challenge flows unchanged.

"Unchanged" here covers both downstream behavior and the request contract: HPA-484 does not reject a legacy object solely because its serialized form exceeds the contextual storage limit.

### 8.2 Contextual submission

A request with `context`:

- validates the complete context before any insert;
- validates and serializes `gameData` when supplied;
- requires serialized contextual `gameData` to fit the storage bound;
- inserts mode, optional competition key, ruleset version, and serialized game data;
- stores `NULL` in `game_data_json` when game data is omitted;
- runs the same existing aggregate-stat, favorite-game, achievement, and challenge side effects as a legacy submission.

Context is never derived from `gameData`, and fields inside `gameData` never override explicit context.

### 8.3 Validation

Use a strict context schema and preserve the open, game-specific shape of `gameData`.

| Field | Validation |
|---|---|
| `mode` | Required in context; 1–32 characters; `[a-z][a-z0-9_-]*` |
| `competitionKey` | Optional; 1–128 characters; letters, digits, `:`, `.`, `_`, and `-` |
| `rulesetVersion` | Required integer; `1..2_147_483_647` |
| `context` | Strict object; unknown fields rejected |
| `gameData` | Preserve the current record/object validation; arrays and primitives remain rejected |
| serialized contextual `gameData` | At most 16 KiB measured as UTF-8 bytes |

The byte-size check runs only when `context` is present and `gameData` will be persisted. It must measure `TextEncoder().encode(serialized).byteLength` or an equivalent server-safe UTF-8 byte count, not JavaScript string length.

Malformed request JSON, invalid context, oversized contextual data, and unknown context fields return `400` before inserting a score or updating statistics. A contextual validation failure is never retried as a legacy submission. An oversized legacy object remains subject to existing request/infrastructure limits but is not newly rejected by HPA-484's score schema.

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
5. Cache concurrent callers behind one process-local promise.
6. Record success only for capabilities that actually exist.
7. Reset the shared promise when any required column migration is incomplete so a later request retries.
8. If only index creation fails, retain the column capabilities but leave the guard retryable until `scopedIndex=true`; do not permanently cache a performance-only failure.

No path rebuilds or rewrites `game_scores`, and existing rows remain valid with `NULL` context.

### 9.2 Capability-dependent behavior

- Contextual inserts require all four columns. If any are unavailable, return a server error and do not insert an unscoped replacement.
- Scoped reads require all four columns. Missing capability is an explicit server failure, not an empty leaderboard or unscoped fallback.
- Legacy inserts use the original column set and remain available when the context migration is incomplete.
- Default unscoped reads apply every available isolation predicate:
  - when both scope columns exist: `mode IS NULL AND competition_key IS NULL`;
  - when only one exists after a partial migration: filter on the available column;
  - when neither exists on a legacy schema: all existing rows are necessarily treated as unscoped.
- An index failure affects performance only. Contextual reads and writes remain valid when the four columns exist.

This fallback is deliberately asymmetric: legacy behavior degrades gracefully, while requested contextual behavior never loses scope silently.

## 10. Query Semantics

### 10.1 Existing unscoped queries

Keep explicit legacy functions rather than introducing a single highly conditional query.

`getGameLeaderboard(gameId, limit)` adds unscoped predicates when available and retains its current public result shape and score-descending behavior.

Every existing function that answers a user's best score for a game, including compatibility aliases and `/api/scores/best`, uses the same unscoped predicate. Personal-best-derived achievement progress therefore remains Campaign-compatible.

The all-games leaderboard endpoint continues to call the unscoped query for every registered game.

### 10.2 Queries that intentionally include scoped rows

Do not add unscoped predicates to:

- recent and paginated score history;
- user activity calendars;
- aggregate total-score and activity statistics;
- the existing stored `total_games_played`, `total_score`, and `favorite_game` update path;
- games-played, unique-games, and total-score challenge queries;
- submission-time score and in-game achievement checks;
- existing daily-challenge progress updates.

A Daily or Expedition attempt is still a real platform play even when it belongs to a separate competitive scope.

### 10.3 Scoped best-per-user query

Add a separate reusable query. The database-layer row may retain `userId` internally because partitioning and later authenticated-user matching require it, but that identifier must be stripped before producing a public API entry.

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
    rulesetVersion: number | null
    elapsedSeconds: number | null
    totalMoves: number | null
}

export type ScopedLeaderboardEntry = Omit<ScopedLeaderboardRow, 'userId'>
```

The query filters by exact `game_id` and `mode`; when `competitionKey` is supplied it also requires an exact `competition_key` match. A mode-only query intentionally spans keys and ruleset versions in that mode.

Use a parameterized CTE with `ROW_NUMBER() OVER (PARTITION BY user_id ...)`. Apply `limit` only after selecting one row per user.

The API mapping must remove `userId`. If HPA-488 needs authenticated-player highlighting, it should compare the internal row to the optional session server-side and expose a safe boolean such as `isCurrentUser`; it must not publish the Better Auth identifier.

### 10.4 Tie-break extraction

The reusable query recognizes `elapsedSeconds` and `totalMoves` only when each stored value is a non-negative JSON integer. Missing, malformed, negative, non-integer, or otherwise invalid values become `NULL` for ranking and output.

Use staged CTEs:

1. An initial CTE filters the requested scope and exposes `game_data_json` only when `json_valid(game_data_json)=1`; invalid JSON becomes `NULL`.
2. A later CTE invokes `json_type`/`json_extract` only against the valid JSON value.
3. The ranking CTE consumes the normalized nullable integers.

Do not depend on SQL boolean-expression short-circuiting to protect JSON functions. A malformed historical or externally written row must never abort the leaderboard query.

### 10.5 Deterministic ranking order

Use the same order when selecting a user's best attempt and when ordering the final best-per-user leaderboard:

1. `score DESC`
2. valid elapsed time before missing/invalid elapsed time
3. `elapsedSeconds ASC`
4. valid move count before missing/invalid move count
5. `totalMoves ASC`
6. `created_at ASC`
7. `id ASC`

The row ID is an internal final determinant for equal timestamps. It does not replace or reorder the documented product tie-breaks.

The query keeps the existing player identity precedence:

```text
displayName -> username -> name -> "Anonymous"
```

### 10.6 Public field naming

Shared public leaderboard fields retain the existing contract exactly, including `created_at`. The scoped response does not rename that field to `createdAt`.

New opt-in fields use the existing API's TypeScript-facing camelCase convention:

```text
mode
competitionKey
rulesetVersion
elapsedSeconds
totalMoves
```

This means consumers can reuse the existing rank/player/score/timestamp rendering and feature-detect only the additive scoped fields.

## 11. API Contracts

### 11.1 `POST /api/scores`

- Existing request bodies without `context` remain valid under the existing legacy validation contract.
- The contextual byte limit does not apply to a request that omits `context`.
- Contextual validation errors return `400` and insert nothing.
- Missing contextual schema capability returns a server error and inserts nothing.
- The success response shape remains unchanged.
- Aggregate stats, favorite-game assignment, achievement processing, and challenge processing receive the same `gameId`, score, and game-data inputs as before.
- A contextual score is not semantically admitted to a game-specific ranked competition here; that validation belongs to the consuming game issue.

### 11.2 `GET /api/leaderboard`

Replace the route's manual parameter parsing with one validation schema that models both existing and scoped forms. The schema must keep `gameId` optional for the all-games request, parse/default `limit`, validate `mode` and `competitionKey`, and enforce cross-field combinations with a refinement:

- `mode` requires `gameId`;
- `competitionKey` requires both `gameId` and `mode`.

The route must call the shared `validateQuery()` helper or an equivalent single schema-validation entry point for all query parameters; it must not validate `limit` manually while handling scope parameters separately.

| Query | Behavior |
|---|---|
| no scope parameters | Preserve current unscoped behavior |
| `gameId` only | Preserve current single-game unscoped response |
| `gameId` + `mode` | Return scoped best-per-user results for that mode |
| `gameId` + `mode` + `competitionKey` | Return exact scoped competition results |
| `competitionKey` without `mode` | `400` |
| scope parameter without `gameId` | `400` |
| invalid game, limit, mode, or key | `400` |
| scoped schema unavailable | server error |
| scoped database query failure | server error, not an empty-success response |

The existing unscoped response remains shape-compatible. Scoped entries retain `created_at`, never expose `userId`, and add only `mode`, `competitionKey`, `rulesetVersion`, `elapsedSeconds`, and `totalMoves`.

The legacy query may retain its current defensive empty-array behavior for compatibility. The new scoped query must preserve failure information so HPA-488 can distinguish an unavailable leaderboard from a legitimately empty competition.

## 12. Error Handling

- Invalid context or oversized contextual data fails before any database mutation.
- Legacy game-data objects retain their existing score-schema validation and are not subject to the new contextual byte cap.
- A contextual migration failure is logged and surfaced; no unscoped substitute is written.
- Legacy submissions continue with the original insert columns where possible.
- A partial schema never causes a query to reference a missing column.
- Malformed persisted JSON is treated as missing tie-break data rather than a query failure.
- An unavailable scoped leaderboard is distinguishable from an empty scoped leaderboard.
- Existing score, aggregate-stat, favorite-game, achievement, and challenge side-effect ordering is preserved; transactional redesign is outside this issue.
- Database and validation errors must not expose serialized game data, raw user IDs, or secrets in client responses.

## 13. Testing Strategy

Use mocked query tests for call boundaries and real in-memory LibSQL tests for schema and ranking behavior.

### 13.1 Validation and client tests

- Legacy payload without context remains valid.
- A legacy object larger than 16 KiB remains accepted by the score schema, proving HPA-484 did not tighten the existing contract.
- Contextual payload with and without game data is valid.
- Mode, competition-key, and ruleset-version boundaries are covered.
- Unknown context fields are rejected.
- Arrays and primitives remain rejected as game data through the existing record/object validation.
- Oversized contextual ASCII and multibyte UTF-8 payloads are rejected by encoded byte size.
- Context is forwarded by `scoreService` without changing legacy request bodies.
- Invalid context returns the existing client-facing invalid-score failure path.

### 13.2 Migration tests

- Fresh initialization contains all four columns and the scoped index.
- A legacy four-column table gains all columns without rewriting existing rows.
- Unscoped fallback behavior covers the four meaningful scope-column states: neither `mode` nor `competition_key`, `mode` only, `competition_key` only, and both.
- Representative interrupted states missing `ruleset_version` or `game_data_json` prove contextual operations fail and the next guard call completes migration.
- Exhaustively testing all 16 column-presence permutations is not required because every state missing any contextual column has the same contextual fail/no-downgrade contract.
- Repeated calls are idempotent.
- Concurrent calls share one migration execution.
- A failed column addition causes the next call to retry.
- Index creation failure leaves column capabilities available and retries later.
- Legacy inserts and default reads remain functional during incomplete migration.
- Contextual operations fail rather than downgrade when schema capability is incomplete.

### 13.3 Real LibSQL query tests

- Legacy and contextual submissions round-trip the expected nullable columns.
- Contextual game data is persisted exactly once; legacy game data remains transient.
- Contextual submissions execute the existing aggregate-stat and favorite-game side effects.
- Default game and all-games leaderboards exclude scoped rows.
- Every personal-best function and compatibility alias excludes scoped rows.
- Personal-best-derived achievement progress ignores scoped rows.
- History, activity, aggregate statistics, favorite-game updates, and daily-challenge source queries include scoped rows.
- Mode and competition-key isolation are exact.
- `ruleset_version` round-trips as metadata but is not an implicit filter or tie-break.
- Each user appears at most once in scoped output.
- A better retry replaces a worse retry in output while both remain stored.
- Score, elapsed-time, move-count, submission-time, and row-ID tie-break levels are independently covered.
- Valid tie-break values sort before missing or invalid values.
- Malformed JSON does not abort the query.
- `limit` is applied after best-per-user selection.
- Player identity fallback behavior remains unchanged.
- The internal row retains `userId` for server use, while the public mapping omits it.
- Scoped and unscoped public entries both retain `created_at`.

### 13.4 API tests

- Existing no-`gameId` and single-game unscoped responses remain shape-compatible.
- The unified leaderboard query schema accepts the all-games path and rejects every invalid scope combination.
- The route uses the unified validation result rather than separate manual parsing.
- Scoped mode-only and exact-key requests return the new fields and ranks.
- Scoped entries retain `created_at` and do not serialize `userId`.
- Contextual submission returns `400` with no insert for malformed context or oversized contextual data.
- Legacy oversized object data is not newly rejected by HPA-484.
- Scoped schema/query failure returns a server error rather than an empty result.
- Existing aggregate-stat, favorite-game, achievement, and challenge update calls still occur after successful legacy and contextual submissions.

End-to-end Daily UI coverage belongs to HPA-487 and HPA-488, not this backend foundation.

## 14. Implementation Boundaries

Likely touched areas are intentionally limited to:

```text
scripts/init-db.sql
better-auth_migrations/...
src/lib/server/db/types.ts
src/lib/server/db/queries.ts
src/lib/server/validations.ts
src/lib/services/scoreService.ts
src/pages/api/scores.ts
src/pages/api/leaderboard.ts
focused unit, API, migration, legacy-schema, and LibSQL integration tests
```

No Ice Slide runtime module should depend on unfinished HPA-487 data shapes in this issue. The platform contract must be usable independently by later games.

## 15. Delivery Sequence

1. Add schema types, checked-in schema definitions, runtime capability guard, and focused migration tests.
2. Add strict request context and contextual game-data storage bounds without tightening legacy validation.
3. Extend score-service and insert paths while preserving all existing aggregate-stat, favorite-game, achievement, and challenge side effects.
4. Isolate default leaderboard and personal-best queries to unscoped rows.
5. Add the scoped best-per-user LibSQL query, internal/public DTO boundary, and deterministic tie-break tests.
6. Replace leaderboard manual parameter parsing with one schema and add validated opt-in filters.
7. Run compatibility tests across fresh, legacy, representative partial, and malformed-data fixtures.

This sequence keeps every intermediate change reviewable and prevents API work from landing before its storage/query invariants exist.

## 16. Acceptance Criteria

- Existing rows remain valid and no table is destructively rewritten.
- Existing score callers require no changes.
- Legacy `gameData` keeps its existing validation contract, continues to power achievements, and is not persisted.
- A contextual submission round-trips mode, optional key, ruleset version, and optional game data.
- Invalid context or oversized contextual data returns `400` and inserts nothing.
- Default leaderboards, personal bests, and Campaign-oriented achievement progress exclude scoped rows.
- History, activity, aggregate statistics, favorite-game updates, and current daily challenges include scoped rows.
- Scoped output contains at most one row per user.
- Scoped public output preserves `created_at` and never exposes raw `user_id`.
- `ruleset_version` is returned as metadata but does not silently define ranking scope.
- All documented tie-breaks are deterministic and covered against real LibSQL.
- Missing or malformed tie-break JSON cannot crash the query.
- Legacy, representative partial, concurrent, and index-retry migration paths are covered.
- The leaderboard route enforces all parameter combinations through one validation schema.
- Existing achievement and challenge updates remain intact.
- HPA-487 and HPA-488 can consume the context and scoped-query primitives without adding Ice Slide rules to the shared database layer.

## 17. Resolved Decisions

- Personal-best and achievement-progress queries use only unscoped rows.
- Scoped rows still count as platform plays, aggregate-stat/favorite-game updates, and daily-challenge activity.
- Context is explicit and separate from game data.
- Legacy transient game data does not receive the new contextual 16 KiB storage bound.
- Contextual data is never silently discarded or downgraded.
- Mode-only scoped ranking is allowed as a reusable primitive; competitive Daily callers use an exact competition key.
- The mode-only path may sort because no second index is justified without a measured consumer.
- `ruleset_version` is audit/display metadata; exact competition keys provide version isolation.
- JSON tie-breaks are staged, guarded, nullable, and sorted after valid values.
- Public scoped output preserves `created_at` and strips raw user IDs.
- The leaderboard route uses one schema for all-games, single-game, and scoped query forms.
- The shared layer does not decide whether an Ice Slide Daily submission is solved or trustworthy.
- The canonical parent requirements live in Linear; the closed GitHub documentation branch is not the durable citation.

## 18. Spec Self-Review

- **Placeholder scan:** no TBD, TODO, unresolved field bound, or invented production-volume target remains.
- **Consistency:** Campaign competition is unscoped while platform activity includes all rows; every query family is assigned to one side of that boundary.
- **Legacy compatibility:** the contextual persistence limit does not change the existing transient `gameData` request contract.
- **Migration safety:** contextual operations require complete capability, while legacy behavior never references unavailable columns; index failure remains retryable.
- **Determinism:** per-user selection and final ordering use the same complete sequence, including row ID as the final internal fallback.
- **API surface:** existing shared fields retain their casing, new fields are additive, and raw auth identifiers remain private.
- **Version semantics:** competition keys isolate versions; `ruleset_version` is explicit metadata rather than a hidden predicate.
- **Scope:** the work remains a shared persistence/query foundation; Ice Slide gameplay, semantic admission, highlighting, and UI remain in HPA-487/HPA-488.
- **Ambiguity resolution:** malformed JSON sorts as missing data, mode-only queries intentionally span keys, and the unified query schema models the all-games path.
