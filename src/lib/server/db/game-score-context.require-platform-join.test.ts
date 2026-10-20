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
let probeGate: Promise<void> | null = null

beforeAll(async () => {
    // Fully migrated except for the platform column, so the platform ALTER
    // is the only schema work a probe has left to attempt.
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
        const sqlText: string = query.sql ?? ''
        if (
            /alter\s+table\s+game_scores\s+add\s+column\s+"?platform"?/i.test(
                sqlText
            )
        ) {
            platformAlterAttempts++
            throw new Error('injected platform migration failure')
        }
        // One-shot gate: the first capability inspection hangs until the
        // test releases it, keeping an unforced probe in flight.
        if (/pragma\s+table_info\(game_scores\)/i.test(sqlText) && probeGate) {
            const gate = probeGate
            probeGate = null
            await gate
        }
        return originalExecute(query)
    }) as typeof executor.executeQuery
})

describe('score-context requirePlatform join', () => {
    it('re-probes after joining an unforced in-flight probe that missed the platform column', async () => {
        let openGate = () => {}
        probeGate = new Promise<void>(resolve => {
            openGate = resolve
        })

        // Unforced probe in flight, hanging on its capability inspection.
        const unforced = ensureGameScoresContextSchema()

        // A forced caller joins the in-flight probe instead of starting a
        // parallel migration pass.
        const forced = ensureGameScoresContextSchema({ requirePlatform: true })

        openGate()

        const unforcedState = await unforced
        expect(unforcedState.known).toBe(true)
        if (!unforcedState.known) {
            throw new Error('expected known state')
        }
        expect(unforcedState.capabilities.platform).toBe(false)
        expect(platformAlterAttempts).toBe(1)

        // The joined caller saw platform:false and ran a forced re-probe;
        // the minimum forced interval suppresses a second ALTER attempt
        // inside the window after the first failure.
        const forcedState = await forced
        expect(forcedState.known).toBe(true)
        if (!forcedState.known) {
            throw new Error('expected known state')
        }
        expect(forcedState.capabilities.platform).toBe(false)
        expect(platformAlterAttempts).toBe(1)
    })
})
