import { db } from "./client"
import type { NewGameScore, NewUserStats, UserStatsUpdate, GameScore, UserStats, Game } from "./types"

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

/**
 * Get all available games
 */
export async function getAllGames(): Promise<Game[]> {
  try {
    const games = await db
      .selectFrom("games")
      .selectAll()
      .orderBy("created_at", "asc")
      .execute()
    
    return games
  } catch (error) {
    console.error("Error fetching games:", error)
    return []
  }
}

/**
 * Get game by ID
 */
export async function getGameById(gameId: string): Promise<Game | null> {
  try {
    const game = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirst()
    
    return game || null
  } catch (error) {
    console.error("Error fetching game:", error)
    return null
  }
}

/**
 * Save score using game_scores table
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
      favorite_game: gameId,
    })
    
    return true
  } catch (error) {
    console.error("Error saving game score:", error)
    return false
  }
}

/**
 * Get user's game history with game details
 */
export async function getUserGameHistory(userId: string, limit: number = 10): Promise<Array<{
  game_id: string
  game_name: string
  score: number
  created_at: string
}>> {
  try {
    const results = await db
      .selectFrom("game_scores")
      .innerJoin("games", "games.id", "game_scores.game_id")
      .select([
        "game_scores.game_id",
        "games.name as game_name",
        "game_scores.score",
        "game_scores.created_at"
      ])
      .where("game_scores.user_id", "=", userId)
      .orderBy("game_scores.created_at", "desc")
      .limit(limit)
      .execute()
    
    return results.map(row => ({
      game_id: row.game_id,
      game_name: row.game_name,
      score: row.score,
      created_at: row.created_at.toString()
    }))
  } catch (error) {
    console.error("Error fetching user game history:", error)
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
      .selectFrom("game_scores")
      .select(db.fn.count("id").as("total"))
      .where("user_id", "=", userId)
      .executeTakeFirst()
    
    const total = Number(totalResult?.total) || 0
    const totalPages = Math.ceil(total / pageSize)

    // Get paginated results
    const results = await db
      .selectFrom("game_scores")
      .innerJoin("games", "games.id", "game_scores.game_id")
      .select([
        "game_scores.game_id",
        "games.name as game_name",
        "game_scores.score",
        "game_scores.created_at"
      ])
      .where("game_scores.user_id", "=", userId)
      .orderBy("game_scores.created_at", "desc")
      .limit(pageSize)
      .offset(offset)
      .execute()
    
    const games = results.map(row => ({
      game_id: row.game_id,
      game_name: row.game_name,
      score: row.score,
      created_at: row.created_at.toString()
    }))

    return {
      games,
      total,
      page,
      pageSize,
      totalPages
    }
  } catch (error) {
    console.error("Error fetching paginated user game history:", error)
    return {
      games: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 0
    }
  }
}

/**
 * Get user's best score for a specific game
 */
export async function getUserBestScoreByGame(userId: string, gameId: string): Promise<number | null> {
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