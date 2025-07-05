import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  getUserStats, 
  saveGameScore, 
  getGameLeaderboard, 
  getUserBestScore,
  upsertUserStats 
} from '@/lib/db/queries'

// Mock the database module
vi.mock('@/lib/db/client', () => ({
  db: {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    executeTakeFirst: vi.fn(),
  },
}))

describe('Database Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserStats', () => {
    it('should return user stats when they exist', async () => {
      const mockStats = {
        id: 1,
        user_id: 'user-123',
        total_games_played: 10,
        total_score: 1500,
        favorite_game: 'quick-draw',
        created_at: new Date(),
        updated_at: new Date(),
      }

      const { db } = await import('@/lib/db/client')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(mockStats)

      const result = await getUserStats('user-123')

      expect(db.selectFrom).toHaveBeenCalledWith('user_stats')
      expect(db.selectAll).toHaveBeenCalled()
      expect(db.where).toHaveBeenCalledWith('user_id', '=', 'user-123')
      expect(result).toEqual(mockStats)
    })

    it('should return null when user stats do not exist', async () => {
      const { db } = await import('@/lib/db/client')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(undefined)

      const result = await getUserStats('nonexistent-user')

      expect(result).toBeNull()
    })

    it('should handle database errors gracefully', async () => {
      const { db } = await import('@/lib/db/client')
      vi.mocked(db.executeTakeFirst).mockRejectedValue(new Error('Database error'))

      const result = await getUserStats('user-123')

      expect(result).toBeNull()
    })
  })

  describe('saveGameScore', () => {
    it('should successfully save a game score', async () => {
      const { db } = await import('@/lib/db/client')
      
      // Mock the insert operation
      vi.mocked(db.execute).mockResolvedValue({ changes: 1, lastInsertRowid: 1 } as any)
      
      // Mock getUserStats to return existing stats
      vi.mocked(db.executeTakeFirst)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 'user-123',
          total_games_played: 5,
          total_score: 500,
          favorite_game: 'tetris',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .mockResolvedValueOnce(undefined) // For the upsert check

      const result = await saveGameScore('user-123', 'quick-draw', 1200)

      expect(db.insertInto).toHaveBeenCalledWith('game_scores')
      expect(db.values).toHaveBeenCalledWith({
        user_id: 'user-123',
        game_id: 'quick-draw',
        score: 1200,
      })
      expect(result).toBe(true)
    })

    it('should handle save errors gracefully', async () => {
      const { db } = await import('@/lib/db/client')
      vi.mocked(db.execute).mockRejectedValue(new Error('Database error'))

      const result = await saveGameScore('user-123', 'quick-draw', 1200)

      expect(result).toBe(false)
    })
  })

  describe('getGameLeaderboard', () => {
    it('should return leaderboard data', async () => {
      const mockLeaderboard = [
        { name: 'Player1', score: 2000, created_at: new Date() },
        { name: 'Player2', score: 1800, created_at: new Date() },
        { name: 'Player3', score: 1600, created_at: new Date() },
      ]

      const { db } = await import('@/lib/db/client')
      vi.mocked(db.execute).mockResolvedValue(mockLeaderboard)

      const result = await getGameLeaderboard('quick-draw', 10)

      expect(db.selectFrom).toHaveBeenCalledWith('game_scores')
      expect(db.innerJoin).toHaveBeenCalledWith('user', 'user.id', 'game_scores.user_id')
      expect(db.where).toHaveBeenCalledWith('game_scores.game_id', '=', 'quick-draw')
      expect(db.orderBy).toHaveBeenCalledWith('game_scores.score', 'desc')
      expect(db.limit).toHaveBeenCalledWith(10)
      expect(result).toHaveLength(3)
    })

    it('should return empty array on error', async () => {
      const { db } = await import('@/lib/db/client')
      vi.mocked(db.execute).mockRejectedValue(new Error('Database error'))

      const result = await getGameLeaderboard('quick-draw', 10)

      expect(result).toEqual([])
    })
  })

  describe('getUserBestScore', () => {
    it('should return user best score when it exists', async () => {
      const mockResult = { score: 2500 }

      const { db } = await import('@/lib/db/client')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(mockResult)

      const result = await getUserBestScore('user-123', 'quick-draw')

      expect(db.selectFrom).toHaveBeenCalledWith('game_scores')
      expect(db.where).toHaveBeenCalledWith('user_id', '=', 'user-123')
      expect(db.where).toHaveBeenCalledWith('game_id', '=', 'quick-draw')
      expect(db.orderBy).toHaveBeenCalledWith('score', 'desc')
      expect(db.limit).toHaveBeenCalledWith(1)
      expect(result).toBe(2500)
    })

    it('should return null when no scores exist', async () => {
      const { db } = await import('@/lib/db/client')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(undefined)

      const result = await getUserBestScore('user-123', 'quick-draw')

      expect(result).toBeNull()
    })
  })

  describe('upsertUserStats', () => {
    it('should update existing stats', async () => {
      const { db } = await import('@/lib/db/client')
      
      // Mock getUserStats to return existing stats
      vi.mocked(db.executeTakeFirst).mockResolvedValue({
        id: 1,
        user_id: 'user-123',
        total_games_played: 5,
        total_score: 500,
        favorite_game: 'tetris',
        created_at: new Date(),
        updated_at: new Date(),
      })
      
      vi.mocked(db.execute).mockResolvedValue({ changes: 1 } as any)

      const result = await upsertUserStats('user-123', {
        total_games_played: 6,
        total_score: 700,
      })

      expect(db.updateTable).toHaveBeenCalledWith('user_stats')
      expect(result).toBe(true)
    })

    it('should create new stats when none exist', async () => {
      const { db } = await import('@/lib/db/client')
      
      // Mock getUserStats to return null (no existing stats)
      vi.mocked(db.executeTakeFirst).mockResolvedValue(undefined)
      vi.mocked(db.execute).mockResolvedValue({ changes: 1, lastInsertRowid: 1 } as any)

      const result = await upsertUserStats('user-123', {
        total_games_played: 1,
        total_score: 100,
      })

      expect(db.insertInto).toHaveBeenCalledWith('user_stats')
      expect(result).toBe(true)
    })
  })
})
