# Versioned Game Score Context and Scoped Leaderboards — Design

- **Date:** 2026-07-31
- **Status:** Approved for implementation planning
- **Repository:** `cwchanap/cetus`
- **Linear issue:** [HPA-484 — Persist versioned game score context and add scoped leaderboard queries](https://linear.app/cwchanap/issue/HPA-484/persist-versioned-game-score-context-and-add-scoped-leaderboard)
- **Parent design:** [Ice Slide replayability design](https://github.com/cwchanap/cetus/blob/docs/ice-slide-replayability-spec/docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md)

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
- `getUserBestScore()` and compatibility aliases are reused by the personal-best API and achievement-progress calculations.
- History, activity, aggregate-score, and challenge queries intentionally derive data from the complete `game_scores` activity stream.
- The database layer already uses defensive, lazy, idempotent LibSQL migrations with process-local single-flight promises and retry after incomplete migration.
- Database behavior is tested both through mocked Kysely chains and real in-memory LibSQL integration tests.

The change must preserve those contracts unless this design explicitly narrows a query to unscoped rows.

## 3. Goals

1. Persist optional score mode, competition identity, ruleset version, and bounded game data.
2. Keep every existing submission caller valid without modification.
3. Keep historical and new Campaign scores comparable through the existing unscoped leaderboard.
4. Prevent Daily and Expedition rows from changing Campaign leaderboards, personal bests, or Campaign-oriented achievement progress.
5. Continue counting scoped submissions toward platform activity, aggregate statistics, history, and existing daily challenges.
6. Provide a reusable scoped query that returns one deterministic best attempt per user.
7. Migrate existing and partially migrated LibSQL schemas without table rebuilds or destructive rewrites.
8. Make malformed stored JSON and partial migration states fail safely.
9. Keep Ice Slide-specific completion and run-identity verification outside the shared score layer.

## 4. Non-goals

- Ice Slide mode selection, generation, objectives, or scoring.
- Daily leaderboard presentation.
- Server-authoritative replay, anti-cheat, or score recomputation.
- Migrating existing games to contextual submissions.
- Normalizing arbitrary game-specific data into dedicated columns.
- Historical Daily navigation, seasonal leagues, or cross-seed Expedition ranking.
- Redesigning the existing score-insert/stat-update transaction boundary.
- Changing platform daily-challenge definitions or challenge rotation.

## 5. Fixed Product and Platform Decisions

| Decision | Requirement |
|---|---|
| Legacy path | A submission without `context` uses the current unscoped path. |
| Context ownership | Context is an explicit sibling of `gameData`; it is never inferred from game data. |
| Game-data persistence | `gameData` is persisted only for a validated contextual submission. |
| Campaign ranking | Default/global leaderboards include only unscoped rows. |
| Personal best | Existing best-score queries and Campaign-oriented achievement progress include only unscoped rows. |
| Platform activity | Scoped rows still count toward history, activity, aggregates, and existing daily challenges. |
| Scoped ranking | One best row per user, selected and ordered deterministically. |
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

The index intentionally omits `ruleset_version`: exact competitive callers such as Ice Slide Daily encode generator and ruleset identity into `competition_key`. A mode-only query is a generic platform primitive and may span multiple competition keys by explicit caller choice.

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
- does not persist `gameData`;
- runs the existing statistics, achievement, and challenge flows unchanged.

### 8.2 Contextual submission

A request with `context`:

- validates the complete context before any insert;
- validates and serializes `gameData` when supplied;
- inserts mode, optional competition key, ruleset version, and serialized game data;
- stores `NULL` in `game_data_json` when game data is omitted;
- runs the same statistics, achievement, and challenge flows as a legacy submission.

Context is never derived from `gameData`, and fields inside `gameData` never override explicit context.

### 8.3 Validation

Use a strict context schema and preserve the open, game-specific shape of `gameData`.

| Field | Validation |
|---|---|
| `mode` | Required in context; 1–32 characters; `[a-z][a-z0-9_-]*` |
| `competitionKey` | Optional; 1–128 characters; letters, digits, `:`, `.`, `_`, and `-` |
| `rulesetVersion` | Required integer; `1..2_147_483_647` |
| `context` | Strict object; unknown fields rejected |
| `gameData` | Plain JSON object; arrays and primitives rejected |
| serialized `gameData` | At most 16 KiB measured as UTF-8 bytes |

The `gameData` object and byte-size validation applies to both legacy and contextual requests. This bounds the existing transient input as well as newly persisted JSON while preserving all current game-specific object shapes.

Malformed JSON, invalid context, oversized data, and unknown context fields return `400` before inserting a score or updating statistics. A contextual validation failure is never retried as a legacy submission.

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
8. Log index creation failure and retry it later without treating otherwise available contextual columns as absent.

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
- games-played, unique-games, and total-score challenge queries;
- submission-time score and in-game achievement checks;
- existing daily-challenge progress updates.

A Daily or Expedition attempt is still a real platform play even when it belongs to a separate competitive scope.

### 10.3 Scoped best-per-user query

Add a separate reusable query:

```ts
export interface ScopedLeaderboardQuery {
    gameId: string
    mode: string
    competitionKey?: string
    limit?: number
}

export interface ScopedLeaderboardEntry {
    userId: string
    name: string
    username: string | null
    image: string | null
    score: number
    createdAt: string
    mode: string
    competitionKey: string | null
    rulesetVersion: number | null
    elapsedSeconds: number | null
    totalMoves: number | null
}
```

The query filters by exact `game_id` and `mode`; when `competitionKey` is supplied it also requires an exact `competition_key` match. A mode-only query intentionally spans keys in that mode.

Use a parameterized CTE with `ROW_NUMBER() OVER (PARTITION BY user_id ...)`. Apply `limit` only after selecting one row per user.

### 10.4 Tie-break extraction

The reusable query recognizes `elapsedSeconds` and `totalMoves` only when each stored value is a non-negative JSON integer. Missing, malformed, negative, non-integer, or otherwise invalid values become `NULL` for ranking and output.

Guard every JSON extraction with `json_valid(game_data_json)` so a malformed historical or externally written row cannot abort the leaderboard query. JSON validity must be established before invoking path extraction or type inspection.

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

## 11. API Contracts

### 11.1 `POST /api/scores`

- Existing request bodies without `context` remain valid.
- Contextual validation errors return `400` and insert nothing.
- Missing contextual schema capability returns a server error and inserts nothing.
- The success response shape remains unchanged.
- Achievement and challenge processing receives the same `gameId`, score, and game-data inputs as before.
- A contextual score is not semantically admitted to a game-specific ranked competition here; that validation belongs to the consuming game issue.

### 11.2 `GET /api/leaderboard`

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

The existing unscoped response remains shape-compatible. The scoped response may add explicit `mode`, `competitionKey`, `elapsedSeconds`, and `totalMoves` fields because it is a new opt-in contract.

The legacy query may retain its current defensive empty-array behavior for compatibility. The new scoped query must preserve failure information so HPA-488 can distinguish an unavailable leaderboard from a legitimately empty competition.

## 12. Error Handling

- Invalid or oversized request data fails before any database mutation.
- A contextual migration failure is logged and surfaced; no unscoped substitute is written.
- Legacy submissions continue with the original insert columns where possible.
- A partial schema never causes a query to reference a missing column.
- Malformed persisted JSON is treated as missing tie-break data rather than a query failure.
- An unavailable scoped leaderboard is distinguishable from an empty scoped leaderboard.
- Existing score, achievement, statistics, and challenge side-effect ordering is preserved; transactional redesign is outside this issue.
- Database and validation errors must not expose serialized game data or secrets in client responses.

## 13. Testing Strategy

Use mocked query tests for call boundaries and real in-memory LibSQL tests for schema and ranking behavior.

### 13.1 Validation and client tests

- Legacy payload without context remains valid.
- Contextual payload with and without game data is valid.
- Mode, competition-key, and ruleset-version boundaries are covered.
- Unknown context fields are rejected.
- Arrays and primitives are rejected as game data.
- Oversized ASCII and multibyte UTF-8 payloads are rejected by encoded byte size.
- Context is forwarded by `scoreService` without changing legacy request bodies.
- Invalid context returns the existing client-facing invalid-score failure path.

### 13.2 Migration tests

- Fresh initialization contains all four columns and the scoped index.
- A legacy four-column table gains all columns without rewriting existing rows.
- Every partial-column permutation needed for realistic interrupted migration completes correctly.
- Repeated calls are idempotent.
- Concurrent calls share one migration execution.
- A failed column addition causes the next call to retry.
- Index creation failure leaves column capabilities available and retries later.
- Legacy inserts and default reads remain functional during incomplete migration.
- Contextual operations fail rather than downgrade when schema capability is incomplete.

### 13.3 Real LibSQL query tests

- Legacy and contextual submissions round-trip the expected nullable columns.
- Contextual game data is persisted exactly once; legacy game data remains transient.
- Default game and all-games leaderboards exclude scoped rows.
- Every personal-best function and compatibility alias excludes scoped rows.
- Personal-best-derived achievement progress ignores scoped rows.
- History, activity, aggregate statistics, and daily-challenge source queries include scoped rows.
- Mode and competition-key isolation are exact.
- Each user appears at most once in scoped output.
- A better retry replaces a worse retry in output while both remain stored.
- Score, elapsed-time, move-count, submission-time, and row-ID tie-break levels are independently covered.
- Valid tie-break values sort before missing or invalid values.
- Malformed JSON does not abort the query.
- `limit` is applied after best-per-user selection.
- Player identity fallback behavior remains unchanged.

### 13.4 API tests

- Existing no-`gameId` and single-game unscoped responses remain shape-compatible.
- Scoped mode-only and exact-key requests return the new fields and ranks.
- Invalid parameter combinations return `400`.
- Contextual submission returns `400` with no insert for malformed or oversized input.
- Scoped schema/query failure returns a server error rather than an empty result.
- Existing achievement and challenge update calls still occur after successful legacy and contextual submissions.

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

1. Add schema types, checked-in schema definitions, runtime capability guard, and migration tests.
2. Add strict request context and game-data bounds.
3. Extend score-service and insert paths while preserving existing side effects.
4. Isolate default leaderboard and personal-best queries to unscoped rows.
5. Add the scoped best-per-user LibSQL query and deterministic tie-break tests.
6. Extend the leaderboard API with validated opt-in filters.
7. Run compatibility tests across fresh, legacy, partial, and malformed-data fixtures.

This sequence keeps every intermediate change reviewable and prevents API work from landing before its storage/query invariants exist.

## 16. Acceptance Criteria

- Existing rows remain valid and no table is destructively rewritten.
- Existing score callers require no changes.
- Legacy `gameData` continues to power achievements without being persisted.
- A contextual submission round-trips mode, optional key, ruleset version, and optional game data.
- Invalid or oversized context/data returns `400` and inserts nothing.
- Default leaderboards, personal bests, and Campaign-oriented achievement progress exclude scoped rows.
- History, activity, aggregate statistics, and current daily challenges include scoped rows.
- Scoped output contains at most one row per user.
- All documented tie-breaks are deterministic and covered against real LibSQL.
- Missing or malformed tie-break JSON cannot crash the query.
- Legacy, partial, and concurrent migration paths are covered.
- Existing achievement and challenge updates remain intact.
- HPA-487 and HPA-488 can consume the context and scoped-query primitives without adding Ice Slide rules to the shared database layer.

## 17. Resolved Decisions

- Personal-best and achievement-progress queries use only unscoped rows.
- Scoped rows still count as platform plays and daily-challenge activity.
- Context is explicit and separate from game data.
- Contextual data is never silently discarded or downgraded.
- Mode-only scoped ranking is allowed as a reusable primitive; competitive Daily callers use an exact competition key.
- JSON tie-breaks are guarded, nullable, and sorted after valid values.
- The shared layer does not decide whether an Ice Slide Daily submission is solved or trustworthy.

## 18. Spec Self-Review

- **Placeholder scan:** no TBD, TODO, or unresolved field bound remains.
- **Consistency:** Campaign competition is unscoped while platform activity includes all rows; every query family is assigned to one side of that boundary.
- **Migration safety:** contextual operations require complete capability, while legacy behavior never references unavailable columns.
- **Determinism:** per-user selection and final ordering use the same complete sequence, including row ID as the final internal fallback.
- **Scope:** the work remains a shared persistence/query foundation; Ice Slide gameplay, semantic admission, and UI remain in HPA-487/HPA-488.
- **Ambiguity resolution:** malformed JSON sorts as missing data, mode-only queries intentionally span keys, and index failure affects performance rather than correctness.
