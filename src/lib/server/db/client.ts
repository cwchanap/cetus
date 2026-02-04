import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Kysely } from 'kysely'
import { LibsqlDialect, libsql } from '@libsql/kysely-libsql'
import type { Database } from './types'

const isCi = Boolean(process.env.CI)
const fallbackUrl = pathToFileURL(
    path.resolve(process.cwd(), 'db', 'db.sqlite')
).toString()
const dbUrl = isCi ? fallbackUrl : import.meta.env.TURSO_DATABASE_URL

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
await dbClient.execute('PRAGMA foreign_keys = ON')

export const dialect = new LibsqlDialect({ client: dbClient })

// Create a reusable Turso database client with proper typing
export const db = new Kysely<Database>({ dialect })

// Export the client type for type safety
export type DbClient = typeof db
