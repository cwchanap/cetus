import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

// `date` gives the column NUMERIC affinity, matching the Better Auth
// migration: integer writes stay INTEGER (returned as numbers by libsql),
// ISO strings stay TEXT.
const USER_TABLE = `
    CREATE TABLE user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        username TEXT,
        displayName TEXT,
        createdAt date,
        updatedAt date
    )
`

const RESET_USER_TABLE_SQL = `DROP TABLE IF EXISTS user`

const seedUser = (createdAt: string | number) => `
    INSERT INTO user (id, name, email, emailVerified, username, displayName, createdAt)
    VALUES ('u1', 'Alice', 'a@t.co', 0, 'alice', 'Alice D', ${
        typeof createdAt === 'number' ? createdAt : `'${createdAt}'`
    })
`

async function importFreshQueries() {
    const { sql } = await import('kysely')
    const { db } = await import('@/lib/server/db/client')
    const queries = await import('./queries')
    return { sql, db, queries }
}

describe('identity readers — createdAt normalization', () => {
    it('returns the ISO text createdAt unchanged', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await sql.raw(RESET_USER_TABLE_SQL).execute(db)
        await sql.raw(USER_TABLE).execute(db)
        await sql.raw(seedUser('2026-11-04T01:59:28.306Z')).execute(db)

        await expect(
            queries.getUserIdentityByIdStrict('u1')
        ).resolves.toMatchObject({
            createdAt: '2026-11-04T01:59:28.306Z',
        })
    })

    it('converts a millisecond-integer createdAt (date column stores NUMERIC)', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await sql.raw(RESET_USER_TABLE_SQL).execute(db)
        await sql.raw(USER_TABLE).execute(db)
        await sql.raw(seedUser(1735689600000)).execute(db)

        await expect(
            queries.getUserIdentityByIdStrict('u1')
        ).resolves.toMatchObject({
            createdAt: '2025-01-01T00:00:00.000Z',
        })
    })

    it('normalizes numeric createdAt for getUserByUsername as well', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await sql.raw(RESET_USER_TABLE_SQL).execute(db)
        await sql.raw(USER_TABLE).execute(db)
        await sql.raw(seedUser(1735689600000)).execute(db)

        await expect(queries.getUserByUsername('alice')).resolves.toMatchObject(
            {
                createdAt: '2025-01-01T00:00:00.000Z',
            }
        )
    })

    it('strict read rejects an unparseable createdAt instead of fabricating a date', async () => {
        vi.resetModules()
        const { sql, db, queries } = await importFreshQueries()

        await sql.raw(RESET_USER_TABLE_SQL).execute(db)
        await sql.raw(USER_TABLE).execute(db)
        await sql.raw(seedUser('not-a-date')).execute(db)

        await expect(queries.getUserIdentityByIdStrict('u1')).rejects.toThrow(
            RangeError
        )

        await expect(queries.getUserByUsername('alice')).resolves.toBeNull()
    })
})
