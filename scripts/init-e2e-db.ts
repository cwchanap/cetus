/**
 * Initializes the E2E test database (db/db.sqlite).
 *
 * better-auth stopped auto-creating its tables in 1.7, so the auth tables
 * (derived from the installed better-auth via getSchema) and the game
 * tables (scripts/init-db.sql) must be created before the server starts.
 * Auth tables go first because scripts/init-db.sql has FKs referencing user(id).
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { getSchema } from 'better-auth/db'

const dbPath = resolve(process.cwd(), 'db', 'db.sqlite')
mkdirSync(dirname(dbPath), { recursive: true })

const client = createClient({ url: `file:${dbPath}` })

const SQLITE_TYPES = {
    string: 'TEXT',
    number: 'INTEGER',
    boolean: 'INTEGER',
    date: 'INTEGER',
} as const

interface FieldAttr {
    type: keyof typeof SQLITE_TYPES
    required?: boolean
    unique?: boolean
    references?: { model: string; field: string }
}

const schema = getSchema({} as never) as Record<
    string,
    { fields: Record<string, FieldAttr> }
>

for (const [table, definition] of Object.entries(schema)) {
    const columns = ['"id" TEXT PRIMARY KEY']
    for (const [fieldName, attr] of Object.entries(definition.fields)) {
        let column = `"${fieldName}" ${SQLITE_TYPES[attr.type] ?? 'TEXT'}`
        if (attr.required) {
            column += ' NOT NULL'
        }
        if (attr.unique) {
            column += ' UNIQUE'
        }
        if (attr.references) {
            column += ` REFERENCES "${attr.references.model}"("${attr.references.field}") ON DELETE CASCADE`
        }
        columns.push(column)
    }
    await client.execute(
        `CREATE TABLE IF NOT EXISTS "${table}" (${columns.join(', ')})`
    )
}

// Game tables from scripts/init-db.sql; strip -- comments then run statements.
const gameSql = readFileSync(
    resolve(process.cwd(), 'scripts', 'init-db.sql'),
    'utf8'
)
const statements = gameSql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)

for (const statement of statements) {
    await client.execute(statement)
}

console.log(`[init-e2e-db] initialized ${dbPath}`)
