import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Kysely, sql } from 'kysely'
import { LibsqlDialect, libsql } from '@libsql/kysely-libsql'
import type { Database } from './types'

const isCi = process.env.CI === 'true' || process.env.CI === '1'
const fallbackUrl = pathToFileURL(
    path.resolve(process.cwd(), 'db', 'db.sqlite')
).toString()
const dbUrl =
    import.meta.env.TURSO_DATABASE_URL || (isCi ? fallbackUrl : undefined)

if (!dbUrl) {
    throw new Error('TURSO_DATABASE_URL environment variable is required')
}

const isFileUrl = dbUrl.startsWith('file:')
const authToken = isFileUrl ? undefined : import.meta.env.TURSO_AUTH_TOKEN

if (!isFileUrl && !authToken) {
    throw new Error('TURSO_AUTH_TOKEN environment variable is required')
}

const dbClient = libsql.createClient({
    url: dbUrl,
    ...(authToken ? { authToken } : {}),
})

const dialect = new LibsqlDialect({ client: dbClient })

// Create a reusable Turso database client with proper typing
const db = new Kysely<Database>({ dialect })

// Enable foreign keys using Kysely sql template with proper error handling
try {
    await sql`PRAGMA foreign_keys = ON`.execute(db)
} catch (error) {
    console.error('Failed to enable foreign keys:', error)
    throw error
}

export { dialect, db }

// Export the client type for type safety
export type DbClient = typeof db
