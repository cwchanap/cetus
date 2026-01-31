import { Kysely } from 'kysely'
import { LibsqlDialect, libsql } from '@libsql/kysely-libsql'
import type { Database } from './types'

// Use Turso for production
if (!import.meta.env.TURSO_DATABASE_URL) {
    throw new Error('TURSO_DATABASE_URL environment variable is required')
}

if (!import.meta.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_AUTH_TOKEN environment variable is required')
}

const dbClient = libsql.createClient({
    url: import.meta.env.TURSO_DATABASE_URL,
    authToken: import.meta.env.TURSO_AUTH_TOKEN,
})
await dbClient.execute('PRAGMA foreign_keys = ON')

export const dialect = new LibsqlDialect({ client: dbClient })

// Create a reusable Turso database client with proper typing
export const db = new Kysely<Database>({ dialect })

// Export the client type for type safety
export type DbClient = typeof db
