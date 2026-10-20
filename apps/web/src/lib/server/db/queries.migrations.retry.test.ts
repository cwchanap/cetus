/**
 * Tests that `ensureUserStatsSchema` retries after a transient migration
 * failure instead of caching a failed run for the process lifetime.
 *
 * Isolated in-memory SQLite (separate from queries.migrations.test.ts) so the
 * user_stats table can be dropped to force DDL failures without disturbing
 * other tests' shared state. Vitest isolates each test file in its own module
 * registry, so the module-level `_userStatsSchemaPromise` / `_migrationsRun`
 * start fresh here.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { sql } from 'kysely'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')

    const client = libsql.createClient({ url: 'file::memory:?cache=shared' })
    const dialect = new LibsqlDialect({ client })
    const db = new Kysely({ dialect })

    return { db, dialect }
})

import { db } from '@/lib/server/db/client'
import { ensureUserStatsSchema } from '@/lib/server/db/queries'

async function columnNames(): Promise<string[]> {
    const result = await sql<{
        name: string
    }>`PRAGMA table_info(user_stats)`.execute(db)
    return result.rows.map(r => r.name)
}

describe('ensureUserStatsSchema retry on transient failure', () => {
    beforeAll(async () => {
        await sql`
            CREATE TABLE IF NOT EXISTS user (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                emailVerified INTEGER NOT NULL DEFAULT 0,
                image TEXT,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `.execute(db)
    })

    it('retries and applies migrations after an initial transient DDL failure', async () => {
        // Force a failure: no user_stats table, so PRAGMA returns no rows and
        // ALTER TABLE inside the helpers throws (swallowed by design).
        await sql`DROP TABLE IF EXISTS user_stats`.execute(db)

        // First call must resolve (helpers swallow) and must NOT cache the
        // failed run for the process lifetime.
        await expect(ensureUserStatsSchema()).resolves.toBeUndefined()

        // Recreate the base table so the retry can actually run the DDL.
        await sql`
            CREATE TABLE IF NOT EXISTS user_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                total_games_played INTEGER NOT NULL DEFAULT 0,
                total_score INTEGER NOT NULL DEFAULT 0,
                favorite_game TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `.execute(db)

        // Second call must retry rather than returning a cached failed promise.
        await expect(ensureUserStatsSchema()).resolves.toBeUndefined()

        const cols = await columnNames()
        expect(cols).toContain('streak_days')
        expect(cols).toContain('xp')
        expect(cols).toContain('login_streak')
        expect(cols).toContain('email_notifications')
    })
})
