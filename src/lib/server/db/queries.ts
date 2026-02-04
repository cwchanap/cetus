import { db } from './client'
import { sql } from 'kysely'
import type { AchievementCheckData } from '../../achievements'
import { GameID } from '../../games'
import type {
    NewGameScore,
    NewUserStats,
    UserStatsUpdate,
    UserUpdate,
    GameScore,
    UserStats,
    NewUserAchievement,
    UserAchievementRecord,
    DailyChallengeProgress,
} from './types'

function sanitizeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

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
    } catch (error) {
        console.error('[getUserStats] Database error:', sanitizeError(error))
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
        // Ensure schema has all required columns before insert/update
        await ensureStreakColumn()
        await ensureChallengeColumns()
        await ensureLoginRewardColumns()
        await ensurePreferenceColumns()

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
                xp: updates.xp || 0,
                level: updates.level || 1,
                challenge_streak: updates.challenge_streak || 0,
                last_challenge_date: updates.last_challenge_date || null,
                // Login rewards defaults
                login_streak: updates.login_streak || 0,
                last_login_reward_date: updates.last_login_reward_date || null,
                total_login_cycles: updates.total_login_cycles || 0,
                // Notification preferences defaults (1 = enabled)
                email_notifications: updates.email_notifications ?? 1,
                push_notifications: updates.push_notifications ?? 0,
                challenge_reminders: updates.challenge_reminders ?? 1,
            }

            await db.insertInto('user_stats').values(newStats).execute()
        }

        return true
    } catch (error) {
        console.error('[upsertUserStats] Database error:', sanitizeError(error))
        return false
    }
}

/**
 * Update user's level only (do not modify XP)
 */
export async function updateUserLevel(
    userId: string,
    newLevel: number
): Promise<boolean> {
    try {
        return await upsertUserStats(userId, { level: newLevel })
    } catch (error) {
        console.error('[updateUserLevel] Error:', sanitizeError(error))
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
        username: string | null
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
                'user.username',
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
            username: string | null
            score: number
            created_at: Date
            image: string | null
        }

        const rows = results as Row[]

        return rows.map(row => ({
            name: row.name || 'Anonymous',
            username: row.username ?? null,
            score: row.score,
            created_at: new Date(row.created_at).toISOString(),
            image: row.image ?? null,
        }))
    } catch (error) {
        console.error(
            '[getGameLeaderboard] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        // Log but swallow to avoid breaking primary flows
        console.warn('[ensureUserIdentityColumns] Migration warning:', error)
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
    } catch (error) {
        console.error(
            '[isUsernameAvailable] Database error:',
            sanitizeError(error)
        )
        return false
    }
}

/**
 * Get a user by username (for public profile viewing)
 */
export type PublicUser = {
    id: string
    username: string | null
    displayName: string | null
    image: string | null
    name: string
    email: string
    createdAt: string // ISO string
}

export async function getUserByUsername(
    username: string
): Promise<PublicUser | null> {
    try {
        await ensureUserIdentityColumns()
        const row = await db
            .selectFrom('user')
            .select([
                'id',
                'username',
                'displayName',
                'image',
                'name',
                'email',
                'createdAt',
            ])
            .where('username', '=', username)
            .executeTakeFirst()

        if (!row) {
            return null
        }
        return {
            id: row.id,
            username: row.username ?? null,
            displayName: row.displayName ?? null,
            image: row.image ?? null,
            name: row.name,
            email: row.email,
            createdAt: new Date(String(row.createdAt)).toISOString(),
        }
    } catch (error) {
        console.error(
            '[getUserByUsername] Database error:',
            sanitizeError(error)
        )
        return null
    }
}

/**
 * Get a user by ID (includes public identity fields)
 */
export async function getUserIdentityById(
    userId: string
): Promise<PublicUser | null> {
    try {
        await ensureUserIdentityColumns()
        const row = await db
            .selectFrom('user')
            .select([
                'id',
                'username',
                'displayName',
                'image',
                'name',
                'email',
                'createdAt',
            ])
            .where('id', '=', userId)
            .executeTakeFirst()

        if (!row) {
            return null
        }

        return {
            id: row.id,
            username: row.username ?? null,
            displayName: row.displayName ?? null,
            image: row.image ?? null,
            name: row.name,
            email: row.email,
            createdAt: new Date(String(row.createdAt)).toISOString(),
        }
    } catch (error) {
        console.error(
            '[getUserIdentityById] Database error:',
            sanitizeError(error)
        )
        return null
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
    } catch (error) {
        console.error(
            '[getUserDailyActivity] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[getUserRecentScores] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[getUserBestScore] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error('[saveGameScore] Database error:', sanitizeError(error))
        return false
    }
}

/**
 * Type guard for GameData (AchievementCheckData)
 */
function isGameData(obj: unknown): obj is AchievementCheckData {
    return obj !== null && typeof obj === 'object'
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
        if (gameData !== undefined) {
            if (!isGameData(gameData)) {
                throw new Error('Invalid game data provided')
            }

            inGameAchievements = await checkInGameAchievements(
                userId,
                gameId as GameID,
                gameData,
                score
            )
        }

        const allNewAchievements = [...scoreAchievements, ...inGameAchievements]

        return { success: true, newAchievements: allNewAchievements }
    } catch (error) {
        console.error(
            '[saveGameScoreWithAchievements] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[getUserGameHistory] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[getUserGameHistoryPaginated] Database error:',
            sanitizeError(error)
        )
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
 * @deprecated Use getUserBestScore instead - this is an alias for backward compatibility
 */
export const getUserBestScoreByGame = getUserBestScore

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
    } catch (error) {
        console.error('[updateUser] Database error:', sanitizeError(error))
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
    } catch (error) {
        console.error(
            '[getUserAchievements] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[getUserAchievementsPaginated] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[hasUserEarnedAchievement] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[awardAchievement] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[getUserBestScoreForGame] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        // Log but swallow to avoid breaking primary flows
        console.warn('[ensureStreakColumn] Migration warning:', error)
    }
}

/**
 * Get all user IDs
 */
export async function getAllUserIds(): Promise<string[]> {
    try {
        const rows = await db.selectFrom('user').select('id').execute()
        return rows.map(r => r.id)
    } catch (error) {
        console.error('[getAllUserIds] Database error:', sanitizeError(error))
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
    } catch (error) {
        console.error(
            '[getActiveUserIdsBetween] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error(
            '[incrementUserStreak] Database error:',
            sanitizeError(error)
        )
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
    } catch (error) {
        console.error('[resetUserStreak] Database error:', sanitizeError(error))
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

    return {
        processed: allUserIds.length,
        incremented: inc,
        reset: rst,
    }
}

/**
 * Get achievement statistics for all achievements
 * Returns earned count and percentage for each achievement
 */
export async function getAchievementStatistics(): Promise<
    Array<{
        achievement_id: string
        earned_count: number
        total_players: number
        percentage: number
    }>
> {
    try {
        // Get all achievements and their earned counts
        const achievementStats = await db
            .selectFrom('user_achievements')
            .select([
                'achievement_id',
                db.fn.count('user_id').distinct().as('earned_count'),
            ])
            .groupBy('achievement_id')
            .execute()

        // Get total players per game (users with at least one score)
        const gamePlayerCounts = await db
            .selectFrom('game_scores')
            .select([
                'game_id',
                db.fn.count('user_id').distinct().as('player_count'),
            ])
            .groupBy('game_id')
            .execute()

        // Get total global players (users with at least one score across any game)
        const globalPlayerCount = await db
            .selectFrom('game_scores')
            .select([db.fn.count('user_id').distinct().as('player_count')])
            .executeTakeFirst()

        // Create a map of game_id to player count
        const gamePlayerMap = new Map<string, number>()
        gamePlayerCounts.forEach(row => {
            gamePlayerMap.set(row.game_id, Number(row.player_count))
        })
        const globalPlayers = Number(globalPlayerCount?.player_count || 0)

        // Import achievements to get game associations
        const { getAllAchievements } = await import('../../achievements')
        const allAchievements = getAllAchievements()

        // Create a map of achievement_id to achievement for game lookup
        const achievementMap = new Map(
            allAchievements.map(achievement => [achievement.id, achievement])
        )

        // Calculate statistics for each achievement
        const result = achievementStats.map(stat => {
            const achievementId = stat.achievement_id
            const earnedCount = Number(stat.earned_count)
            const achievement = achievementMap.get(achievementId)

            let totalPlayers = 0
            if (achievement) {
                // For global achievements, use global player count
                if (achievement.gameId === 'global') {
                    totalPlayers = globalPlayers
                } else {
                    // For game-specific achievements, use that game's player count
                    totalPlayers = gamePlayerMap.get(achievement.gameId) || 0
                }
            }

            const percentage =
                totalPlayers > 0 ? (earnedCount / totalPlayers) * 100 : 0

            return {
                achievement_id: achievementId,
                earned_count: earnedCount,
                total_players: totalPlayers,
                percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
            }
        })

        // Also include achievements that haven't been earned by anyone yet
        const earnedAchievementIds = new Set(
            achievementStats.map(stat => stat.achievement_id)
        )
        const unearnedAchievements = allAchievements.filter(
            achievement => !earnedAchievementIds.has(achievement.id)
        )

        unearnedAchievements.forEach(achievement => {
            let totalPlayers = 0
            if (achievement.gameId === 'global') {
                totalPlayers = globalPlayers
            } else {
                totalPlayers = gamePlayerMap.get(achievement.gameId) || 0
            }

            result.push({
                achievement_id: achievement.id,
                earned_count: 0,
                total_players: totalPlayers,
                percentage: 0,
            })
        })

        return result
    } catch (error) {
        console.error(
            '[getAchievementStatistics] Database error:',
            sanitizeError(error)
        )
        return []
    }
}

/**
 * Ensure challenge columns exist on user_stats (safe, idempotent)
 */
export async function ensureChallengeColumns(): Promise<void> {
    try {
        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const cols = result.rows?.map(r => r.name) ?? []

        if (!cols.includes('xp')) {
            await sql`ALTER TABLE user_stats ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`.execute(
                db
            )
        }
        if (!cols.includes('level')) {
            await sql`ALTER TABLE user_stats ADD COLUMN level INTEGER NOT NULL DEFAULT 1`.execute(
                db
            )
        }
        if (!cols.includes('challenge_streak')) {
            await sql`ALTER TABLE user_stats ADD COLUMN challenge_streak INTEGER NOT NULL DEFAULT 0`.execute(
                db
            )
        }
        if (!cols.includes('last_challenge_date')) {
            await sql`ALTER TABLE user_stats ADD COLUMN last_challenge_date TEXT`.execute(
                db
            )
        }
    } catch (error) {
        console.warn(
            '[ensureChallengeColumns] Migration warning:',
            sanitizeError(error)
        )
    }
}

/**
 * Ensure daily_challenge_progress table exists (safe, idempotent)
 */
export async function ensureDailyChallengeTable(): Promise<void> {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS daily_challenge_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                challenge_date TEXT NOT NULL,
                challenge_id TEXT NOT NULL,
                current_value INTEGER NOT NULL DEFAULT 0,
                target_value INTEGER NOT NULL,
                completed_at DATETIME,
                xp_awarded INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
                UNIQUE(user_id, challenge_date, challenge_id)
            )
        `.execute(db)

        await sql`
            CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_date
            ON daily_challenge_progress(user_id, challenge_date)
        `.execute(db)
    } catch (error) {
        console.warn(
            '[ensureDailyChallengeTable] Migration warning:',
            sanitizeError(error)
        )
    }
}

/**
 * Get user's challenge progress for a specific date
 */
export async function getUserChallengeProgress(
    userId: string,
    date: string
): Promise<DailyChallengeProgress[]> {
    try {
        await ensureDailyChallengeTable()
        return await db
            .selectFrom('daily_challenge_progress')
            .selectAll()
            .where('user_id', '=', userId)
            .where('challenge_date', '=', date)
            .execute()
    } catch (error) {
        console.error('[getUserChallengeProgress] Error:', sanitizeError(error))
        return []
    }
}

/**
 * Create or get existing challenge progress record
 */
export async function upsertChallengeProgress(
    userId: string,
    challengeDate: string,
    challengeId: string,
    targetValue: number
): Promise<boolean> {
    try {
        await ensureDailyChallengeTable()
        await db
            .insertInto('daily_challenge_progress')
            .values({
                user_id: userId,
                challenge_date: challengeDate,
                challenge_id: challengeId,
                current_value: 0,
                target_value: targetValue,
                xp_awarded: 0,
                completed_at: null,
            })
            .onConflict(oc =>
                oc
                    .columns(['user_id', 'challenge_date', 'challenge_id'])
                    .doNothing()
            )
            .execute()
        return true
    } catch (error) {
        console.error('[upsertChallengeProgress] Error:', sanitizeError(error))
        return false
    }
}

/**
 * Update challenge progress value
 */
export async function updateChallengeProgressValue(
    userId: string,
    challengeDate: string,
    challengeId: string,
    newValue: number
): Promise<boolean> {
    try {
        await db
            .updateTable('daily_challenge_progress')
            .set({ current_value: newValue })
            .where('user_id', '=', userId)
            .where('challenge_date', '=', challengeDate)
            .where('challenge_id', '=', challengeId)
            .execute()
        return true
    } catch (error) {
        console.error(
            '[updateChallengeProgressValue] Error:',
            sanitizeError(error)
        )
        return false
    }
}

/**
 * Mark challenge as completed and record XP awarded
 */
export async function completeChallengeAndAwardXP(
    userId: string,
    challengeDate: string,
    challengeId: string,
    xpAmount: number
): Promise<boolean> {
    try {
        await ensureChallengeColumns()

        await db.transaction().execute(async trx => {
            const progress = await trx
                .selectFrom('daily_challenge_progress')
                .select(['xp_awarded'])
                .where('user_id', '=', userId)
                .where('challenge_date', '=', challengeDate)
                .where('challenge_id', '=', challengeId)
                .executeTakeFirst()

            if (!progress) {
                throw new Error('Challenge progress not found for user')
            }

            // Idempotent: if XP already awarded, skip additional updates
            if (progress.xp_awarded && progress.xp_awarded > 0) {
                return
            }

            const completedAt = new Date().toISOString()

            await trx
                .updateTable('daily_challenge_progress')
                .set({
                    completed_at: completedAt,
                    xp_awarded: xpAmount,
                })
                .where('user_id', '=', userId)
                .where('challenge_date', '=', challengeDate)
                .where('challenge_id', '=', challengeId)
                .execute()

            const stats = await trx
                .selectFrom('user_stats')
                .select(['xp', 'level'])
                .where('user_id', '=', userId)
                .executeTakeFirst()

            if (stats) {
                await trx
                    .updateTable('user_stats')
                    .set({
                        xp: stats.xp + xpAmount,
                        level: stats.level,
                        updated_at: completedAt,
                    })
                    .where('user_id', '=', userId)
                    .execute()
            } else {
                await trx
                    .insertInto('user_stats')
                    .values({
                        user_id: userId,
                        total_games_played: 0,
                        total_score: 0,
                        favorite_game: null,
                        streak_days: 0,
                        xp: xpAmount,
                        level: 1,
                        challenge_streak: 0,
                        last_challenge_date: null,
                    })
                    .execute()
            }
        })

        return true
    } catch (error) {
        console.error(
            '[completeChallengeAndAwardXP] Error:',
            sanitizeError(error)
        )
        return false
    }
}

/**
 * Get user's XP, level, and challenge streak
 */
export async function getUserXPAndLevel(userId: string): Promise<{
    xp: number
    level: number
    challengeStreak: number
    lastChallengeDate: string | null
}> {
    try {
        await ensureChallengeColumns()
        const stats = await db
            .selectFrom('user_stats')
            .select(['xp', 'level', 'challenge_streak', 'last_challenge_date'])
            .where('user_id', '=', userId)
            .executeTakeFirst()

        let challengeStreak = stats?.challenge_streak ?? 0
        const lastChallengeDate = stats?.last_challenge_date ?? null

        // If the last challenge was completed before yesterday, the current streak is effectively 0
        if (lastChallengeDate) {
            const today = new Date().toISOString().split('T')[0]
            if (lastChallengeDate !== today) {
                const todayDate = new Date(`${today}T00:00:00Z`)
                const yesterdayDate = new Date(
                    todayDate.getTime() - 24 * 60 * 60 * 1000
                )
                const yesterday = yesterdayDate.toISOString().split('T')[0]

                if (lastChallengeDate !== yesterday) {
                    challengeStreak = 0

                    // Persist the reset to the database if the stored streak was not already 0
                    if (stats && stats.challenge_streak !== 0) {
                        try {
                            await db
                                .updateTable('user_stats')
                                .set({
                                    challenge_streak: 0,
                                    updated_at: new Date().toISOString(),
                                })
                                .where('user_id', '=', userId)
                                .execute()
                        } catch (updateError) {
                            // Log but don't fail the read operation
                            console.error(
                                '[getUserXPAndLevel] Failed to persist streak reset:',
                                sanitizeError(updateError)
                            )
                        }
                    }
                }
            }
        }

        return {
            xp: stats?.xp ?? 0,
            level: stats?.level ?? 1,
            challengeStreak,
            lastChallengeDate,
        }
    } catch (error) {
        console.error('[getUserXPAndLevel] Error:', sanitizeError(error))
        return { xp: 0, level: 1, challengeStreak: 0, lastChallengeDate: null }
    }
}

/**
 * Update user's XP and level
 */
export async function updateUserXPAndLevel(
    userId: string,
    xpToAdd: number,
    newLevel: number
): Promise<boolean> {
    try {
        await ensureChallengeColumns()
        const now = new Date().toISOString()

        await db
            .insertInto('user_stats')
            .values({
                user_id: userId,
                total_games_played: 0,
                total_score: 0,
                favorite_game: null,
                streak_days: 0,
                xp: xpToAdd,
                level: newLevel,
                challenge_streak: 0,
                last_challenge_date: null,
            })
            .onConflict(oc =>
                oc.column('user_id').doUpdateSet({
                    xp: sql`user_stats.xp + ${xpToAdd}`,
                    level: newLevel,
                    updated_at: now,
                })
            )
            .execute()

        return true
    } catch (error) {
        console.error('[updateUserXPAndLevel] Error:', sanitizeError(error))
        return false
    }
}

/**
 * Get unique games played today by user
 */
export async function getUniqueGamesPlayedToday(
    userId: string
): Promise<string[]> {
    try {
        const today = new Date().toISOString().split('T')[0]
        const rows = await db
            .selectFrom('game_scores')
            .select('game_id')
            .distinct()
            .where('user_id', '=', userId)
            .where(
                sql<boolean>`strftime('%Y-%m-%d', created_at, 'utc') = ${today}`
            )
            .execute()
        return rows.map(r => r.game_id)
    } catch (error) {
        console.error(
            '[getUniqueGamesPlayedToday] Error:',
            sanitizeError(error)
        )
        return []
    }
}

/**
 * Get total score earned today by user
 */
export async function getTotalScoreToday(userId: string): Promise<number> {
    try {
        const today = new Date().toISOString().split('T')[0]
        const result = await db
            .selectFrom('game_scores')
            .select(db.fn.sum('score').as('total'))
            .where('user_id', '=', userId)
            .where(
                sql<boolean>`strftime('%Y-%m-%d', created_at, 'utc') = ${today}`
            )
            .executeTakeFirst()
        return Number(result?.total) || 0
    } catch (error) {
        console.error('[getTotalScoreToday] Error:', sanitizeError(error))
        return 0
    }
}

/**
 * Get count of games played today by user
 */
export async function getGamesPlayedCountToday(
    userId: string
): Promise<number> {
    try {
        const today = new Date().toISOString().split('T')[0]
        const result = await db
            .selectFrom('game_scores')
            .select(db.fn.count('id').as('count'))
            .where('user_id', '=', userId)
            .where(
                sql<boolean>`strftime('%Y-%m-%d', created_at, 'utc') = ${today}`
            )
            .executeTakeFirst()
        return Number(result?.count) || 0
    } catch (error) {
        console.error('[getGamesPlayedCountToday] Error:', sanitizeError(error))
        return 0
    }
}

/**
 * Atomically check and update daily challenge streak
 */
export async function atomicCheckAndUpdateStreak(
    userId: string,
    today: string,
    allChallengesCompleted: boolean
): Promise<boolean> {
    try {
        await ensureChallengeColumns()

        if (!allChallengesCompleted) {
            return false
        }

        return await db.transaction().execute(async trx => {
            const stats = await trx
                .selectFrom('user_stats')
                .select(['challenge_streak', 'last_challenge_date'])
                .where('user_id', '=', userId)
                .forUpdate() // Lock the row for update if supported by the driver
                .executeTakeFirst()

            if (!stats) {
                // If no stats, this is the first completion
                await trx
                    .insertInto('user_stats')
                    .values({
                        user_id: userId,
                        total_games_played: 0,
                        total_score: 0,
                        favorite_game: null,
                        streak_days: 0,
                        xp: 0,
                        level: 1,
                        challenge_streak: 1,
                        last_challenge_date: today,
                    })
                    .execute()
                return true
            }

            // Only update if this is the first time completing all today
            if (stats.last_challenge_date !== today) {
                let newStreak = 1
                if (stats.last_challenge_date) {
                    const todayDate = new Date(`${today}T00:00:00Z`)
                    const yesterdayDate = new Date(
                        todayDate.getTime() - 24 * 60 * 60 * 1000
                    )
                    const yesterday = yesterdayDate.toISOString().split('T')[0]

                    // If last completion was yesterday, increment streak
                    if (stats.last_challenge_date === yesterday) {
                        newStreak = (stats.challenge_streak ?? 0) + 1
                    }
                }

                await trx
                    .updateTable('user_stats')
                    .set({
                        challenge_streak: newStreak,
                        last_challenge_date: today,
                        updated_at: new Date().toISOString(),
                    })
                    .where('user_id', '=', userId)
                    .execute()
                return true
            }

            return false
        })
    } catch (error) {
        console.error(
            '[atomicCheckAndUpdateStreak] Error:',
            sanitizeError(error)
        )
        return false
    }
}

// ============================================================================
// LOGIN REWARD FUNCTIONS
// ============================================================================

/**
 * Ensure login reward columns exist on user_stats (idempotent migration)
 */
export async function ensureLoginRewardColumns(): Promise<void> {
    try {
        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const cols = result.rows?.map(r => r.name) ?? []

        if (!cols.includes('login_streak')) {
            await sql`ALTER TABLE user_stats ADD COLUMN login_streak INTEGER NOT NULL DEFAULT 0`.execute(
                db
            )
        }
        if (!cols.includes('last_login_reward_date')) {
            await sql`ALTER TABLE user_stats ADD COLUMN last_login_reward_date TEXT`.execute(
                db
            )
        }
        if (!cols.includes('total_login_cycles')) {
            await sql`ALTER TABLE user_stats ADD COLUMN total_login_cycles INTEGER NOT NULL DEFAULT 0`.execute(
                db
            )
        }
    } catch (error) {
        console.warn('[ensureLoginRewardColumns] Migration warning:', error)
    }
}

/**
 * Get user's login reward status
 */
export async function getLoginRewardStatus(userId: string): Promise<{
    login_streak: number
    last_login_reward_date: string | null
    total_login_cycles: number
} | null> {
    try {
        await ensureLoginRewardColumns()
        const stats = await db
            .selectFrom('user_stats')
            .select([
                'login_streak',
                'last_login_reward_date',
                'total_login_cycles',
            ])
            .where('user_id', '=', userId)
            .executeTakeFirst()

        if (!stats) {
            return null
        }

        return {
            login_streak: stats.login_streak ?? 0,
            last_login_reward_date: stats.last_login_reward_date ?? null,
            total_login_cycles: stats.total_login_cycles ?? 0,
        }
    } catch (error) {
        console.error(
            '[getLoginRewardStatus] Database error:',
            sanitizeError(error)
        )
        return null
    }
}

/**
 * Claim daily login reward (atomic operation)
 * Returns false if already claimed today or on error
 */
export async function claimLoginReward(
    userId: string,
    today: string,
    newStreak: number,
    xpReward: number,
    cycleCompleted: boolean,
    streakBroken: boolean = false
): Promise<{ success: boolean; newXP?: number; newLevel?: number }> {
    try {
        await ensureLoginRewardColumns()
        await ensureChallengeColumns()

        // Import level calculation outside transaction
        const { getLevelFromXP } = await import('../../challenges')

        return await db.transaction().execute(async trx => {
            // Get current stats with row lock to prevent concurrent claims
            const stats = await trx
                .selectFrom('user_stats')
                .select(['xp', 'level', 'last_login_reward_date'])
                .where('user_id', '=', userId)
                .forUpdate()
                .executeTakeFirst()

            // If already claimed today, return false
            if (stats?.last_login_reward_date === today) {
                return { success: false }
            }

            const currentXP = stats?.xp ?? 0
            const newXP = currentXP + xpReward

            // Use the pre-imported getLevelFromXP function
            const newLevel = getLevelFromXP(newXP)

            // Update stats atomically
            const updateData: Record<string, unknown> = {
                login_streak: newStreak,
                last_login_reward_date: today,
                xp: newXP,
                level: newLevel,
                updated_at: new Date().toISOString(),
            }

            if (cycleCompleted) {
                // Reset streak to 0 after completing day 7
                updateData.login_streak = 0
                // Increment total cycles completed
                updateData.total_login_cycles = sql`total_login_cycles + 1`
            } else if (streakBroken) {
                // Reset total cycles when streak is broken (missed a day)
                updateData.total_login_cycles = 0
            }

            // Check if user_stats row exists
            if (stats) {
                await trx
                    .updateTable('user_stats')
                    .set(updateData)
                    .where('user_id', '=', userId)
                    .execute()
            } else {
                // Create new stats row
                await trx
                    .insertInto('user_stats')
                    .values({
                        user_id: userId,
                        total_games_played: 0,
                        total_score: 0,
                        favorite_game: null,
                        streak_days: 0,
                        xp: newXP,
                        level: newLevel,
                        challenge_streak: 0,
                        last_challenge_date: null,
                        login_streak: cycleCompleted ? 0 : newStreak,
                        last_login_reward_date: today,
                        total_login_cycles: cycleCompleted ? 1 : 0,
                        email_notifications: 1,
                        push_notifications: 0,
                        challenge_reminders: 1,
                    })
                    .execute()
            }

            return { success: true, newXP, newLevel }
        })
    } catch (error) {
        console.error(
            '[claimLoginReward] Database error:',
            sanitizeError(error)
        )
        return { success: false }
    }
}

// ============================================================================
// USER PREFERENCES FUNCTIONS
// ============================================================================

/**
 * Ensure notification preference columns exist on user_stats (idempotent migration)
 */
export async function ensurePreferenceColumns(): Promise<void> {
    try {
        const result = await sql<{
            name: string
        }>`PRAGMA table_info(user_stats)`.execute(db)
        const cols = result.rows?.map(r => r.name) ?? []

        if (!cols.includes('email_notifications')) {
            await sql`ALTER TABLE user_stats ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1`.execute(
                db
            )
        }
        if (!cols.includes('push_notifications')) {
            await sql`ALTER TABLE user_stats ADD COLUMN push_notifications INTEGER NOT NULL DEFAULT 0`.execute(
                db
            )
        }
        if (!cols.includes('challenge_reminders')) {
            await sql`ALTER TABLE user_stats ADD COLUMN challenge_reminders INTEGER NOT NULL DEFAULT 1`.execute(
                db
            )
        }
    } catch (error) {
        console.warn('[ensurePreferenceColumns] Migration warning:', error)
    }
}

/**
 * Get user notification preferences
 */
export async function getUserPreferences(userId: string): Promise<{
    email_notifications: boolean
    push_notifications: boolean
    challenge_reminders: boolean
} | null> {
    try {
        await ensurePreferenceColumns()
        const stats = await db
            .selectFrom('user_stats')
            .select([
                'email_notifications',
                'push_notifications',
                'challenge_reminders',
            ])
            .where('user_id', '=', userId)
            .executeTakeFirst()

        if (!stats) {
            // Return defaults if no stats row exists
            return {
                email_notifications: true,
                push_notifications: false,
                challenge_reminders: true,
            }
        }

        return {
            email_notifications: Boolean(stats.email_notifications),
            push_notifications: Boolean(stats.push_notifications),
            challenge_reminders: Boolean(stats.challenge_reminders),
        }
    } catch (error) {
        console.error(
            '[getUserPreferences] Database error:',
            sanitizeError(error)
        )
        return null
    }
}

/**
 * Update user notification preferences
 */
export async function updateUserPreferences(
    userId: string,
    preferences: {
        email_notifications?: boolean
        push_notifications?: boolean
        challenge_reminders?: boolean
    }
): Promise<boolean> {
    try {
        await ensurePreferenceColumns()

        // Ensure user_stats row exists
        const existing = await getUserStats(userId)
        if (!existing) {
            await upsertUserStats(userId, {})
        }

        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        }

        if (typeof preferences.email_notifications === 'boolean') {
            updates.email_notifications = preferences.email_notifications
                ? 1
                : 0
        }
        if (typeof preferences.push_notifications === 'boolean') {
            updates.push_notifications = preferences.push_notifications ? 1 : 0
        }
        if (typeof preferences.challenge_reminders === 'boolean') {
            updates.challenge_reminders = preferences.challenge_reminders
                ? 1
                : 0
        }

        await db
            .updateTable('user_stats')
            .set(updates)
            .where('user_id', '=', userId)
            .execute()

        return true
    } catch (error) {
        console.error(
            '[updateUserPreferences] Database error:',
            sanitizeError(error)
        )
        return false
    }
}
