import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

import { db } from '@/lib/server/db/client'
import {
    getScopedGameLeaderboard,
    toPublicScopedLeaderboardEntry,
} from './scoped-leaderboard'

interface SeedScoreOptions {
    mode: string
    competitionKey: string | null
    rulesetVersion: number | null
    createdAt?: string
    gameData?: Record<string, unknown>
    rawGameDataJson?: string
}

beforeAll(async () => {
    await sql`
        CREATE TABLE "user" (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT,
            displayName TEXT,
            image TEXT
        )
    `.execute(db)

    await sql`
        CREATE TABLE game_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            mode TEXT,
            competition_key TEXT,
            ruleset_version INTEGER,
            game_data_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE INDEX idx_game_scores_scoped_ranking
        ON game_scores (
            game_id,
            mode,
            competition_key,
            score DESC,
            created_at ASC
        )
    `.execute(db)
})

afterEach(async () => {
    await sql`DELETE FROM game_scores`.execute(db)
    await sql`DELETE FROM "user"`.execute(db)
})

async function seedUser(
    id: string,
    name: string,
    options: {
        username?: string
        displayName?: string
        image?: string
    } = {}
): Promise<void> {
    await sql`
        INSERT INTO "user" (id, name, username, displayName, image)
        VALUES (
            ${id},
            ${name},
            ${options.username ?? null},
            ${options.displayName ?? null},
            ${options.image ?? null}
        )
    `.execute(db)
}

async function seedScopedScore(
    userId: string,
    score: number,
    options: SeedScoreOptions
): Promise<void> {
    const gameDataJson =
        options.rawGameDataJson ??
        (options.gameData === undefined
            ? null
            : JSON.stringify(options.gameData))

    await sql`
        INSERT INTO game_scores (
            user_id,
            game_id,
            score,
            mode,
            competition_key,
            ruleset_version,
            game_data_json,
            created_at
        )
        VALUES (
            ${userId},
            'tetris',
            ${score},
            ${options.mode},
            ${options.competitionKey},
            ${options.rulesetVersion},
            ${gameDataJson},
            ${options.createdAt ?? '2026-08-01T00:00:00Z'}
        )
    `.execute(db)
}

describe('getScopedGameLeaderboard', () => {
    it('returns one best row per user for an exact competition key', async () => {
        await seedUser('u1', 'One')
        await seedUser('u2', 'Two')
        await seedScopedScore('u1', 100, {
            mode: 'daily',
            competitionKey: 'daily:1',
            rulesetVersion: 1,
            gameData: { elapsedSeconds: 20, totalMoves: 10 },
        })
        await seedScopedScore('u1', 200, {
            mode: 'daily',
            competitionKey: 'daily:1',
            rulesetVersion: 1,
            gameData: { elapsedSeconds: 30, totalMoves: 20 },
        })
        await seedScopedScore('u2', 150, {
            mode: 'daily',
            competitionKey: 'daily:1',
            rulesetVersion: 1,
            gameData: { elapsedSeconds: 25, totalMoves: 12 },
        })

        const result = await getScopedGameLeaderboard({
            gameId: 'tetris',
            mode: 'daily',
            competitionKey: 'daily:1',
            limit: 10,
        })

        expect(result.success).toBe(true)
        if (!result.success) {
            throw new Error('expected success')
        }
        expect(result.rows.map(row => [row.userId, row.score])).toEqual([
            ['u1', 200],
            ['u2', 150],
        ])
    })

    it('mode-only ranking spans keys and ruleset versions', async () => {
        await seedUser('u1', 'One')
        await seedScopedScore('u1', 100, {
            mode: 'daily',
            competitionKey: 'daily:1',
            rulesetVersion: 1,
        })
        await seedScopedScore('u1', 200, {
            mode: 'daily',
            competitionKey: 'daily:2',
            rulesetVersion: 2,
        })

        const result = await getScopedGameLeaderboard({
            gameId: 'tetris',
            mode: 'daily',
            limit: 10,
        })

        expect(result.success).toBe(true)
        if (!result.success) {
            throw new Error('expected success')
        }
        expect(result.rows[0].rulesetVersion).toBe(2)
    })

    it.each([
        {
            name: 'higher score',
            first: {
                score: 100,
                rulesetVersion: 1,
                elapsedSeconds: 10,
                totalMoves: 10,
                createdAt: '2026-08-01T00:00:00Z',
            },
            second: {
                score: 200,
                rulesetVersion: 2,
                elapsedSeconds: 99,
                totalMoves: 99,
                createdAt: '2026-08-01T00:00:01Z',
            },
            expectedRuleset: 2,
        },
        {
            name: 'lower valid elapsed time',
            first: {
                score: 100,
                rulesetVersion: 1,
                elapsedSeconds: 10,
                totalMoves: 20,
                createdAt: '2026-08-01T00:00:01Z',
            },
            second: {
                score: 100,
                rulesetVersion: 2,
                elapsedSeconds: 20,
                totalMoves: 1,
                createdAt: '2026-08-01T00:00:00Z',
            },
            expectedRuleset: 1,
        },
        {
            name: 'lower valid move count',
            first: {
                score: 100,
                rulesetVersion: 1,
                elapsedSeconds: 10,
                totalMoves: 5,
                createdAt: '2026-08-01T00:00:01Z',
            },
            second: {
                score: 100,
                rulesetVersion: 2,
                elapsedSeconds: 10,
                totalMoves: 9,
                createdAt: '2026-08-01T00:00:00Z',
            },
            expectedRuleset: 1,
        },
        {
            name: 'earlier created_at',
            first: {
                score: 100,
                rulesetVersion: 1,
                elapsedSeconds: 10,
                totalMoves: 5,
                createdAt: '2026-08-01T00:00:00Z',
            },
            second: {
                score: 100,
                rulesetVersion: 2,
                elapsedSeconds: 10,
                totalMoves: 5,
                createdAt: '2026-08-01T00:00:01Z',
            },
            expectedRuleset: 1,
        },
        {
            name: 'lower row id for equal second-resolution timestamps',
            first: {
                score: 100,
                rulesetVersion: 1,
                elapsedSeconds: 10,
                totalMoves: 5,
                createdAt: '2026-08-01T00:00:00Z',
            },
            second: {
                score: 100,
                rulesetVersion: 2,
                elapsedSeconds: 10,
                totalMoves: 5,
                createdAt: '2026-08-01T00:00:00Z',
            },
            expectedRuleset: 1,
        },
    ])('selects by $name', async ({ first, second, expectedRuleset }) => {
        await seedUser('u1', 'One')
        await seedScopedScore('u1', first.score, {
            mode: 'daily',
            competitionKey: 'daily:tie',
            rulesetVersion: first.rulesetVersion,
            createdAt: first.createdAt,
            gameData: {
                elapsedSeconds: first.elapsedSeconds,
                totalMoves: first.totalMoves,
            },
        })
        await seedScopedScore('u1', second.score, {
            mode: 'daily',
            competitionKey: 'daily:tie',
            rulesetVersion: second.rulesetVersion,
            createdAt: second.createdAt,
            gameData: {
                elapsedSeconds: second.elapsedSeconds,
                totalMoves: second.totalMoves,
            },
        })

        const result = await getScopedGameLeaderboard({
            gameId: 'tetris',
            mode: 'daily',
            competitionKey: 'daily:tie',
            limit: 10,
        })

        expect(result.success).toBe(true)
        if (!result.success) {
            throw new Error('expected success')
        }
        expect(result.rows[0].rulesetVersion).toBe(expectedRuleset)
    })

    it('sorts valid metrics before missing, fractional, negative, and malformed values', async () => {
        await seedUser('valid', 'Valid')
        await seedUser('invalid', 'Invalid')
        await seedUser('broken', 'Broken')

        await seedScopedScore('valid', 100, {
            mode: 'daily',
            competitionKey: 'daily:invalid',
            rulesetVersion: 1,
            gameData: { elapsedSeconds: 12, totalMoves: 20 },
        })
        await seedScopedScore('invalid', 100, {
            mode: 'daily',
            competitionKey: 'daily:invalid',
            rulesetVersion: 1,
            rawGameDataJson: '{"elapsedSeconds":12.5,"totalMoves":-1}',
        })
        await seedScopedScore('broken', 100, {
            mode: 'daily',
            competitionKey: 'daily:invalid',
            rulesetVersion: 1,
            rawGameDataJson: '{not-json',
        })

        const result = await getScopedGameLeaderboard({
            gameId: 'tetris',
            mode: 'daily',
            competitionKey: 'daily:invalid',
            limit: 10,
        })

        expect(result.success).toBe(true)
        if (!result.success) {
            throw new Error('expected success')
        }
        expect(result.rows[0].userId).toBe('valid')
        expect(result.rows.slice(1)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    userId: 'invalid',
                    elapsedSeconds: null,
                    totalMoves: null,
                }),
                expect.objectContaining({
                    userId: 'broken',
                    elapsedSeconds: null,
                    totalMoves: null,
                }),
            ])
        )
    })

    it('excludes null-version rows and does not project unknown JSON keys', async () => {
        await seedUser('u1', 'One')
        await seedUser('u2', 'Two')
        await seedScopedScore('u1', 100, {
            mode: 'daily',
            competitionKey: 'daily:version',
            rulesetVersion: null,
            gameData: { elapsedSeconds: 1, combo: 99 },
        })
        await seedScopedScore('u2', 90, {
            mode: 'daily',
            competitionKey: 'daily:version',
            rulesetVersion: 1,
            gameData: { elapsedSeconds: 2, combo: 100 },
        })

        const result = await getScopedGameLeaderboard({
            gameId: 'tetris',
            mode: 'daily',
            competitionKey: 'daily:version',
            limit: 10,
        })

        expect(result.success).toBe(true)
        if (!result.success) {
            throw new Error('expected success')
        }
        expect(result.rows.map(row => row.userId)).toEqual(['u2'])
        expect(result.rows[0]).not.toHaveProperty('combo')
    })

    it('applies limit after best-per-user partitioning', async () => {
        for (let user = 0; user < 100; user += 1) {
            const userId = `u-${user}`
            await seedUser(userId, `Player ${user}`)
            for (let attempt = 0; attempt < 3; attempt += 1) {
                await seedScopedScore(userId, user * 10 + attempt, {
                    mode: 'daily',
                    competitionKey: 'daily:bulk',
                    rulesetVersion: 1,
                    gameData: {
                        elapsedSeconds: 100 - attempt,
                        totalMoves: 50 - attempt,
                    },
                })
            }
        }

        const result = await getScopedGameLeaderboard({
            gameId: 'tetris',
            mode: 'daily',
            competitionKey: 'daily:bulk',
            limit: 10,
        })

        expect(result.success).toBe(true)
        if (!result.success) {
            throw new Error('expected success')
        }
        expect(result.rows).toHaveLength(10)
        expect(new Set(result.rows.map(row => row.userId)).size).toBe(10)
        expect(result.rows[0].score).toBe(992)
    })
})
