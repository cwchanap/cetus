import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    saveGameScore,
    getUserGameHistory,
    getUserGameHistoryPaginated,
    getUserBestScoreByGame,
    getUserAchievementsPaginated,
    isUsernameAvailable,
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
import { db } from '@/lib/server/db/client'

// Mock the database client
vi.mock('@/lib/server/db/client', () => ({
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
            vi.doMock('@/lib/server/db/queries', async () => {
                const actual = await vi.importActual('@/lib/server/db/queries')
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
            // Act
            const result = await saveGameScore('user-123', 'tetris', 5000)

            // Assert
            expect(result).toBe(false)
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
                    game_id: 'bubble_shooter',
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
                    game_id: 'bubble_shooter',
                    game_name: 'Bubble Shooter',
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
            // Act
            const result = await getUserGameHistory('user-123', 10)

            // Assert
            expect(result).toEqual([])
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
            // Act
            const result = await getUserBestScoreByGame('user-123', 'tetris')

            // Assert
            expect(result).toBeNull()
        })
    })

    describe('getUserGameHistoryPaginated', () => {
        it('should return paginated game history with correct pagination info', async () => {
            // Arrange
            const mockTotalResult = { total: 23 }
            const _mockHistory = [
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
                        created_at: new Date('2025-07-10T12:00:00Z').toString(),
                    },
                    {
                        game_id: 'bubble_shooter',
                        game_name: 'Bubble Shooter',
                        score: 2000,
                        created_at: new Date('2025-07-10T11:00:00Z').toString(),
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
    })

    describe('getUserAchievementsPaginated', () => {
        it('should return paginated user achievements with default parameters', async () => {
            // Arrange
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ total: 15 }),
            }

            const mockSelectQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([
                    {
                        id: '1',
                        user_id: 'user1',
                        achievement_id: 'achievement1',
                        earned_at: new Date().toISOString(),
                    },
                    {
                        id: '2',
                        user_id: 'user1',
                        achievement_id: 'achievement2',
                        earned_at: new Date().toISOString(),
                    },
                ]),
            }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockCountQuery as any)
                .mockReturnValueOnce(mockSelectQuery as any)

            // Act
            const result = await getUserAchievementsPaginated('user1')

            // Assert
            expect(result.page).toBe(1)
            expect(result.pageSize).toBe(10)
            expect(result.total).toBe(15)
            expect(result.totalPages).toBe(2)
            expect(result.userAchievements).toHaveLength(2)
        })

        it('should handle custom page and page size', async () => {
            // Arrange
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ total: 25 }),
            }

            const mockSelectQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([
                    {
                        id: '6',
                        user_id: 'user1',
                        achievement_id: 'achievement6',
                        earned_at: new Date().toISOString(),
                    },
                    {
                        id: '7',
                        user_id: 'user1',
                        achievement_id: 'achievement7',
                        earned_at: new Date().toISOString(),
                    },
                    {
                        id: '8',
                        user_id: 'user1',
                        achievement_id: 'achievement8',
                        earned_at: new Date().toISOString(),
                    },
                    {
                        id: '9',
                        user_id: 'user1',
                        achievement_id: 'achievement9',
                        earned_at: new Date().toISOString(),
                    },
                    {
                        id: '10',
                        user_id: 'user1',
                        achievement_id: 'achievement10',
                        earned_at: new Date().toISOString(),
                    },
                ]),
            }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockCountQuery as any)
                .mockReturnValueOnce(mockSelectQuery as any)

            // Act
            const result = await getUserAchievementsPaginated('user1', 2, 5)

            // Assert
            expect(result.page).toBe(2)
            expect(result.pageSize).toBe(5)
            expect(result.total).toBe(25)
            expect(result.totalPages).toBe(5)
            expect(result.userAchievements).toHaveLength(5)

            // Verify offset calculation: (page - 1) * pageSize = (2 - 1) * 5 = 5
            expect(mockSelectQuery.offset).toHaveBeenCalledWith(5)
        })

        it('should handle empty results', async () => {
            // Arrange
            const mockCountQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ total: 0 }),
            }

            const mockSelectQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue([]),
            }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockCountQuery as any)
                .mockReturnValueOnce(mockSelectQuery as any)

            // Act
            const result = await getUserAchievementsPaginated('user1')

            // Assert
            expect(result.page).toBe(1)
            expect(result.pageSize).toBe(10)
            expect(result.total).toBe(0)
            expect(result.totalPages).toBe(0)
            expect(result.userAchievements).toHaveLength(0)
        })

        it('should handle database errors gracefully', async () => {
            // Arrange
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('Database connection failed')
            })

            // Act
            const result = await getUserAchievementsPaginated('user1')

            // Assert
            expect(result.userAchievements).toEqual([])
            expect(result.total).toBe(0)
            expect(result.page).toBe(1)
            expect(result.pageSize).toBe(10)
            expect(result.totalPages).toBe(0)
        })

        it('should calculate total pages correctly', async () => {
            const testCases = [
                { total: 10, pageSize: 10, expectedPages: 1 },
                { total: 11, pageSize: 10, expectedPages: 2 },
                { total: 20, pageSize: 10, expectedPages: 2 },
                { total: 21, pageSize: 10, expectedPages: 3 },
                { total: 1, pageSize: 10, expectedPages: 1 },
                { total: 0, pageSize: 10, expectedPages: 0 },
            ]

            for (const testCase of testCases) {
                // Arrange
                const mockCountQuery = {
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi
                        .fn()
                        .mockResolvedValue({ total: testCase.total }),
                }

                const mockSelectQuery = {
                    selectAll: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    offset: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue([]),
                }

                vi.mocked(db.selectFrom)
                    .mockReturnValueOnce(mockCountQuery as any)
                    .mockReturnValueOnce(mockSelectQuery as any)

                // Act
                const result = await getUserAchievementsPaginated(
                    'user1',
                    1,
                    testCase.pageSize
                )

                // Assert
                expect(result.totalPages).toBe(testCase.expectedPages)
                expect(result.total).toBe(testCase.total)

                vi.clearAllMocks()
            }
        })
    })

    describe('isUsernameAvailable', () => {
        it('returns true when username is not taken', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await isUsernameAvailable('newuser')

            expect(result).toBe(true)
            expect(mockQuery.where).toHaveBeenCalledWith(
                'username',
                '=',
                'newuser'
            )
        })

        it('returns false when username is already taken', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockResolvedValue({ id: 'existing-user-id' }),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await isUsernameAvailable('existinguser')

            expect(result).toBe(false)
        })

        it('excludes specified userId from the check', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await isUsernameAvailable(
                'myuser',
                'current-user-id'
            )

            expect(result).toBe(true)
            expect(mockQuery.where).toHaveBeenCalledWith(
                'id',
                '!=',
                'current-user-id'
            )
        })

        it('returns false when username exists for different user (with excludeUserId)', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockResolvedValue({ id: 'other-user-id' }),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await isUsernameAvailable(
                'existinguser',
                'current-user-id'
            )

            expect(result).toBe(false)
        })

        it('returns false on database error', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockRejectedValue(new Error('db connection failed')),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await isUsernameAvailable('testuser')

            expect(result).toBe(false)
        })
    })
})

describe('getUserStats', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return null when user_stats row is not found', async () => {
        const mockQuery = {
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserStats('user-123')

        expect(result).toBeNull()
    })

    it('should return stats with distinct game count when row exists', async () => {
        const mockStatsRow = {
            id: 1,
            user_id: 'user-123',
            total_games_played: 99, // Will be overridden
            total_score: 5000,
            favorite_game: 'tetris',
            level: 1,
            xp: 200,
        }
        const mockStatsQuery = {
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(mockStatsRow),
        }
        const mockGamesQuery = {
            select: vi.fn().mockReturnThis(),
            distinct: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi
                .fn()
                .mockResolvedValue([
                    { game_id: 'tetris' },
                    { game_id: 'snake' },
                    { game_id: 'sudoku' },
                ]),
        }
        vi.mocked(db.selectFrom)
            .mockReturnValueOnce(mockStatsQuery as any)
            .mockReturnValueOnce(mockGamesQuery as any)

        const result = await getUserStats('user-123')

        expect(result).not.toBeNull()
        expect(result!.total_games_played).toBe(3) // From distinct games, not stored value
        expect(result!.total_score).toBe(5000)
    })

    it('should return null on database error', async () => {
        vi.mocked(db.selectFrom).mockImplementation(() => {
            throw new Error('Connection refused')
        })

        const result = await getUserStats('user-123')

        expect(result).toBeNull()
    })
})

describe('getUserRecentScores', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return recent scores for a user', async () => {
        const mockScores = [
            { id: '1', game_id: 'tetris', score: 5000, created_at: new Date() },
            { id: '2', game_id: 'snake', score: 3000, created_at: new Date() },
        ]
        const mockQuery = {
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue(mockScores),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserRecentScores('user-123', 5)

        expect(result).toEqual(mockScores)
        expect(mockQuery.limit).toHaveBeenCalledWith(5)
        expect(mockQuery.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })

    it('should use default limit of 5', async () => {
        const mockQuery = {
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([]),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        await getUserRecentScores('user-123')

        expect(mockQuery.limit).toHaveBeenCalledWith(5)
    })

    it('should return empty array on database error', async () => {
        const mockQuery = {
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: vi.fn().mockRejectedValue(new Error('DB error')),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserRecentScores('user-123')

        expect(result).toEqual([])
    })
})

describe('getUserBestScore', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return the best score for a user/game pair', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ score: 9500 }),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserBestScore('user-123', 'tetris')

        expect(result).toBe(9500)
    })

    it('should return null when no scores exist', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserBestScore('user-123', 'tetris')

        expect(result).toBeNull()
    })

    it('should return null on database error', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockRejectedValue(new Error('DB error')),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserBestScore('user-123', 'tetris')

        expect(result).toBeNull()
    })
})

describe('getUserBestScoreForGame', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return score when found', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ score: 7200 }),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserBestScoreForGame('user-123', 'snake')

        expect(result).toBe(7200)
    })

    it('should return 0 when no score found (null -> 0 conversion)', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserBestScoreForGame('user-123', 'snake')

        expect(result).toBe(0)
    })
})

describe('hasUserEarnedAchievement', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return true when achievement exists', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ id: 'ach-1' }),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await hasUserEarnedAchievement(
            'user-123',
            'tetris_master'
        )

        expect(result).toBe(true)
    })

    it('should return false when achievement does not exist', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await hasUserEarnedAchievement(
            'user-123',
            'tetris_master'
        )

        expect(result).toBe(false)
    })

    it('should return false on database error', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockRejectedValue(new Error('DB error')),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await hasUserEarnedAchievement(
            'user-123',
            'tetris_master'
        )

        expect(result).toBe(false)
    })
})

describe('awardAchievement', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return true if user already has the achievement', async () => {
        // hasUserEarnedAchievement returns true
        const mockSelectQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ id: 'ach-1' }),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

        const result = await awardAchievement('user-123', 'tetris_master')

        expect(result).toBe(true)
        expect(db.insertInto).not.toHaveBeenCalled()
    })

    it('should insert and return true when user does not have achievement', async () => {
        // hasUserEarnedAchievement returns false
        const mockSelectQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }
        const mockInsertQuery = {
            values: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue({}),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
        vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)

        const result = await awardAchievement('user-123', 'tetris_master')

        expect(result).toBe(true)
        expect(db.insertInto).toHaveBeenCalledWith('user_achievements')
        expect(mockInsertQuery.values).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 'user-123',
                achievement_id: 'tetris_master',
            })
        )
    })

    it('should return false when insert fails', async () => {
        // hasUserEarnedAchievement returns false (no achievement)
        const mockSelectQuery = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }
        // insertInto throws
        const mockInsertQuery = {
            values: vi.fn().mockReturnThis(),
            execute: vi.fn().mockRejectedValue(new Error('Insert failed')),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
        vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)

        const result = await awardAchievement('user-123', 'tetris_master')

        expect(result).toBe(false)
    })
})

describe('getUserAchievements', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return list of user achievements', async () => {
        const mockAchievements = [
            {
                id: '1',
                user_id: 'user-123',
                achievement_id: 'tetris_master',
                earned_at: new Date(),
            },
            {
                id: '2',
                user_id: 'user-123',
                achievement_id: 'snake_expert',
                earned_at: new Date(),
            },
        ]
        const mockQuery = {
            selectAll: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue(mockAchievements),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getUserAchievements('user-123')

        expect(result).toEqual(mockAchievements)
        expect(db.selectFrom).toHaveBeenCalledWith('user_achievements')
    })

    it('should return empty array on database error', async () => {
        vi.mocked(db.selectFrom).mockImplementation(() => {
            throw new Error('DB error')
        })

        const result = await getUserAchievements('user-123')

        expect(result).toEqual([])
    })
})

describe('getAllUserIds', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return array of all user IDs', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            execute: vi
                .fn()
                .mockResolvedValue([
                    { id: 'user-1' },
                    { id: 'user-2' },
                    { id: 'user-3' },
                ]),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getAllUserIds()

        expect(result).toEqual(['user-1', 'user-2', 'user-3'])
        expect(db.selectFrom).toHaveBeenCalledWith('user')
    })

    it('should return empty array on database error', async () => {
        vi.mocked(db.selectFrom).mockImplementation(() => {
            throw new Error('DB error')
        })

        const result = await getAllUserIds()

        expect(result).toEqual([])
    })
})

describe('getActiveUserIdsBetween', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return user IDs active between start and end dates', async () => {
        const start = new Date('2024-01-01')
        const end = new Date('2024-01-02')
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            distinct: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi
                .fn()
                .mockResolvedValue([
                    { user_id: 'user-1' },
                    { user_id: 'user-2' },
                ]),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getActiveUserIdsBetween(start, end)

        expect(result).toEqual(['user-1', 'user-2'])
        expect(mockQuery.where).toHaveBeenCalledWith('created_at', '>=', start)
        expect(mockQuery.where).toHaveBeenCalledWith('created_at', '<', end)
    })

    it('should return empty array on database error', async () => {
        vi.mocked(db.selectFrom).mockImplementation(() => {
            throw new Error('DB error')
        })

        const result = await getActiveUserIdsBetween(
            new Date('2024-01-01'),
            new Date('2024-01-02')
        )

        expect(result).toEqual([])
    })
})

describe('getGameLeaderboard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return leaderboard entries with Anonymous name for null users', async () => {
        const mockRows = [
            {
                name: null,
                username: null,
                score: 8000,
                created_at: new Date('2024-01-01'),
                image: null,
            },
            {
                name: 'Player One',
                username: 'p1',
                score: 5000,
                created_at: new Date('2024-01-02'),
                image: 'img.png',
            },
        ]
        const mockQuery = {
            leftJoin: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue(mockRows),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        const result = await getGameLeaderboard('tetris', 10)

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('Anonymous')
        expect(result[0].score).toBe(8000)
        expect(result[1].name).toBe('Player One')
        expect(result[1].username).toBe('p1')
        expect(result[1].image).toBe('img.png')
    })

    it('should use default limit of 10', async () => {
        const mockQuery = {
            leftJoin: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([]),
        }
        vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

        await getGameLeaderboard('tetris')

        expect(mockQuery.limit).toHaveBeenCalledWith(10)
    })

    it('should return empty array on database error', async () => {
        vi.mocked(db.selectFrom).mockImplementation(() => {
            throw new Error('DB error')
        })

        const result = await getGameLeaderboard('tetris')

        expect(result).toEqual([])
    })
})
