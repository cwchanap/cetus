import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAllGames,
  getGameById,
  saveGameScore,
  getUserGameHistory,
  getUserBestScoreByGame,
  getUserStats,
  upsertUserStats,
} from '@/lib/db/queries'
import { db } from '@/lib/db/client'

// Mock the database client
vi.mock('@/lib/db/client', () => ({
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
  },
}))

describe('Database Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAllGames', () => {
    it('should return all games ordered by creation date', async () => {
      // Arrange
      const mockGames = [
        {
          id: 'tetris',
          name: 'Tetris Challenge',
          description: 'Classic block-stacking puzzle game',
          created_at: new Date('2023-01-01'),
        },
        {
          id: 'quick_draw',
          name: 'Quick Draw',
          description: 'Fast-paced drawing and guessing game',
          created_at: new Date('2023-01-02'),
        },
      ]

      const mockQuery = {
        selectAll: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(mockGames),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

      // Act
      const result = await getAllGames()

      // Assert
      expect(result).toEqual(mockGames)
      expect(db.selectFrom).toHaveBeenCalledWith('games')
      expect(mockQuery.selectAll).toHaveBeenCalled()
      expect(mockQuery.orderBy).toHaveBeenCalledWith('created_at', 'asc')
      expect(mockQuery.execute).toHaveBeenCalled()
    })

    it('should return empty array on database error', async () => {
      // Arrange
      const mockQuery = {
        selectAll: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        execute: vi.fn().mockRejectedValue(new Error('Database error')),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = await getAllGames()

      // Assert
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching games:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('getGameById', () => {
    it('should return game when found', async () => {
      // Arrange
      const mockGame = {
        id: 'tetris',
        name: 'Tetris Challenge',
        description: 'Classic block-stacking puzzle game',
        created_at: new Date('2023-01-01'),
      }

      const mockQuery = {
        selectAll: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(mockGame),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

      // Act
      const result = await getGameById('tetris')

      // Assert
      expect(result).toEqual(mockGame)
      expect(db.selectFrom).toHaveBeenCalledWith('games')
      expect(mockQuery.selectAll).toHaveBeenCalled()
      expect(mockQuery.where).toHaveBeenCalledWith('id', '=', 'tetris')
      expect(mockQuery.executeTakeFirst).toHaveBeenCalled()
    })

    it('should return null when game not found', async () => {
      // Arrange
      const mockQuery = {
        selectAll: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

      // Act
      const result = await getGameById('nonexistent')

      // Assert
      expect(result).toBeNull()
    })

    it('should return null on database error', async () => {
      // Arrange
      const mockQuery = {
        selectAll: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockRejectedValue(new Error('Database error')),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = await getGameById('tetris')

      // Assert
      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching game:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('saveGameScore', () => {
    it('should successfully save a score and update user stats', async () => {
      // Arrange
      const mockInsertQuery = {
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({}),
      }

      vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)

      // Mock getUserStats
      const mockUserStats = {
        id: 1,
        user_id: 'user-123',
        total_games_played: 5,
        total_score: 10000,
        favorite_game: 'tetris',
        created_at: new Date(),
        updated_at: new Date(),
      }

      // Mock the getUserStats and upsertUserStats functions
      vi.doMock('@/lib/db/queries', async () => {
        const actual = await vi.importActual('@/lib/db/queries')
        return {
          ...actual,
          getUserStats: vi.fn().mockResolvedValue(mockUserStats),
          upsertUserStats: vi.fn().mockResolvedValue(true),
        }
      })

      // Act
      const result = await saveGameScore('user-123', 'tetris', 5000)

      // Assert
      expect(result).toBe(true)
      expect(db.insertInto).toHaveBeenCalledWith('game_scores')
      expect(mockInsertQuery.values).toHaveBeenCalledWith({
        user_id: 'user-123',
        game_id: 'tetris',
        score: 5000,
      })
      expect(mockInsertQuery.execute).toHaveBeenCalled()
    })

    it('should return false on database error', async () => {
      // Arrange
      const mockInsertQuery = {
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockRejectedValue(new Error('Database error')),
      }

      vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = await saveGameScore('user-123', 'tetris', 5000)

      // Assert
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Error saving game score:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('getUserGameHistory', () => {
    it('should return user game history with game details', async () => {
      // Arrange
      const mockHistory = [
        {
          game_id: 'tetris',
          game_name: 'Tetris Challenge',
          score: 5000,
          created_at: new Date('2023-01-01'),
        },
        {
          game_id: 'quick_draw',
          game_name: 'Quick Draw',
          score: 3000,
          created_at: new Date('2023-01-02'),
        },
      ]

      const mockQuery = {
        innerJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(mockHistory),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

      // Act
      const result = await getUserGameHistory('user-123', 10)

      // Assert
      expect(result).toEqual([
        {
          game_id: 'tetris',
          game_name: 'Tetris Challenge',
          score: 5000,
          created_at: mockHistory[0].created_at.toString(),
        },
        {
          game_id: 'quick_draw',
          game_name: 'Quick Draw',
          score: 3000,
          created_at: mockHistory[1].created_at.toString(),
        },
      ])
      expect(db.selectFrom).toHaveBeenCalledWith('game_scores')
      expect(mockQuery.innerJoin).toHaveBeenCalledWith('games', 'games.id', 'game_scores.game_id')
      expect(mockQuery.where).toHaveBeenCalledWith('game_scores.user_id', '=', 'user-123')
      expect(mockQuery.orderBy).toHaveBeenCalledWith('game_scores.created_at', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
    })

    it('should return empty array on database error', async () => {
      // Arrange
      const mockQuery = {
        innerJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        execute: vi.fn().mockRejectedValue(new Error('Database error')),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = await getUserGameHistory('user-123', 10)

      // Assert
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching user game history:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('getUserBestScoreByGame', () => {
    it('should return best score for user and game', async () => {
      // Arrange
      const mockScore = { score: 15000 }

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(mockScore),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

      // Act
      const result = await getUserBestScoreByGame('user-123', 'tetris')

      // Assert
      expect(result).toBe(15000)
      expect(db.selectFrom).toHaveBeenCalledWith('game_scores')
      expect(mockQuery.select).toHaveBeenCalledWith('score')
      expect(mockQuery.where).toHaveBeenCalledWith('user_id', '=', 'user-123')
      expect(mockQuery.where).toHaveBeenCalledWith('game_id', '=', 'tetris')
      expect(mockQuery.orderBy).toHaveBeenCalledWith('score', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(1)
    })

    it('should return null when no scores found', async () => {
      // Arrange
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

      // Act
      const result = await getUserBestScoreByGame('user-123', 'tetris')

      // Assert
      expect(result).toBeNull()
    })

    it('should return null on database error', async () => {
      // Arrange
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockRejectedValue(new Error('Database error')),
      }

      vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = await getUserBestScoreByGame('user-123', 'tetris')

      // Assert
      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching user best score:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })
})