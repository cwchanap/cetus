import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    checkAndAwardAchievements,
    awardGlobalAchievement,
    getUserGameAchievementProgress,
    getAchievementNotifications,
    checkSpaceExplorerAchievement,
    checkInGameAchievements,
} from './achievementService'
import { GameID } from '@/lib/games'

// Mock the database queries
vi.mock('../server/db/queries', () => ({
    awardAchievement: vi.fn(),
    hasUserEarnedAchievement: vi.fn(),
    getUserBestScore: vi.fn(),
}))

// Mock the achievements
vi.mock('../achievements', () => ({
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
    AchievementRarity: {
        COMMON: 'common',
        RARE: 'rare',
        EPIC: 'epic',
        LEGENDARY: 'legendary',
    },
}))

import {
    awardAchievement,
    hasUserEarnedAchievement,
    getUserBestScore,
} from '../server/db/queries'
import {
    getAchievementsByGame,
    AchievementRarity,
    type Achievement,
} from '../achievements'

const mockAwardAchievement = vi.mocked(awardAchievement)
const mockHasUserEarnedAchievement = vi.mocked(hasUserEarnedAchievement)
const mockGetUserBestScore = vi.mocked(getUserBestScore)
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
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: AchievementRarity.COMMON,
                },
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(true)

            const result = await checkAndAwardAchievements(
                'user123',
                GameID.TETRIS,
                150
            )

            expect(mockGetAchievementsByGame).toHaveBeenCalledWith(
                GameID.TETRIS
            )
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
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: AchievementRarity.COMMON,
                },
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(true) // Already earned

            const result = await checkAndAwardAchievements(
                'user123',
                GameID.TETRIS,
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
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: AchievementRarity.COMMON,
                },
            ])

            const result = await checkAndAwardAchievements(
                'user123',
                GameID.TETRIS,
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
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: AchievementRarity.COMMON,
                },
                {
                    id: 'tetris_master',
                    name: 'Tetris Master',
                    description: 'Score 1000 points in Tetris',
                    logo: '👑',
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold', threshold: 1000 },
                    rarity: AchievementRarity.EPIC,
                },
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(true)

            const result = await checkAndAwardAchievements(
                'user123',
                GameID.TETRIS,
                1200
            )

            expect(mockAwardAchievement).toHaveBeenCalledTimes(2)
            expect(result).toEqual(['tetris_novice', 'tetris_master'])
        })

        it('should return empty array when query throws', async () => {
            mockGetAchievementsByGame.mockImplementation(() => {
                throw new Error('db failure')
            })

            const result = await checkAndAwardAchievements(
                'user123',
                GameID.TETRIS,
                150
            )

            expect(result).toEqual([])
        })

        it('should skip achievement with missing score threshold', async () => {
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'broken_threshold',
                    name: 'Broken Threshold',
                    description: 'Invalid threshold config',
                    logo: '❌',
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold' },
                    rarity: AchievementRarity.COMMON,
                } satisfies Achievement,
            ])

            const result = await checkAndAwardAchievements(
                'user123',
                GameID.TETRIS,
                1000
            )

            expect(mockHasUserEarnedAchievement).not.toHaveBeenCalled()
            expect(mockAwardAchievement).not.toHaveBeenCalled()
            expect(result).toEqual([])
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

        it('should return false when database check throws', async () => {
            mockHasUserEarnedAchievement.mockRejectedValue(
                new Error('query error')
            )

            const result = await awardGlobalAchievement(
                'user123',
                'space_explorer'
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
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: AchievementRarity.COMMON,
                },
            ])
            mockGetUserBestScore.mockResolvedValue(50) // 50% progress
            mockHasUserEarnedAchievement.mockResolvedValue(false)

            const result = await getUserGameAchievementProgress(
                'user123',
                GameID.TETRIS
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
                    gameId: GameID.TETRIS,
                    condition: { type: 'score_threshold', threshold: 100 },
                    rarity: AchievementRarity.COMMON,
                },
            ])
            mockGetUserBestScore.mockResolvedValue(200) // 200% but should cap at 100%
            mockHasUserEarnedAchievement.mockResolvedValue(true)

            const result = await getUserGameAchievementProgress(
                'user123',
                GameID.TETRIS
            )

            expect(result[0].progress).toBe(100)
            expect(result[0].earned).toBe(true)
        })

        it('should keep progress 0 for non-score-based achievement conditions', async () => {
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'custom_condition',
                    name: 'Custom Condition',
                    description: 'Non-score based',
                    logo: '🧪',
                    gameId: GameID.TETRIS,
                    condition: { type: 'in_game', check: () => true },
                    rarity: AchievementRarity.RARE,
                } satisfies Achievement,
            ])
            mockGetUserBestScore.mockResolvedValue(999)
            mockHasUserEarnedAchievement.mockResolvedValue(false)

            const result = await getUserGameAchievementProgress(
                'user123',
                GameID.TETRIS
            )

            expect(result).toHaveLength(1)
            expect(result[0].progress).toBe(0)
            expect(result[0].earned).toBe(false)
        })

        it('should return empty array when progress fetch throws', async () => {
            mockGetAchievementsByGame.mockImplementation(() => {
                throw new Error('fetch error')
            })

            const result = await getUserGameAchievementProgress(
                'user123',
                GameID.TETRIS
            )

            expect(result).toEqual([])
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

    describe('checkInGameAchievements', () => {
        it('should award in-game achievement when check passes', async () => {
            const inGameCheck = vi.fn().mockReturnValue(true)
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_clean_stack',
                    name: 'Clean Stack',
                    description: 'Perform a special in-game condition',
                    logo: '✨',
                    gameId: GameID.TETRIS,
                    condition: { type: 'in_game', check: inGameCheck },
                    rarity: AchievementRarity.RARE,
                } satisfies Achievement,
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(true)

            const result = await checkInGameAchievements(
                'user123',
                GameID.TETRIS,
                { linesCleared: 4 },
                1200
            )

            expect(inGameCheck).toHaveBeenCalledWith({ linesCleared: 4 }, 1200)
            expect(mockAwardAchievement).toHaveBeenCalledWith(
                'user123',
                'tetris_clean_stack'
            )
            expect(result).toEqual(['tetris_clean_stack'])
        })

        it('should skip in-game achievement when check fails', async () => {
            const inGameCheck = vi.fn().mockReturnValue(false)
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_clean_stack',
                    name: 'Clean Stack',
                    description: 'Perform a special in-game condition',
                    logo: '✨',
                    gameId: GameID.TETRIS,
                    condition: { type: 'in_game', check: inGameCheck },
                    rarity: AchievementRarity.RARE,
                } satisfies Achievement,
            ])

            const result = await checkInGameAchievements(
                'user123',
                GameID.TETRIS,
                { linesCleared: 0 },
                10
            )

            expect(mockHasUserEarnedAchievement).not.toHaveBeenCalled()
            expect(mockAwardAchievement).not.toHaveBeenCalled()
            expect(result).toEqual([])
        })

        it('should skip award when already earned', async () => {
            const inGameCheck = vi.fn().mockReturnValue(true)
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_clean_stack',
                    name: 'Clean Stack',
                    description: 'Perform a special in-game condition',
                    logo: '✨',
                    gameId: GameID.TETRIS,
                    condition: { type: 'in_game', check: inGameCheck },
                    rarity: AchievementRarity.RARE,
                } satisfies Achievement,
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(true)

            const result = await checkInGameAchievements(
                'user123',
                GameID.TETRIS,
                { linesCleared: 4 },
                1000
            )

            expect(mockAwardAchievement).not.toHaveBeenCalled()
            expect(result).toEqual([])
        })

        it('should not append when award call returns false', async () => {
            const inGameCheck = vi.fn().mockReturnValue(true)
            mockGetAchievementsByGame.mockReturnValue([
                {
                    id: 'tetris_clean_stack',
                    name: 'Clean Stack',
                    description: 'Perform a special in-game condition',
                    logo: '✨',
                    gameId: GameID.TETRIS,
                    condition: { type: 'in_game', check: inGameCheck },
                    rarity: AchievementRarity.RARE,
                } satisfies Achievement,
            ])
            mockHasUserEarnedAchievement.mockResolvedValue(false)
            mockAwardAchievement.mockResolvedValue(false)

            const result = await checkInGameAchievements(
                'user123',
                GameID.TETRIS,
                { linesCleared: 4 },
                1000
            )

            expect(result).toEqual([])
        })
    })
})
