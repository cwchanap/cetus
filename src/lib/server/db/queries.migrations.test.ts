/**
 * Integration tests for database migration functions using a real in-memory SQLite instance.
 * These tests specifically cover the `ensure*` migration functions that are otherwise
 * unreachable because tests mock the database client.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { sql } from 'kysely'

// Set up in-memory SQLite WITHOUT the migration columns so migrations actually run
vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')

    // Use a unique temp file database so transactions work correctly across connections
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const client = libsql.createClient({
        url: `file:/tmp/vitest-migrations-${uniqueId}.db`,
    })
    const dialect = new LibsqlDialect({ client })
    const db = new Kysely({ dialect })

    return { db, dialect }
})

import { db } from '@/lib/server/db/client'
import {
    ensureUserIdentityColumns,
    ensureStreakColumn,
    ensureChallengeColumns,
    ensureDailyChallengeTable,
    ensureLoginRewardColumns,
    ensurePreferenceColumns,
    completeChallengeAndAwardXP,
    atomicCheckAndUpdateStreak,
    upsertChallengeProgress,
} from '@/lib/server/db/queries'

// Minimal schema - NO migration columns, so the migrations must add them
beforeAll(async () => {
    // user table WITHOUT username/displayName
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

    // user_stats table with only base columns (NO migration columns)
    await sql`
        CREATE TABLE IF NOT EXISTS user_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            total_games_played INTEGER NOT NULL DEFAULT 0,
            total_score INTEGER NOT NULL DEFAULT 0,
            favorite_game TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    // Seed a user for later tests
    await sql`
        INSERT INTO user (id, name, email, emailVerified)
        VALUES ('user-mig-1', 'Test User', 'test@test.com', 0)
    `.execute(db)
})

describe('ensureUserIdentityColumns', () => {
    it('should add displayName and username columns to user table', async () => {
        await expect(ensureUserIdentityColumns()).resolves.toBeUndefined()

        // Verify the columns were added by trying to select them
        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user)`.execute(db)
        const colNames = result.rows.map(r => r.name)
        expect(colNames).toContain('displayName')
        expect(colNames).toContain('username')
    })

    it('should hit early return on second call (idempotent)', async () => {
        // Second call should return immediately (migration already run)
        await expect(ensureUserIdentityColumns()).resolves.toBeUndefined()
    })
})

describe('ensureStreakColumn', () => {
    it('should add streak_days column to user_stats table', async () => {
        await expect(ensureStreakColumn()).resolves.toBeUndefined()

        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const colNames = result.rows.map(r => r.name)
        expect(colNames).toContain('streak_days')
    })

    it('should hit early return on second call (idempotent)', async () => {
        await expect(ensureStreakColumn()).resolves.toBeUndefined()
    })
})

describe('ensureChallengeColumns', () => {
    it('should add xp, level, challenge_streak, last_challenge_date columns', async () => {
        await expect(ensureChallengeColumns()).resolves.toBeUndefined()

        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const colNames = result.rows.map(r => r.name)
        expect(colNames).toContain('xp')
        expect(colNames).toContain('level')
        expect(colNames).toContain('challenge_streak')
        expect(colNames).toContain('last_challenge_date')
    })

    it('should hit early return on second call (idempotent)', async () => {
        await expect(ensureChallengeColumns()).resolves.toBeUndefined()
    })
})

describe('ensureDailyChallengeTable', () => {
    it('should create daily_challenge_progress table with index', async () => {
        await expect(ensureDailyChallengeTable()).resolves.toBeUndefined()

        // Verify table exists by selecting from it
        const result = await sql<{
            name: string
        }>`SELECT name FROM sqlite_master WHERE type='table' AND name='daily_challenge_progress'`.execute(
            db
        )
        expect(result.rows.length).toBe(1)
    })

    it('should hit early return on second call (idempotent)', async () => {
        await expect(ensureDailyChallengeTable()).resolves.toBeUndefined()
    })
})

describe('ensureLoginRewardColumns', () => {
    it('should add login_streak, last_login_reward_date, total_login_cycles columns', async () => {
        await expect(ensureLoginRewardColumns()).resolves.toBeUndefined()

        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const colNames = result.rows.map(r => r.name)
        expect(colNames).toContain('login_streak')
        expect(colNames).toContain('last_login_reward_date')
        expect(colNames).toContain('total_login_cycles')
    })

    it('should hit early return on second call (idempotent)', async () => {
        await expect(ensureLoginRewardColumns()).resolves.toBeUndefined()
    })
})

describe('ensurePreferenceColumns', () => {
    it('should add email_notifications, push_notifications, challenge_reminders columns', async () => {
        await expect(ensurePreferenceColumns()).resolves.toBeUndefined()

        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const colNames = result.rows.map(r => r.name)
        expect(colNames).toContain('email_notifications')
        expect(colNames).toContain('push_notifications')
        expect(colNames).toContain('challenge_reminders')
    })

    it('should hit early return on second call (idempotent)', async () => {
        await expect(ensurePreferenceColumns()).resolves.toBeUndefined()
    })
})

describe('upsertChallengeProgress', () => {
    it('should insert a new challenge progress record', async () => {
        const result = await upsertChallengeProgress(
            'user-mig-1',
            '2024-01-15',
            'play_5_games',
            10
        )
        expect(result).toBe(true)
    })

    it('should do nothing on conflict (onConflict doNothing path)', async () => {
        // Insert same record again - should hit onConflict path
        const result = await upsertChallengeProgress(
            'user-mig-1',
            '2024-01-15',
            'play_5_games',
            10
        )
        expect(result).toBe(true)
    })
})

describe('completeChallengeAndAwardXP', () => {
    it('should award XP to user with existing stats (update path)', async () => {
        // Create user_stats for this user
        await sql`
            INSERT INTO user_stats (user_id, total_games_played, total_score, xp, level, challenge_streak)
            VALUES ('user-mig-1', 5, 1000, 50, 1, 0)
            ON CONFLICT (user_id) DO UPDATE SET xp = 50, level = 1
        `.execute(db)

        // Ensure there's a progress record with xp_awarded = 0
        await sql`
            INSERT OR REPLACE INTO daily_challenge_progress
            (user_id, challenge_date, challenge_id, current_value, target_value, xp_awarded)
            VALUES ('user-mig-1', '2024-01-15', 'play_5_games', 10, 10, 0)
        `.execute(db)

        const result = await completeChallengeAndAwardXP(
            'user-mig-1',
            '2024-01-15',
            'play_5_games',
            25
        )
        expect(result).toBe(true)

        // Verify XP was updated
        const stats = await sql<{
            xp: number
        }>`SELECT xp FROM user_stats WHERE user_id = 'user-mig-1'`.execute(db)
        expect(stats.rows[0].xp).toBe(75) // 50 + 25
    })

    it('should insert user_stats when stats row does not exist (insert path)', async () => {
        const userId = 'user-no-stats'
        await sql`
            INSERT INTO user (id, name, email, emailVerified)
            VALUES (${userId}, 'No Stats', 'nostats@test.com', 0)
        `.execute(db)

        // Create progress record
        await sql`
            INSERT INTO daily_challenge_progress
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

        // Verify stats were created
        const stats = await sql<{
            xp: number
        }>`SELECT xp FROM user_stats WHERE user_id = ${userId}`.execute(db)
        expect(stats.rows[0].xp).toBe(30)
    })
})

describe('atomicCheckAndUpdateStreak - with existing stats', () => {
    it('should update streak when last_challenge_date is not today', async () => {
        const userId = 'user-streak-1'
        const today = '2024-01-15'
        const yesterday = '2024-01-14'

        await sql`
            INSERT INTO user (id, name, email, emailVerified)
            VALUES (${userId}, 'Streak User', 'streak@test.com', 0)
        `.execute(db)

        // Insert stats with last_challenge_date = yesterday
        await sql`
            INSERT INTO user_stats
            (user_id, total_games_played, total_score, xp, level, challenge_streak, last_challenge_date)
            VALUES (${userId}, 0, 0, 0, 1, 3, ${yesterday})
        `.execute(db)

        const result = await atomicCheckAndUpdateStreak(userId, today, true)
        expect(result).toBe(true)

        // Verify streak was incremented
        const stats = await sql<{
            challenge_streak: number
            last_challenge_date: string
        }>`SELECT challenge_streak, last_challenge_date FROM user_stats WHERE user_id = ${userId}`.execute(
            db
        )
        expect(stats.rows[0].challenge_streak).toBe(4) // was 3, now 4
        expect(stats.rows[0].last_challenge_date).toBe(today)
    })

    it('should set streak to 1 when last_challenge_date is not yesterday', async () => {
        const userId = 'user-streak-2'
        const today = '2024-01-15'
        const twoDaysAgo = '2024-01-13'

        await sql`
            INSERT INTO user (id, name, email, emailVerified)
            VALUES (${userId}, 'Streak User 2', 'streak2@test.com', 0)
        `.execute(db)

        await sql`
            INSERT INTO user_stats
            (user_id, total_games_played, total_score, xp, level, challenge_streak, last_challenge_date)
            VALUES (${userId}, 0, 0, 0, 1, 5, ${twoDaysAgo})
        `.execute(db)

        const result = await atomicCheckAndUpdateStreak(userId, today, true)
        expect(result).toBe(true)

        const stats = await sql<{
            challenge_streak: number
        }>`SELECT challenge_streak FROM user_stats WHERE user_id = ${userId}`.execute(
            db
        )
        expect(stats.rows[0].challenge_streak).toBe(1) // reset to 1
    })

    it('should return false when already completed today', async () => {
        const userId = 'user-streak-3'
        const today = '2024-01-15'

        await sql`
            INSERT INTO user (id, name, email, emailVerified)
            VALUES (${userId}, 'Streak User 3', 'streak3@test.com', 0)
        `.execute(db)

        await sql`
            INSERT INTO user_stats
            (user_id, total_games_played, total_score, xp, level, challenge_streak, last_challenge_date)
            VALUES (${userId}, 0, 0, 0, 1, 2, ${today})
        `.execute(db)

        const result = await atomicCheckAndUpdateStreak(userId, today, true)
        expect(result).toBe(false)
    })

    it('should set streak to 1 when last_challenge_date is null', async () => {
        const userId = 'user-streak-4'
        const today = '2024-01-15'

        await sql`
            INSERT INTO user (id, name, email, emailVerified)
            VALUES (${userId}, 'Streak User 4', 'streak4@test.com', 0)
        `.execute(db)

        await sql`
            INSERT INTO user_stats
            (user_id, total_games_played, total_score, xp, level, challenge_streak, last_challenge_date)
            VALUES (${userId}, 0, 0, 0, 1, 0, NULL)
        `.execute(db)

        const result = await atomicCheckAndUpdateStreak(userId, today, true)
        expect(result).toBe(true)

        const stats = await sql<{
            challenge_streak: number
        }>`SELECT challenge_streak FROM user_stats WHERE user_id = ${userId}`.execute(
            db
        )
        expect(stats.rows[0].challenge_streak).toBe(1)
    })
})
