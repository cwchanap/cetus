import { describe, expect, it, vi } from 'vitest'

// In-memory libSQL instance shared across the single test below. The mock
// factory is hoisted; vi.resetModules() in the test re-runs it to give a fresh
// DB and a fresh game-score-context module (whose module-level cachedState
// must start empty for the stale-snapshot scenario).
vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

describe('inspectAndMigrate - stale incomplete cached state', () => {
    it('fails closed when a refresh probe fails after caching an incomplete schema', async () => {
        vi.resetModules()

        const { sql } = await import('kysely')
        const { db } = await import('@/lib/server/db/client')
        const { ensureGameScoresContextSchema } = await import(
            './game-score-context'
        )
        const { getGameLeaderboard, isGameLeaderboardAvailable } = await import(
            './queries'
        )

        // Start with a legacy schema (no score-context columns).
        await sql`DROP TABLE IF EXISTS game_scores`.execute(db)
        await sql`DROP TABLE IF EXISTS user`.execute(db)
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

        const executor = db.getExecutor()
        const originalExecute = executor.executeQuery.bind(executor)

        // Phase 1: let the initial inspection succeed (incomplete) but fail the
        // first ALTER so migration throws and the catch path runs with an
        // incomplete cachedState.
        let phase: 1 | 3 = 1
        executor.executeQuery = vi.fn(async (query: any) => {
            const sqlText: string = query.sql ?? ''
            if (phase === 1 && /ALTER\s+TABLE/i.test(sqlText)) {
                throw new Error('injected migration failure')
            }
            return originalExecute(query)
        }) as typeof executor.executeQuery

        const firstState = await ensureGameScoresContextSchema()
        // An incomplete cached state must not be reported as known; otherwise
        // callers treat the context as available and skip the unscoped-row
        // isolation filter.
        expect(firstState.known).toBe(false)

        // Phase 2 (external): another Vercel instance finishes the migration
        // and starts accepting scoped rows. Restore the real executor so the
        // external ALTERs and inserts run unmodified.
        executor.executeQuery = originalExecute
        await sql`ALTER TABLE game_scores ADD COLUMN mode TEXT`.execute(db)
        await sql`ALTER TABLE game_scores ADD COLUMN competition_key TEXT`.execute(
            db
        )
        await sql`ALTER TABLE game_scores ADD COLUMN ruleset_version INTEGER`.execute(
            db
        )
        await sql`ALTER TABLE game_scores ADD COLUMN game_data_json TEXT`.execute(
            db
        )

        await sql`
            INSERT INTO user (id, name, email, emailVerified)
            VALUES ('u1', 'Alice', 'a@t.co', 0)
        `.execute(db)
        // A scoped (campaign) row that must never appear in the unscoped
        // leaderboard, and an unscoped row that legitimately belongs there.
        await sql`
            INSERT INTO game_scores (user_id, game_id, score, mode, competition_key)
            VALUES ('u1', 'tetris', 999, 'campaign', 'season-1')
        `.execute(db)
        await sql`
            INSERT INTO game_scores (user_id, game_id, score)
            VALUES ('u1', 'tetris', 100)
        `.execute(db)

        // Phase 3: the next capability probe fails transiently. Only the
        // PRAGMA inspection is forced to throw; the leaderboard SELECT (if it
        // were to run) is allowed.
        phase = 3
        executor.executeQuery = vi.fn(async (query: any) => {
            const sqlText: string = query.sql ?? ''
            if (/PRAGMA\s+table_info/i.test(sqlText)) {
                throw new Error('injected probe failure')
            }
            return originalExecute(query)
        }) as typeof executor.executeQuery

        const result = await getGameLeaderboard('tetris', 10)

        // Must fail closed: the scoped campaign row (score 999) must not leak
        // into the unscoped leaderboard, and the caller must see the coded
        // 503-style unavailable result rather than a silently wrong list.
        expect(isGameLeaderboardAvailable(result)).toBe(false)
        if (!isGameLeaderboardAvailable(result)) {
            expect(result).toEqual({
                status: 'unavailable',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            })
        }

        executor.executeQuery = originalExecute
    })
})
