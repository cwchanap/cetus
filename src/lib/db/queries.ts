import { db } from "./client"
import type { NewGameScore, NewUserStats, UserStatsUpdate, GameScore, UserStats } from "./types"

/**
 * Get user game statistics
 */
export async function getUserStats(userId: string): Promise<UserStats | null> {
  try {
    const stats = await db
      .selectFrom("user_stats")
      .selectAll()
      .where("user_id", "=", userId)
      .executeTakeFirst()
    
    return stats || null
  } catch (error) {
    console.error("Error fetching user stats:", error)
    return null
  }
}

/**
 * Create or update user statistics
 */
export async function upsertUserStats(userId: string, updates: UserStatsUpdate): Promise<boolean> {
  try {
    // Check if stats exist
    const existing = await getUserStats(userId)
    
    if (existing) {
      // Update existing stats
      await db
        .updateTable("user_stats")
        .set({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .where("user_id", "=", userId)
        .execute()
    } else {
      // Create new stats
      const newStats: NewUserStats = {
        user_id: userId,
        total_games_played: updates.total_games_played || 0,
        total_score: updates.total_score || 0,
        favorite_game: updates.favorite_game || null,
      }
      
      await db
        .insertInto("user_stats")
        .values(newStats)
        .execute()
    }
    
    return true
  } catch (error) {
    console.error("Error upserting user stats:", error)
    return false
  }
}

/**
 * Save game score
 */
export async function saveGameScore(userId: string, gameId: string, score: number): Promise<boolean> {
  try {
    const newScore: NewGameScore = {
      user_id: userId,
      game_id: gameId,
      score,
    }
    
    await db
      .insertInto("game_scores")
      .values(newScore)
      .execute()

    // Update user stats
    const currentStats = await getUserStats(userId)
    await upsertUserStats(userId, {
      total_games_played: (currentStats?.total_games_played || 0) + 1,
      total_score: (currentStats?.total_score || 0) + score,
    })
    
    return true
  } catch (error) {
    console.error("Error saving game score:", error)
    return false
  }
}

/**
 * Get game leaderboard
 */
export async function getGameLeaderboard(gameId: string, limit: number = 10): Promise<Array<{
  name: string
  score: number
  created_at: string
}>> {
  try {
    const results = await db
      .selectFrom("game_scores")
      .innerJoin("user", "user.id", "game_scores.user_id")
      .select([
        "user.name",
        "game_scores.score",
        "game_scores.created_at"
      ])
      .where("game_scores.game_id", "=", gameId)
      .orderBy("game_scores.score", "desc")
      .limit(limit)
      .execute()
    
    return results.map(row => ({
      name: row.name,
      score: row.score,
      created_at: row.created_at.toString()
    }))
  } catch (error) {
    console.error("Error fetching leaderboard:", error)
    return []
  }
}

/**
 * Get user's recent game scores
 */
export async function getUserRecentScores(userId: string, limit: number = 5): Promise<GameScore[]> {
  try {
    const scores = await db
      .selectFrom("game_scores")
      .selectAll()
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute()
    
    return scores
  } catch (error) {
    console.error("Error fetching user recent scores:", error)
    return []
  }
}

/**
 * Get user's best score for a specific game
 */
export async function getUserBestScore(userId: string, gameId: string): Promise<number | null> {
  try {
    const result = await db
      .selectFrom("game_scores")
      .select("score")
      .where("user_id", "=", userId)
      .where("game_id", "=", gameId)
      .orderBy("score", "desc")
      .limit(1)
      .executeTakeFirst()
    
    return result?.score || null
  } catch (error) {
    console.error("Error fetching user best score:", error)
    return null
  }
}