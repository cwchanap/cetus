import { sql } from 'kysely'
import { db } from './client'

/**
 * Shared user identity schema migration (`displayName`, `username` and the
 * unique username index). Better Auth's own migration does not create these
 * columns, so every read that joins the public identity fields (leaderboards,
 * username lookups, scoped leaderboards) must prepare them first.
 *
 * One mechanism, two entry points:
 * - `ensureUserIdentitySchema` is failure-aware: it throws so a caller that
 *   cannot serve a result without the columns (the scoped leaderboard) can
 *   surface an honest unavailable state instead of running a broken query.
 * - `ensureUserIdentityColumns` keeps the historical best-effort contract for
 *   primary flows that should not fail because an optional index is missing.
 */

const migrationsRun = new Set<string>()
let schemaPromise: Promise<void> | null = null

function sanitizeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

async function applyUserIdentityColumns(): Promise<void> {
    if (migrationsRun.has('userIdentity')) {
        return
    }
    const result = await sql<{
        name: string
    }>`PRAGMA table_info("user")`.execute(db)
    const cols = result.rows?.map(r => r.name) ?? []

    if (!cols.includes('displayName')) {
        await sql`ALTER TABLE "user" ADD COLUMN displayName TEXT`.execute(db)
    }

    if (!cols.includes('username')) {
        await sql`ALTER TABLE "user" ADD COLUMN username TEXT`.execute(db)
    }

    // The unique index is a uniqueness backstop, not a read dependency. A
    // legacy database can hold duplicate usernames that make index creation
    // fail with a constraint error; reads (leaderboard joins, identity
    // lookups) must stay available, so warn and mark done rather than
    // blocking every consumer. Transient failures (network/timeout) are
    // different: leave the migration unmarked so the next call retries
    // instead of running without the index until the next deploy.
    try {
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON "user" (username)`.execute(
            db
        )
        migrationsRun.add('userIdentity')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.toLowerCase().includes('unique constraint')) {
            console.warn(
                '[applyUserIdentityColumns] username unique index unavailable:',
                sanitizeError(error)
            )
            migrationsRun.add('userIdentity')
        } else {
            console.warn(
                '[applyUserIdentityColumns] username unique index attempt failed; will retry on next call:',
                sanitizeError(error)
            )
        }
    }
}

/** Failure-aware: resolves only when the identity columns are usable. */
export function ensureUserIdentitySchema(): Promise<void> {
    if (!schemaPromise) {
        schemaPromise = applyUserIdentityColumns().finally(() => {
            schemaPromise = null
        })
    }
    return schemaPromise
}

/**
 * Ensure user identity columns (displayName, username) and unique index exist.
 * Safe and idempotent for SQLite/LibSQL. Swallows failures for primary flows.
 */
export async function ensureUserIdentityColumns(): Promise<void> {
    try {
        await ensureUserIdentitySchema()
    } catch (error) {
        // Log but swallow to avoid breaking primary flows
        console.warn('[ensureUserIdentityColumns] Migration warning:', error)
    }
}
