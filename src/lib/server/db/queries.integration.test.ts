/**
 * Integration tests for database query functions using a real in-memory SQLite instance.
 * These tests validate actual SQL behavior rather than just Kysely call chains.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { sql } from 'kysely'
import type { UserStatsUpdate } from '@/lib/server/db/types'

// Set up an in-memory SQLite Kysely instance before any module imports
vi.mock('@/lib/server/db/client', async () => {
    const { Kysely } = await import('kysely')
    const { LibsqlDialect, libsql } = await import('@libsql/kysely-libsql')

    const client = libsql.createClient({ url: ':memory:' })
    const dialect = new LibsqlDialect({ client })
    const db = new Kysely({ dialect })

    return { db, dialect }
})

// Imports resolve to the mocked in-memory db instance
import { db } from '@/lib/server/db/client'
import {
    getUserStats,
    getUserRecentScores,
    getUserBestScore,
    getUserBestScoreForGame,
    hasUserEarnedAchievement,
    awardAchievement,
    getUserAchievements,
    getAllUserIds,
    getActiveUserIdsBetween,
    getGameLeaderboard,
} from '@/lib/server/db/queries'

// ─── Schema setup ────────────────────────────────────────────────────────────

beforeAll(async () => {
    await sql`
        CREATE TABLE IF NOT EXISTS user (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            emailVerified INTEGER NOT NULL DEFAULT 0,
            image TEXT,
            username TEXT,
            displayName TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE TABLE IF NOT EXISTS game_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            game_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE TABLE IF NOT EXISTS user_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            total_games_played INTEGER NOT NULL DEFAULT 0,
            total_score INTEGER NOT NULL DEFAULT 0,
            favorite_game TEXT,
            streak_days INTEGER NOT NULL DEFAULT 0,
            xp INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            challenge_streak INTEGER NOT NULL DEFAULT 0,
            last_challenge_date TEXT,
            login_streak INTEGER NOT NULL DEFAULT 0,
            last_login_reward_date TEXT,
            total_login_cycles INTEGER NOT NULL DEFAULT 0,
            email_notifications INTEGER NOT NULL DEFAULT 1,
            push_notifications INTEGER NOT NULL DEFAULT 0,
            challenge_reminders INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)

    await sql`
        CREATE TABLE IF NOT EXISTS user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            achievement_id TEXT NOT NULL,
            earned_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db)
})

afterEach(async () => {
    await sql`DELETE FROM game_scores`.execute(db)
    await sql`DELETE FROM user_stats`.execute(db)
    await sql`DELETE FROM user_achievements`.execute(db)
    await sql`DELETE FROM user`.execute(db)
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUser(
    id: string,
    name: string,
    opts: { username?: string; displayName?: string; image?: string } = {}
) {
    await sql`
        INSERT INTO user (id, name, email, emailVerified, username, displayName, image)
        VALUES (${id}, ${name}, ${id + '@test.com'}, 0,
                ${opts.username ?? null}, ${opts.displayName ?? null}, ${opts.image ?? null})
    `.execute(db)
}

async function seedScore(
    userId: string,
    gameId: string,
    score: number,
    createdAt?: string
) {
    if (createdAt) {
        await sql`
            INSERT INTO game_scores (user_id, game_id, score, created_at)
            VALUES (${userId}, ${gameId}, ${score}, ${createdAt})
        `.execute(db)
    } else {
        await sql`
            INSERT INTO game_scores (user_id, game_id, score)
            VALUES (${userId}, ${gameId}, ${score})
        `.execute(db)
    }
}

async function seedUserStats(
    userId: string,
    overrides: Partial<UserStatsUpdate> = {}
) {
    const seedValues: Required<
        Pick<
            UserStatsUpdate,
            | 'total_games_played'
            | 'total_score'
            | 'streak_days'
            | 'xp'
            | 'level'
            | 'challenge_streak'
            | 'login_streak'
            | 'total_login_cycles'
        >
    > = {
        total_games_played: overrides.total_games_played ?? 0,
        total_score: overrides.total_score ?? 0,
        streak_days: overrides.streak_days ?? 0,
        xp: overrides.xp ?? 0,
        level: overrides.level ?? 1,
        challenge_streak: overrides.challenge_streak ?? 0,
        login_streak: overrides.login_streak ?? 0,
        total_login_cycles: overrides.total_login_cycles ?? 0,
    }
    await sql`
        INSERT INTO user_stats
            (user_id, total_games_played, total_score, streak_days, xp, level,
             challenge_streak, login_streak, total_login_cycles)
        VALUES (${userId}, ${seedValues.total_games_played}, ${seedValues.total_score},
                ${seedValues.streak_days}, ${seedValues.xp}, ${seedValues.level},
                ${seedValues.challenge_streak}, ${seedValues.login_streak},
                ${seedValues.total_login_cycles})
    `.execute(db)
}

async function seedAchievement(userId: string, achievementId: string) {
    await sql`
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES (${userId}, ${achievementId})
    `.execute(db)
}

// ─── getUserStats ─────────────────────────────────────────────────────────────

describe('getUserStats (integration)', () => {
    it('returns null when user has no stats row', async () => {
        const result = await getUserStats('nonexistent')
        expect(result).toBeNull()
    })

    it('overrides total_games_played with distinct game count from game_scores', async () => {
        await seedUserStats('u1', { total_games_played: 99, total_score: 5000 })
        // Two tetris scores (same game) + one snake score = 2 distinct games
        await seedScore('u1', 'tetris', 1000)
        await seedScore('u1', 'tetris', 2000)
        await seedScore('u1', 'snake', 500)

        const result = await getUserStats('u1')

        expect(result).not.toBeNull()
        expect(result!.total_games_played).toBe(2) // distinct: tetris, snake
        expect(result!.total_score).toBe(5000) // stored value unmodified
    })

    it('returns zero distinct games when user has stats but no scores', async () => {
        await seedUserStats('u1', { total_games_played: 5 })

        const result = await getUserStats('u1')

        expect(result).not.toBeNull()
        expect(result!.total_games_played).toBe(0)
    })
})

// ─── getUserRecentScores ──────────────────────────────────────────────────────

describe('getUserRecentScores (integration)', () => {
    it('returns empty array when user has no scores', async () => {
        const result = await getUserRecentScores('u1')
        expect(result).toEqual([])
    })

    it('returns scores belonging to the user', async () => {
        await seedScore('u1', 'tetris', 1500)
        await seedScore('u1', 'snake', 800)
        await seedScore('u2', 'tetris', 9999) // different user - must not appear

        const result = await getUserRecentScores('u1')

        expect(result).toHaveLength(2)
        expect(result.every(r => r.user_id === 'u1')).toBe(true)
    })

    it('respects the limit parameter', async () => {
        for (let i = 0; i < 8; i++) {
            await seedScore('u1', 'tetris', i * 100)
        }

        const result = await getUserRecentScores('u1', 3)
        expect(result).toHaveLength(3)
    })

    it('uses default limit of 5', async () => {
        for (let i = 0; i < 7; i++) {
            await seedScore('u1', 'tetris', i * 100)
        }

        const result = await getUserRecentScores('u1')
        expect(result).toHaveLength(5)
    })
})

// ─── getUserBestScore ─────────────────────────────────────────────────────────

describe('getUserBestScore (integration)', () => {
    it('returns null when user has no scores for the game', async () => {
        const result = await getUserBestScore('u1', 'tetris')
        expect(result).toBeNull()
    })

    it('returns the highest score for the user/game pair', async () => {
        await seedScore('u1', 'tetris', 1000)
        await seedScore('u1', 'tetris', 5000)
        await seedScore('u1', 'tetris', 2000)

        const result = await getUserBestScore('u1', 'tetris')
        expect(result).toBe(5000)
    })

    it('only considers scores for the specified game', async () => {
        await seedScore('u1', 'snake', 9999)
        await seedScore('u1', 'tetris', 500)

        const result = await getUserBestScore('u1', 'tetris')
        expect(result).toBe(500)
    })

    it('only considers scores for the specified user', async () => {
        await seedScore('u2', 'tetris', 9999)
        await seedScore('u1', 'tetris', 100)

        const result = await getUserBestScore('u1', 'tetris')
        expect(result).toBe(100)
    })
})

// ─── getUserBestScoreForGame ──────────────────────────────────────────────────

describe('getUserBestScoreForGame (integration)', () => {
    it('returns 0 when no score exists (null → 0 conversion)', async () => {
        const result = await getUserBestScoreForGame('u1', 'snake')
        expect(result).toBe(0)
    })

    it('returns the best score when scores exist', async () => {
        await seedScore('u1', 'snake', 3000)
        await seedScore('u1', 'snake', 7200)

        const result = await getUserBestScoreForGame('u1', 'snake')
        expect(result).toBe(7200)
    })
})

// ─── hasUserEarnedAchievement ─────────────────────────────────────────────────

describe('hasUserEarnedAchievement (integration)', () => {
    it('returns false when user does not have the achievement', async () => {
        const result = await hasUserEarnedAchievement('u1', 'tetris_master')
        expect(result).toBe(false)
    })

    it('returns true when user has the achievement', async () => {
        await seedAchievement('u1', 'tetris_master')

        const result = await hasUserEarnedAchievement('u1', 'tetris_master')
        expect(result).toBe(true)
    })

    it('returns false for a different achievement the user does not have', async () => {
        await seedAchievement('u1', 'snake_expert')

        const result = await hasUserEarnedAchievement('u1', 'tetris_master')
        expect(result).toBe(false)
    })
})

// ─── awardAchievement ────────────────────────────────────────────────────────

describe('awardAchievement (integration)', () => {
    it('inserts the achievement and returns true when not already earned', async () => {
        const result = await awardAchievement('u1', 'tetris_master')

        expect(result).toBe(true)
        // Assert directly against the table rather than via hasUserEarnedAchievement
        // to avoid masking shared bugs between the two functions
        const { rows } = await sql<{ count: number }>`
            SELECT COUNT(*) AS count FROM user_achievements
            WHERE user_id = 'u1' AND achievement_id = 'tetris_master'
        `.execute(db)
        expect(Number((rows[0] as { count: unknown }).count)).toBe(1)
    })

    it('returns true without duplicating when already earned', async () => {
        await seedAchievement('u1', 'tetris_master')

        const result = await awardAchievement('u1', 'tetris_master')

        expect(result).toBe(true)
        // Count directly — must still be exactly one row
        const { rows } = await sql<{ count: number }>`
            SELECT COUNT(*) AS count FROM user_achievements
            WHERE user_id = 'u1' AND achievement_id = 'tetris_master'
        `.execute(db)
        expect(Number((rows[0] as { count: unknown }).count)).toBe(1)
    })
})

// ─── getUserAchievements ──────────────────────────────────────────────────────

describe('getUserAchievements (integration)', () => {
    it('returns empty array when user has no achievements', async () => {
        const result = await getUserAchievements('u1')
        expect(result).toEqual([])
    })

    it('returns all achievements for the user', async () => {
        await seedAchievement('u1', 'tetris_master')
        await seedAchievement('u1', 'snake_expert')
        await seedAchievement('u2', 'other_ach') // different user — must not appear

        const result = await getUserAchievements('u1')

        expect(result).toHaveLength(2)
        expect(result.map(r => r.achievement_id)).toEqual(
            expect.arrayContaining(['tetris_master', 'snake_expert'])
        )
        expect(result.every(r => r.user_id === 'u1')).toBe(true)
    })
})

// ─── getAllUserIds ────────────────────────────────────────────────────────────

describe('getAllUserIds (integration)', () => {
    it('returns empty array when no users exist', async () => {
        const result = await getAllUserIds()
        expect(result).toEqual([])
    })

    it('returns all user IDs', async () => {
        await seedUser('u1', 'Alice')
        await seedUser('u2', 'Bob')
        await seedUser('u3', 'Carol')

        const result = await getAllUserIds()

        expect(result).toHaveLength(3)
        expect(result).toEqual(expect.arrayContaining(['u1', 'u2', 'u3']))
    })
})

// ─── getActiveUserIdsBetween ──────────────────────────────────────────────────

describe('getActiveUserIdsBetween (integration)', () => {
    // libsql serializes Date objects as numeric millisecond timestamps.
    // SQLite then coerces that integer to a TEXT string for comparison against
    // the TEXT-affinity created_at column (lexicographic comparison).
    //
    // Fixed windows used in these tests:
    //   start = new Date(3e12) → '3000000000000'  (≈ year 2065)
    //   end   = new Date(5e12) → '5000000000000'  (≈ year 2128)
    //
    // Explicit ISO timestamps chosen for deterministic boundary coverage:
    //   '2024-06-01 00:00:00' → starts with '2', so '2' < '3' → strictly before start
    //   '4000-01-01 00:00:00' → starts with '4', so '3' < '4' < '5' → inside window
    //   '9999-01-01 00:00:00' → starts with '9', so '9' > '5' → strictly after end

    it('returns empty array when no scores exist', async () => {
        const start = new Date(3e12)
        const end = new Date(5e12)
        const result = await getActiveUserIdsBetween(start, end)
        expect(result).toEqual([])
    })

    it('includes only in-range users, deduplicates same-user scores, and excludes out-of-range users', async () => {
        // u_before: score timestamped before the window – must be excluded
        await seedScore('u_before', 'tetris', 100, '2024-06-01 00:00:00')
        // u_inside: two scores within the window – must appear exactly once (distinct)
        await seedScore('u_inside', 'tetris', 200, '4000-01-01 00:00:00')
        await seedScore('u_inside', 'snake', 300, '4500-06-01 00:00:00')
        // u_after: score timestamped after the window – must be excluded
        await seedScore('u_after', 'tetris', 400, '9999-01-01 00:00:00')

        const start = new Date(3e12)
        const end = new Date(5e12)
        const result = await getActiveUserIdsBetween(start, end)

        expect(result).toHaveLength(1) // only u_inside; u_before and u_after excluded
        expect(result).toContain('u_inside')
        expect(result).not.toContain('u_before')
        expect(result).not.toContain('u_after')
    })
})

// ─── getGameLeaderboard ───────────────────────────────────────────────────────

describe('getGameLeaderboard (integration)', () => {
    it('returns empty array when no scores exist for game', async () => {
        const result = await getGameLeaderboard('tetris')
        expect(result).toEqual([])
    })

    it('returns entries ordered by score descending', async () => {
        await seedUser('u1', 'Alice', { username: 'alice' })
        await seedUser('u2', 'Bob', { username: 'bob' })
        await seedScore('u1', 'tetris', 3000)
        await seedScore('u2', 'tetris', 8000)

        const result = await getGameLeaderboard('tetris')

        expect(result[0].score).toBe(8000)
        expect(result[1].score).toBe(3000)
    })

    it('returns Anonymous for scores with no matching user (left join null)', async () => {
        // Score with a user_id that has no row in the user table
        await sql`
            INSERT INTO game_scores (user_id, game_id, score)
            VALUES ('ghost-user', 'tetris', 5000)
        `.execute(db)

        const result = await getGameLeaderboard('tetris')

        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Anonymous')
        expect(result[0].username).toBeNull()
        expect(result[0].score).toBe(5000)
    })

    it('uses displayName over username and name via coalesce', async () => {
        await seedUser('u1', 'RealName', {
            username: 'handle',
            displayName: 'DisplayPref',
        })
        await seedScore('u1', 'tetris', 1000)

        const result = await getGameLeaderboard('tetris')

        expect(result[0].name).toBe('DisplayPref')
    })

    it('falls back to username when displayName is null', async () => {
        await seedUser('u1', 'RealName', { username: 'handle' })
        await seedScore('u1', 'tetris', 1000)

        const result = await getGameLeaderboard('tetris')

        expect(result[0].name).toBe('handle')
    })

    it('falls back to name when displayName and username are null', async () => {
        await seedUser('u1', 'RealName')
        await seedScore('u1', 'tetris', 1000)

        const result = await getGameLeaderboard('tetris')

        expect(result[0].name).toBe('RealName')
    })

    it('respects the limit parameter', async () => {
        await seedUser('u1', 'A')
        await seedUser('u2', 'B')
        await seedUser('u3', 'C')
        await seedScore('u1', 'tetris', 1000)
        await seedScore('u2', 'tetris', 2000)
        await seedScore('u3', 'tetris', 3000)

        const result = await getGameLeaderboard('tetris', 2)
        expect(result).toHaveLength(2)
    })

    it('only returns scores for the specified game', async () => {
        await seedUser('u1', 'Alice')
        await seedScore('u1', 'snake', 9999) // different game
        await seedScore('u1', 'tetris', 500)

        const result = await getGameLeaderboard('tetris')

        expect(result).toHaveLength(1)
        expect(result[0].score).toBe(500)
    })
})
