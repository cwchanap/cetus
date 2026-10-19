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

let platformAlterAttempts = 0

beforeAll(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'))

    // Fully migrated except for the platform column, so the platform ALTER is
    // the only schema work a probe has left to attempt.
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

    const executor = db.getExecutor()
    const originalExecute = executor.executeQuery.bind(executor)
    executor.executeQuery = (async (
        query: Parameters<typeof executor.executeQuery>[0]
    ) => {
        if (
            /alter\s+table\s+game_scores\s+add\s+column\s+"?platform"?/i.test(
                query.sql ?? ''
            )
        ) {
            platformAlterAttempts++
            throw new Error('injected platform migration failure')
        }
        return originalExecute(query)
    }) as typeof executor.executeQuery
})

describe('score-context platform retry backoff', () => {
    it('throttles unforced platform retries while requirePlatform forces an attempt', async () => {
        // Probe 1: the platform ALTER fails once and arms the backoff.
        const first = await ensureGameScoresContextSchema()
        expect(first.known).toBe(true)
        if (!first.known) {
            throw new Error('expected known state')
        }
        expect(first.capabilities.platform).toBe(false)
        expect(platformAlterAttempts).toBe(1)

        // A probe that misses the fast path for another reason inside the
        // backoff window must not re-attempt (or re-warn on) the ALTER.
        // Mutating the cached snapshot is the seam the index-retry test
        // uses to force such a probe.
        first.capabilities.scopedIndex = false
        const second = await ensureGameScoresContextSchema()
        expect(second.known && second.capabilities.platform).toBe(false)
        expect(platformAlterAttempts).toBe(1)

        // Callers that need the column bypass the exponential backoff —
        // their insert fails without it — but forced attempts still respect
        // a minimum interval so per-request callers can't drive unbounded
        // DDL. A forced call inside that window adds no attempt.
        const floored = await ensureGameScoresContextSchema({
            requirePlatform: true,
        })
        expect(floored.known && floored.capabilities.platform).toBe(false)
        expect(platformAlterAttempts).toBe(1)

        vi.advanceTimersByTime(60_001)
        if (second.known) {
            second.capabilities.scopedIndex = false
        }
        const forced = await ensureGameScoresContextSchema({
            requirePlatform: true,
        })
        expect(forced.known && forced.capabilities.platform).toBe(false)
        expect(platformAlterAttempts).toBe(2)

        // The forced failure doubled the delay (120s); after it expires the
        // next unforced probe retries the ALTER.
        vi.advanceTimersByTime(120_001)
        if (forced.known) {
            forced.capabilities.scopedIndex = false
        }
        const retried = await ensureGameScoresContextSchema()
        expect(retried.known && retried.capabilities.platform).toBe(false)
        expect(platformAlterAttempts).toBe(3)
    })
})
