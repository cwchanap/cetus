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
        const executeSpy = vi.spyOn(db.getExecutor(), 'executeQuery')

        const states = await Promise.all([
            ensureGameScoresContextSchema(),
            ensureGameScoresContextSchema(),
            ensureGameScoresContextSchema(),
        ])

        expect(states.every(state => state.known)).toBe(true)
        const state = states[0]
        if (!state.known) {
            throw new Error('expected known state')
        }

        expect(hasCompleteGameScoresContextColumns(state.capabilities)).toBe(
            true
        )
        expect(state.capabilities.scopedIndex).toBe(true)
        expect(getCachedGameScoresContextState()).toEqual(state)

        const tableInfoCalls = executeSpy.mock.calls.filter(([query]) =>
            query.sql.includes('PRAGMA table_info(game_scores)')
        )
        expect(tableInfoCalls).toHaveLength(2)

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

        const rows = await sql<{
            score: number
            mode: string | null
        }>`SELECT score, mode FROM game_scores`.execute(db)
        expect(rows.rows).toEqual([{ score: 123, mode: null }])
    })
})
