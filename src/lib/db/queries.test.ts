import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    saveGameScore,
    getUserGameHistory,
    getUserGameHistoryPaginated,
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
        fn: {
            count: vi.fn().mockReturnValue({
                as: vi.fn().mockReturnValue('COUNT'),
            }),
        },
    },
}))

describe('Database Queries', () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            // Act
            const result = await saveGameScore('user-123', 'tetris', 5000)

            // Assert
            expect(result).toBe(false)
            expect(consoleSpy).toHaveBeenCalledWith(
                'Error saving game score:',
                expect.any(Error)
            )

            consoleSpy.mockRestore()
        })
    })

    describe('getUserGameHistory', () => {
        it('should return user game history with game details from code', async () => {
            // Arrange
            const mockScores = [
                {
                    game_id: 'tetris',
                    score: 5000,
                    created_at: new Date('2023-01-01'),
                },
                {
                    game_id: 'quick_draw',
                    score: 3000,
                    created_at: new Date('2023-01-02'),
                },
            ]

            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue(mockScores),
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
                    created_at: mockScores[0].created_at.toString(),
                },
                {
                    game_id: 'quick_draw',
                    game_name: 'Quick Draw',
                    score: 3000,
                    created_at: mockScores[1].created_at.toString(),
                },
            ])
            expect(db.selectFrom).toHaveBeenCalledWith('game_scores')
            expect(mockQuery.select).toHaveBeenCalledWith([
                'game_scores.game_id',
                'game_scores.score',
                'game_scores.created_at',
            ])
            expect(mockQuery.where).toHaveBeenCalledWith(
                'game_scores.user_id',
                '=',
                'user-123'
            )
            expect(mockQuery.orderBy).toHaveBeenCalledWith(
                'game_scores.created_at',
                'desc'
            )
            expect(mockQuery.limit).toHaveBeenCalledWith(10)
        })

        it('should return empty array on database error', async () => {
            // Arrange
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                execute: vi.fn().mockRejectedValue(new Error('Database error')),
            }

            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            // Act
            const result = await getUserGameHistory('user-123', 10)

            // Assert
            expect(result).toEqual([])
            expect(consoleSpy).toHaveBeenCalledWith(
                'Error fetching user game history:',
                expect.any(Error)
            )

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
            expect(mockQuery.where).toHaveBeenCalledWith(
                'user_id',
                '=',
                'user-123'
            )
            expect(mockQuery.where).toHaveBeenCalledWith(
                'game_id',
                '=',
                'tetris'
            )
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
                executeTakeFirst: vi
                    .fn()
                    .mockRejectedValue(new Error('Database error')),
            }

            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            // Act
            const result = await getUserBestScoreByGame('user-123', 'tetris')

            // Assert
            expect(result).toBeNull()
            expect(consoleSpy).toHaveBeenCalledWith(
                'Error fetching user best score:',
                expect.any(Error)
            )

            consoleSpy.mockRestore()
        })
    })

    describe('getUserGameHistoryPaginated', () => {
        it('should return paginated game history with correct pagination info', async () => {
            // Arrange
            const mockTotalResult = { total: 23 }
            const mockHistory = [
                {
                    game_id: 'tetris',
                    game_name: 'Tetris Challenge',
                    score: 1500,
                    created_at: new Date('2025-07-10T12:00:00Z'),
                },
                {
                    game_id: 'bubble_shooter',
                    game_name: 'Bubble Shooter',
                    score: 2000,
                    created_at: new Date('2025-07-10T11:00:00Z'),
                },
            ]

            // Mock the count query
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockTotalResult),
            }

            // Mock the paginated results query
            const mockResultsQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([
                    {
                        game_id: 'tetris',
                        score: 1500,
                        created_at: new Date('2025-07-10T12:00:00Z'),
                    },
                    {
                        game_id: 'bubble_shooter',
                        score: 2000,
                        created_at: new Date('2025-07-10T11:00:00Z'),
                    },
                ]),
            }

            // Mock selectFrom to return different queries for count and results
            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockCountQuery as any) // First call for count
                .mockReturnValueOnce(mockResultsQuery as any) // Second call for results

            // Act
            const result = await getUserGameHistoryPaginated('user-123', 2, 5)

            // Assert
            expect(result).toEqual({
                games: [
                    {
                        game_id: 'tetris',
                        game_name: 'Tetris Challenge',
                        score: 1500,
                        created_at:
                            'Thu Jul 10 2025 05:00:00 GMT-0700 (Pacific Daylight Time)',
                    },
                    {
                        game_id: 'bubble_shooter',
                        game_name: 'Bubble Shooter',
                        score: 2000,
                        created_at:
                            'Thu Jul 10 2025 04:00:00 GMT-0700 (Pacific Daylight Time)',
                    },
                ],
                total: 23,
                page: 2,
                pageSize: 5,
                totalPages: 5,
            })

            // Verify pagination calculations
            expect(mockResultsQuery.offset).toHaveBeenCalledWith(5) // (page 2 - 1) * pageSize 5
            expect(mockResultsQuery.limit).toHaveBeenCalledWith(5)
        })

        it('should handle empty results correctly', async () => {
            // Arrange
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ total: 0 }),
            }

            const mockResultsQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([]),
            }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockCountQuery as any)
                .mockReturnValueOnce(mockResultsQuery as any)

            // Act
            const result = await getUserGameHistoryPaginated('user-123', 1, 5)

            // Assert
            expect(result).toEqual({
                games: [],
                total: 0,
                page: 1,
                pageSize: 5,
                totalPages: 0,
            })
        })

        it('should calculate total pages correctly', async () => {
            // Arrange
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ total: 23 }),
            }

            const mockResultsQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([]),
            }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockCountQuery as any)
                .mockReturnValueOnce(mockResultsQuery as any)

            // Act
            const result = await getUserGameHistoryPaginated('user-123', 1, 5)

            // Assert
            // 23 items with page size 5 should result in 5 pages (Math.ceil(23/5) = 5)
            expect(result.totalPages).toBe(5)
        })

        it('should handle first page correctly', async () => {
            // Arrange
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ total: 3 }),
            }

            const mockResultsQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([]),
            }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockCountQuery as any)
                .mockReturnValueOnce(mockResultsQuery as any)

            // Act
            await getUserGameHistoryPaginated('user-123', 1, 5)

            // Assert
            // First page should have offset 0
            expect(mockResultsQuery.offset).toHaveBeenCalledWith(0)
        })

        it('should return error state on database failure', async () => {
            // Arrange
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockRejectedValue(new Error('Database error')),
            }

            vi.mocked(db.selectFrom).mockReturnValue(mockCountQuery as any)
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            // Act
            const result = await getUserGameHistoryPaginated('user-123', 1, 5)

            // Assert
            expect(result).toEqual({
                games: [],
                total: 0,
                page: 1,
                pageSize: 5,
                totalPages: 0,
            })
            expect(consoleSpy).toHaveBeenCalledWith(
                'Error fetching paginated user game history:',
                expect.any(Error)
            )

            consoleSpy.mockRestore()
        })
    })
})
