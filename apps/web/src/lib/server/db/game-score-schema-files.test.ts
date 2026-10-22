import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { appRoot } from '@/test/app-root'

const schemaFiles = [
    'scripts/init-db.sql',
    'better-auth_migrations/2025-07-06-schema-consolidation.sql',
] as const

// The platform column ships as its own dated migration rather than an
// in-place edit of the consolidation file.
const platformMigrationFile =
    'better-auth_migrations/2026-10-19-game-scores-platform.sql'

function extractGameScoresDdl(source: string): string {
    const table = source.match(
        /CREATE TABLE IF NOT EXISTS\s+"?game_scores"?\s*\([\s\S]*?\n\);/i
    )?.[0]
    const index = source.match(
        /CREATE INDEX IF NOT EXISTS\s+"?idx_game_scores_scoped_ranking"?[\s\S]*?;/i
    )?.[0]

    if (!table || !index) {
        throw new Error('game_scores table or scoped index DDL is missing')
    }

    return `${table}\n${index}`
}

describe.each(schemaFiles)('%s', schemaPath => {
    it('creates the complete contextual score schema', async () => {
        const source = await readFile(resolve(appRoot, schemaPath), 'utf8')
        const client = createClient({ url: ':memory:' })

        await client.executeMultiple(extractGameScoresDdl(source))

        // Apply the dated platform migration when the base DDL predates the
        // column (SQLite has no ADD COLUMN IF NOT EXISTS; the runtime
        // migrator makes the same existence check before its ALTER).
        // Existing rows without the column must backfill to 'web' via the
        // column default.
        await client.execute('CREATE TABLE user (id TEXT PRIMARY KEY)')
        await client.execute(`INSERT INTO user (id) VALUES ('u1')`)
        await client.execute(
            `INSERT INTO game_scores (user_id, game_id, score)
             VALUES ('u1', 'tetris', 100)`
        )
        const preColumns = await client.execute(
            'PRAGMA table_info(game_scores)'
        )
        if (!preColumns.rows.some(row => row.name === 'platform')) {
            const migrationSql = await readFile(
                resolve(appRoot, platformMigrationFile),
                'utf8'
            )
            const statements = migrationSql
                .split('\n')
                .filter(line => !line.trimStart().startsWith('--'))
                .join('\n')
            await client.executeMultiple(statements)
        }

        const columns = await client.execute('PRAGMA table_info(game_scores)')
        expect(columns.rows.map(row => String(row.name))).toEqual(
            expect.arrayContaining([
                'id',
                'user_id',
                'game_id',
                'score',
                'mode',
                'competition_key',
                'ruleset_version',
                'game_data_json',
                'platform',
                'created_at',
            ])
        )

        // The pre-migration row backfills to 'web', and fresh rows that omit
        // platform are labeled web by the DDL default, so pre-platform
        // callers stay correct after migration.
        const backfilledRow = await client.execute(
            "SELECT platform FROM game_scores WHERE user_id = 'u1'"
        )
        expect(String(backfilledRow.rows[0].platform)).toBe('web')
        await client.execute(
            `INSERT INTO game_scores (user_id, game_id, score)
             VALUES ('u1', 'snake', 50)`
        )
        const insertedRow = await client.execute(
            "SELECT platform FROM game_scores WHERE game_id = 'snake'"
        )
        expect(String(insertedRow.rows[0].platform)).toBe('web')

        const index = await client.execute(
            'PRAGMA index_info(idx_game_scores_scoped_ranking)'
        )
        expect(index.rows.map(row => String(row.name))).toEqual([
            'game_id',
            'mode',
            'competition_key',
            'score',
            'created_at',
        ])

        // PRAGMA index_info returns column names but not sort directions.
        // index_xinfo adds a `desc` column (1 = DESC, 0 = ASC) so we can
        // verify the ranking-critical ordering: score DESC, created_at ASC.
        const indexXinfo = await client.execute(
            'PRAGMA index_xinfo(idx_game_scores_scoped_ranking)'
        )
        // index_xinfo appends a trailing rowid auxiliary row (name = null,
        // cid = -1); filter it out so only the declared index columns remain.
        const xinfoRows = indexXinfo.rows
            .filter(row => row.name !== null)
            .map(row => ({
                name: String(row.name),
                desc: Number(row.desc),
            }))
        expect(xinfoRows.map(row => row.name)).toEqual([
            'game_id',
            'mode',
            'competition_key',
            'score',
            'created_at',
        ])
        const scoreColumn = xinfoRows.find(row => row.name === 'score')
        const createdAtColumn = xinfoRows.find(row => row.name === 'created_at')
        expect(scoreColumn?.desc).toBe(1)
        expect(createdAtColumn?.desc).toBe(0)

        client.close()
    })
})
