import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

// Each case targets one column whose capability name differs from (or matches)
// its SQL column name. The concurrent-migrator recovery path must re-inspect
// the schema after a "duplicate column name" failure and match the actual SQL
// column name, not the camelCase capability key.
const CASES = [
    {
        capability: 'mode' as const,
        column: 'mode',
        alterSql: 'ALTER TABLE game_scores ADD COLUMN mode TEXT',
        alterRegex: /add\s+column\s+"?mode"?/i,
    },
    {
        capability: 'competitionKey' as const,
        column: 'competition_key',
        alterSql: 'ALTER TABLE game_scores ADD COLUMN competition_key TEXT',
        alterRegex: /add\s+column\s+"?competition_key"?/i,
    },
    {
        capability: 'rulesetVersion' as const,
        column: 'ruleset_version',
        alterSql: 'ALTER TABLE game_scores ADD COLUMN ruleset_version INTEGER',
        alterRegex: /add\s+column\s+"?ruleset_version"?/i,
    },
    {
        capability: 'gameDataJson' as const,
        column: 'game_data_json',
        alterSql: 'ALTER TABLE game_scores ADD COLUMN game_data_json TEXT',
        alterRegex: /add\s+column\s+"?game_data_json"?/i,
    },
]

beforeEach(async () => {
    // Reset the module registry so each case gets a fresh in-memory DB and a
    // fresh game-score-context module (whose module-level cachedState would
    // otherwise short-circuit migration after the first case completes).
    vi.resetModules()
})

describe.each(CASES)(
    'ensureGameScoresContextSchema - concurrent migrator ($capability)',
    ({ capability, column, alterSql, alterRegex }) => {
        it(`tolerates another process adding ${column} between inspection and ALTER`, async () => {
            const { sql } = await import('kysely')
            const { db } = await import('@/lib/server/db/client')
            const { ensureGameScoresContextSchema } = await import(
                './game-score-context'
            )

            await sql`DROP TABLE IF EXISTS game_scores`.execute(db)
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

            const executor = db.getExecutor()
            const originalExecute = executor.executeQuery.bind(executor)

            let injectedConcurrentAdd = false
            executor.executeQuery = vi.fn(async (query: any) => {
                const sqlText: string = query.sql ?? ''

                // Intercept the first ALTER for the target column and
                // simulate a second Vercel instance adding it just before
                // our ALTER runs. Our ALTER will then fail with "duplicate
                // column name"; the migrator must re-inspect, see the
                // column exists, and continue.
                if (!injectedConcurrentAdd && alterRegex.test(sqlText)) {
                    injectedConcurrentAdd = true
                    await sql.raw(alterSql).execute(db)
                }

                return originalExecute(query)
            }) as typeof executor.executeQuery

            const state = await ensureGameScoresContextSchema()

            expect(state.known).toBe(true)
            if (!state.known) {
                throw new Error('expected known state')
            }
            expect(state.capabilities.mode).toBe(true)
            expect(state.capabilities.competitionKey).toBe(true)
            expect(state.capabilities.rulesetVersion).toBe(true)
            expect(state.capabilities.gameDataJson).toBe(true)

            const columns = await sql<{
                name: string
            }>`PRAGMA table_info(game_scores)`.execute(db)
            expect(columns.rows.map(row => row.name)).toEqual(
                expect.arrayContaining([
                    'mode',
                    'competition_key',
                    'ruleset_version',
                    'game_data_json',
                ])
            )

            // The row written before migration must be preserved, with the
            // concurrently-added column defaulting to null.
            const rows = await sql<{
                score: number
            }>`SELECT score, ${sql.raw(column)} AS col FROM game_scores`.execute(
                db
            )
            expect(rows.rows).toHaveLength(1)
            expect(rows.rows[0].score).toBe(123)
            expect((rows.rows[0] as Record<string, unknown>).col).toBeNull()

            expect(injectedConcurrentAdd).toBe(true)
            expect(state.capabilities[capability]).toBe(true)
        })
    }
)
