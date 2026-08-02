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

describe('ensureGameScoresContextSchema - concurrent migrator', () => {
    it('tolerates another process adding a column between inspection and ALTER', async () => {
        const executor = db.getExecutor()
        const originalExecute = executor.executeQuery.bind(executor)

        let injectedConcurrentAdd = false
        executor.executeQuery = vi.fn(async (query: any) => {
            const sqlText: string = query.sql ?? ''

            // Intercept the first ALTER for `mode` and simulate a second
            // Vercel instance adding the column just before our ALTER runs.
            // Our ALTER will then fail with "duplicate column name"; the
            // migrator must re-inspect, see the column exists, and continue.
            if (
                !injectedConcurrentAdd &&
                /add\s+column\s+"?mode"?/i.test(sqlText)
            ) {
                injectedConcurrentAdd = true
                await sql`ALTER TABLE game_scores ADD COLUMN mode TEXT`.execute(
                    db
                )
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
            mode: string | null
        }>`SELECT score, mode FROM game_scores`.execute(db)
        expect(rows.rows).toEqual([{ score: 123, mode: null }])

        expect(injectedConcurrentAdd).toBe(true)
    })
})
