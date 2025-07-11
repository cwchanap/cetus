import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUserGameHistoryPaginated } from './queries'

// Mock the database
vi.mock('./client', () => ({
  db: {
    selectFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn(),
    execute: vi.fn(),
    fn: {
      count: vi.fn().mockReturnValue('COUNT')
    }
  }
}))

describe('getUserGameHistoryPaginated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return paginated game history with correct pagination info', async () => {
    const { db } = await import('./client')
    
    // Mock total count query
    vi.mocked(db.executeTakeFirst).mockResolvedValueOnce({ total: 23 })
    
    // Mock paginated results
    const mockResults = [
      {
        game_id: 'tetris',
        game_name: 'Tetris',
        score: 1500,
        created_at: '2025-07-10T12:00:00Z'
      },
      {
        game_id: 'bubble_shooter',
        game_name: 'Bubble Shooter',
        score: 2000,
        created_at: '2025-07-10T11:00:00Z'
      }
    ]
    
    vi.mocked(db.execute).mockResolvedValueOnce(mockResults)

    const result = await getUserGameHistoryPaginated('user-123', 2, 5)

    expect(result).toEqual({
      games: [
        {
          game_id: 'tetris',
          game_name: 'Tetris',
          score: 1500,
          created_at: '2025-07-10T12:00:00Z'
        },
        {
          game_id: 'bubble_shooter',
          game_name: 'Bubble Shooter',
          score: 2000,
          created_at: '2025-07-10T11:00:00Z'
        }
      ],
      total: 23,
      page: 2,
      pageSize: 5,
      totalPages: 5
    })

    // Verify offset calculation (page 2 with pageSize 5 should have offset 5)
    expect(db.offset).toHaveBeenCalledWith(5)
    expect(db.limit).toHaveBeenCalledWith(5)
  })

  it('should handle empty results correctly', async () => {
    const { db } = await import('./client')
    
    // Mock empty results
    vi.mocked(db.executeTakeFirst).mockResolvedValueOnce({ total: 0 })
    vi.mocked(db.execute).mockResolvedValueOnce([])

    const result = await getUserGameHistoryPaginated('user-123', 1, 5)

    expect(result).toEqual({
      games: [],
      total: 0,
      page: 1,
      pageSize: 5,
      totalPages: 0
    })
  })

  it('should handle first page correctly', async () => {
    const { db } = await import('./client')
    
    vi.mocked(db.executeTakeFirst).mockResolvedValueOnce({ total: 3 })
    vi.mocked(db.execute).mockResolvedValueOnce([])

    await getUserGameHistoryPaginated('user-123', 1, 5)

    // First page should have offset 0
    expect(db.offset).toHaveBeenCalledWith(0)
  })

  it('should calculate total pages correctly', async () => {
    const { db } = await import('./client')
    
    // Test case: 23 total items with page size 5 should result in 5 pages
    vi.mocked(db.executeTakeFirst).mockResolvedValueOnce({ total: 23 })
    vi.mocked(db.execute).mockResolvedValueOnce([])

    const result = await getUserGameHistoryPaginated('user-123', 1, 5)
    expect(result.totalPages).toBe(5)

    // Test case: 25 total items with page size 5 should result in 5 pages
    vi.mocked(db.executeTakeFirst).mockResolvedValueOnce({ total: 25 })
    
    const result2 = await getUserGameHistoryPaginated('user-123', 1, 5)
    expect(result2.totalPages).toBe(5)

    // Test case: 26 total items with page size 5 should result in 6 pages
    vi.mocked(db.executeTakeFirst).mockResolvedValueOnce({ total: 26 })
    
    const result3 = await getUserGameHistoryPaginated('user-123', 1, 5)
    expect(result3.totalPages).toBe(6)
  })
})
