/**
 * Integration tests for the platform column on the existing score write path.
 *
 * These tests inject ALTER TABLE failures through the query executor (the same
 * technique as game-score-context.stale-incomplete-fallback.test.ts) to prove:
 *
 * - unscoped web inserts never depend on the platform migration,
 * - contextual web writes stay usable when adding the unrelated platform
 *   column fails (never SCORE_CONTEXT_UNAVAILABLE),
 * - non-web writes fail loudly (SCORE_WRITE_FAILED) instead of silently
 *   falling back to 'web',
 * - cached capability snapshots without platform are not treated as migrated
 *   for non-web requests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

// vi.resetModules() gives each test fresh query/migrator modules (and their
// module-level caches). The mocked client module itself survives resets, so
// the Kysely executor is shared across tests in this file.
beforeEach(async () => {
    vi.resetModules()
})

async function setupBaseTables(): Promise<void> {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')

    // The in-memory DB is shared across module resets within the process;
    // drop first so each test starts from a clean schema.
    await sql`DROP TABLE IF EXISTS game_scores`.execute(db)
    await sql`DROP TABLE IF EXISTS user_stats`.execute(db)
    await sql`DROP TABLE IF EXISTS user`.execute(db)

    await sql`
        CREATE TABLE user (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            emailVerified INTEGER NOT NULL DEFAULT 0,
            image TEXT,
            username TEXT,
            displayName TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)
    await sql`
        INSERT INTO user (id, name, email, emailVerified)
        VALUES ('u1', 'Player One', 'u1@test.com', 0)
    `.execute(db)
    await sql`
        CREATE TABLE user_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            total_games_played INTEGER NOT NULL DEFAULT 0,
            total_score INTEGER NOT NULL DEFAULT 0,
            favorite_game TEXT,
            streak_days INTEGER NOT NULL DEFAULT 0,
            xp INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            challenge_streak INTEGER NOT NULL DEFAULT 0,
            last_challenge_date TEXT,
            login_streak INTEGER NOT NULL DEFAULT 0,
            last_login_reward_date TEXT,
            total_login_cycles INTEGER NOT NULL DEFAULT 0,
            email_notifications INTEGER NOT NULL DEFAULT 1,
            push_notifications INTEGER NOT NULL DEFAULT 0,
            challenge_reminders INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)
}

/** Legacy table: base columns only, no context columns, no platform. */
async function createBareGameScoresTable(): Promise<void> {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')

    await sql`
        CREATE TABLE game_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)
}

/**
 * Modern-context table: the four contextual columns exist but platform was
 * never added.
 */
async function createContextualGameScoresTable(): Promise<void> {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')

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
}

/**
 * Scoped ranking index predating the platform deploy: capabilities then
 * inspect as scopedIndex: true even while platform is still missing.
 */
async function createScopedRankingIndex(): Promise<void> {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')

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
}

/**
 * Injected ALTER failures are controlled by a single shared executor hook:
 * the mocked client module (and its executor) survives vi.resetModules(), so
 * per-test interceptors would leak into later tests. Each test sets
 * `alterFailureMode` before acting and clears it afterwards (tests run
 * sequentially by default).
 */
let alterFailureMode: 'all' | 'platform' | null = null

async function installAlterFailureHook(): Promise<void> {
    const { db } = await import('@/lib/server/db/client')
    const executor = db.getExecutor()
    if ((executor as { __alterFailureHooked?: boolean }).__alterFailureHooked) {
        return
    }
    ;(executor as { __alterFailureHooked?: boolean }).__alterFailureHooked =
        true
    const originalExecute = executor.executeQuery.bind(executor)
    executor.executeQuery = (async (
        query: Parameters<typeof executor.executeQuery>[0]
    ) => {
        const sqlText = query.sql ?? ''
        if (alterFailureMode === 'all' && /alter\s+table/i.test(sqlText)) {
            throw new Error('injected migration failure')
        }
        if (
            alterFailureMode === 'platform' &&
            /alter\s+table\s+game_scores\s+add\s+column\s+"?platform"?/i.test(
                sqlText
            )
        ) {
            throw new Error('injected platform migration failure')
        }
        return originalExecute(query)
    }) as typeof executor.executeQuery
}

async function countScores(): Promise<number> {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')
    const rows = await sql<{ count: number }>`
        SELECT COUNT(*) AS count FROM game_scores
    `.execute(db)
    return rows.rows[0].count
}

describe('platform writes with failing platform migration', () => {
    it('keeps unscoped web inserts working on an old schema while platform migration fails', async () => {
        await installAlterFailureHook()
        alterFailureMode = 'all'
        try {
            await setupBaseTables()
            await createBareGameScoresTable()

            const { saveGameScore } = await import('./queries')

            expect(await saveGameScore('u1', 'tetris', 100)).toEqual({
                success: true,
            })
            expect(await countScores()).toBe(1)
        } finally {
            alterFailureMode = null
        }
    })

    it('preserves contextual web writes when adding the platform column fails', async () => {
        await installAlterFailureHook()
        alterFailureMode = 'platform'
        try {
            await setupBaseTables()
            await createContextualGameScoresTable()

            const { saveGameScore } = await import('./queries')

            const result = await saveGameScore('u1', 'tetris', 200, {
                mode: 'daily',
                competitionKey: 'daily:2026-08-01',
                rulesetVersion: 1,
                gameDataJson: null,
            })

            // Complete contextual columns remain usable: the unrelated
            // platform failure must not surface as SCORE_CONTEXT_UNAVAILABLE.
            expect(result).toEqual({ success: true })

            const { sql } = await import('kysely')
            const { db } = await import('@/lib/server/db/client')
            const rows = await sql<{
                mode: string | null
                competition_key: string | null
            }>`SELECT mode, competition_key FROM game_scores`.execute(db)
            expect(rows.rows).toEqual([
                { mode: 'daily', competition_key: 'daily:2026-08-01' },
            ])
        } finally {
            alterFailureMode = null
        }
    })

    it('fails a non-web score loudly instead of falling back to web', async () => {
        await installAlterFailureHook()
        alterFailureMode = 'platform'
        try {
            await setupBaseTables()
            await createContextualGameScoresTable()

            const { saveGameScore } = await import('./queries')

            expect(
                await saveGameScore('u1', 'tetris', 300, undefined, 'ios')
            ).toEqual({ success: false, code: 'SCORE_WRITE_FAILED' })
            // No mislabeled row may exist.
            expect(await countScores()).toBe(0)
        } finally {
            alterFailureMode = null
        }
    })

    // Note: this table has no scoped index, so the pre-existing fast-path
    // condition (scopedIndex || index-retry due) already bypasses the fast
    // path independently of the requirePlatform guard. The dedicated
    // guard-pinning scenario (scoped index present) is the final test below.
    it('does not treat a cached snapshot without platform as migrated for a later non-web write', async () => {
        await installAlterFailureHook()
        alterFailureMode = 'platform'
        try {
            await setupBaseTables()
            await createContextualGameScoresTable()

            const { saveGameScore } = await import('./queries')

            // Phase 1: migration fails and caches capabilities without
            // platform.
            expect(
                await saveGameScore('u1', 'tetris', 300, undefined, 'ios')
            ).toEqual({ success: false, code: 'SCORE_WRITE_FAILED' })

            // Phase 2: the transient failure clears. The non-web write must
            // re-run the migration (bypassing the cached fast path), add the
            // column, and persist the row with its real platform.
            alterFailureMode = null

            expect(
                await saveGameScore('u1', 'tetris', 300, undefined, 'ios')
            ).toEqual({ success: true })

            const { sql } = await import('kysely')
            const { db } = await import('@/lib/server/db/client')
            const rows = await sql<{ platform: string }>`
                SELECT platform FROM game_scores WHERE user_id = 'u1'
            `.execute(db)
            expect(rows.rows).toEqual([{ platform: 'ios' }])
        } finally {
            alterFailureMode = null
        }
    })

    // Pins the requirePlatform guard in ensureGameScoresContextSchema: with
    // the scoped index already present, the pre-existing fast-path condition
    // (scopedIndex || index-retry due) passes on its own, so only
    // requirePlatform can force re-migration of a cached
    // scopedIndex: true + platform: false snapshot. Without the guard, every
    // non-web write on such an instance fails with SCORE_WRITE_FAILED until
    // the instance recycles.
    it('bypasses a cached scoped-index snapshot without platform for a non-web write', async () => {
        await installAlterFailureHook()
        alterFailureMode = 'platform'
        try {
            await setupBaseTables()
            await createContextualGameScoresTable()
            await createScopedRankingIndex()

            const { saveGameScore } = await import('./queries')

            // Phase 1: the platform ALTER fails transiently after inspection,
            // so the cached snapshot reads scopedIndex: true + platform: false.
            expect(
                await saveGameScore('u1', 'tetris', 300, undefined, 'ios')
            ).toEqual({ success: false, code: 'SCORE_WRITE_FAILED' })

            // Phase 2: the failure clears. The guard must bypass the cached
            // fast path so the idempotent migration re-runs and the write
            // succeeds with its real platform.
            alterFailureMode = null

            expect(
                await saveGameScore('u1', 'tetris', 300, undefined, 'ios')
            ).toEqual({ success: true })

            const { sql } = await import('kysely')
            const { db } = await import('@/lib/server/db/client')
            const rows = await sql<{ platform: string }>`
                SELECT platform FROM game_scores WHERE user_id = 'u1'
            `.execute(db)
            expect(rows.rows).toEqual([{ platform: 'ios' }])
        } finally {
            alterFailureMode = null
        }
    })
})
