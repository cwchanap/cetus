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
        const executeSpy = vi.spyOn(db.getExecutor(), 'executeQuery')

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
        if (!recovered.known) {
            throw new Error('expected known state')
        }
        expect(recovered.capabilities.scopedIndex).toBe(true)
    })

    it('reuses complete cached context when a refresh probe fails', async () => {
        const first = await ensureGameScoresContextSchema()
        expect(first.known).toBe(true)
        if (first.known) {
            // Simulate a stale cached snapshot after an index disappears so
            // the next call must refresh capabilities.
            first.capabilities.scopedIndex = false
        }
        vi.advanceTimersByTime(60_001)

        const executeSpy = vi
            .spyOn(db.getExecutor(), 'executeQuery')
            .mockRejectedValueOnce(new Error('probe failed'))
        const recovered = await ensureGameScoresContextSchema()

        expect(recovered).toEqual(first)
        expect(executeSpy).toHaveBeenCalled()
        executeSpy.mockRestore()
    })
})
