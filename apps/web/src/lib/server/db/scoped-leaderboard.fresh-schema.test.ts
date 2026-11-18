import { afterEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'

vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')
    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    return { db: new Kysely({ dialect }), dialect }
})

import { db } from '@/lib/server/db/client'
import { ensureGameScoresContextSchema } from './game-score-context'
import { getScopedGameLeaderboard } from './scoped-leaderboard'

/**
 * Regression for the real E2E failure: a freshly initialized database runs
 * Better Auth's own migration first, so `"user"` has no displayName/username
 * columns (and the legacy base `game_scores` has no context columns). The
 * scoped leaderboard must prepare BOTH through the shared lazy migrations
 * instead of failing the JOIN; an unrepairable identity schema must surface
 * as the honest unavailable code, not a thrown/raw SQL error.
 */

const COMPETITION_KEY = 'ice-slide:daily:2026-08-12:g1:r1'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('getScopedGameLeaderboard on a fresh Better Auth schema', () => {
    it('reports unavailable when the identity schema cannot be prepared', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        // Legacy base game_scores; no "user" table exists yet.
        await sql`
            CREATE TABLE IF NOT EXISTS game_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                game_id TEXT NOT NULL,
                score INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `.execute(db)

        const result = await getScopedGameLeaderboard({
            gameId: 'ice_slide',
            mode: 'daily',
            competitionKey: COMPETITION_KEY,
            limit: 10,
        })

        expect(result).toEqual({
            success: false,
            code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
        })
        expect(errorSpy).toHaveBeenCalledWith(
            '[getScopedGameLeaderboard] identity schema unavailable:',
            expect.stringContaining('no such table')
        )
    })

    it('adds the identity columns before the scoped query and returns the ranking', async () => {
        // Better Auth's canonical fresh user table: name/email/image only.
        await sql`
            CREATE TABLE "user" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                emailVerified INTEGER NOT NULL DEFAULT 0,
                image TEXT,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            )
        `.execute(db)
        await sql`
            INSERT INTO "user" (
                id, name, email, emailVerified, image, createdAt, updatedAt
            )
            VALUES (
                'u1', 'Fresh Player', 'fresh@example.com', 0, NULL, 1, 1
            )
        `.execute(db)

        // The scoped context columns are lazily added too (legacy base table).
        const capabilities = await ensureGameScoresContextSchema()
        expect(capabilities.known).toBe(true)
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
                'u1',
                'ice_slide',
                500,
                'daily',
                ${COMPETITION_KEY},
                1,
                '{"elapsedSeconds":12,"totalMoves":8}',
                '2026-08-12T10:00:00Z'
            )
        `.execute(db)

        const result = await getScopedGameLeaderboard({
            gameId: 'ice_slide',
            mode: 'daily',
            competitionKey: COMPETITION_KEY,
            limit: 10,
        })

        expect(result.success).toBe(true)
        if (!result.success) {
            throw new Error('expected success')
        }
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0]).toMatchObject({
            userId: 'u1',
            name: 'Fresh Player',
            username: null,
            image: null,
            score: 500,
            mode: 'daily',
            competitionKey: COMPETITION_KEY,
            rulesetVersion: 1,
            elapsedSeconds: 12,
            totalMoves: 8,
        })

        const columns = await sql<{ name: string }>`
            PRAGMA table_info("user")
        `.execute(db)
        const names = columns.rows.map(row => row.name)
        expect(names).toEqual(
            expect.arrayContaining(['displayName', 'username'])
        )
    })
})
