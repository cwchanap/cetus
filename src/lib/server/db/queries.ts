import { db } from './client'
import { sql } from 'kysely'
import type { GameID } from '../../games'
import type {
    NewGameScore,
    NewUserStats,
    UserStatsUpdate,
    UserUpdate,
    GameScore,
    UserStats,
    NewUserAchievement,
    UserAchievementRecord,
} from './types'

/**
 * Get user game statistics
 */
export async function getUserStats(userId: string): Promise<UserStats | null> {
    try {
        const stats = await db
            .selectFrom('user_stats')
            .selectAll()
            .where('user_id', '=', userId)
            .executeTakeFirst()

        if (!stats) {
            return null
        }

        // Calculate the correct count of distinct games played
        const distinctGames = await db
            .selectFrom('game_scores')
            .select('game_id')
            .distinct()
            .where('user_id', '=', userId)
            .execute()

        return {
            ...stats,
            total_games_played: distinctGames.length,
        }
    } catch (_e) {
        return null
    }
}

/**
 * Create or update user statistics
 */
export async function upsertUserStats(
    userId: string,
    updates: UserStatsUpdate
): Promise<boolean> {
    try {
        // Check if stats exist
        const existing = await getUserStats(userId)

        if (existing) {
            // Update existing stats
            await db
                .updateTable('user_stats')
                .set({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .where('user_id', '=', userId)
                .execute()
        } else {
            // Create new stats
            const newStats: NewUserStats = {
                user_id: userId,
                total_games_played: updates.total_games_played || 0,
                total_score: updates.total_score || 0,
                favorite_game: updates.favorite_game || null,
                streak_days: updates.streak_days || 0,
            }

            await db.insertInto('user_stats').values(newStats).execute()
        }

        return true
    } catch (_e) {
        return false
    }
}

/**
 * Get game leaderboard (includes anonymous players)
 */
export async function getGameLeaderboard(
    gameId: string,
    limit: number = 10
): Promise<
    Array<{
        name: string
        score: number
        created_at: string
        image: string | null
    }>
> {
    try {
        const results = await db
            .selectFrom('game_scores')
            .leftJoin('user', 'user.id', 'game_scores.user_id')
            .select(eb => [
                eb
                    .fn<string>('coalesce', [
                        // Prefer new fields, keep legacy fallbacks for safety
                        'user.displayName',
                        'user.username',
                        'user.name',
                        'user.email',
                    ])
                    .as('name'),
                'game_scores.score',
                'game_scores.created_at',
                'user.image',
            ])
            .where('game_scores.game_id', '=', gameId)
            .orderBy('game_scores.score', 'desc')
            .limit(limit)
            .execute()

        type Row = {
            name: string | null
            score: number
            created_at: Date
            image: string | null
        }

        const rows = results as Row[]

        return rows.map(row => ({
            name: row.name || 'Anonymous',
            score: row.score,
            created_at: new Date(row.created_at).toISOString(),
            image: row.image ?? null,
        }))
    } catch (_e) {
        return []
    }
}

/**
 * Ensure user identity columns (displayName, username) and unique index exist.
 * Safe and idempotent for SQLite/LibSQL.
 */
export async function ensureUserIdentityColumns(): Promise<void> {
    try {
        const result = await sql<{
            name: string
        }>`PRAGMA table_info("user")`.execute(db)
        const cols = result.rows?.map(r => r.name) ?? []

        if (!cols.includes('displayName')) {
            await sql`ALTER TABLE "user" ADD COLUMN displayName TEXT`.execute(
                db
            )
        }

        if (!cols.includes('username')) {
            await sql`ALTER TABLE "user" ADD COLUMN username TEXT`.execute(db)
        }

        // Create unique index for username (allows multiple NULLs by SQLite semantics)
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON "user" (username)`.execute(
            db
        )
    } catch (_e) {
        // swallow to avoid breaking primary flows
    }
}

/**
 * Check if a username is available (optionally excluding a specific user ID).
 */
export async function isUsernameAvailable(
    username: string,
    excludeUserId?: string
): Promise<boolean> {
    try {
        await ensureUserIdentityColumns()
        const q = db
            .selectFrom('user')
            .select('id')
            .where('username', '=', username)

        const row = excludeUserId
            ? await q.where('id', '!=', excludeUserId).executeTakeFirst()
            : await q.executeTakeFirst()

        return !row
    } catch (_e) {
        return false
    }
}

/**
 * Get user's daily activity counts for a specific year (UTC day buckets).
 * Returns array of { date: 'YYYY-MM-DD', count } for days that have activity.
 */
export async function getUserDailyActivity(
    userId: string,
    year?: number
): Promise<Array<{ date: string; count: number }>> {
    try {
        const now = new Date()
        const y = year ?? now.getUTCFullYear()

        // Filter by year directly using SQLite strftime to avoid type/format issues
        const yearStr = String(y)

        // Use UTC for grouping to match UTC calendar logic in the UI
        const dayExpr = sql<string>`strftime('%Y-%m-%d', "created_at", 'utc')`

        const rows = (await db
            .selectFrom('game_scores')
            .select([dayExpr.as('day'), db.fn.count('id').as('count')])
            .where('user_id', '=', userId)
            // Filter by matching year in UTC
            .where(
                sql<boolean>`strftime('%Y', "created_at", 'utc') = ${yearStr}`
            )
            .groupBy(dayExpr)
            .orderBy('day', 'asc')
            .execute()) as unknown as Array<{
            day: string
            count: number | string | bigint
        }>

        return rows.map(r => ({
            date: r.day,
            count: Number(r.count),
        }))
    } catch (_e) {
        return []
    }
}

/**
 * Get user's recent game scores
 */
export async function getUserRecentScores(
    userId: string,
    limit: number = 5
): Promise<GameScore[]> {
    try {
        const scores = await db
            .selectFrom('game_scores')
            .selectAll()
            .where('user_id', '=', userId)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .execute()

        return scores
    } catch (_e) {
        return []
    }
}

/**
 * Get user's best score for a specific game
 */
export async function getUserBestScore(
    userId: string,
    gameId: string
): Promise<number | null> {
    try {
        const result = await db
            .selectFrom('game_scores')
            .select('score')
            .where('user_id', '=', userId)
            .where('game_id', '=', gameId)
            .orderBy('score', 'desc')
            .limit(1)
            .executeTakeFirst()

        return result?.score || null
    } catch (_e) {
        return null
    }
}

// Note: Game queries removed - game data now comes from src/lib/games.ts

/**
 * Save score using game_scores table
 */
export async function saveGameScore(
    userId: string,
    gameId: string,
    score: number
): Promise<boolean> {
    try {
        const newScore: NewGameScore = {
            user_id: userId,
            game_id: gameId,
            score,
        }

        await db.insertInto('game_scores').values(newScore).execute()

        // Update user stats
        const currentStats = await getUserStats(userId)
        await upsertUserStats(userId, {
            total_games_played: (currentStats?.total_games_played || 0) + 1,
            total_score: (currentStats?.total_score || 0) + score,
            favorite_game: gameId,
        })

        return true
    } catch (_e) {
        return false
    }
}

/**
 * Save game score and check for achievements
 */
export async function saveGameScoreWithAchievements(
    userId: string,
    gameId: string,
    score: number,
    gameData?: unknown
): Promise<{ success: boolean; newAchievements: string[] }> {
    try {
        // First save the score
        const saveResult = await saveGameScore(userId, gameId, score)
        if (!saveResult) {
            return { success: false, newAchievements: [] }
        }

        // Import achievement service here to avoid circular dependency
        const { checkAndAwardAchievements, checkInGameAchievements } =
            await import('../../services/achievementService')

        // Check and award score-based achievements
        const scoreAchievements = await checkAndAwardAchievements(
            userId,
            gameId as GameID,
            score
        )

        // Check and award in-game achievements if game data is provided
        let inGameAchievements: string[] = []
        if (gameData) {
            inGameAchievements = await checkInGameAchievements(
                userId,
                gameId as GameID,
                gameData,
                score
            )
        }

        const allNewAchievements = [...scoreAchievements, ...inGameAchievements]

        return { success: true, newAchievements: allNewAchievements }
    } catch (_e) {
        return { success: false, newAchievements: [] }
    }
}

/**
 * Get user's game history with game details
 */
export async function getUserGameHistory(
    userId: string,
    limit: number = 10
): Promise<
    Array<{
        game_id: string
        game_name: string
        score: number
        created_at: string
    }>
> {
    try {
        const results = await db
            .selectFrom('game_scores')
            .select([
                'game_scores.game_id',
                'game_scores.score',
                'game_scores.created_at',
            ])
            .where('game_scores.user_id', '=', userId)
            .orderBy('game_scores.created_at', 'desc')
            .limit(limit)
            .execute()

        // Import game definitions to get names
        const { getGameById } = await import('../../games')

        return results.map(row => ({
            game_id: row.game_id,
            game_name:
                getGameById(row.game_id as GameID)?.name || 'Unknown Game',
            score: row.score,
            created_at: row.created_at.toString(),
        }))
    } catch (_e) {
        return []
    }
}

/**
 * Get paginated user's game history with total count
 */
export async function getUserGameHistoryPaginated(
    userId: string,
    page: number = 1,
    pageSize: number = 5
): Promise<{
    games: Array<{
        game_id: string
        game_name: string
        score: number
        created_at: string
    }>
    total: number
    page: number
    pageSize: number
    totalPages: number
}> {
    try {
        const offset = (page - 1) * pageSize

        // Get total count
        const totalResult = await db
            .selectFrom('game_scores')
            .select(db.fn.count('id').as('total'))
            .where('user_id', '=', userId)
            .executeTakeFirst()

        const total = Number(totalResult?.total) || 0
        const totalPages = Math.ceil(total / pageSize)

        // Get paginated results
        const results = await db
            .selectFrom('game_scores')
            .select([
                'game_scores.game_id',
                'game_scores.score',
                'game_scores.created_at',
            ])
            .where('game_scores.user_id', '=', userId)
            .orderBy('game_scores.created_at', 'desc')
            .limit(pageSize)
            .offset(offset)
            .execute()

        // Import game definitions to get names
        const { getGameById } = await import('../../games')

        const games = results.map(row => ({
            game_id: row.game_id,
            game_name:
                getGameById(row.game_id as GameID)?.name || 'Unknown Game',
            score: row.score,
            created_at: row.created_at.toString(),
        }))

        return {
            games,
            total,
            page,
            pageSize,
            totalPages,
        }
    } catch (_e) {
        return {
            games: [],
            total: 0,
            page: 1,
            pageSize,
            totalPages: 0,
        }
    }
}

/**
 * Get user's best score for a specific game
 */
export async function getUserBestScoreByGame(
    userId: string,
    gameId: string
): Promise<number | null> {
    try {
        const result = await db
            .selectFrom('game_scores')
            .select('score')
            .where('user_id', '=', userId)
            .where('game_id', '=', gameId)
            .orderBy('score', 'desc')
            .limit(1)
            .executeTakeFirst()

        return result?.score || null
    } catch (_e) {
        return null
    }
}

/**
 * Update user profile information
 */
export async function updateUser(
    userId: string,
    updates: UserUpdate
): Promise<boolean> {
    try {
        // Ensure columns exist before attempting to update new fields
        await ensureUserIdentityColumns()
        await db
            .updateTable('user')
            .set({
                ...updates,
                updatedAt: new Date().toISOString(),
            })
            .where('id', '=', userId)
            .execute()

        return true
    } catch (_e) {
        return false
    }
}

/**
 * Get user's earned achievements (just the records)
 */
export async function getUserAchievements(
    userId: string
): Promise<UserAchievementRecord[]> {
    try {
        const userAchievements = await db
            .selectFrom('user_achievements')
            .selectAll()
            .where('user_id', '=', userId)
            .orderBy('earned_at', 'desc')
            .execute()

        return userAchievements
    } catch (_e) {
        return []
    }
}

/**
 * Get paginated user achievements with total count
 */
export async function getUserAchievementsPaginated(
    userId: string,
    page: number = 1,
    pageSize: number = 10
): Promise<{
    userAchievements: UserAchievementRecord[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}> {
    try {
        const offset = (page - 1) * pageSize

        // Get total count of user achievements
        const totalResult = await db
            .selectFrom('user_achievements')
            .select(db.fn.count('id').as('total'))
            .where('user_id', '=', userId)
            .executeTakeFirst()

        const total = Number(totalResult?.total) || 0
        const totalPages = Math.ceil(total / pageSize)

        // Get paginated user achievements
        const userAchievements = await db
            .selectFrom('user_achievements')
            .selectAll()
            .where('user_id', '=', userId)
            .orderBy('earned_at', 'desc')
            .limit(pageSize)
            .offset(offset)
            .execute()

        return {
            userAchievements,
            total,
            page,
            pageSize,
            totalPages,
        }
    } catch (_e) {
        return {
            userAchievements: [],
            total: 0,
            page: 1,
            pageSize,
            totalPages: 0,
        }
    }
}

/**
 * Check if user has earned a specific achievement
 */
export async function hasUserEarnedAchievement(
    userId: string,
    achievementId: string
): Promise<boolean> {
    try {
        const result = await db
            .selectFrom('user_achievements')
            .select('id')
            .where('user_id', '=', userId)
            .where('achievement_id', '=', achievementId)
            .executeTakeFirst()

        return !!result
    } catch (_e) {
        return false
    }
}

/**
 * Award achievement to user
 */
export async function awardAchievement(
    userId: string,
    achievementId: string
): Promise<boolean> {
    try {
        // Check if user already has this achievement
        const hasAchievement = await hasUserEarnedAchievement(
            userId,
            achievementId
        )
        if (hasAchievement) {
            return true // Already earned
        }

        const newUserAchievement: NewUserAchievement = {
            user_id: userId,
            achievement_id: achievementId,
        }

        await db
            .insertInto('user_achievements')
            .values(newUserAchievement)
            .execute()

        return true
    } catch (_e) {
        return false
    }
}

/**
 * Get user's best score for a specific game (for achievement checking)
 */
export async function getUserBestScoreForGame(
    userId: string,
    gameId: string
): Promise<number> {
    try {
        const result = await db
            .selectFrom('game_scores')
            .select('score')
            .where('user_id', '=', userId)
            .where('game_id', '=', gameId)
            .orderBy('score', 'desc')
            .limit(1)
            .executeTakeFirst()

        return result?.score || 0
    } catch (_e) {
        return 0
    }
}

/**
 * Ensure streak_days column exists on user_stats (safe, idempotent)
 */
export async function ensureStreakColumn(): Promise<void> {
    try {
        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const hasCol = result.rows?.some(r => r.name === 'streak_days')
        if (!hasCol) {
            await sql`ALTER TABLE user_stats ADD COLUMN streak_days INTEGER NOT NULL DEFAULT 0`.execute(
                db
            )
        }
    } catch (_e) {
        // swallow to avoid breaking primary flows
    }
}

/**
 * Get all user IDs
 */
export async function getAllUserIds(): Promise<string[]> {
    try {
        const rows = await db.selectFrom('user').select('id').execute()
        return rows.map(r => r.id)
    } catch (_e) {
        return []
    }
}

/**
 * Get user IDs that had activity between [start, end)
 */
export async function getActiveUserIdsBetween(
    start: Date,
    end: Date
): Promise<string[]> {
    try {
        const rows = await db
            .selectFrom('game_scores')
            .select('user_id')
            .distinct()
            .where('created_at', '>=', start)
            .where('created_at', '<', end)
            .execute()
        return rows.map(r => r.user_id)
    } catch (_e) {
        return []
    }
}

/**
 * Increment user's streak (creates stats row if missing)
 */
export async function incrementUserStreak(userId: string): Promise<boolean> {
    try {
        const current = await getUserStats(userId)
        const next = (current?.streak_days ?? 0) + 1
        await upsertUserStats(userId, { streak_days: next })
        return true
    } catch (_e) {
        return false
    }
}

/**
 * Reset user's streak to zero (creates stats row if missing)
 */
export async function resetUserStreak(userId: string): Promise<boolean> {
    try {
        await upsertUserStats(userId, { streak_days: 0 })
        return true
    } catch (_e) {
        return false
    }
}

/**
 * Update all users' streaks for 00:00 UTC.
 * If user had activity yesterday (UTC), increment streak; otherwise reset to 0.
 */
export async function updateAllUserStreaksForUTC(): Promise<{
    processed: number
    incremented: number
    reset: number
}> {
    await ensureStreakColumn()

    const now = new Date()
    const todayUTC = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )
    const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000)

    const [allUserIds, activeYesterday] = await Promise.all([
        getAllUserIds(),
        getActiveUserIdsBetween(yesterdayUTC, todayUTC),
    ])

    const activeSet = new Set(activeYesterday)
    let inc = 0
    let rst = 0

    for (const uid of allUserIds) {
        if (activeSet.has(uid)) {
            if (await incrementUserStreak(uid)) {
                inc++
            }
        } else {
            if (await resetUserStreak(uid)) {
                rst++
            }
        }
    }

    return { processed: allUserIds.length, incremented: inc, reset: rst }
}
