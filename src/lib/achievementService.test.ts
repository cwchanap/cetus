import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    checkAndAwardAchievements,
    awardGlobalAchievement,
    getUserGameAchievementProgress,
    getAchievementNotifications,
    checkSpaceExplorerAchievement,
} from './achievementService'

// Mock the database queries
vi.mock('./db/queries', () => ({
    awardAchievement: vi.fn(),
    hasUserEarnedAchievement: vi.fn(),
    getUserBestScoreForGame: vi.fn(),
}))

// Mock the achievements
vi.mock('./achievements', () => ({
    getAchievementsByGame: vi.fn(),
    ACHIEVEMENTS: [
        {
            id: 'tetris_novice',
            name: 'Tetris Novice',
            description: 'Score 100 points in Tetris',
            logo: '🔰',
            gameId: 'tetris',
            condition: { type: 'score_threshold', threshold: 100 },
            rarity: 'common',
        },
        {
            id: 'tetris_master',
            name: 'Tetris Master',
            description: 'Score 1000 points in Tetris',
            logo: '👑',
            gameId: 'tetris',
            condition: { type: 'score_threshold', threshold: 1000 },
            rarity: 'epic',
        },
        {
            id: 'space_explorer',
            name: 'Space Explorer',
            description: 'Welcome to the Cetus universe!',
            logo: '🚀',
            gameId: 'global',
            condition: { type: 'custom', customCheck: 'user_registration' },
            rarity: 'common',
        },
    ],
}))

import {
    awardAchievement,
    hasUserEarnedAchievement,
    getUserBestScoreForGame,
} from './db/queries'
import { getAchievementsByGame, ACHIEVEMENTS } from './achievements'

const mockAwardAchievement = vi.mocked(awardAchievement)
const mockHasUserEarnedAchievement = vi.mocked(hasUserEarnedAchievement)
const mockGetUserBestScoreForGame = vi.mocked(getUserBestScoreForGame)
const mockGetAchievementsByGame = vi.mocked(getAchievementsByGame)

describe('Achievement Service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('checkAndAwardAchievements', () => {
        it('should award achievement when score threshold is met', async () => {
            // Setup mocks
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_novice',
                    name: 'Tetris Novice',
                    description: 'Score 100 points in Tetris',
                    logo: '🔰',
                    gameId: 'tetris',
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: 'common',
                },
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(true)

            const result = await checkAndAwardAchievements(
                'user123',
                'tetris',
                150
            )

            expect(mockGetAchievementsByGame).toHaveBeenCalledWith('tetris')
            expect(mockHasUserEarnedAchievement).toHaveBeenCalledWith(
                'user123',
                'tetris_novice'
            )
            expect(mockAwardAchievement).toHaveBeenCalledWith(
                'user123',
                'tetris_novice'
            )
            expect(result).toEqual(['tetris_novice'])
        })

        it('should not award achievement if already earned', async () => {
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_novice',
                    name: 'Tetris Novice',
                    description: 'Score 100 points in Tetris',
                    logo: '🔰',
                    gameId: 'tetris',
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: 'common',
                },
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(true) // Already earned

            const result = await checkAndAwardAchievements(
                'user123',
                'tetris',
                150
            )

            expect(mockAwardAchievement).not.toHaveBeenCalled()
            expect(result).toEqual([])
        })

        it('should not award achievement if score threshold not met', async () => {
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_novice',
                    name: 'Tetris Novice',
                    description: 'Score 100 points in Tetris',
                    logo: '🔰',
                    gameId: 'tetris',
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: 'common',
                },
            ])

            const result = await checkAndAwardAchievements(
                'user123',
                'tetris',
                50
            ) // Below threshold

            expect(mockAwardAchievement).not.toHaveBeenCalled()
            expect(result).toEqual([])
        })

        it('should award multiple achievements in one score', async () => {
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_novice',
                    name: 'Tetris Novice',
                    description: 'Score 100 points in Tetris',
                    logo: '🔰',
                    gameId: 'tetris',
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: 'common',
                },
                {
                    id: 'tetris_master',
                    name: 'Tetris Master',
                    description: 'Score 1000 points in Tetris',
                    logo: '👑',
                    gameId: 'tetris',
                    condition: { type: 'score_threshold', threshold: 1000 },
                    rarity: 'epic',
                },
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(true)

            const result = await checkAndAwardAchievements(
                'user123',
                'tetris',
                1200
            )

            expect(mockAwardAchievement).toHaveBeenCalledTimes(2)
            expect(result).toEqual(['tetris_novice', 'tetris_master'])
        })
    })

    describe('awardGlobalAchievement', () => {
        it('should award global achievement', async () => {
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(true)

            const result = await awardGlobalAchievement(
                'user123',
                'space_explorer'
            )

            expect(mockHasUserEarnedAchievement).toHaveBeenCalledWith(
                'user123',
                'space_explorer'
            )
            expect(mockAwardAchievement).toHaveBeenCalledWith(
                'user123',
                'space_explorer'
            )
            expect(result).toBe(true)
        })

        it('should return true if achievement already earned', async () => {
            mockHasUserEarnedAchievement.mockResolvedValue(true) // Already earned

            const result = await awardGlobalAchievement(
                'user123',
                'space_explorer'
            )

            expect(mockAwardAchievement).not.toHaveBeenCalled()
            expect(result).toBe(true)
        })

        it('should return false for non-existent achievement', async () => {
            const result = await awardGlobalAchievement(
                'user123',
                'non_existent'
            )

            expect(result).toBe(false)
        })
    })

    describe('getUserGameAchievementProgress', () => {
        it('should calculate progress correctly', async () => {
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_novice',
                    name: 'Tetris Novice',
                    description: 'Score 100 points in Tetris',
                    logo: '🔰',
                    gameId: 'tetris',
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: 'common',
                },
            ])
            mockGetUserBestScoreForGame.mockResolvedValue(50) // 50% progress
            mockHasUserEarnedAchievement.mockResolvedValue(false)

            const result = await getUserGameAchievementProgress(
                'user123',
                'tetris'
            )

            expect(result).toHaveLength(1)
            expect(result[0].progress).toBe(50)
            expect(result[0].earned).toBe(false)
        })

        it('should cap progress at 100%', async () => {
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_novice',
                    name: 'Tetris Novice',
                    description: 'Score 100 points in Tetris',
                    logo: '🔰',
                    gameId: 'tetris',
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: 'common',
                },
            ])
            mockGetUserBestScoreForGame.mockResolvedValue(200) // 200% but should cap at 100%
            mockHasUserEarnedAchievement.mockResolvedValue(true)

            const result = await getUserGameAchievementProgress(
                'user123',
                'tetris'
            )

            expect(result[0].progress).toBe(100)
            expect(result[0].earned).toBe(true)
        })
    })

    describe('getAchievementNotifications', () => {
        it('should return notification data for valid achievement IDs', () => {
            const result = getAchievementNotifications([
                'space_explorer',
                'tetris_novice',
            ])

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                id: 'space_explorer',
                name: 'Space Explorer',
                description: 'Welcome to the Cetus universe!',
                logo: '🚀',
                rarity: 'common',
            })
            expect(result[1]).toEqual({
                id: 'tetris_novice',
                name: 'Tetris Novice',
                description: 'Score 100 points in Tetris',
                logo: '🔰',
                rarity: 'common',
            })
        })

        it('should filter out invalid achievement IDs', () => {
            const result = getAchievementNotifications([
                'space_explorer',
                'invalid_id',
            ])

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe('space_explorer')
        })

        it('should return empty array for no achievements', () => {
            const result = getAchievementNotifications([])
            expect(result).toEqual([])
        })
    })

    describe('checkSpaceExplorerAchievement', () => {
        it('should award space explorer achievement', async () => {
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(true)

            const result = await checkSpaceExplorerAchievement('user123')

            expect(result).toBe(true)
        })
    })
})
