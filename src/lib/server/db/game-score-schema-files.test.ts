import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

const schemaFiles = [
    'scripts/init-db.sql',
    'better-auth_migrations/2025-07-06-schema-consolidation.sql',
] as const

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
        const source = await readFile(
            resolve(process.cwd(), schemaPath),
            'utf8'
        )
        const client = createClient({ url: ':memory:' })

        await client.executeMultiple(extractGameScoresDdl(source))

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
                'created_at',
            ])
        )

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
