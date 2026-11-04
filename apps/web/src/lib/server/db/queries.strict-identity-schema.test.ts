import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

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

const USER_TABLE_WITHOUT_IDENTITY_COLUMNS = `
    CREATE TABLE user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
`

const RESET_USER_TABLE_SQL = `DROP TABLE IF EXISTS user`

const SEED_USER_SQL = `
    INSERT INTO user (id, name, email, emailVerified, username, displayName)
    VALUES ('u1', 'Alice', 'a@t.co', 0, 'alice', 'Alice D')
`

const SEED_USER_BASE_SQL = `
    INSERT INTO user (id, name, email, emailVerified)
    VALUES ('u1', 'Alice', 'a@t.co', 0)
`

async function importFreshQueries() {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')
    const queries = await import('./queries')
    return { sql, db, queries }
}

describe('strict identity read — schema probe failures', () => {
    it('rejects when PRAGMA fails although the identity SELECT would succeed', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await sql.raw(RESET_USER_TABLE_SQL).execute(db)
        await sql.raw(USER_TABLE_WITH_IDENTITY_COLUMNS).execute(db)
        await sql.raw(SEED_USER_SQL).execute(db)

        const executor = db.getExecutor()
        const originalExecute = executor.executeQuery.bind(executor)
        executor.executeQuery = vi.fn(
            async (query: Parameters<typeof executor.executeQuery>[0]) => {
                const sqlText: string = query.sql ?? ''
                if (/PRAGMA\s+table_info/i.test(sqlText)) {
                    throw new Error('injected PRAGMA failure')
                }
                return originalExecute(query)
            }
        ) as typeof executor.executeQuery

        try {
            await expect(
                queries.getUserIdentityByIdStrict('u1')
            ).rejects.toThrow('injected PRAGMA failure')
        } finally {
            executor.executeQuery = originalExecute
        }

        await expect(
            queries.getUserIdentityByIdStrict('u1')
        ).resolves.toMatchObject({
            id: 'u1',
            username: 'alice',
            name: 'Alice',
        })
    })

    it('legacy getUserIdentityById stays warning-only and still returns the row', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await sql.raw(RESET_USER_TABLE_SQL).execute(db)
        await sql.raw(USER_TABLE_WITH_IDENTITY_COLUMNS).execute(db)
        await sql.raw(SEED_USER_SQL).execute(db)

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const executor = db.getExecutor()
        const originalExecute = executor.executeQuery.bind(executor)
        executor.executeQuery = vi.fn(
            async (query: Parameters<typeof executor.executeQuery>[0]) => {
                const sqlText: string = query.sql ?? ''
                if (/PRAGMA\s+table_info/i.test(sqlText)) {
                    throw new Error('injected PRAGMA failure')
                }
                return originalExecute(query)
            }
        ) as typeof executor.executeQuery

        try {
            await expect(
                queries.getUserIdentityById('u1')
            ).resolves.toMatchObject({
                id: 'u1',
                username: 'alice',
            })
            expect(warnSpy).toHaveBeenCalledWith(
                '[ensureUserIdentityColumns] Migration warning:',
                expect.any(Error)
            )
        } finally {
            executor.executeQuery = originalExecute
            warnSpy.mockRestore()
        }
    })

    it('strict read applies the identity migration then returns the row', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await sql.raw(RESET_USER_TABLE_SQL).execute(db)
        await sql.raw(USER_TABLE_WITHOUT_IDENTITY_COLUMNS).execute(db)
        await sql.raw(SEED_USER_BASE_SQL).execute(db)

        await expect(
            queries.getUserIdentityByIdStrict('u1')
        ).resolves.toMatchObject({
            id: 'u1',
            username: null,
            displayName: null,
            name: 'Alice',
        })
    })
})
