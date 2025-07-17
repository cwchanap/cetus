import { db } from './client'
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
    } catch (error) {
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
            }

            await db.insertInto('user_stats').values(newStats).execute()
        }

        return true
    } catch (error) {
        return false
    }
}

/**
 * Get game leaderboard
 */
export async function getGameLeaderboard(
    gameId: string,
    limit: number = 10
): Promise<
    Array<{
        name: string
        score: number
        created_at: string
    }>
> {
    try {
        const results = await db
            .selectFrom('game_scores')
            .innerJoin('user', 'user.id', 'game_scores.user_id')
            .select([
                'user.name',
                'game_scores.score',
                'game_scores.created_at',
            ])
            .where('game_scores.game_id', '=', gameId)
            .orderBy('game_scores.score', 'desc')
            .limit(limit)
            .execute()

        return results.map(row => ({
            name: row.name,
            score: row.score,
            created_at: row.created_at.toString(),
        }))
    } catch (error) {
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
        return false
    }
}

/**
 * Save game score and check for achievements
 */
export async function saveGameScoreWithAchievements(
    userId: string,
    gameId: string,
    score: number
): Promise<{ success: boolean; newAchievements: string[] }> {
    try {
        // First save the score
        const saveResult = await saveGameScore(userId, gameId, score)
        if (!saveResult) {
            return { success: false, newAchievements: [] }
        }

        // Import achievement service here to avoid circular dependency
        const { checkAndAwardAchievements } = await import(
            '../../services/achievementService'
        )

        // Check and award achievements
        const newAchievements = await checkAndAwardAchievements(
            userId,
            gameId as any,
            score
        )

        return { success: true, newAchievements }
    } catch (error) {
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
            game_name: getGameById(row.game_id as any)?.name || 'Unknown Game',
            score: row.score,
            created_at: row.created_at.toString(),
        }))
    } catch (error) {
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
            game_name: getGameById(row.game_id as any)?.name || 'Unknown Game',
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
    } catch (error) {
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
        return 0
    }
}
