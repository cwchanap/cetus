import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

const USER_TABLE_FRESH_E2E = `
    CREATE TABLE user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
`

const USER_TABLE_WITH_IDENTITY_COLUMNS = `
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
`

const GAME_SCORES_TABLE = `
    CREATE TABLE game_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        mode TEXT,
        competition_key TEXT,
        ruleset_version INTEGER,
        game_data_json TEXT,
        platform TEXT NOT NULL DEFAULT 'web',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`

const SEED_USER_SQL = `
    INSERT INTO user (id, name, email, emailVerified)
    VALUES ('u1', 'Alice', 'a@t.co', 0)
`

const SEED_USER_WITH_IDENTITY_SQL = `
    INSERT INTO user (id, name, email, emailVerified, username, displayName)
    VALUES ('u1', 'Alice', 'a@t.co', 0, 'alice', 'Alice D')
`

const seedScore = (gameId: string, score: number) => `
    INSERT INTO game_scores (user_id, game_id, score)
    VALUES ('u1', '${gameId}', ${score})
`

async function resetSchema(
    db: Awaited<ReturnType<typeof importFreshQueries>>['db'],
    sql: Awaited<ReturnType<typeof importFreshQueries>>['sql'],
    userTable: string
) {
    await sql.raw('DROP TABLE IF EXISTS game_scores').execute(db)
    await sql.raw('DROP TABLE IF EXISTS user').execute(db)
    await sql.raw(userTable).execute(db)
    await sql.raw(GAME_SCORES_TABLE).execute(db)
}

async function importFreshQueries() {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')
    const queries = await import('./queries')
    return { sql, db, queries }
}

describe('getGameLeaderboard — user identity schema', () => {
    it('returns the real row on the canonical fresh schema that lacks identity columns', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await resetSchema(db, sql, USER_TABLE_FRESH_E2E)
        await sql.raw(SEED_USER_SQL).execute(db)
        await sql.raw(seedScore('snake', 100)).execute(db)

        const result = await queries.getGameLeaderboard('snake')

        expect(result).toEqual([
            expect.objectContaining({
                name: 'Alice',
                username: null,
                score: 100,
            }),
        ])
    })

    it('returns the row unchanged when identity columns already exist', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await resetSchema(db, sql, USER_TABLE_WITH_IDENTITY_COLUMNS)
        await sql.raw(SEED_USER_WITH_IDENTITY_SQL).execute(db)
        await sql.raw(seedScore('snake', 250)).execute(db)

        const result = await queries.getGameLeaderboard('snake')

        expect(result).toEqual([
            expect.objectContaining({
                name: 'Alice D',
                username: 'alice',
                score: 250,
            }),
        ])
    })

    it('serializes the identity migration across concurrent first calls', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await resetSchema(db, sql, USER_TABLE_FRESH_E2E)
        await sql.raw(SEED_USER_SQL).execute(db)
        await sql.raw(seedScore('snake', 100)).execute(db)
        await sql.raw(seedScore('tetris', 200)).execute(db)

        const executor = db.getExecutor()
        const originalExecute = executor.executeQuery.bind(executor)
        let userAlterStatements = 0
        executor.executeQuery = vi.fn(
            async (query: Parameters<typeof executor.executeQuery>[0]) => {
                if (/ALTER\s+TABLE\s+"user"\s/i.test(query.sql ?? '')) {
                    userAlterStatements += 1
                }
                return originalExecute(query)
            }
        ) as typeof executor.executeQuery

        try {
            const results = await Promise.all([
                queries.getGameLeaderboard('snake'),
                queries.getGameLeaderboard('tetris'),
                queries.getGameLeaderboard('snake', 5),
                queries.getGameLeaderboard('tetris', 5),
            ])

            for (const result of results) {
                expect(Array.isArray(result)).toBe(true)
                expect(result as unknown[]).not.toHaveLength(0)
            }
            expect(userAlterStatements).toBe(2)
        } finally {
            executor.executeQuery = originalExecute
        }
    })

    it('keeps the leaderboard readable when legacy duplicate usernames block the unique index', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await resetSchema(db, sql, USER_TABLE_WITH_IDENTITY_COLUMNS)
        await sql
            .raw(
                `INSERT INTO user (id, name, email, emailVerified, username, displayName)
                 VALUES ('u1', 'Alice', 'a@t.co', 0, 'diver', 'A'),
                        ('u2', 'Bob', 'b@t.co', 0, 'diver', 'B')`
            )
            .execute(db)
        await sql.raw(seedScore('snake', 100)).execute(db)

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            const result = await queries.getGameLeaderboard('snake')

            expect(result).toEqual([
                expect.objectContaining({
                    name: 'A',
                    username: 'diver',
                    score: 100,
                }),
            ])
            expect(warnSpy).toHaveBeenCalledWith(
                '[applyUserIdentityColumns] username unique index unavailable:',
                expect.any(String)
            )
        } finally {
            warnSpy.mockRestore()
        }
    })

    it('retries the unique index on the next call after a transient failure', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await resetSchema(db, sql, USER_TABLE_WITH_IDENTITY_COLUMNS)
        await sql.raw(SEED_USER_WITH_IDENTITY_SQL).execute(db)
        await sql.raw(seedScore('snake', 100)).execute(db)

        const executor = db.getExecutor()
        const originalExecute = executor.executeQuery.bind(executor)
        let indexAttempts = 0
        executor.executeQuery = vi.fn(
            async (query: Parameters<typeof executor.executeQuery>[0]) => {
                if (/CREATE\s+UNIQUE\s+INDEX/i.test(query.sql ?? '')) {
                    indexAttempts += 1
                    if (indexAttempts === 1) {
                        throw new Error('ECONNRESET: connection dropped')
                    }
                }
                return originalExecute(query)
            }
        ) as typeof executor.executeQuery

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            const first = await queries.getGameLeaderboard('snake')
            expect(first).toEqual([
                expect.objectContaining({ username: 'alice', score: 100 }),
            ])
            expect(indexAttempts).toBe(1)
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('will retry'),
                expect.any(String)
            )

            const second = await queries.getGameLeaderboard('snake')
            expect(second).toEqual(first)
            expect(indexAttempts).toBe(2)

            const third = await queries.getGameLeaderboard('snake')
            expect(third).toEqual(first)
            expect(indexAttempts).toBe(2)
        } finally {
            executor.executeQuery = originalExecute
            warnSpy.mockRestore()
        }
    })

    it('surfaces an identity migration failure as unavailable instead of an empty list', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await resetSchema(db, sql, USER_TABLE_FRESH_E2E)
        await sql.raw(SEED_USER_SQL).execute(db)
        await sql.raw(seedScore('snake', 100)).execute(db)

        const executor = db.getExecutor()
        const originalExecute = executor.executeQuery.bind(executor)
        executor.executeQuery = vi.fn(
            async (query: Parameters<typeof executor.executeQuery>[0]) => {
                if (/PRAGMA\s+table_info\("user"\)/i.test(query.sql ?? '')) {
                    throw new Error('injected PRAGMA failure')
                }
                return originalExecute(query)
            }
        ) as typeof executor.executeQuery

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            const result = await queries.getGameLeaderboard('snake')

            expect(result).toEqual({
                status: 'unavailable',
                code: 'SCORE_CONTEXT_UNAVAILABLE',
            })
        } finally {
            executor.executeQuery = originalExecute
            warnSpy.mockRestore()
        }
    })
})
