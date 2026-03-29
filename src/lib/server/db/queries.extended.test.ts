import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    getUserStats,
    getUserByUsername,
    getUserIdentityById,
    getUserRecentScores,
    getUserBestScore,
    getUserBestScoreForGame,
    getGameLeaderboard,
    saveGameScoreWithAchievements,
    updateUser,
    getUserAchievements,
    hasUserEarnedAchievement,
    awardAchievement,
    getAllUserIds,
    getActiveUserIdsBetween,
    getUserXPAndLevel,
    updateUserXPAndLevel,
    getUniqueGamesPlayedToday,
    getTotalScoreToday,
    getGamesPlayedCountToday,
    getLoginRewardStatus,
    getUserPreferences,
    updateUserPreferences,
    getUserDailyActivity,
    getAchievementStatistics,
    resetUserStreak,
} from '@/lib/server/db/queries'
import { db } from '@/lib/server/db/client'

// Mock the database client
vi.mock('@/lib/server/db/client', () => ({
    db: {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        transaction: vi.fn(),
        fn: {
            count: vi.fn().mockReturnValue({
                as: vi.fn().mockReturnValue('COUNT'),
                distinct: vi.fn().mockReturnValue({
                    as: vi.fn().mockReturnValue('COUNT_DISTINCT'),
                }),
            }),
            sum: vi.fn().mockReturnValue({
                as: vi.fn().mockReturnValue('SUM'),
            }),
        },
    },
}))

// Mock achievement service for saveGameScoreWithAchievements
vi.mock('@/lib/services/achievementService', () => ({
    checkAndAwardAchievements: vi.fn().mockResolvedValue([]),
    checkInGameAchievements: vi.fn().mockResolvedValue([]),
}))

// Mock challenges module for getUserXPAndLevel streak reset
vi.mock('@/lib/challenges', () => ({
    getLevelFromXP: vi.fn((xp: number) => Math.floor(xp / 100) + 1),
}))

// Mock achievements module for getAchievementStatistics
vi.mock('@/lib/achievements', () => ({
    getAllAchievements: vi.fn().mockReturnValue([
        { id: 'first_win', gameId: 'tetris', name: 'First Win' },
        { id: 'global_ace', gameId: 'global', name: 'Global Ace' },
    ]),
}))

describe('Extended Database Queries', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getUserStats', () => {
        it('should return null when user stats do not exist', async () => {
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const result = await getUserStats('user-123')

            expect(result).toBeNull()
        })

        it('should return user stats with distinct game count', async () => {
            const mockStats = {
                id: 1,
                user_id: 'user-123',
                total_games_played: 5,
                total_score: 10000,
                favorite_game: 'tetris',
            }
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockStats),
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
                    ]),
            }
            vi.mocked(db.selectFrom)
                .mockReturnValueOnce(mockStatsQuery as any)
                .mockReturnValueOnce(mockGamesQuery as any)

            const result = await getUserStats('user-123')

            expect(result).not.toBeNull()
            expect(result!.total_games_played).toBe(2)
        })

        it('should return null on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('Connection failed')
            })

            const result = await getUserStats('user-123')

            expect(result).toBeNull()
        })
    })

    describe('getUserByUsername', () => {
        it('should return null when user is not found', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserByUsername('nonexistent')

            expect(result).toBeNull()
        })

        it('should return user data when found', async () => {
            const mockUser = {
                id: 'user-123',
                username: 'testuser',
                displayName: 'Test User',
                image: null,
                name: 'Test User',
                email: 'test@example.com',
                createdAt: '2024-01-01T00:00:00.000Z',
            }
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockUser),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserByUsername('testuser')

            expect(result).not.toBeNull()
            expect(result!.id).toBe('user-123')
            expect(result!.username).toBe('testuser')
            expect(result!.email).toBe('test@example.com')
        })

        it('should return null on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserByUsername('testuser')

            expect(result).toBeNull()
        })
    })

    describe('getUserIdentityById', () => {
        it('should return null when user is not found', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserIdentityById('user-999')

            expect(result).toBeNull()
        })

        it('should return user data when found by id', async () => {
            const mockUser = {
                id: 'user-123',
                username: 'testuser',
                displayName: null,
                image: 'https://example.com/avatar.png',
                name: 'Test User',
                email: 'test@example.com',
                createdAt: '2024-06-01T12:00:00.000Z',
            }
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockUser),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserIdentityById('user-123')

            expect(result).not.toBeNull()
            expect(result!.id).toBe('user-123')
            expect(result!.image).toBe('https://example.com/avatar.png')
        })

        it('should return null on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserIdentityById('user-123')

            expect(result).toBeNull()
        })
    })

    describe('getUserRecentScores', () => {
        it('should return recent scores for user', async () => {
            const mockScores = [
                {
                    id: 1,
                    user_id: 'user-123',
                    game_id: 'tetris',
                    score: 1000,
                    created_at: new Date(),
                },
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
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserRecentScores('user-123')

            expect(result).toEqual([])
        })
    })

    describe('getUserBestScore', () => {
        it('should return the best score for a user and game', async () => {
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
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserBestScore('user-123', 'tetris')

            expect(result).toBeNull()
        })
    })

    describe('getUserBestScoreForGame', () => {
        it('should return 0 when no score exists', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserBestScoreForGame('user-123', 'tetris')

            expect(result).toBe(0)
        })

        it('should return the score when it exists', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ score: 5000 }),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserBestScoreForGame('user-123', 'tetris')

            expect(result).toBe(5000)
        })
    })

    describe('getGameLeaderboard', () => {
        it('should return leaderboard entries', async () => {
            const mockRows = [
                {
                    name: 'Player One',
                    username: 'player1',
                    score: 10000,
                    created_at: new Date('2024-01-01'),
                    image: null,
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

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('Player One')
            expect(result[0].score).toBe(10000)
        })

        it('should use Anonymous for entries with null name', async () => {
            const mockRows = [
                {
                    name: null,
                    username: null,
                    score: 5000,
                    created_at: new Date('2024-01-02'),
                    image: null,
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

            const result = await getGameLeaderboard('tetris')

            expect(result[0].name).toBe('Anonymous')
            expect(result[0].username).toBeNull()
        })

        it('should return empty array on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getGameLeaderboard('tetris')

            expect(result).toEqual([])
        })
    })

    describe('saveGameScoreWithAchievements', () => {
        it('should return failure when saveGameScore fails', async () => {
            // Mock db.insertInto to fail so saveGameScore returns false
            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                execute: vi.fn().mockRejectedValue(new Error('Insert failed')),
            }
            vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)

            const result = await saveGameScoreWithAchievements(
                'user-123',
                'tetris',
                5000
            )

            expect(result.success).toBe(false)
            expect(result.newAchievements).toEqual([])
        })

        it('should return success with achievements when score saved', async () => {
            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)
            // Let selectFrom return something that won't break getUserStats
            const mockSelectQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const { checkAndAwardAchievements } = await import(
                '@/lib/services/achievementService'
            )
            vi.mocked(checkAndAwardAchievements).mockResolvedValue([
                'first_win',
            ])

            const result = await saveGameScoreWithAchievements(
                'user-123',
                'tetris',
                5000
            )

            expect(result.success).toBe(true)
            expect(result.newAchievements).toContain('first_win')
        })

        it('should handle invalid game data type', async () => {
            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)
            const mockSelectQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            // Pass null as gameData to trigger the isGameData check (null is explicitly rejected even though typeof null === 'object')
            const result = await saveGameScoreWithAchievements(
                'user-123',
                'tetris',
                5000,
                null
            )

            // null should be rejected by isGameData (null is not a valid game data object)
            expect(result.success).toBe(false)
        })

        it('should include in-game achievements when valid gameData provided', async () => {
            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)
            const mockSelectQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const { checkInGameAchievements } = await import(
                '@/lib/services/achievementService'
            )
            vi.mocked(checkInGameAchievements).mockResolvedValue([
                'in_game_ace',
            ])

            const gameData = { level: 5, bonuses: 3 }
            const result = await saveGameScoreWithAchievements(
                'user-123',
                'tetris',
                5000,
                gameData
            )

            expect(result.success).toBe(true)
            expect(result.newAchievements).toContain('in_game_ace')
        })
    })

    describe('updateUser', () => {
        it('should return true on successful update', async () => {
            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await updateUser('user-123', { name: 'New Name' })

            expect(result).toBe(true)
            expect(db.updateTable).toHaveBeenCalledWith('user')
        })

        it('should return false on database error', async () => {
            vi.mocked(db.updateTable).mockImplementation(() => {
                throw new Error('Update failed')
            })

            const result = await updateUser('user-123', { name: 'New Name' })

            expect(result).toBe(false)
        })
    })

    describe('getUserAchievements', () => {
        it('should return user achievements list', async () => {
            const mockAchievements = [
                {
                    id: '1',
                    user_id: 'user-123',
                    achievement_id: 'first_win',
                    earned_at: new Date().toISOString(),
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
            expect(result).toHaveLength(1)
        })

        it('should return empty array on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserAchievements('user-123')

            expect(result).toEqual([])
        })
    })

    describe('hasUserEarnedAchievement', () => {
        it('should return true when achievement exists', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockResolvedValue({ id: 'achievement-record-1' }),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await hasUserEarnedAchievement(
                'user-123',
                'first_win'
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
                'first_win'
            )

            expect(result).toBe(false)
        })

        it('should return false on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await hasUserEarnedAchievement(
                'user-123',
                'first_win'
            )

            expect(result).toBe(false)
        })
    })

    describe('awardAchievement', () => {
        it('should return true when achievement already earned', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockResolvedValue({ id: 'achievement-record-1' }),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await awardAchievement('user-123', 'first_win')

            expect(result).toBe(true)
        })

        it('should award achievement when not yet earned', async () => {
            // First call (hasUserEarnedAchievement) returns undefined
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)

            const result = await awardAchievement('user-123', 'first_win')

            expect(result).toBe(true)
            expect(db.insertInto).toHaveBeenCalledWith('user_achievements')
        })

        it('should return false on database error during insert', async () => {
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
            vi.mocked(db.insertInto).mockImplementation(() => {
                throw new Error('Insert failed')
            })

            const result = await awardAchievement('user-123', 'first_win')

            expect(result).toBe(false)
        })
    })

    describe('getAllUserIds', () => {
        it('should return all user ids', async () => {
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
        })

        it('should return empty array on error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getAllUserIds()

            expect(result).toEqual([])
        })
    })

    describe('getActiveUserIdsBetween', () => {
        it('should return active user ids in date range', async () => {
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

            const start = new Date('2024-01-01')
            const end = new Date('2024-01-02')
            const result = await getActiveUserIdsBetween(start, end)

            expect(result).toEqual(['user-1', 'user-2'])
        })

        it('should return empty array on error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getActiveUserIdsBetween(new Date(), new Date())

            expect(result).toEqual([])
        })
    })

    describe('getUserXPAndLevel', () => {
        it('should return default values when no stats exist', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserXPAndLevel('user-123')

            expect(result.xp).toBe(0)
            expect(result.level).toBe(1)
            expect(result.challengeStreak).toBe(0)
            expect(result.lastChallengeDate).toBeNull()
        })

        it('should return stats when they exist and last challenge is today', async () => {
            const today = new Date().toISOString().split('T')[0]
            const mockStats = {
                xp: 500,
                level: 6,
                challenge_streak: 3,
                last_challenge_date: today,
            }
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockStats),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserXPAndLevel('user-123')

            expect(result.xp).toBe(500)
            expect(result.level).toBe(6)
            expect(result.challengeStreak).toBe(3)
            expect(result.lastChallengeDate).toBe(today)
        })

        it('should reset streak when last challenge was before yesterday', async () => {
            const oldDate = '2020-01-01'
            const mockStats = {
                xp: 200,
                level: 3,
                challenge_streak: 5,
                last_challenge_date: oldDate,
            }
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockStats),
            }
            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await getUserXPAndLevel('user-123')

            expect(result.challengeStreak).toBe(0)
        })

        it('should log error but not throw when streak reset update fails (line 1521)', async () => {
            const oldDate = '2020-01-01'
            const mockStats = {
                xp: 200,
                level: 3,
                challenge_streak: 5,
                last_challenge_date: oldDate,
            }
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockStats),
            }
            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi
                    .fn()
                    .mockRejectedValue(new Error('DB update error')),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            // Should not throw despite update error (caught internally)
            const result = await getUserXPAndLevel('user-123')
            expect(result.challengeStreak).toBe(0)
        })

        it('should return defaults on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserXPAndLevel('user-123')

            expect(result.xp).toBe(0)
            expect(result.level).toBe(1)
            expect(result.challengeStreak).toBe(0)
        })
    })

    describe('updateUserXPAndLevel', () => {
        it('should return true on successful update', async () => {
            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                onConflict: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            // onConflict returns an object with doUpdateSet
            const mockOnConflict = {
                column: vi.fn().mockReturnThis(),
                doUpdateSet: vi.fn().mockReturnThis(),
            }
            vi.mocked(db.insertInto).mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflict: vi.fn().mockReturnValue({
                        ...mockOnConflict,
                        execute: vi.fn().mockResolvedValue({}),
                    }),
                }),
            } as any)

            // Also need db.selectFrom for ensureChallengeColumns (silently fails)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await updateUserXPAndLevel('user-123', 100, 2)

            expect(result).toBe(true)
        })

        it('should invoke the onConflict callback (lines 1565-1569)', async () => {
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            // Make onConflict actually invoke the callback so lines 1565-1569 are covered
            const mockOc = {
                column: vi.fn().mockReturnThis(),
                doUpdateSet: vi.fn().mockReturnThis(),
            }
            vi.mocked(db.insertInto).mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflict: vi
                        .fn()
                        .mockImplementation(
                            (cb: (oc: typeof mockOc) => typeof mockOc) => {
                                cb(mockOc) // invoke the callback — this runs lines 1565-1569
                                return {
                                    execute: vi.fn().mockResolvedValue({}),
                                }
                            }
                        ),
                }),
            } as any)

            const result = await updateUserXPAndLevel('user-123', 50, 3)
            expect(result).toBe(true)
            expect(mockOc.column).toHaveBeenCalledWith('user_id')
            expect(mockOc.doUpdateSet).toHaveBeenCalled()
        })

        it('should return false on database error', async () => {
            vi.mocked(db.insertInto).mockImplementation(() => {
                throw new Error('Insert failed')
            })

            const result = await updateUserXPAndLevel('user-123', 100, 2)

            expect(result).toBe(false)
        })
    })

    describe('getUniqueGamesPlayedToday', () => {
        it('should return unique game ids played today', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi
                    .fn()
                    .mockResolvedValue([
                        { game_id: 'tetris' },
                        { game_id: 'snake' },
                    ]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUniqueGamesPlayedToday('user-123')

            expect(result).toEqual(['tetris', 'snake'])
        })

        it('should return empty array on error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUniqueGamesPlayedToday('user-123')

            expect(result).toEqual([])
        })
    })

    describe('getTotalScoreToday', () => {
        it('should return total score for today', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ total: 15000 }),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getTotalScoreToday('user-123')

            expect(result).toBe(15000)
        })

        it('should return 0 when no scores today', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getTotalScoreToday('user-123')

            expect(result).toBe(0)
        })

        it('should return 0 on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getTotalScoreToday('user-123')

            expect(result).toBe(0)
        })
    })

    describe('getGamesPlayedCountToday', () => {
        it('should return count of games played today', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ count: 7 }),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getGamesPlayedCountToday('user-123')

            expect(result).toBe(7)
        })

        it('should return 0 on error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getGamesPlayedCountToday('user-123')

            expect(result).toBe(0)
        })
    })

    describe('getLoginRewardStatus', () => {
        it('should return null when no stats row exists', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getLoginRewardStatus('user-123')

            expect(result).toBeNull()
        })

        it('should return login reward data when stats exist', async () => {
            const mockStats = {
                login_streak: 3,
                last_login_reward_date: '2024-01-15',
                total_login_cycles: 1,
            }
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockStats),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getLoginRewardStatus('user-123')

            expect(result).not.toBeNull()
            expect(result!.login_streak).toBe(3)
            expect(result!.last_login_reward_date).toBe('2024-01-15')
            expect(result!.total_login_cycles).toBe(1)
        })

        it('should return null on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getLoginRewardStatus('user-123')

            expect(result).toBeNull()
        })
    })

    describe('getUserPreferences', () => {
        it('should return default preferences when no stats row exists', async () => {
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserPreferences('user-123')

            expect(result).not.toBeNull()
            expect(result!.email_notifications).toBe(true)
            expect(result!.push_notifications).toBe(false)
            expect(result!.challenge_reminders).toBe(true)
        })

        it('should return user preferences when stats exist', async () => {
            const mockStats = {
                email_notifications: 0,
                push_notifications: 1,
                challenge_reminders: 0,
            }
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(mockStats),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserPreferences('user-123')

            expect(result).not.toBeNull()
            expect(result!.email_notifications).toBe(false)
            expect(result!.push_notifications).toBe(true)
            expect(result!.challenge_reminders).toBe(false)
        })

        it('should return null on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserPreferences('user-123')

            expect(result).toBeNull()
        })
    })

    describe('updateUserPreferences', () => {
        it('should return true on successful update', async () => {
            // getUserStats call
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockResolvedValue({ id: 1, user_id: 'user-123' }),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await updateUserPreferences('user-123', {
                email_notifications: true,
                push_notifications: false,
                challenge_reminders: true,
            })

            expect(result).toBe(true)
            expect(db.updateTable).toHaveBeenCalledWith('user_stats')
        })

        it('should return false on database error during update', async () => {
            // getUserStats returns existing stats
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi
                    .fn()
                    .mockResolvedValue({ id: 1, user_id: 'user-123' }),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)
            vi.mocked(db.updateTable).mockImplementation(() => {
                throw new Error('Update failed')
            })

            const result = await updateUserPreferences('user-123', {
                email_notifications: false,
            })

            expect(result).toBe(false)
        })

        it('should call upsertUserStats when existing stats are null', async () => {
            // getUserStats returns null → triggers upsertUserStats path
            const mockStatsQuery = {
                selectAll: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(null),
                execute: vi.fn().mockResolvedValue([]),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockStatsQuery as any)

            const mockInsertQuery = {
                values: vi.fn().mockReturnThis(),
                onConflict: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.insertInto).mockReturnValue(mockInsertQuery as any)

            const mockUpdateQuery = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue({}),
            }
            vi.mocked(db.updateTable).mockReturnValue(mockUpdateQuery as any)

            const result = await updateUserPreferences('user-123', {
                challenge_reminders: false, // tests the ': 0' false branch
            })

            expect(result).toBe(true)
        })
    })

    describe('getUserDailyActivity', () => {
        it('should return daily activity grouped by day', async () => {
            const mockRows = [
                { day: '2024-01-01', count: 5 },
                { day: '2024-01-02', count: 3 },
            ]
            const mockQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                groupBy: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                execute: vi.fn().mockResolvedValue(mockRows),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockQuery as any)

            const result = await getUserDailyActivity('user-123', 2024)

            expect(result).toHaveLength(2)
            expect(result[0].date).toBe('2024-01-01')
            expect(result[0].count).toBe(5)
        })

        it('should return empty array on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getUserDailyActivity('user-123')

            expect(result).toEqual([])
        })
    })

    describe('getAchievementStatistics', () => {
        it('should return achievement statistics', async () => {
            // Both achievements are earned - first_win (tetris) and global_ace (global)
            const mockAchievementStats = [
                { achievement_id: 'first_win', earned_count: 50 },
                { achievement_id: 'global_ace', earned_count: 20 },
            ]
            const mockGamePlayerCounts = [
                { game_id: 'tetris', player_count: 100 },
            ]
            const mockGlobalCount = { player_count: 200 }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    groupBy: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue(mockAchievementStats),
                } as any)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    groupBy: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue(mockGamePlayerCounts),
                } as any)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi
                        .fn()
                        .mockResolvedValue(mockGlobalCount),
                } as any)

            const result = await getAchievementStatistics()

            // Should include both earned achievements
            expect(result.length).toBeGreaterThanOrEqual(2)
            const firstWin = result.find(r => r.achievement_id === 'first_win')
            expect(firstWin).toBeDefined()
            expect(firstWin!.earned_count).toBe(50)
            expect(firstWin!.total_players).toBe(100)

            const globalAce = result.find(
                r => r.achievement_id === 'global_ace'
            )
            expect(globalAce).toBeDefined()
            expect(globalAce!.earned_count).toBe(20)
            expect(globalAce!.total_players).toBe(200)
        })

        it('should return empty array on database error', async () => {
            vi.mocked(db.selectFrom).mockImplementation(() => {
                throw new Error('DB error')
            })

            const result = await getAchievementStatistics()

            expect(result).toEqual([])
        })

        it('should include unearned achievements with earned_count 0', async () => {
            // Only first_win is earned; global_ace is NOT earned → unearned forEach runs
            const mockAchievementStats = [
                { achievement_id: 'first_win', earned_count: 50 },
            ]
            const mockGamePlayerCounts = [
                { game_id: 'tetris', player_count: 100 },
            ]
            const mockGlobalCount = { player_count: 200 }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    groupBy: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue(mockAchievementStats),
                } as any)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    groupBy: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue(mockGamePlayerCounts),
                } as any)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi
                        .fn()
                        .mockResolvedValue(mockGlobalCount),
                } as any)

            const result = await getAchievementStatistics()

            // global_ace was not earned → should appear with earned_count: 0
            const globalAce = result.find(
                r => r.achievement_id === 'global_ace'
            )
            expect(globalAce).toBeDefined()
            expect(globalAce!.earned_count).toBe(0)
            expect(globalAce!.total_players).toBe(200) // global achievement uses globalPlayers
            expect(globalAce!.percentage).toBe(0)
        })

        it('should use gamePlayerMap for unearned non-global achievements (lines 1201-1202)', async () => {
            // Neither achievement is earned → both go into unearnedAchievements forEach
            // global_ace hits the if(gameId === 'global') branch
            // first_win (tetris) hits the else branch (lines 1201-1202)
            const mockAchievementStats: never[] = []
            const mockGamePlayerCounts = [
                { game_id: 'tetris', player_count: 75 },
            ]
            const mockGlobalCount = { player_count: 150 }

            vi.mocked(db.selectFrom)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    groupBy: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue(mockAchievementStats),
                } as any)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    groupBy: vi.fn().mockReturnThis(),
                    execute: vi.fn().mockResolvedValue(mockGamePlayerCounts),
                } as any)
                .mockReturnValueOnce({
                    select: vi.fn().mockReturnThis(),
                    executeTakeFirst: vi
                        .fn()
                        .mockResolvedValue(mockGlobalCount),
                } as any)

            const result = await getAchievementStatistics()

            const firstWin = result.find(r => r.achievement_id === 'first_win')
            expect(firstWin).toBeDefined()
            expect(firstWin!.earned_count).toBe(0)
            expect(firstWin!.total_players).toBe(75) // from gamePlayerMap (else branch)
        })
    })

    describe('resetUserStreak', () => {
        it('should return true on successful streak reset', async () => {
            // upsertUserStats calls insertInto/updateTable internally
            vi.mocked(db.insertInto).mockReturnValue({
                values: vi.fn().mockReturnValue({
                    execute: vi.fn().mockResolvedValue({}),
                }),
            } as any)
            const mockSelectQuery = {
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            }
            vi.mocked(db.selectFrom).mockReturnValue(mockSelectQuery as any)

            const result = await resetUserStreak('user-123')
            expect(result).toBe(true)
        })
    })
})
