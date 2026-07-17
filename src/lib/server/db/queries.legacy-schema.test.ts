/**
 * Regression tests for user_stats insert paths on a legacy schema.
 *
 * The base schema (scripts/init-db.sql) ships with xp, level, challenge_streak,
 * last_challenge_date, and streak_days but NOT the login-reward or preference
 * columns. Several insert paths include those columns without first running the
 * corresponding ensure* migrations, so the insert is rejected by SQLite and the
 * surrounding transaction rolls back.
 *
 * Each test below targets one insert path with a user that has NO stats row,
 * forcing the insert (not update) branch on a legacy schema.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { sql } from 'kysely'

// Real in-memory SQLite so the schema mismatch is actually exercised.
// NOTE: This relies on vitest's per-file module isolation. The shared cache
// URL (`cache=shared`) only shares state within a single module instance; each
// test file gets its own fresh in-memory DB because vitest isolates modules
// per file. Do not merge this into a shared setup file or enable
// `isolate: false` without re-evaluating, or tests will leak schema state.
vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')

    const client = libsql.createClient({ url: 'file::memory:?cache=shared' })
    const dialect = new LibsqlDialect({ client })
    const db = new Kysely({ dialect })

    return { db, dialect }
})

// claimLoginReward dynamically imports getLevelFromXP from @/lib/challenges.
vi.mock('@/lib/challenges', () => ({
    getLevelFromXP: (xp: number) => Math.floor(xp / 100) + 1,
}))

import { db } from '@/lib/server/db/client'
import {
    ensureDailyChallengeTable,
    completeChallengeAndAwardXP,
    updateUserXPAndLevel,
    atomicCheckAndUpdateStreak,
    claimLoginReward,
} from '@/lib/server/db/queries'

// Base schema mirrors scripts/init-db.sql: user_stats has xp/level/challenge/
// streak_days but NOT login-reward or preference columns.
beforeAll(async () => {
    await sql`
        CREATE TABLE IF NOT EXISTS user (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            emailVerified INTEGER NOT NULL DEFAULT 0,
            image TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE TABLE IF NOT EXISTS user_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            total_games_played INTEGER DEFAULT 0,
            total_score INTEGER DEFAULT 0,
            favorite_game TEXT,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            challenge_streak INTEGER DEFAULT 0,
            last_challenge_date TEXT,
            streak_days INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE TABLE IF NOT EXISTS game_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await ensureDailyChallengeTable()
})

async function seedUser(userId: string): Promise<void> {
    const email = `${userId}@test.com`
    await sql`
        INSERT OR IGNORE INTO user (id, name, email, emailVerified)
        VALUES (${userId}, ${userId}, ${email}, 0)
    `.execute(db)
    await sql`DELETE FROM user_stats WHERE user_id = ${userId}`.execute(db)
}

describe('legacy schema insert paths', () => {
    it('completeChallengeAndAwardXP creates stats row for user without one', async () => {
        const userId = 'legacy-challenge-xp'
        await seedUser(userId)

        await sql`
            INSERT OR REPLACE INTO daily_challenge_progress
            (user_id, challenge_date, challenge_id, current_value, target_value, xp_awarded)
            VALUES (${userId}, '2024-01-15', 'score_100', 100, 100, 0)
        `.execute(db)

        const result = await completeChallengeAndAwardXP(
            userId,
            '2024-01-15',
            'score_100',
            30
        )
        expect(result).toBe(true)

        const stats = await sql<{
            xp: number
        }>`SELECT xp FROM user_stats WHERE user_id = ${userId}`.execute(db)
        expect(stats.rows[0]?.xp).toBe(30)
    })

    it('updateUserXPAndLevel creates stats row for user without one', async () => {
        const userId = 'legacy-update-xp'
        await seedUser(userId)

        const result = await updateUserXPAndLevel(userId, 40, 2)
        expect(result).toBe(true)

        const stats = await sql<{
            xp: number
            level: number
        }>`SELECT xp, level FROM user_stats WHERE user_id = ${userId}`.execute(
            db
        )
        expect(stats.rows[0]?.xp).toBe(40)
        expect(stats.rows[0]?.level).toBe(2)
    })

    it('atomicCheckAndUpdateStreak creates stats row for user without one', async () => {
        const userId = 'legacy-streak'
        await seedUser(userId)

        const result = await atomicCheckAndUpdateStreak(
            userId,
            '2024-01-15',
            true
        )
        expect(result).toBe(true)

        const stats = await sql<{
            challenge_streak: number
        }>`SELECT challenge_streak FROM user_stats WHERE user_id = ${userId}`.execute(
            db
        )
        expect(stats.rows[0]?.challenge_streak).toBe(1)
    })

    it('claimLoginReward creates stats row for user without one', async () => {
        const userId = 'legacy-login-reward'
        await seedUser(userId)

        const result = await claimLoginReward(
            userId,
            '2024-01-15',
            1,
            50,
            false,
            false
        )
        expect(result.success).toBe(true)

        const stats = await sql<{
            xp: number
            login_streak: number
        }>`SELECT xp, login_streak FROM user_stats WHERE user_id = ${userId}`.execute(
            db
        )
        expect(stats.rows[0]?.xp).toBe(50)
        expect(stats.rows[0]?.login_streak).toBe(1)
    })
})
