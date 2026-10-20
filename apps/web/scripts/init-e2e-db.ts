/**
 * Initializes the E2E test database (db/db.sqlite).
 *
 * better-auth stopped auto-creating its tables in 1.7, so the auth tables
 * (created via better-auth's own getMigrations/runMigrations so the DDL
 * matches what `auth migrate` would emit) and the game tables
 * (scripts/init-db.sql) must exist before the server starts.
 * Auth tables go first because scripts/init-db.sql has FKs referencing user(id).
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { libsql, LibsqlDialect } from '@libsql/kysely-libsql'
import { getMigrations } from 'better-auth/db/migration'

const dbPath = resolve(process.cwd(), 'db', 'db.sqlite')
mkdirSync(dirname(dbPath), { recursive: true })

// The client comes from @libsql/kysely-libsql's re-export so its type matches
// what LibsqlDialect expects (it bundles its own @libsql/client copy).
const client = libsql.createClient({ url: `file:${dbPath}` })
const dialect = new LibsqlDialect({ client })

const { runMigrations } = await getMigrations({
    database: { dialect, type: 'sqlite' },
})
await runMigrations()

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

const isIndexStatement = (statement: string): boolean =>
    /^create\s+(unique\s+)?index/i.test(statement)

// Tables first; an existing local db.sqlite may hold a game_scores that
// predates the context/platform columns, in which case CREATE TABLE IF NOT
// EXISTS no-ops and the scoped-ranking index would fail on the missing
// columns — so the columns are backfilled before any index DDL runs.
for (const statement of statements.filter(s => !isIndexStatement(s))) {
    await client.execute(statement)
}

const GAME_SCORES_COLUMNS: Record<string, string> = {
    mode: 'TEXT',
    competition_key: 'TEXT',
    ruleset_version: 'INTEGER',
    game_data_json: 'TEXT',
    platform: "TEXT NOT NULL DEFAULT 'web'",
}
const existingColumns = await client.execute('PRAGMA table_info(game_scores)')
const columnNames = new Set(existingColumns.rows.map(row => String(row.name)))
for (const [name, definition] of Object.entries(GAME_SCORES_COLUMNS)) {
    if (!columnNames.has(name)) {
        await client.execute(
            `ALTER TABLE game_scores ADD COLUMN ${name} ${definition}`
        )
    }
}

for (const statement of statements.filter(isIndexStatement)) {
    await client.execute(statement)
}

console.log(`[init-e2e-db] initialized ${dbPath}`)
