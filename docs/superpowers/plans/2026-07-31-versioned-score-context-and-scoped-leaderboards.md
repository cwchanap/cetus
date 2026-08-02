# Versioned Score Context and Scoped Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backward-compatible, versioned score persistence and deterministic scoped leaderboards without changing existing Campaign score, history, achievement-awarding, aggregate-stat, or daily-challenge behavior.

**Architecture:** Add nullable score-context columns to `game_scores`, guarded by a cached, retryable LibSQL capability layer. Keep one score write function and one achievement pipeline, return discriminated failures through the server and client, preserve existing unscoped raw-attempt queries, and add a separate staged-CTE/window query for scoped best-per-user results. Public APIs map explicit DTOs so internal context, stored JSON, and raw authentication IDs never leak.

**Tech Stack:** Astro 5, TypeScript 6, Bun 1.3.1, Kysely 0.28, LibSQL/Turso, Zod 4, Vitest 3.

## Global Constraints

- Execute implementation on a new isolated worktree/branch from the latest `main` after documentation PR #50 is merged. Do not add runtime implementation commits to the documentation PR.
- Package manager is **Bun** (`bun@1.3.1`).
- Do not add dependencies.
- Context columns are nullable: `mode`, `competition_key`, `ruleset_version`, `game_data_json`.
- Scoped filtering index is exactly `(game_id, mode, competition_key, score DESC, created_at ASC)`.
- Context is omit-only. Omitted context means legacy; `context: null` returns `400`.
- Fully anchored identifiers:
  - mode: `^[a-z][a-z0-9_-]*$`, 1–32 characters;
  - competition key: `^[A-Za-z0-9:._-]+$`, 1–128 characters.
- `rulesetVersion` is required for contextual writes, integer `1..2_147_483_647`, and non-null in scoped public output.
- Contextual `gameData` is at most 16 KiB by UTF-8 byte length. Legacy transient `gameData` does not receive this new limit.
- V1 projected tie-break keys are only `elapsedSeconds` and `totalMoves`.
  - `elapsedSeconds` is a non-negative integer count of floored whole seconds.
  - `totalMoves` is a non-negative integer count.
  - Submitted fractions or negative values return `400`.
  - Malformed historical/external values normalize to `NULL`.
- Existing unscoped leaderboards remain raw-attempt lists. Scoped leaderboards return one best row per user.
- Existing personal-best and best-score-derived achievement progress use only unscoped rows.
- Scoped submissions still run score-threshold and in-game achievement awarding against the submitted score and `gameData`.
- Scoped submissions still update total score, game-count/favorite-game side effects, history/activity, and current daily challenges.
- Public APIs must never expose `game_data_json`, raw `user_id`, or widened internal `GameScore` rows.
- Public scoped timestamps remain `created_at`.
- Missing contextual write capability returns HTTP `500` with code `SCORE_CONTEXT_UNAVAILABLE`.
- Scoped leaderboard capability/query failure returns HTTP `500` with code `SCOPED_LEADERBOARD_UNAVAILABLE`.
- Unknown capability state must fail closed to each legacy query’s existing defensive result; never run an unfiltered query that might mix scoped rows.
- Performance-only index creation retries use process-local exponential backoff from one minute to one hour.
- HPA-487/HPA-488 own Ice Slide generation, semantic admission, current-user highlighting, and UI.
- Full verification commands:
  - `bun run test:run`
  - `bun run lint`
  - `bun run typecheck`
  - `bun run build`

## File Structure

**Create**

- `src/lib/server/db/game-score-context.ts` — context types, discriminated write/result codes, schema capability cache, migration, and index retry backoff.
- `src/lib/server/db/game-score-schema-files.test.ts` — executes the extracted `game_scores` DDL from both checked-in schema sources.
- `src/lib/server/db/game-score-context.migrations.test.ts` — real-LibSQL fresh, legacy, partial, idempotent, concurrent, and unknown-probe behavior.
- `src/lib/server/db/game-score-context.index-retry.test.ts` — real-LibSQL performance-index retry/backoff behavior.
- `src/lib/server/db/scoped-leaderboard.ts` — staged JSON normalization, window ranking, internal row/result types, and public DTO mapping.
- `src/lib/server/db/scoped-leaderboard.integration.test.ts` — real-LibSQL scoped ranking and malformed-data coverage.

**Modify**

- `scripts/init-db.sql`
- `better-auth_migrations/2025-07-06-schema-consolidation.sql`
- `src/lib/server/db/types.ts`
- `src/lib/server/db/queries.ts`
- `src/lib/server/db/queries.integration.test.ts`
- `src/lib/server/db/queries.test.ts`
- `src/lib/server/validations.ts`
- `src/lib/server/validations.test.ts`
- `src/lib/server/api-utils.ts`
- `src/lib/services/scoreService.ts`
- `src/lib/services/scoreService.test.ts`
- `src/pages/api/scores.ts`
- `src/pages/api/scores.test.ts`
- `src/pages/api/leaderboard.ts`
- `src/pages/api/leaderboard.test.ts`
- `src/pages/api/scores/history.test.ts`
- `src/lib/services/achievementService.test.ts`

---

### Task 1: Add the persistent schema and Kysely insert types

**Files:**
- Modify: `scripts/init-db.sql:9-20, indexes section`
- Modify: `better-auth_migrations/2025-07-06-schema-consolidation.sql:44-55, indexes section`
- Modify: `src/lib/server/db/types.ts:1, GameScoresTable, NewGameScore`
- Create: `src/lib/server/db/game-score-schema-files.test.ts`

**Interfaces:**
- Produces: nullable `mode`, `competition_key`, `ruleset_version`, and `game_data_json` columns.
- Produces: `idx_game_scores_scoped_ranking`.
- Produces: `NewGameScore = Insertable<GameScoresTable>` so legacy inserts may omit nullable context columns while contextual inserts may supply them.

- [ ] **Step 1: Write the failing schema-file test**

Create `src/lib/server/db/game-score-schema-files.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

const schemaFiles = [
    'scripts/init-db.sql',
    'better-auth_migrations/2025-07-06-schema-consolidation.sql',
] as const

function extractGameScoresDdl(source: string): string {
    const table = source.match(
        /CREATE TABLE IF NOT EXISTS\s+"?game_scores"?\s*\([\s\S]*?\n\);/i
    )?.[0]
    const index = source.match(
        /CREATE INDEX IF NOT EXISTS\s+"?idx_game_scores_scoped_ranking"?[\s\S]*?;/i
    )?.[0]

    if (!table || !index) {
        throw new Error('game_scores table or scoped index DDL is missing')
    }

    return `${table}\n${index}`
}

describe.each(schemaFiles)('%s', schemaPath => {
    it('creates the complete contextual score schema', async () => {
        const source = await readFile(resolve(process.cwd(), schemaPath), 'utf8')
        const client = createClient({ url: ':memory:' })

        await client.executeMultiple(extractGameScoresDdl(source))

        const columns = await client.execute('PRAGMA table_info(game_scores)')
        expect(columns.rows.map(row => String(row.name))).toEqual(
            expect.arrayContaining([
                'id',
                'user_id',
                'game_id',
                'score',
                'mode',
                'competition_key',
                'ruleset_version',
                'game_data_json',
                'created_at',
            ])
        )

        const index = await client.execute(
            'PRAGMA index_info(idx_game_scores_scoped_ranking)'
        )
        expect(index.rows.map(row => String(row.name))).toEqual([
            'game_id',
            'mode',
            'competition_key',
            'score',
            'created_at',
        ])

        client.close()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun run test:run src/lib/server/db/game-score-schema-files.test.ts
```

Expected: FAIL because neither schema file declares the four columns or the scoped index. The `scripts/init-db.sql` extraction may also expose its existing trailing-comma table syntax; fix that within this task.

- [ ] **Step 3: Replace the `game_scores` block in `scripts/init-db.sql`**

Use:

```sql
CREATE TABLE IF NOT EXISTS game_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    mode TEXT,
    competition_key TEXT,
    ruleset_version INTEGER,
    game_data_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
```

Add with the existing score indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_game_scores_scoped_ranking
    ON game_scores(
        game_id,
        mode,
        competition_key,
        score DESC,
        created_at ASC
    );
```

- [ ] **Step 4: Replace the `game_scores` block in the consolidated migration**

Use:

```sql
CREATE TABLE IF NOT EXISTS "game_scores" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "game_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "mode" TEXT,
    "competition_key" TEXT,
    "ruleset_version" INTEGER,
    "game_data_json" TEXT,
    "created_at" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Add with its existing indexes:

```sql
CREATE INDEX IF NOT EXISTS "idx_game_scores_scoped_ranking"
    ON "game_scores" (
        "game_id",
        "mode",
        "competition_key",
        "score" DESC,
        "created_at" ASC
    );
```

- [ ] **Step 5: Update the Kysely table and insert type**

In `src/lib/server/db/types.ts`, change the import:

```ts
import type { ColumnType, Insertable, Selectable } from 'kysely'
```

Replace `GameScoresTable` with:

```ts
export interface GameScoresTable {
    id: ColumnType<number, never, never>
    user_id: string
    game_id: string
    score: number
    mode: ColumnType<
        string | null,
        string | null | undefined,
        string | null
    >
    competition_key: ColumnType<
        string | null,
        string | null | undefined,
        string | null
    >
    ruleset_version: ColumnType<
        number | null,
        number | null | undefined,
        number | null
    >
    game_data_json: ColumnType<
        string | null,
        string | null | undefined,
        string | null
    >
    created_at: ColumnType<Date, never, never>
}
```

Replace:

```ts
export type NewGameScore = Omit<GameScoresTable, 'id' | 'created_at'>
```

with:

```ts
export type NewGameScore = Insertable<GameScoresTable>
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun run test:run src/lib/server/db/game-score-schema-files.test.ts
bun run typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add scripts/init-db.sql \
  better-auth_migrations/2025-07-06-schema-consolidation.sql \
  src/lib/server/db/types.ts \
  src/lib/server/db/game-score-schema-files.test.ts
git commit -m "feat(scores): add versioned score context schema"
```

---

### Task 2: Add the cached runtime capability guard and bounded index retry

**Files:**
- Create: `src/lib/server/db/game-score-context.ts`
- Create: `src/lib/server/db/game-score-context.migrations.test.ts`
- Create: `src/lib/server/db/game-score-context.index-retry.test.ts`

**Interfaces:**
- Produces: `ensureGameScoresContextSchema(): Promise<GameScoresContextState>`.
- Produces: `getCachedGameScoresContextState(): GameScoresContextState | null`.
- Produces: `hasCompleteGameScoresContextColumns(capabilities): boolean`.
- Produces shared DB contracts: `PersistedScoreContext`, `SaveGameScoreResult`, and `SaveGameScoreWithAchievementsResult`.
- `GameScoresContextState` is `{ known: true; capabilities }` or `{ known: false }`.

- [ ] **Step 1: Write the migration behavior test**

Create `src/lib/server/db/game-score-context.migrations.test.ts` with an in-memory Kysely database and one test that exercises the first-call single flight before module state is cached:

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

import { db } from '@/lib/server/db/client'
import {
    ensureGameScoresContextSchema,
    getCachedGameScoresContextState,
    hasCompleteGameScoresContextColumns,
} from './game-score-context'

beforeAll(async () => {
    await sql`
        CREATE TABLE game_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        INSERT INTO game_scores (user_id, game_id, score)
        VALUES ('u1', 'tetris', 123)
    `.execute(db)
})

describe('ensureGameScoresContextSchema', () => {
    it('single-flights migration, preserves rows, and caches complete capability', async () => {
        const executeSpy = vi.spyOn(db, 'executeQuery')

        const states = await Promise.all([
            ensureGameScoresContextSchema(),
            ensureGameScoresContextSchema(),
            ensureGameScoresContextSchema(),
        ])

        expect(states.every(state => state.known)).toBe(true)
        const state = states[0]
        if (!state.known) throw new Error('expected known state')

        expect(hasCompleteGameScoresContextColumns(state.capabilities)).toBe(true)
        expect(state.capabilities.scopedIndex).toBe(true)
        expect(getCachedGameScoresContextState()).toEqual(state)

        const tableInfoCalls = executeSpy.mock.calls.filter(([query]) =>
            query.sql.includes('PRAGMA table_info(game_scores)')
        )
        expect(tableInfoCalls).toHaveLength(2)

        const columns =
            await sql<{ name: string }>`PRAGMA table_info(game_scores)`.execute(
                db
            )
        expect(columns.rows.map(row => row.name)).toEqual(
            expect.arrayContaining([
                'mode',
                'competition_key',
                'ruleset_version',
                'game_data_json',
            ])
        )

        const rows = await sql<{
            score: number
            mode: string | null
        }>`SELECT score, mode FROM game_scores`.execute(db)
        expect(rows.rows).toEqual([{ score: 123, mode: null }])
    })
})
```

The two `PRAGMA table_info` calls are the expected inspect-before/inspect-after cycle for one migration run. Three concurrent callers must not multiply that count.

- [ ] **Step 2: Write the index backoff test**

Create `src/lib/server/db/game-score-context.index-retry.test.ts`. Build a table with all four context columns, create a table named `idx_game_scores_scoped_ranking` to force the index DDL to fail, and use fake time:

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

import { db } from '@/lib/server/db/client'
import { ensureGameScoresContextSchema } from './game-score-context'

beforeAll(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'))

    await sql`
        CREATE TABLE game_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            mode TEXT,
            competition_key TEXT,
            ruleset_version INTEGER,
            game_data_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE TABLE idx_game_scores_scoped_ranking (id INTEGER)
    `.execute(db)
})

describe('score-context index retry backoff', () => {
    it('skips hot-path retries inside the delay and succeeds after one minute', async () => {
        const executeSpy = vi.spyOn(db, 'executeQuery')

        const first = await ensureGameScoresContextSchema()
        expect(first.known && first.capabilities.scopedIndex).toBe(false)

        executeSpy.mockClear()
        await ensureGameScoresContextSchema()
        expect(
            executeSpy.mock.calls.some(([query]) =>
                query.sql.includes('CREATE INDEX')
            )
        ).toBe(false)

        await sql`DROP TABLE idx_game_scores_scoped_ranking`.execute(db)
        vi.advanceTimersByTime(60_000)

        const recovered = await ensureGameScoresContextSchema()
        expect(recovered.known).toBe(true)
        if (!recovered.known) throw new Error('expected known state')
        expect(recovered.capabilities.scopedIndex).toBe(true)
    })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
bun run test:run \
  src/lib/server/db/game-score-context.migrations.test.ts \
  src/lib/server/db/game-score-context.index-retry.test.ts
```

Expected: FAIL because `game-score-context.ts` does not exist.

- [ ] **Step 4: Implement the context contracts and capability state**

Create `src/lib/server/db/game-score-context.ts` with these exported contracts:

```ts
import { sql } from 'kysely'
import { db } from './client'

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

export type SaveGameScoreWithAchievementsResult =
    | { success: true; newAchievements: string[] }
    | {
          success: false
          newAchievements: []
          code: SaveGameScoreFailureCode
      }

export interface GameScoresContextCapabilities {
    mode: boolean
    competitionKey: boolean
    rulesetVersion: boolean
    gameDataJson: boolean
    scopedIndex: boolean
}

export type GameScoresContextState =
    | {
          known: true
          capabilities: GameScoresContextCapabilities
      }
    | { known: false }

const INDEX_NAME = 'idx_game_scores_scoped_ranking'
const INDEX_RETRY_MIN_MS = 60_000
const INDEX_RETRY_MAX_MS = 3_600_000

let cachedState: GameScoresContextState | null = null
let schemaPromise: Promise<GameScoresContextState> | null = null
let indexRetryDelayMs = INDEX_RETRY_MIN_MS
let nextIndexRetryAt = 0

export function hasCompleteGameScoresContextColumns(
    capabilities: GameScoresContextCapabilities
): boolean {
    return (
        capabilities.mode &&
        capabilities.competitionKey &&
        capabilities.rulesetVersion &&
        capabilities.gameDataJson
    )
}

export function getCachedGameScoresContextState():
    | GameScoresContextState
    | null {
    return cachedState
}
```

- [ ] **Step 5: Implement inspection, additive migration, and backoff**

Add these private helpers and the exported ensure function in the same file:

```ts
async function inspectCapabilities(): Promise<GameScoresContextCapabilities> {
    const columns =
        await sql<{ name: string }>`PRAGMA table_info(game_scores)`.execute(db)
    const names = new Set(columns.rows.map(row => row.name))

    const indexes = await sql<{ name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'game_scores'
    `.execute(db)

    return {
        mode: names.has('mode'),
        competitionKey: names.has('competition_key'),
        rulesetVersion: names.has('ruleset_version'),
        gameDataJson: names.has('game_data_json'),
        scopedIndex: indexes.rows.some(row => row.name === INDEX_NAME),
    }
}

async function addMissingColumns(
    capabilities: GameScoresContextCapabilities
): Promise<void> {
    if (!capabilities.mode) {
        await sql`ALTER TABLE game_scores ADD COLUMN mode TEXT`.execute(db)
    }
    if (!capabilities.competitionKey) {
        await sql`
            ALTER TABLE game_scores ADD COLUMN competition_key TEXT
        `.execute(db)
    }
    if (!capabilities.rulesetVersion) {
        await sql`
            ALTER TABLE game_scores ADD COLUMN ruleset_version INTEGER
        `.execute(db)
    }
    if (!capabilities.gameDataJson) {
        await sql`
            ALTER TABLE game_scores ADD COLUMN game_data_json TEXT
        `.execute(db)
    }
}

async function createScopedIndexIfDue(
    capabilities: GameScoresContextCapabilities
): Promise<GameScoresContextCapabilities> {
    if (
        !hasCompleteGameScoresContextColumns(capabilities) ||
        capabilities.scopedIndex ||
        Date.now() < nextIndexRetryAt
    ) {
        return capabilities
    }

    try {
        await sql`
            CREATE INDEX IF NOT EXISTS idx_game_scores_scoped_ranking
            ON game_scores (
                game_id,
                mode,
                competition_key,
                score DESC,
                created_at ASC
            )
        `.execute(db)

        indexRetryDelayMs = INDEX_RETRY_MIN_MS
        nextIndexRetryAt = 0
        return { ...capabilities, scopedIndex: true }
    } catch (error) {
        console.warn('[game-score-context] index creation failed:', error)
        nextIndexRetryAt = Date.now() + indexRetryDelayMs
        indexRetryDelayMs = Math.min(
            indexRetryDelayMs * 2,
            INDEX_RETRY_MAX_MS
        )
        return capabilities
    }
}

async function inspectAndMigrate(): Promise<GameScoresContextState> {
    try {
        let capabilities = await inspectCapabilities()
        cachedState = { known: true, capabilities }

        if (!hasCompleteGameScoresContextColumns(capabilities)) {
            await addMissingColumns(capabilities)
            capabilities = await inspectCapabilities()
            cachedState = { known: true, capabilities }
        }

        capabilities = await createScopedIndexIfDue(capabilities)
        cachedState = { known: true, capabilities }
        return cachedState
    } catch (error) {
        console.warn('[game-score-context] capability probe failed:', error)
        return cachedState ?? { known: false }
    }
}

export function ensureGameScoresContextSchema(): Promise<GameScoresContextState> {
    const cachedCapabilities =
        cachedState?.known === true ? cachedState.capabilities : null

    if (
        cachedCapabilities &&
        hasCompleteGameScoresContextColumns(cachedCapabilities) &&
        (cachedCapabilities.scopedIndex || Date.now() < nextIndexRetryAt)
    ) {
        return Promise.resolve(cachedState as GameScoresContextState)
    }

    if (!schemaPromise) {
        schemaPromise = inspectAndMigrate().finally(() => {
            schemaPromise = null
        })
    }

    return schemaPromise
}
```

- [ ] **Step 6: Run focused migration tests**

```bash
bun run test:run \
  src/lib/server/db/game-score-context.migrations.test.ts \
  src/lib/server/db/game-score-context.index-retry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/db/game-score-context.ts \
  src/lib/server/db/game-score-context.migrations.test.ts \
  src/lib/server/db/game-score-context.index-retry.test.ts
git commit -m "feat(scores): add score-context capability guard"
```

---

### Task 3: Add strict contextual validation and client context forwarding

**Files:**
- Modify: `src/lib/server/validations.ts`
- Modify: `src/lib/server/validations.test.ts`
- Modify: `src/lib/services/scoreService.ts`
- Modify: `src/lib/services/scoreService.test.ts`

**Interfaces:**
- Produces: `ScoreSubmissionContext`.
- Produces: omit-only `context` in `scoreSubmissionSchema`.
- Produces: `SaveScoreOptions.context`.
- Contextual requests validate UTF-8 bytes and allowlisted integer metrics before any database call.

- [ ] **Step 1: Add failing validation tests**

Add to `src/lib/server/validations.test.ts`:

```ts
describe('scoreSubmissionSchema context', () => {
    const base = { gameId: GameID.TETRIS, score: 100 }

    it('accepts omitted context and rejects null context', () => {
        expect(scoreSubmissionSchema.safeParse(base).success).toBe(true)
        expect(
            scoreSubmissionSchema.safeParse({ ...base, context: null }).success
        ).toBe(false)
    })

    it('uses fully anchored mode and competition-key patterns', () => {
        const valid = {
            ...base,
            context: {
                mode: 'daily',
                competitionKey: 'ice-slide:daily:2026-08-01:g1:r1',
                rulesetVersion: 1,
            },
        }
        expect(scoreSubmissionSchema.safeParse(valid).success).toBe(true)

        expect(
            scoreSubmissionSchema.safeParse({
                ...valid,
                context: { ...valid.context, mode: 'daily!' },
            }).success
        ).toBe(false)

        expect(
            scoreSubmissionSchema.safeParse({
                ...valid,
                context: {
                    ...valid.context,
                    competitionKey: 'ok#invalid',
                },
            }).success
        ).toBe(false)
    })

    it('accepts oversized legacy gameData but rejects oversized contextual data', () => {
        const gameData = { payload: 'x'.repeat(17 * 1024) }

        expect(
            scoreSubmissionSchema.safeParse({ ...base, gameData }).success
        ).toBe(true)

        expect(
            scoreSubmissionSchema.safeParse({
                ...base,
                gameData,
                context: { mode: 'daily', rulesetVersion: 1 },
            }).success
        ).toBe(false)
    })

    it('measures contextual data in UTF-8 bytes', () => {
        const gameData = { payload: '界'.repeat(6_000) }

        expect(
            scoreSubmissionSchema.safeParse({
                ...base,
                gameData,
                context: { mode: 'daily', rulesetVersion: 1 },
            }).success
        ).toBe(false)
    })

    it.each([
        { elapsedSeconds: 12.5 },
        { elapsedSeconds: -1 },
        { totalMoves: 4.5 },
        { totalMoves: -1 },
    ])('rejects invalid allowlisted metrics: %o', metric => {
        expect(
            scoreSubmissionSchema.safeParse({
                ...base,
                gameData: metric,
                context: { mode: 'daily', rulesetVersion: 1 },
            }).success
        ).toBe(false)
    })

    it('accepts whole-second elapsed time and integer moves', () => {
        expect(
            scoreSubmissionSchema.safeParse({
                ...base,
                gameData: { elapsedSeconds: 12, totalMoves: 34 },
                context: { mode: 'daily', rulesetVersion: 1 },
            }).success
        ).toBe(true)
    })
})
```

- [ ] **Step 2: Add failing client forwarding tests**

Add to `src/lib/services/scoreService.test.ts`:

```ts
it('forwards context through SaveScoreOptions without a new positional argument', async () => {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
    })

    await saveGameScore(
        GameID.TETRIS,
        100,
        undefined,
        undefined,
        { elapsedSeconds: 12, totalMoves: 34 },
        {
            context: {
                mode: 'daily',
                competitionKey: 'ice-slide:daily:2026-08-01:g1:r1',
                rulesetVersion: 1,
            },
        }
    )

    const request = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual({
        gameId: GameID.TETRIS,
        score: 100,
        gameData: { elapsedSeconds: 12, totalMoves: 34 },
        context: {
            mode: 'daily',
            competitionKey: 'ice-slide:daily:2026-08-01:g1:r1',
            rulesetVersion: 1,
        },
    })
})

it('keeps the legacy request body free of a context property', async () => {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
    })

    await saveGameScore(GameID.TETRIS, 100)

    const request = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual({
        gameId: GameID.TETRIS,
        score: 100,
    })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun run test:run \
  src/lib/server/validations.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: FAIL because context and contextual refinements do not exist.

- [ ] **Step 4: Implement the Zod context and contextual refinements**

In `src/lib/server/validations.ts`, add:

```ts
const SCORE_CONTEXT_MAX_GAME_DATA_BYTES = 16 * 1024
const modePattern = /^[a-z][a-z0-9_-]*$/
const competitionKeyPattern = /^[A-Za-z0-9:._-]+$/

export const scoreContextSchema = z
    .object({
        mode: z.string().min(1).max(32).regex(modePattern),
        competitionKey: z
            .string()
            .min(1)
            .max(128)
            .regex(competitionKeyPattern)
            .optional(),
        rulesetVersion: z.number().int().min(1).max(2_147_483_647),
    })
    .strict()

export type ScoreSubmissionContext = z.infer<typeof scoreContextSchema>

function addContextualGameDataIssues(
    data: Record<string, unknown>,
    ctx: z.RefinementCtx
): void {
    for (const key of ['elapsedSeconds', 'totalMoves'] as const) {
        const value = data[key]
        if (
            value !== undefined &&
            (typeof value !== 'number' ||
                !Number.isInteger(value) ||
                value < 0)
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['gameData', key],
                message: `${key} must be a non-negative integer`,
            })
        }
    }

    const serialized = JSON.stringify(data)
    const byteLength = new TextEncoder().encode(serialized).byteLength
    if (byteLength > SCORE_CONTEXT_MAX_GAME_DATA_BYTES) {
        ctx.addIssue({
            code: 'custom',
            path: ['gameData'],
            message: 'Contextual gameData exceeds 16 KiB',
        })
    }
}
```

Replace `scoreSubmissionSchema` with:

```ts
export const scoreSubmissionSchema = z
    .object({
        gameId: z.enum(gameIdValues, {
            message: 'Invalid game ID',
        }),
        score: z
            .number()
            .int()
            .min(0, {
                message: 'Score must be a non-negative integer',
            })
            .max(999_999_999, {
                message: 'Score exceeds maximum allowed value',
            }),
        gameData: z.record(z.string(), z.unknown()).optional(),
        context: scoreContextSchema.optional(),
    })
    .superRefine((data, ctx) => {
        if (data.context && data.gameData) {
            addContextualGameDataIssues(data.gameData, ctx)
        }
    })
```

- [ ] **Step 5: Extend the client contracts without changing positional arguments**

In `src/lib/services/scoreService.ts`, import the context type:

```ts
import type { ScoreSubmissionContext } from '@/lib/server/validations'
```

Extend:

```ts
export interface ScoreData {
    gameId: GameType
    score: number
    gameData?: GameData | Record<string, unknown>
    context?: ScoreSubmissionContext
}

export interface SaveScoreOptions {
    isStale?: () => boolean
    context?: ScoreSubmissionContext
}
```

Change the submit call in `saveGameScore()` to:

```ts
const scoreData: ScoreData = { gameId, score }
if (gameData !== undefined) {
    scoreData.gameData = gameData
}
if (options?.context !== undefined) {
    scoreData.context = options.context
}
const result = await submitScore(scoreData)
```

- [ ] **Step 6: Run focused tests**

```bash
bun run test:run \
  src/lib/server/validations.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/validations.ts \
  src/lib/server/validations.test.ts \
  src/lib/services/scoreService.ts \
  src/lib/services/scoreService.test.ts
git commit -m "feat(scores): validate and forward score context"
```

---

### Task 4: Preserve discriminated write failures through the server and client

**Files:**
- Modify: `src/lib/server/db/queries.ts: saveGameScore, saveGameScoreWithAchievements`
- Modify: `src/lib/server/db/queries.test.ts`
- Modify: `src/lib/server/api-utils.ts`
- Modify: `src/pages/api/scores.ts`
- Modify: `src/pages/api/scores.test.ts`
- Modify: `src/lib/services/scoreService.ts`
- Modify: `src/lib/services/scoreService.test.ts`

**Interfaces:**
- Consumes: `PersistedScoreContext`, `SaveGameScoreResult`, and `SaveGameScoreWithAchievementsResult`.
- Produces: one write path for legacy and contextual inserts.
- Produces: public client code `SCORE_CONTEXT_UNAVAILABLE`.
- Generic DB/stat failures remain `SCORE_WRITE_FAILED` internally and preserve the current generic client message.

- [ ] **Step 1: Write failing query-layer tests**

At the top of `src/lib/server/db/queries.test.ts`, mock the new capability module while retaining its real types/helpers:

```ts
vi.mock('@/lib/server/db/game-score-context', async importOriginal => {
    const actual = await importOriginal<
        typeof import('@/lib/server/db/game-score-context')
    >()
    return {
        ...actual,
        ensureGameScoresContextSchema: vi.fn(),
    }
})
```

Import `ensureGameScoresContextSchema` and `saveGameScoreWithAchievements`.

Add these tests to the existing `saveGameScore` describe block, using its fluent `db.insertInto`, `db.selectFrom`, and `db.updateTable` mocks:

```ts
it('returns SCORE_CONTEXT_UNAVAILABLE and does not insert when columns are unavailable', async () => {
    vi.mocked(ensureGameScoresContextSchema).mockResolvedValue({
        known: true,
        capabilities: {
            mode: true,
            competitionKey: true,
            rulesetVersion: false,
            gameDataJson: true,
            scopedIndex: false,
        },
    })

    const result = await saveGameScore('u1', 'tetris', 100, {
        mode: 'daily',
        competitionKey: 'ice-slide:daily:2026-08-01:g1:r1',
        rulesetVersion: 1,
        gameDataJson: '{"elapsedSeconds":12,"totalMoves":34}',
    })

    expect(result).toEqual({
        success: false,
        code: 'SCORE_CONTEXT_UNAVAILABLE',
    })
    expect(db.insertInto).not.toHaveBeenCalled()
})

it('inserts context and uses the existing stats update chain', async () => {
    vi.mocked(ensureGameScoresContextSchema).mockResolvedValue({
        known: true,
        capabilities: {
            mode: true,
            competitionKey: true,
            rulesetVersion: true,
            gameDataJson: true,
            scopedIndex: true,
        },
    })

    const insert = {
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({}),
    }
    vi.mocked(db.insertInto).mockReturnValue(insert as never)

    const updateSet = vi.fn().mockReturnThis()
    vi.mocked(db.updateTable).mockReturnValue({
        set: updateSet,
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({}),
    } as never)

    const existingStats = {
        id: 1,
        user_id: 'u1',
        total_games_played: 2,
        total_score: 500,
        favorite_game: 'snake',
        streak_days: 0,
        xp: 0,
        level: 1,
        challenge_streak: 0,
        last_challenge_date: null,
        login_streak: 0,
        last_login_reward_date: null,
        total_login_cycles: 0,
        email_notifications: 1,
        push_notifications: 0,
        challenge_reminders: 1,
        created_at: new Date(),
        updated_at: new Date(),
    }

    vi.mocked(db.selectFrom)
        .mockReturnValueOnce({
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(existingStats),
        } as never)
        .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            distinct: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([{ game_id: 'tetris' }]),
        } as never)
        .mockReturnValueOnce({
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(existingStats),
        } as never)
        .mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            distinct: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([{ game_id: 'tetris' }]),
        } as never)

    const result = await saveGameScore('u1', 'tetris', 100, {
        mode: 'daily',
        competitionKey: null,
        rulesetVersion: 1,
        gameDataJson: null,
    })

    expect(result).toEqual({ success: true })
    expect(insert.values).toHaveBeenCalledWith({
        user_id: 'u1',
        game_id: 'tetris',
        score: 100,
        mode: 'daily',
        competition_key: null,
        ruleset_version: 1,
        game_data_json: null,
    })
    expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
            total_score: 600,
            favorite_game: 'tetris',
        })
    )
})

it('preserves capability failure through the achievement wrapper', async () => {
    vi.mocked(ensureGameScoresContextSchema).mockResolvedValue({
        known: false,
    })

    const result = await saveGameScoreWithAchievements(
        'u1',
        'tetris',
        100,
        { elapsedSeconds: 12 },
        {
            mode: 'daily',
            competitionKey: null,
            rulesetVersion: 1,
            gameDataJson: '{"elapsedSeconds":12}',
        }
    )

    expect(result).toEqual({
        success: false,
        newAchievements: [],
        code: 'SCORE_CONTEXT_UNAVAILABLE',
    })
    expect(db.insertInto).not.toHaveBeenCalled()
})
```

Update the existing boolean assertions in this file:
- successful writes expect `{ success: true }`;
- database failures expect `{ success: false, code: 'SCORE_WRITE_FAILED' }`.

- [ ] **Step 2: Write failing route and client tests**

In `src/pages/api/scores.test.ts` add:

```ts
it('returns SCORE_CONTEXT_UNAVAILABLE when contextual storage is unavailable', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
    vi.mocked(getGameById).mockReturnValue(mockGame)
    vi.mocked(saveGameScoreWithAchievements).mockResolvedValue({
        success: false,
        newAchievements: [],
        code: 'SCORE_CONTEXT_UNAVAILABLE',
    })

    const request = new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gameId: 'tetris',
            score: 100,
            context: { mode: 'daily', rulesetVersion: 1 },
        }),
    })

    const response = await POST({ request } as never)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
        error: 'Score context is unavailable',
        code: 'SCORE_CONTEXT_UNAVAILABLE',
    })
})
```

In `src/lib/services/scoreService.test.ts` add:

```ts
it('propagates recognized server error codes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
            Promise.resolve({
                error: 'Score context is unavailable',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            }),
    })

    const result = await submitScore({
        gameId: GameID.TETRIS,
        score: 100,
        context: { mode: 'daily', rulesetVersion: 1 },
    })

    expect(result).toMatchObject({
        success: false,
        code: 'SCORE_CONTEXT_UNAVAILABLE',
    })
})

it('does not invent a server code for network failures', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'))

    const result = await submitScore({
        gameId: GameID.TETRIS,
        score: 100,
    })

    expect(result.success).toBe(false)
    expect(result.code).toBeUndefined()
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun run test:run \
  src/lib/server/db/queries.test.ts \
  src/pages/api/scores.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: FAIL because writes return booleans and error bodies/codes are not propagated.

- [ ] **Step 4: Implement the single discriminated write path**

In `src/lib/server/db/queries.ts`, import:

```ts
import {
    ensureGameScoresContextSchema,
    hasCompleteGameScoresContextColumns,
    type PersistedScoreContext,
    type SaveGameScoreResult,
    type SaveGameScoreWithAchievementsResult,
} from './game-score-context'
```

Replace `saveGameScore()` with:

```ts
export async function saveGameScore(
    userId: string,
    gameId: string,
    score: number,
    context?: PersistedScoreContext
): Promise<SaveGameScoreResult> {
    try {
        if (context) {
            const state = await ensureGameScoresContextSchema()
            if (
                !state.known ||
                !hasCompleteGameScoresContextColumns(state.capabilities)
            ) {
                return {
                    success: false,
                    code: 'SCORE_CONTEXT_UNAVAILABLE',
                }
            }
        }

        const newScore: NewGameScore = {
            user_id: userId,
            game_id: gameId,
            score,
        }

        if (context) {
            newScore.mode = context.mode
            newScore.competition_key = context.competitionKey
            newScore.ruleset_version = context.rulesetVersion
            newScore.game_data_json = context.gameDataJson
        }

        await db.insertInto('game_scores').values(newScore).execute()

        const currentStats = await getUserStats(userId)
        await upsertUserStats(userId, {
            total_games_played:
                (currentStats?.total_games_played || 0) + 1,
            total_score: (currentStats?.total_score || 0) + score,
            favorite_game: gameId,
        })

        return { success: true }
    } catch (error) {
        console.error('[saveGameScore] Database error:', sanitizeError(error))
        return { success: false, code: 'SCORE_WRITE_FAILED' }
    }
}
```

Update `saveGameScoreWithAchievements()` to accept `context?: PersistedScoreContext`, delegate once, and preserve `saveResult.code` before running achievements.

- [ ] **Step 5: Add a coded JSON error helper**

In `src/lib/server/api-utils.ts` add:

```ts
export function codedErrorResponse<C extends string>(
    message: string,
    code: C,
    status: number = 500
): Response {
    return jsonResponse({ error: message, code }, status)
}
```

- [ ] **Step 6: Map validated context in the score route**

In `src/pages/api/scores.ts`:
1. Destructure `context`.
2. Build `PersistedScoreContext` only when context exists.
3. Serialize validated contextual `gameData` once.
4. Pass `gameData` and the normalized context to `saveGameScoreWithAchievements()`.
5. Return the coded response only for `SCORE_CONTEXT_UNAVAILABLE`.

Use:

```ts
const persistedContext: PersistedScoreContext | undefined = context
    ? {
          mode: context.mode,
          competitionKey: context.competitionKey ?? null,
          rulesetVersion: context.rulesetVersion,
          gameDataJson:
              gameData === undefined ? null : JSON.stringify(gameData),
      }
    : undefined

const result = await saveGameScoreWithAchievements(
    session.user.id,
    validatedGameId,
    score,
    gameData,
    persistedContext
)

if (!result.success) {
    if (result.code === 'SCORE_CONTEXT_UNAVAILABLE') {
        return codedErrorResponse(
            'Score context is unavailable',
            'SCORE_CONTEXT_UNAVAILABLE'
        )
    }
    return errorResponse('Failed to save score')
}
```

- [ ] **Step 7: Parse recognized codes in the client**

In `scoreService.ts` add:

```ts
export type ScoreSubmissionPublicErrorCode =
    | 'SCORE_CONTEXT_UNAVAILABLE'
```

Add `code?: ScoreSubmissionPublicErrorCode` to `ScoreSubmissionResult`.

For a non-2xx response, parse JSON defensively even when a test response or proxy does not provide a `json()` method:

```ts
let body: { code?: unknown } | null = null
try {
    body = (await response.json()) as { code?: unknown }
} catch {
    body = null
}

const code =
    body?.code === 'SCORE_CONTEXT_UNAVAILABLE'
        ? body.code
        : undefined
```

Include `code` in the returned failure object. Preserve the existing user-facing 401/400/500 messages.

- [ ] **Step 8: Run focused tests**

```bash
bun run test:run \
  src/lib/server/db/queries.test.ts \
  src/pages/api/scores.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/db/queries.ts \
  src/lib/server/db/queries.test.ts \
  src/lib/server/api-utils.ts \
  src/pages/api/scores.ts \
  src/pages/api/scores.test.ts \
  src/lib/services/scoreService.ts \
  src/lib/services/scoreService.test.ts
git commit -m "feat(scores): propagate contextual write failures"
```

---

### Task 5: Isolate Campaign leaderboards and personal bests safely

**Files:**
- Modify: `src/lib/server/db/queries.ts: getGameLeaderboard, getUserBestScore`
- Modify: `src/lib/server/db/queries.integration.test.ts`
- Create: `src/lib/server/db/queries.score-context-read-failure.test.ts`
- Modify: `src/lib/services/achievementService.test.ts`

**Interfaces:**
- Confirmed complete schema adds `mode IS NULL` and `competition_key IS NULL`.
- Confirmed legacy/incomplete schema uses the existing no-predicate query.
- Unknown capability without a cached snapshot returns `[]` for leaderboard and `null` for personal best.
- `getUserBestScoreByGame` and `getUserBestScoreForGame` remain aliases/wrappers and inherit isolation.

- [ ] **Step 1: Extend the integration fixture to the complete schema**

In `queries.integration.test.ts`, add the four nullable columns to its `game_scores` table and extend `seedScore()` with an optional context object:

```ts
async function seedScore(
    userId: string,
    gameId: string,
    score: number,
    options: {
        createdAt?: string
        mode?: string
        competitionKey?: string
        rulesetVersion?: number
        gameDataJson?: string
    } = {}
): Promise<void> {
    await sql`
        INSERT INTO game_scores (
            user_id,
            game_id,
            score,
            mode,
            competition_key,
            ruleset_version,
            game_data_json,
            created_at
        )
        VALUES (
            ${userId},
            ${gameId},
            ${score},
            ${options.mode ?? null},
            ${options.competitionKey ?? null},
            ${options.rulesetVersion ?? null},
            ${options.gameDataJson ?? null},
            ${options.createdAt ?? new Date().toISOString()}
        )
    `.execute(db)
}
```

- [ ] **Step 2: Write failing isolation tests**

Add integration tests:

```ts
it('keeps scoped rows out of the default raw-attempt leaderboard', async () => {
    await seedUser('u1', 'Player')
    await seedScore('u1', 'tetris', 100)
    await seedScore('u1', 'tetris', 999, {
        mode: 'daily',
        competitionKey: 'daily:1',
        rulesetVersion: 1,
    })

    const result = await getGameLeaderboard('tetris', 10)

    expect(result.map(entry => entry.score)).toEqual([100])
})

it('keeps scoped rows out of every personal-best alias', async () => {
    await seedScore('u1', 'tetris', 100)
    await seedScore('u1', 'tetris', 999, {
        mode: 'daily',
        rulesetVersion: 1,
    })

    await expect(getUserBestScore('u1', 'tetris')).resolves.toBe(100)
    await expect(getUserBestScoreForGame('u1', 'tetris')).resolves.toBe(100)
    await expect(getUserBestScoreByGame('u1', 'tetris')).resolves.toBe(100)
})

it('retains raw-attempt semantics for unscoped rows', async () => {
    await seedUser('u1', 'Player')
    await seedScore('u1', 'tetris', 100)
    await seedScore('u1', 'tetris', 200)

    const result = await getGameLeaderboard('tetris', 10)

    expect(result.map(entry => entry.score)).toEqual([200, 100])
})
```

Add an achievement-service test that mocks `getUserBestScore()` to an unscoped value and verifies progress remains derived from that value even when `earned` is true.

- [ ] **Step 3: Write the unknown-capability fail-closed test**

Create `src/lib/server/db/queries.score-context-read-failure.test.ts`. Mock `game-score-context` to return `{ known: false }`, mock the database query chain, and assert:

```ts
await expect(getGameLeaderboard('tetris', 10)).resolves.toEqual([])
await expect(getUserBestScore('u1', 'tetris')).resolves.toBeNull()
expect(mockSelectFrom).not.toHaveBeenCalled()
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
bun run test:run \
  src/lib/server/db/queries.integration.test.ts \
  src/lib/server/db/queries.score-context-read-failure.test.ts \
  src/lib/services/achievementService.test.ts
```

Expected: scoped scores currently appear in default leaderboard/personal-best results.

- [ ] **Step 5: Implement a shared read-state decision**

In `queries.ts`, add:

```ts
async function getConfirmedScoreContextCapabilities():
    Promise<GameScoresContextCapabilities | undefined> {
    const state = await ensureGameScoresContextSchema()
    if (!state.known) {
        return undefined
    }
    return state.capabilities
}
```

Interpret:
- `undefined`: unknown probe; return the existing defensive result.
- complete columns: add both unscoped predicates.
- known incomplete columns: use the legacy no-predicate query.

In both `getGameLeaderboard()` and `getUserBestScore()`:

```ts
const capabilities = await getConfirmedScoreContextCapabilities()
if (capabilities === undefined) {
    return []
}
```

Use `return null` in `getUserBestScore()`.

After building the existing query, conditionally add:

```ts
if (hasCompleteGameScoresContextColumns(capabilities)) {
    query = query
        .where('game_scores.mode', 'is', null)
        .where('game_scores.competition_key', 'is', null)
}
```

For `getUserBestScore()`, use unqualified column names matching its single-table query.

- [ ] **Step 6: Run focused tests**

```bash
bun run test:run \
  src/lib/server/db/queries.integration.test.ts \
  src/lib/server/db/queries.score-context-read-failure.test.ts \
  src/lib/services/achievementService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/db/queries.ts \
  src/lib/server/db/queries.integration.test.ts \
  src/lib/server/db/queries.score-context-read-failure.test.ts \
  src/lib/services/achievementService.test.ts
git commit -m "feat(scores): isolate unscoped leaderboard and best scores"
```

---

### Task 6: Add the real-LibSQL scoped best-per-user query

**Files:**
- Create: `src/lib/server/db/scoped-leaderboard.ts`
- Create: `src/lib/server/db/scoped-leaderboard.integration.test.ts`
- Modify: `src/lib/server/db/queries.ts` to re-export the scoped query contracts

**Interfaces:**
- Produces: `getScopedGameLeaderboard(query): Promise<ScopedLeaderboardResult>`.
- Produces: internal rows with `userId`.
- Produces: `toPublicScopedLeaderboardEntry(row)` that strips `userId`.
- Failure code is `SCOPED_LEADERBOARD_UNAVAILABLE`.
- Scoped public `rulesetVersion` is non-null.

- [ ] **Step 1: Write the in-memory schema and seed helpers**

Start `src/lib/server/db/scoped-leaderboard.integration.test.ts` with:

```ts
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

import { db } from '@/lib/server/db/client'
import {
    getScopedGameLeaderboard,
    toPublicScopedLeaderboardEntry,
} from './scoped-leaderboard'

interface SeedScoreOptions {
    mode: string
    competitionKey: string | null
    rulesetVersion: number | null
    createdAt?: string
    gameData?: Record<string, unknown>
    rawGameDataJson?: string
}

beforeAll(async () => {
    await sql`
        CREATE TABLE "user" (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT,
            displayName TEXT,
            image TEXT
        )
    `.execute(db)

    await sql`
        CREATE TABLE game_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            mode TEXT,
            competition_key TEXT,
            ruleset_version INTEGER,
            game_data_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE INDEX idx_game_scores_scoped_ranking
        ON game_scores (
            game_id,
            mode,
            competition_key,
            score DESC,
            created_at ASC
        )
    `.execute(db)
})

afterEach(async () => {
    await sql`DELETE FROM game_scores`.execute(db)
    await sql`DELETE FROM "user"`.execute(db)
})

async function seedUser(
    id: string,
    name: string,
    options: {
        username?: string
        displayName?: string
        image?: string
    } = {}
): Promise<void> {
    await sql`
        INSERT INTO "user" (id, name, username, displayName, image)
        VALUES (
            ${id},
            ${name},
            ${options.username ?? null},
            ${options.displayName ?? null},
            ${options.image ?? null}
        )
    `.execute(db)
}

async function seedScopedScore(
    userId: string,
    score: number,
    options: SeedScoreOptions
): Promise<void> {
    const gameDataJson =
        options.rawGameDataJson ??
        (options.gameData === undefined
            ? null
            : JSON.stringify(options.gameData))

    await sql`
        INSERT INTO game_scores (
            user_id,
            game_id,
            score,
            mode,
            competition_key,
            ruleset_version,
            game_data_json,
            created_at
        )
        VALUES (
            ${userId},
            'tetris',
            ${score},
            ${options.mode},
            ${options.competitionKey},
            ${options.rulesetVersion},
            ${gameDataJson},
            ${options.createdAt ?? '2026-08-01T00:00:00Z'}
        )
    `.execute(db)
}
```

The tests deliberately use `tetris` so HPA-484 remains independent of the not-yet-landed Ice Slide runtime.

- [ ] **Step 2: Write failing scope/deduplication tests**

Add:

```ts
it('returns one best row per user for an exact competition key', async () => {
    await seedUser('u1', 'One')
    await seedUser('u2', 'Two')
    await seedScopedScore('u1', 100, {
        mode: 'daily',
        competitionKey: 'daily:1',
        rulesetVersion: 1,
        gameData: { elapsedSeconds: 20, totalMoves: 10 },
    })
    await seedScopedScore('u1', 200, {
        mode: 'daily',
        competitionKey: 'daily:1',
        rulesetVersion: 1,
        gameData: { elapsedSeconds: 30, totalMoves: 20 },
    })
    await seedScopedScore('u2', 150, {
        mode: 'daily',
        competitionKey: 'daily:1',
        rulesetVersion: 1,
        gameData: { elapsedSeconds: 25, totalMoves: 12 },
    })

    const result = await getScopedGameLeaderboard({
        gameId: 'tetris',
        mode: 'daily',
        competitionKey: 'daily:1',
        limit: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.rows.map(row => [row.userId, row.score])).toEqual([
        ['u1', 200],
        ['u2', 150],
    ])
})

it('mode-only ranking spans keys and ruleset versions', async () => {
    await seedUser('u1', 'One')
    await seedScopedScore('u1', 100, {
        mode: 'daily',
        competitionKey: 'daily:1',
        rulesetVersion: 1,
    })
    await seedScopedScore('u1', 200, {
        mode: 'daily',
        competitionKey: 'daily:2',
        rulesetVersion: 2,
    })

    const result = await getScopedGameLeaderboard({
        gameId: 'tetris',
        mode: 'daily',
        limit: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.rows[0].rulesetVersion).toBe(2)
})
```

- [ ] **Step 3: Write every tie-break and malformed-data test**

Add this table-driven best-attempt test. Use `rulesetVersion` only as an observable marker for which stored attempt won; it is not part of the ordering:

```ts
it.each([
    {
        name: 'higher score',
        first: {
            score: 100,
            rulesetVersion: 1,
            elapsedSeconds: 10,
            totalMoves: 10,
            createdAt: '2026-08-01T00:00:00Z',
        },
        second: {
            score: 200,
            rulesetVersion: 2,
            elapsedSeconds: 99,
            totalMoves: 99,
            createdAt: '2026-08-01T00:00:01Z',
        },
        expectedRuleset: 2,
    },
    {
        name: 'lower valid elapsed time',
        first: {
            score: 100,
            rulesetVersion: 1,
            elapsedSeconds: 10,
            totalMoves: 20,
            createdAt: '2026-08-01T00:00:01Z',
        },
        second: {
            score: 100,
            rulesetVersion: 2,
            elapsedSeconds: 20,
            totalMoves: 1,
            createdAt: '2026-08-01T00:00:00Z',
        },
        expectedRuleset: 1,
    },
    {
        name: 'lower valid move count',
        first: {
            score: 100,
            rulesetVersion: 1,
            elapsedSeconds: 10,
            totalMoves: 5,
            createdAt: '2026-08-01T00:00:01Z',
        },
        second: {
            score: 100,
            rulesetVersion: 2,
            elapsedSeconds: 10,
            totalMoves: 9,
            createdAt: '2026-08-01T00:00:00Z',
        },
        expectedRuleset: 1,
    },
    {
        name: 'earlier created_at',
        first: {
            score: 100,
            rulesetVersion: 1,
            elapsedSeconds: 10,
            totalMoves: 5,
            createdAt: '2026-08-01T00:00:00Z',
        },
        second: {
            score: 100,
            rulesetVersion: 2,
            elapsedSeconds: 10,
            totalMoves: 5,
            createdAt: '2026-08-01T00:00:01Z',
        },
        expectedRuleset: 1,
    },
    {
        name: 'lower row id for equal second-resolution timestamps',
        first: {
            score: 100,
            rulesetVersion: 1,
            elapsedSeconds: 10,
            totalMoves: 5,
            createdAt: '2026-08-01T00:00:00Z',
        },
        second: {
            score: 100,
            rulesetVersion: 2,
            elapsedSeconds: 10,
            totalMoves: 5,
            createdAt: '2026-08-01T00:00:00Z',
        },
        expectedRuleset: 1,
    },
])('selects by $name', async ({ first, second, expectedRuleset }) => {
    await seedUser('u1', 'One')
    await seedScopedScore('u1', first.score, {
        mode: 'daily',
        competitionKey: 'daily:tie',
        rulesetVersion: first.rulesetVersion,
        createdAt: first.createdAt,
        gameData: {
            elapsedSeconds: first.elapsedSeconds,
            totalMoves: first.totalMoves,
        },
    })
    await seedScopedScore('u1', second.score, {
        mode: 'daily',
        competitionKey: 'daily:tie',
        rulesetVersion: second.rulesetVersion,
        createdAt: second.createdAt,
        gameData: {
            elapsedSeconds: second.elapsedSeconds,
            totalMoves: second.totalMoves,
        },
    })

    const result = await getScopedGameLeaderboard({
        gameId: 'tetris',
        mode: 'daily',
        competitionKey: 'daily:tie',
        limit: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.rows[0].rulesetVersion).toBe(expectedRuleset)
})
```

Add explicit invalid/missing ordering coverage:

```ts
it('sorts valid metrics before missing, fractional, negative, and malformed values', async () => {
    await seedUser('valid', 'Valid')
    await seedUser('invalid', 'Invalid')
    await seedUser('broken', 'Broken')

    await seedScopedScore('valid', 100, {
        mode: 'daily',
        competitionKey: 'daily:invalid',
        rulesetVersion: 1,
        gameData: { elapsedSeconds: 12, totalMoves: 20 },
    })
    await seedScopedScore('invalid', 100, {
        mode: 'daily',
        competitionKey: 'daily:invalid',
        rulesetVersion: 1,
        rawGameDataJson: '{"elapsedSeconds":12.5,"totalMoves":-1}',
    })
    await seedScopedScore('broken', 100, {
        mode: 'daily',
        competitionKey: 'daily:invalid',
        rulesetVersion: 1,
        rawGameDataJson: '{not-json',
    })

    const result = await getScopedGameLeaderboard({
        gameId: 'tetris',
        mode: 'daily',
        competitionKey: 'daily:invalid',
        limit: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.rows[0].userId).toBe('valid')
    expect(result.rows.slice(1)).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                userId: 'invalid',
                elapsedSeconds: null,
                totalMoves: null,
            }),
            expect.objectContaining({
                userId: 'broken',
                elapsedSeconds: null,
                totalMoves: null,
            }),
        ])
    )
})

it('excludes null-version rows and does not project unknown JSON keys', async () => {
    await seedUser('u1', 'One')
    await seedUser('u2', 'Two')
    await seedScopedScore('u1', 100, {
        mode: 'daily',
        competitionKey: 'daily:version',
        rulesetVersion: null,
        gameData: { elapsedSeconds: 1, combo: 99 },
    })
    await seedScopedScore('u2', 90, {
        mode: 'daily',
        competitionKey: 'daily:version',
        rulesetVersion: 1,
        gameData: { elapsedSeconds: 2, combo: 100 },
    })

    const result = await getScopedGameLeaderboard({
        gameId: 'tetris',
        mode: 'daily',
        competitionKey: 'daily:version',
        limit: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.rows.map(row => row.userId)).toEqual(['u2'])
    expect(result.rows[0]).not.toHaveProperty('combo')
})
```

Define the seed helper options so `rulesetVersion` accepts `number | null` and `rawGameDataJson` bypasses normal JSON serialization only for historical-corruption fixtures.

- [ ] **Step 4: Write the high-attempt/limit test**

Seed at least 100 users and three attempts per user:

```ts
it('applies limit after best-per-user partitioning', async () => {
    for (let user = 0; user < 100; user += 1) {
        const userId = `u-${user}`
        await seedUser(userId, `Player ${user}`)
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await seedScopedScore(userId, user * 10 + attempt, {
                mode: 'daily',
                competitionKey: 'daily:bulk',
                rulesetVersion: 1,
                gameData: {
                    elapsedSeconds: 100 - attempt,
                    totalMoves: 50 - attempt,
                },
            })
        }
    }

    const result = await getScopedGameLeaderboard({
        gameId: 'tetris',
        mode: 'daily',
        competitionKey: 'daily:bulk',
        limit: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.rows).toHaveLength(10)
    expect(new Set(result.rows.map(row => row.userId)).size).toBe(10)
    expect(result.rows[0].score).toBe(992)
})
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
bun run test:run src/lib/server/db/scoped-leaderboard.integration.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement the scoped query contracts**

Create `src/lib/server/db/scoped-leaderboard.ts`:

```ts
import { sql } from 'kysely'
import { db } from './client'
import {
    ensureGameScoresContextSchema,
    hasCompleteGameScoresContextColumns,
} from './game-score-context'

export interface ScopedLeaderboardQuery {
    gameId: string
    mode: string
    competitionKey?: string
    limit?: number
}

export interface ScopedLeaderboardRow {
    userId: string
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

export type ScopedLeaderboardEntry = Omit<
    ScopedLeaderboardRow,
    'userId'
>

export type ScopedLeaderboardResult =
    | { success: true; rows: ScopedLeaderboardRow[] }
    | {
          success: false
          code: 'SCOPED_LEADERBOARD_UNAVAILABLE'
      }

export function toPublicScopedLeaderboardEntry(
    row: ScopedLeaderboardRow
): ScopedLeaderboardEntry {
    const { userId: _userId, ...entry } = row
    return entry
}
```

- [ ] **Step 7: Implement staged JSON normalization and window ranking**

Add the raw row type and complete function in `scoped-leaderboard.ts`:

```ts
interface RawScopedLeaderboardRow {
    user_id: string
    name: string | null
    username: string | null
    image: string | null
    score: number
    created_at: string | Date
    mode: string
    competition_key: string | null
    ruleset_version: number
    elapsed_seconds: number | null
    total_moves: number | null
}

export async function getScopedGameLeaderboard(
    query: ScopedLeaderboardQuery
): Promise<ScopedLeaderboardResult> {
    const state = await ensureGameScoresContextSchema()
    if (
        !state.known ||
        !hasCompleteGameScoresContextColumns(state.capabilities)
    ) {
        return {
            success: false,
            code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
        }
    }

    const competitionFilter =
        query.competitionKey === undefined
            ? sql``
            : sql`AND gs.competition_key = ${query.competitionKey}`
    const limit = query.limit ?? 10

    try {
        const result = await sql<RawScopedLeaderboardRow>`
            WITH scoped AS (
                SELECT
                    gs.id,
                    gs.user_id,
                    gs.score,
                    gs.created_at,
                    gs.mode,
                    gs.competition_key,
                    gs.ruleset_version,
                    CASE
                        WHEN json_valid(gs.game_data_json) = 1
                        THEN gs.game_data_json
                        ELSE NULL
                    END AS valid_json
                FROM game_scores AS gs
                WHERE gs.game_id = ${query.gameId}
                  AND gs.mode = ${query.mode}
                  AND gs.ruleset_version IS NOT NULL
                  ${competitionFilter}
            ),
            metrics AS (
                SELECT
                    *,
                    CASE
                        WHEN json_type(
                            valid_json,
                            '$.elapsedSeconds'
                        ) = 'integer'
                         AND json_extract(
                            valid_json,
                            '$.elapsedSeconds'
                         ) >= 0
                        THEN CAST(
                            json_extract(
                                valid_json,
                                '$.elapsedSeconds'
                            ) AS INTEGER
                        )
                        ELSE NULL
                    END AS elapsed_seconds,
                    CASE
                        WHEN json_type(
                            valid_json,
                            '$.totalMoves'
                        ) = 'integer'
                         AND json_extract(
                            valid_json,
                            '$.totalMoves'
                         ) >= 0
                        THEN CAST(
                            json_extract(
                                valid_json,
                                '$.totalMoves'
                            ) AS INTEGER
                        )
                        ELSE NULL
                    END AS total_moves
                FROM scoped
            ),
            ranked AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY
                            score DESC,
                            CASE
                                WHEN elapsed_seconds IS NULL
                                THEN 1
                                ELSE 0
                            END ASC,
                            elapsed_seconds ASC,
                            CASE
                                WHEN total_moves IS NULL
                                THEN 1
                                ELSE 0
                            END ASC,
                            total_moves ASC,
                            created_at ASC,
                            id ASC
                    ) AS user_attempt_rank
                FROM metrics
            ),
            best AS (
                SELECT *
                FROM ranked
                WHERE user_attempt_rank = 1
            )
            SELECT
                best.user_id AS user_id,
                COALESCE(
                    "user".displayName,
                    "user".username,
                    "user".name,
                    'Anonymous'
                ) AS name,
                "user".username AS username,
                "user".image AS image,
                best.score AS score,
                best.created_at AS created_at,
                best.mode AS mode,
                best.competition_key AS competition_key,
                best.ruleset_version AS ruleset_version,
                best.elapsed_seconds AS elapsed_seconds,
                best.total_moves AS total_moves
            FROM best
            LEFT JOIN "user" ON "user".id = best.user_id
            ORDER BY
                best.score DESC,
                CASE
                    WHEN best.elapsed_seconds IS NULL
                    THEN 1
                    ELSE 0
                END ASC,
                best.elapsed_seconds ASC,
                CASE
                    WHEN best.total_moves IS NULL
                    THEN 1
                    ELSE 0
                END ASC,
                best.total_moves ASC,
                best.created_at ASC,
                best.id ASC
            LIMIT ${limit}
        `.execute(db)

        return {
            success: true,
            rows: result.rows.map(row => ({
                userId: row.user_id,
                name: row.name ?? 'Anonymous',
                username: row.username ?? null,
                image: row.image ?? null,
                score: Number(row.score),
                created_at: new Date(row.created_at).toISOString(),
                mode: row.mode,
                competitionKey: row.competition_key ?? null,
                rulesetVersion: Number(row.ruleset_version),
                elapsedSeconds:
                    row.elapsed_seconds === null
                        ? null
                        : Number(row.elapsed_seconds),
                totalMoves:
                    row.total_moves === null
                        ? null
                        : Number(row.total_moves),
            })),
        }
    } catch (error) {
        console.error(
            '[getScopedGameLeaderboard] Database error:',
            error instanceof Error ? error.message : String(error)
        )
        return {
            success: false,
            code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
        }
    }
}
```

Do not add a `ruleset_version = value` predicate to the mode-only branch. The only ruleset condition is `IS NOT NULL`.

- [ ] **Step 8: Re-export from the existing query surface**

At the end of `queries.ts` add:

```ts
export {
    getScopedGameLeaderboard,
    toPublicScopedLeaderboardEntry,
} from './scoped-leaderboard'

export type {
    ScopedLeaderboardEntry,
    ScopedLeaderboardQuery,
    ScopedLeaderboardResult,
    ScopedLeaderboardRow,
} from './scoped-leaderboard'
```

- [ ] **Step 9: Run focused tests**

```bash
bun run test:run src/lib/server/db/scoped-leaderboard.integration.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/db/scoped-leaderboard.ts \
  src/lib/server/db/scoped-leaderboard.integration.test.ts \
  src/lib/server/db/queries.ts
git commit -m "feat(scores): add scoped best-per-user leaderboard query"
```

---

### Task 7: Expose validated scoped leaderboard API forms

**Files:**
- Modify: `src/lib/server/validations.ts`
- Modify: `src/lib/server/validations.test.ts`
- Modify: `src/pages/api/leaderboard.ts`
- Modify: `src/pages/api/leaderboard.test.ts`

**Interfaces:**
- Produces one schema for all-games, single-game, mode-only scoped, and exact-key scoped forms.
- Scoped output uses the existing `{ gameId, gameName, leaderboard }` wrapper and additive entry fields.
- Scoped API adds `rank` after the database has selected one row per user.

- [ ] **Step 1: Write failing leaderboard-query validation tests**

Add:

```ts
describe('leaderboardQuerySchema', () => {
    it('accepts the all-games form', () => {
        expect(leaderboardQuerySchema.parse({})).toEqual({ limit: 10 })
    })

    it('accepts game-only, mode-only scoped, and exact-key forms', () => {
        expect(
            leaderboardQuerySchema.safeParse({
                gameId: GameID.TETRIS,
                mode: 'daily',
            }).success
        ).toBe(true)

        expect(
            leaderboardQuerySchema.safeParse({
                gameId: GameID.TETRIS,
                mode: 'daily',
                competitionKey: 'daily:1',
            }).success
        ).toBe(true)
    })

    it.each([
        { mode: 'daily' },
        { competitionKey: 'daily:1' },
        { gameId: GameID.TETRIS, competitionKey: 'daily:1' },
    ])('rejects invalid cross-field combinations: %o', params => {
        expect(leaderboardQuerySchema.safeParse(params).success).toBe(false)
    })
})
```

- [ ] **Step 2: Write failing API tests**

Extend the query mock:

```ts
vi.mock('@/lib/server/db/queries', () => ({
    getGameLeaderboard: vi.fn(),
    getScopedGameLeaderboard: vi.fn(),
    toPublicScopedLeaderboardEntry: vi.fn(
        ({ userId: _userId, ...entry }) => entry
    ),
}))
```

Import all three functions and add:

```ts
it('returns a mode-only scoped best-per-user leaderboard', async () => {
    vi.mocked(getScopedGameLeaderboard).mockResolvedValue({
        success: true,
        rows: [
            {
                userId: 'u1',
                name: 'Player',
                username: 'player',
                image: null,
                score: 500,
                created_at: '2026-08-01T00:00:00.000Z',
                mode: 'daily',
                competitionKey: null,
                rulesetVersion: 2,
                elapsedSeconds: 12,
                totalMoves: 34,
            },
        ],
    })

    const response = await GET({
        url: new URL(
            'http://localhost/api/leaderboard?gameId=tetris&mode=daily'
        ),
    } as never)

    expect(response.status).toBe(200)
    expect(getScopedGameLeaderboard).toHaveBeenCalledWith({
        gameId: 'tetris',
        mode: 'daily',
        competitionKey: undefined,
        limit: 10,
    })

    const body = await response.json()
    expect(body.leaderboard).toEqual([
        {
            rank: 1,
            name: 'Player',
            username: 'player',
            image: null,
            score: 500,
            created_at: '2026-08-01T00:00:00.000Z',
            mode: 'daily',
            competitionKey: null,
            rulesetVersion: 2,
            elapsedSeconds: 12,
            totalMoves: 34,
        },
    ])
    expect(body.leaderboard[0]).not.toHaveProperty('userId')
})

it('forwards an exact competition key', async () => {
    vi.mocked(getScopedGameLeaderboard).mockResolvedValue({
        success: true,
        rows: [],
    })

    await GET({
        url: new URL(
            'http://localhost/api/leaderboard' +
                '?gameId=tetris&mode=daily&competitionKey=daily%3A1'
        ),
    } as never)

    expect(getScopedGameLeaderboard).toHaveBeenCalledWith({
        gameId: 'tetris',
        mode: 'daily',
        competitionKey: 'daily:1',
        limit: 10,
    })
})

it.each([
    'http://localhost/api/leaderboard?mode=daily',
    'http://localhost/api/leaderboard?competitionKey=daily%3A1',
    'http://localhost/api/leaderboard?gameId=tetris&competitionKey=daily%3A1',
])('rejects invalid scoped parameter combinations: %s', async url => {
    const response = await GET({ url: new URL(url) } as never)
    expect(response.status).toBe(400)
    expect(getScopedGameLeaderboard).not.toHaveBeenCalled()
})

it('returns a stable scoped-unavailable code', async () => {
    vi.mocked(getScopedGameLeaderboard).mockResolvedValue({
        success: false,
        code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
    })

    const response = await GET({
        url: new URL(
            'http://localhost/api/leaderboard?gameId=tetris&mode=daily'
        ),
    } as never)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
        error: 'Scoped leaderboard is unavailable',
        code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
    })
})
```

Keep the existing all-games and game-only tests unchanged except for using the unified validation error messages. Add one assertion that two unscoped rows from the same user remain two response entries.

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun run test:run \
  src/lib/server/validations.test.ts \
  src/pages/api/leaderboard.test.ts
```

Expected: FAIL because the schema requires `gameId` and the route has no scoped branch.

- [ ] **Step 4: Replace `leaderboardQuerySchema`**

Use:

```ts
export const leaderboardQuerySchema = z
    .object({
        gameId: z.enum(gameIdValues).optional(),
        limit: z
            .string()
            .transform(value => Number.parseInt(value, 10))
            .pipe(z.number().int().min(1).max(100))
            .optional()
            .default(10),
        mode: z
            .string()
            .min(1)
            .max(32)
            .regex(modePattern)
            .optional(),
        competitionKey: z
            .string()
            .min(1)
            .max(128)
            .regex(competitionKeyPattern)
            .optional(),
    })
    .superRefine((data, ctx) => {
        if (data.mode && !data.gameId) {
            ctx.addIssue({
                code: 'custom',
                path: ['mode'],
                message: 'mode requires gameId',
            })
        }

        if (
            data.competitionKey &&
            (!data.gameId || !data.mode)
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['competitionKey'],
                message: 'competitionKey requires gameId and mode',
            })
        }
    })
```

- [ ] **Step 5: Replace manual route parsing with `validateQuery()`**

In `leaderboard.ts`:
1. Validate once.
2. Preserve the existing all-games branch when `gameId` is absent.
3. Preserve the existing unscoped branch when `mode` is absent.
4. Call the scoped query when `mode` is present.
5. Map internal rows to public entries, then add ranks.
6. Return the coded error on a scoped failure.

The scoped branch must use:

```ts
const scoped = await getScopedGameLeaderboard({
    gameId,
    mode,
    competitionKey,
    limit,
})

if (!scoped.success) {
    return codedErrorResponse(
        'Scoped leaderboard is unavailable',
        'SCOPED_LEADERBOARD_UNAVAILABLE'
    )
}

const leaderboard = scoped.rows.map((row, index) => ({
    rank: index + 1,
    ...toPublicScopedLeaderboardEntry(row),
}))
```

- [ ] **Step 6: Run focused tests**

```bash
bun run test:run \
  src/lib/server/validations.test.ts \
  src/pages/api/leaderboard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/validations.ts \
  src/lib/server/validations.test.ts \
  src/pages/api/leaderboard.ts \
  src/pages/api/leaderboard.test.ts
git commit -m "feat(scores): expose validated scoped leaderboards"
```

---

### Task 8: Prove activity, achievements, and public DTO compatibility

**Files:**
- Modify: `src/lib/server/db/queries.integration.test.ts`
- Modify: `src/pages/api/scores/history.test.ts`
- Modify: `src/pages/api/scores.test.ts`
- Modify: `src/lib/services/achievementService.test.ts`

**Interfaces:**
- No new production interface.
- This task closes regression coverage for the intentional semantic split.

- [ ] **Step 1: Add contextual write side-effect coverage**

Import `saveGameScore`, `getUserGameHistory`, `getUserDailyActivity`, `getGamesPlayedCountToday`, `getUniqueGamesPlayedToday`, and `getTotalScoreToday` into `queries.integration.test.ts`.

Add:

```ts
it('persists scoped context while retaining platform activity side effects', async () => {
    await seedUser('scoped-user', 'Scoped Player')
    await seedUserStats('scoped-user')

    const result = await saveGameScore('scoped-user', 'tetris', 500, {
        mode: 'daily',
        competitionKey: 'daily:activity',
        rulesetVersion: 1,
        gameDataJson: JSON.stringify({
            elapsedSeconds: 12,
            totalMoves: 34,
        }),
    })
    expect(result).toEqual({ success: true })

    const scoreRows = await sql<{
        mode: string | null
        competition_key: string | null
        ruleset_version: number | null
        game_data_json: string | null
    }>`
        SELECT
            mode,
            competition_key,
            ruleset_version,
            game_data_json
        FROM game_scores
        WHERE user_id = 'scoped-user'
    `.execute(db)
    expect(scoreRows.rows).toEqual([
        {
            mode: 'daily',
            competition_key: 'daily:activity',
            ruleset_version: 1,
            game_data_json:
                '{"elapsedSeconds":12,"totalMoves":34}',
        },
    ])

    const stats = await sql<{
        total_games_played: number
        total_score: number
        favorite_game: string | null
    }>`
        SELECT total_games_played, total_score, favorite_game
        FROM user_stats
        WHERE user_id = 'scoped-user'
    `.execute(db)
    expect(stats.rows[0]).toEqual({
        total_games_played: 1,
        total_score: 500,
        favorite_game: 'tetris',
    })

    const history = await getUserGameHistory('scoped-user', 10)
    expect(history).toHaveLength(1)
    expect(Object.keys(history[0]).sort()).toEqual([
        'created_at',
        'game_id',
        'game_name',
        'score',
    ])

    expect(await getGamesPlayedCountToday('scoped-user')).toBe(1)
    expect(await getUniqueGamesPlayedToday('scoped-user')).toBe(1)
    expect(await getTotalScoreToday('scoped-user')).toBe(500)

    const activity = await getUserDailyActivity(
        'scoped-user',
        new Date().getUTCFullYear()
    )
    expect(activity.reduce((sum, day) => sum + day.count, 0)).toBe(1)
})
```

Use the test process's current UTC year because the inserted score uses `CURRENT_TIMESTAMP`.

- [ ] **Step 2: Add achievement awarding/progress asymmetry coverage**

Add to `achievementService.test.ts`:

```ts
it('treats earned as authoritative when scoped awarding exceeds unscoped progress', async () => {
    const achievement: Achievement = {
        id: 'tetris_master',
        name: 'Tetris Master',
        description: 'Score 1000 points in Tetris',
        logo: '👑',
        gameId: GameID.TETRIS,
        condition: {
            type: 'score_threshold',
            threshold: 1000,
        },
        rarity: AchievementRarity.EPIC,
    }

    mockGetAchievementsByGame.mockReturnValue([achievement])
    mockHasUserEarnedAchievement
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
    mockAwardAchievement.mockResolvedValue(true)
    mockGetUserBestScore.mockResolvedValue(250)

    await expect(
        checkAndAwardAchievements('user123', GameID.TETRIS, 1200)
    ).resolves.toEqual(['tetris_master'])

    const progress = await getUserGameAchievementProgress(
        'user123',
        GameID.TETRIS
    )

    expect(progress).toEqual([
        {
            achievement,
            earned: true,
            progress: 25,
        },
    ])
})
```

This test does not label the award as Campaign or Daily; it proves the shared service uses submitted score for awarding and the unscoped best-score query for progress.

- [ ] **Step 3: Add public history leakage tests**

In `history.test.ts`, make the mocked database result intentionally include internal fields:

```ts
vi.mocked(getUserGameHistory).mockResolvedValue([
    {
        game_id: 'tetris',
        game_name: 'Tetris Challenge',
        score: 100,
        created_at: '2026-08-01T00:00:00.000Z',
    },
])
```

Then assert the response entry has exactly these keys:

```ts
expect(Object.keys(result.history[0]).sort()).toEqual([
    'created_at',
    'game_id',
    'game_name',
    'score',
])
```

Also add a real-query assertion in `queries.integration.test.ts` that `getUserGameHistory()` omits `mode`, `competition_key`, `ruleset_version`, and `game_data_json`.

- [ ] **Step 4: Add route sequencing coverage**

Add to `scores.test.ts`:

```ts
it('normalizes context and updates challenges after a successful contextual save', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
    vi.mocked(getGameById).mockReturnValue(mockGame)
    vi.mocked(saveGameScoreWithAchievements).mockResolvedValue({
        success: true,
        newAchievements: [],
    })
    vi.mocked(updateChallengeProgress).mockResolvedValue({
        completedChallenges: [],
        xpEarned: 0,
        levelUp: false,
    })

    const request = new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gameId: 'tetris',
            score: 500,
            gameData: {
                elapsedSeconds: 12,
                totalMoves: 34,
            },
            context: {
                mode: 'daily',
                competitionKey: 'daily:route',
                rulesetVersion: 1,
            },
        }),
    })

    const response = await POST({ request } as never)
    expect(response.status).toBe(200)

    expect(saveGameScoreWithAchievements).toHaveBeenCalledWith(
        'user-123',
        'tetris',
        500,
        {
            elapsedSeconds: 12,
            totalMoves: 34,
        },
        {
            mode: 'daily',
            competitionKey: 'daily:route',
            rulesetVersion: 1,
            gameDataJson:
                '{"elapsedSeconds":12,"totalMoves":34}',
        }
    )
    expect(updateChallengeProgress).toHaveBeenCalledWith(
        'user-123',
        'tetris',
        500
    )
    expect(
        vi.mocked(saveGameScoreWithAchievements).mock.invocationCallOrder[0]
    ).toBeLessThan(
        vi.mocked(updateChallengeProgress).mock.invocationCallOrder[0]
    )
})

it('does not update challenges after contextual capability failure', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
    vi.mocked(getGameById).mockReturnValue(mockGame)
    vi.mocked(saveGameScoreWithAchievements).mockResolvedValue({
        success: false,
        newAchievements: [],
        code: 'SCORE_CONTEXT_UNAVAILABLE',
    })

    const request = new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gameId: 'tetris',
            score: 500,
            context: {
                mode: 'daily',
                rulesetVersion: 1,
            },
        }),
    })

    const response = await POST({ request } as never)

    expect(response.status).toBe(500)
    expect(updateChallengeProgress).not.toHaveBeenCalled()
})
```

Retain the existing legacy success test and its challenge best-effort behavior.

- [ ] **Step 5: Run the semantic regression suite**

```bash
bun run test:run \
  src/lib/server/db/queries.integration.test.ts \
  src/lib/services/achievementService.test.ts \
  src/pages/api/scores.test.ts \
  src/pages/api/scores/history.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/queries.integration.test.ts \
  src/lib/services/achievementService.test.ts \
  src/pages/api/scores.test.ts \
  src/pages/api/scores/history.test.ts
git commit -m "test(scores): lock scoped compatibility boundaries"
```

---

### Task 9: Run full verification and update tracking

**Files:**
- Modify only if verification reveals an actual defect.
- Update PR description/checklist and HPA-484 after all commands pass.

**Interfaces:**
- Produces verified implementation evidence.
- Does not change the approved public contract.

- [ ] **Step 1: Run all score-focused tests together**

```bash
bun run test:run \
  src/lib/server/db/game-score-schema-files.test.ts \
  src/lib/server/db/game-score-context.migrations.test.ts \
  src/lib/server/db/game-score-context.index-retry.test.ts \
  src/lib/server/db/queries.test.ts \
  src/lib/server/db/queries.integration.test.ts \
  src/lib/server/db/queries.score-context-read-failure.test.ts \
  src/lib/server/db/scoped-leaderboard.integration.test.ts \
  src/lib/server/validations.test.ts \
  src/lib/services/scoreService.test.ts \
  src/lib/services/achievementService.test.ts \
  src/pages/api/scores.test.ts \
  src/pages/api/leaderboard.test.ts \
  src/pages/api/scores/history.test.ts \
  src/pages/api/scores/best.test.ts
```

Expected: zero failing tests.

- [ ] **Step 2: Run the full unit/integration suite**

```bash
bun run test:run
```

Expected: exit `0`.

- [ ] **Step 3: Run static verification**

```bash
bun run lint
bun run typecheck
bun run format:check
bun run build
```

Expected:
- `bun run lint`, `bun run format:check`, and `bun run build` must each exit `0`.
- `bun run typecheck` has three known pre-existing errors in `src/lib/games/ice-slide/*` that are unrelated to this work and predate this branch:
  1. `src/lib/games/ice-slide/game.crystal-farm.test.ts:3:1` — `Cannot find name 'vi'` (missing Vitest import).
  2. `src/lib/games/ice-slide/init.test.ts:36:64` — `A spread argument must either have a tuple type or be passed to a rest parameter`.
  3. `src/lib/games/ice-slide/init.ts:178:21` — `The left-hand side of an 'instanceof' expression must be of type 'any', an object type or a type parameter`.
- This work must introduce **no additional** typecheck errors beyond those three baseline failures. Either leave the three baseline failures in place (they are out of scope) or fix them within this scope, but do not add new ones. Record the exact `bun run typecheck` error count before and after the work to confirm the delta is zero.

- [ ] **Step 4: Inspect the final diff**

```bash
git status --short
git diff --check
git diff --stat main...HEAD
```

Expected:
- no uncommitted files;
- no whitespace errors;
- only HPA-484 implementation, tests, and approved documentation changes.

- [ ] **Step 5: Perform the spec-coverage checklist**

Confirm each statement with a test name or diff location:
- both bootstrap schemas;
- non-destructive migration;
- bounded index retry;
- omit-only context;
- legacy payload compatibility;
- discriminated failure propagation;
- same write/stat/achievement/challenge path;
- unscoped leaderboard and best-score isolation;
- scoped exact-key and mode-only behavior;
- every tie-break;
- integer producer contract and fractional historical normalization;
- high-attempt limit after partition;
- public ID/JSON/history isolation;
- explicit scoped unavailable response.

- [ ] **Step 6: Stop on any verification failure**

When any command in Steps 1–5 fails, record the failing command and assertion, return to the task that owns that behavior, add a failing regression test there, and repeat that task's red/green cycle. Do not publish or claim completion while any verification command is failing.

- [ ] **Step 7: Publish the implementation PR**

Push the implementation branch and open a draft PR against `main`. Include:
- HPA-484;
- link to the design and this plan;
- task-by-task commit summary;
- exact verification commands and results;
- explicit statement that HPA-487/HPA-488 UI/semantic admission remain out of scope.

- [ ] **Step 8: Update Linear**

Add the implementation PR link to HPA-484 and post:
- branch and head commit;
- verification results;
- any deliberate deviations from this plan;
- remaining blockers for HPA-487/HPA-488.

## Plan Self-Review

- **Spec coverage:** Tasks 1–8 cover every acceptance criterion in the approved design; Task 9 verifies them together.
- **Placeholder scan:** No unresolved markers, deferred implementation instructions, or unspecified test steps remain.
- **Type consistency:** `ScoreSubmissionContext`, `PersistedScoreContext`, `SaveGameScoreResult`, `ScopedLeaderboardRow`, and the two public error codes use the same names across producer, route, query, tests, and client.
- **Scope:** The plan adds no Ice Slide runtime, semantic admission, UI, arbitrary metric engine, second mode-only index, anti-cheat, or transaction redesign.
