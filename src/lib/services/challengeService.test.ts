import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameID } from '../games'
import * as challenges from '../challenges'
import { getTodayUTC } from '../challenges'

// Mock challenges module
vi.mock('../challenges', async importOriginal => {
    const actual = await importOriginal<typeof import('../challenges')>()
    return {
        ...actual,
        generateDailyChallenges: vi.fn().mockReturnValue([
            {
                id: 'play_2_games',
                name: 'Warm Up',
                description: 'Play 2 games today',
                icon: '🎮',
                type: 'play_games',
                targetValue: 2,
                xpReward: 30,
                difficulty: 'easy',
            },
            {
                id: 'score_tetris_100',
                name: 'Tetris Starter',
                description: 'Score 100+ points in Tetris',
                icon: '🔲',
                type: 'score_target',
                gameId: 'tetris',
                targetValue: 100,
                xpReward: 30,
                difficulty: 'easy',
            },
        ]),
    }
})

// Mock database queries
vi.mock('../server/db/queries', () => ({
    getUserChallengeProgress: vi.fn().mockResolvedValue([]),
    upsertChallengeProgress: vi.fn().mockResolvedValue(true),
    updateChallengeProgressValue: vi.fn().mockResolvedValue(true),
    completeChallengeAndAwardXP: vi.fn().mockResolvedValue(true),
    getUserXPAndLevel: vi.fn().mockResolvedValue({
        xp: 0,
        level: 1,
        challengeStreak: 0,
        lastChallengeDate: null,
    }),
    updateUserLevel: vi.fn().mockResolvedValue(true),
    getUniqueGamesPlayedToday: vi.fn().mockResolvedValue([]),
    getTotalScoreToday: vi.fn().mockResolvedValue(0),
    getGamesPlayedCountToday: vi.fn().mockResolvedValue(0),
    atomicCheckAndUpdateStreak: vi.fn().mockResolvedValue(true),
}))

import {
    getUserDailyChallenges,
    updateChallengeProgress,
} from './challengeService'
import * as queries from '../server/db/queries'

describe('Challenge Service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Restore default mock implementations after clear
        vi.mocked(queries.getUserXPAndLevel).mockResolvedValue({
            xp: 0,
            level: 1,
            challengeStreak: 0,
            lastChallengeDate: null,
        })
        vi.mocked(queries.completeChallengeAndAwardXP).mockResolvedValue(true)
    })

    describe('getUserDailyChallenges', () => {
        it('should return challenges with progress', async () => {
            const challenges = await getUserDailyChallenges('user-123')
            expect(challenges.length).toBeGreaterThanOrEqual(2)
            expect(queries.upsertChallengeProgress).toHaveBeenCalled()
        })

        it('should have correct challenge structure', async () => {
            const challenges = await getUserDailyChallenges('user-123')
            const challenge = challenges[0]

            expect(challenge).toHaveProperty('challengeId')
            expect(challenge).toHaveProperty('name')
            expect(challenge).toHaveProperty('description')
            expect(challenge).toHaveProperty('icon')
            expect(challenge).toHaveProperty('type')
            expect(challenge).toHaveProperty('targetValue')
            expect(challenge).toHaveProperty('currentValue')
            expect(challenge).toHaveProperty('xpReward')
            expect(challenge).toHaveProperty('difficulty')
            expect(challenge).toHaveProperty('completed')
        })
    })

    describe('updateChallengeProgress', () => {
        it('should update progress for score-based challenges', async () => {
            const result = await updateChallengeProgress(
                'user-123',
                GameID.TETRIS,
                500
            )
            expect(result).toHaveProperty('completedChallenges')
            expect(result).toHaveProperty('xpEarned')
            expect(result).toHaveProperty('levelUp')
        })

        it('should return empty completedChallenges when no challenges completed', async () => {
            const result = await updateChallengeProgress(
                'user-123',
                GameID.TETRIS,
                10
            )
            expect(Array.isArray(result.completedChallenges)).toBe(true)
        })

        it('should update level without changing XP on level up', async () => {
            vi.mocked(challenges.generateDailyChallenges).mockReturnValue([
                {
                    id: 'score_tetris_100',
                    type: 'score_target',
                    gameId: GameID.TETRIS,
                    targetValue: 100,
                    xpReward: 30,
                },
            ] as any)

            vi.mocked(queries.getUserChallengeProgress).mockResolvedValue([])

            vi.mocked(queries.getTotalScoreToday).mockResolvedValue(100)
            vi.mocked(queries.getGamesPlayedCountToday).mockResolvedValue(1)
            vi.mocked(queries.getUniqueGamesPlayedToday).mockResolvedValue([
                GameID.TETRIS,
            ])

            // XP after awarding crosses level 1 -> 2 (threshold 100)
            vi.mocked(queries.getUserXPAndLevel).mockResolvedValue({
                xp: 100,
                level: 1,
                challengeStreak: 0,
                lastChallengeDate: null,
            })

            await updateChallengeProgress('user-123', GameID.TETRIS, 150)

            expect(queries.updateUserLevel).toHaveBeenCalledWith('user-123', 2)
        })

        it('should call necessary database functions', async () => {
            await updateChallengeProgress('user-123', GameID.TETRIS, 500)

            expect(queries.getGamesPlayedCountToday).toHaveBeenCalledWith(
                'user-123'
            )
            expect(queries.getUniqueGamesPlayedToday).toHaveBeenCalledWith(
                'user-123'
            )
            expect(queries.getTotalScoreToday).toHaveBeenCalledWith('user-123')
        })

        it('should not mark levelUp when updateUserLevel fails', async () => {
            vi.mocked(challenges.generateDailyChallenges).mockReturnValue([
                {
                    id: 'score_tetris_100',
                    name: 'Tetris Starter',
                    description: 'Score 100+ points in Tetris',
                    icon: '🔲',
                    type: 'score_target',
                    gameId: GameID.TETRIS,
                    targetValue: 100,
                    xpReward: 30,
                    difficulty: 'easy',
                },
            ] as any)

            vi.mocked(queries.getUserChallengeProgress).mockResolvedValue([])
            vi.mocked(queries.getTotalScoreToday).mockResolvedValue(120)
            vi.mocked(queries.getGamesPlayedCountToday).mockResolvedValue(1)
            vi.mocked(queries.getUniqueGamesPlayedToday).mockResolvedValue([
                GameID.TETRIS,
            ])
            vi.mocked(queries.getUserXPAndLevel).mockResolvedValue({
                xp: 100,
                level: 1,
                challengeStreak: 0,
                lastChallengeDate: null,
            })
            vi.mocked(queries.updateUserLevel).mockResolvedValue(false)

            const result = await updateChallengeProgress(
                'user-123',
                GameID.TETRIS,
                150
            )

            expect(queries.updateUserLevel).toHaveBeenCalledWith('user-123', 2)
            expect(result.levelUp).toBe(false)
            expect(result.newLevel).toBeUndefined()
        })

        it('should not update streak when not all challenges are completed', async () => {
            vi.mocked(challenges.generateDailyChallenges).mockReturnValue([
                {
                    id: 'play_2_games',
                    name: 'Warm Up',
                    description: 'Play 2 games today',
                    icon: '🎮',
                    type: 'play_games',
                    targetValue: 2,
                    xpReward: 30,
                    difficulty: 'easy',
                },
                {
                    id: 'score_tetris_100',
                    name: 'Tetris Starter',
                    description: 'Score 100+ points in Tetris',
                    icon: '🔲',
                    type: 'score_target',
                    gameId: GameID.TETRIS,
                    targetValue: 100,
                    xpReward: 30,
                    difficulty: 'easy',
                },
            ] as any)

            const today = getTodayUTC()
            vi.mocked(queries.getUserChallengeProgress).mockResolvedValue([
                {
                    id: 1,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'play_2_games',
                    current_value: 2,
                    target_value: 2,
                    completed_at: new Date(),
                    xp_awarded: 30,
                    created_at: new Date(),
                },
                {
                    id: 2,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'score_tetris_100',
                    current_value: 50,
                    target_value: 100,
                    completed_at: null,
                    xp_awarded: 0,
                    created_at: new Date(),
                },
            ])
            vi.mocked(queries.getTotalScoreToday).mockResolvedValue(50)
            vi.mocked(queries.getGamesPlayedCountToday).mockResolvedValue(2)
            vi.mocked(queries.getUniqueGamesPlayedToday).mockResolvedValue([
                GameID.TETRIS,
            ])

            await updateChallengeProgress('user-123', GameID.TETRIS, 50)

            expect(queries.atomicCheckAndUpdateStreak).not.toHaveBeenCalled()
        })

        it('should process variety and total-score challenge types', async () => {
            vi.mocked(challenges.generateDailyChallenges).mockReturnValue([
                {
                    id: 'variety_3_games',
                    name: 'Variety Pack',
                    description: 'Play 3 different game types',
                    icon: '🎲',
                    type: 'variety',
                    targetValue: 3,
                    xpReward: 50,
                    difficulty: 'medium',
                },
                {
                    id: 'total_score_500',
                    name: 'High Scorer',
                    description: 'Earn 500 total points today',
                    icon: '🏆',
                    type: 'total_score',
                    targetValue: 500,
                    xpReward: 50,
                    difficulty: 'medium',
                },
            ] as any)

            vi.mocked(queries.getUserChallengeProgress).mockResolvedValue([])
            vi.mocked(queries.getGamesPlayedCountToday).mockResolvedValue(5)
            vi.mocked(queries.getUniqueGamesPlayedToday).mockResolvedValue([
                GameID.TETRIS,
                GameID.SNAKE,
                GameID.BEJEWELED,
            ])
            vi.mocked(queries.getTotalScoreToday).mockResolvedValue(700)

            const result = await updateChallengeProgress(
                'user-123',
                GameID.TETRIS,
                10
            )

            expect(queries.updateChallengeProgressValue).toHaveBeenCalledWith(
                'user-123',
                expect.any(String),
                'variety_3_games',
                3
            )
            expect(queries.updateChallengeProgressValue).toHaveBeenCalledWith(
                'user-123',
                expect.any(String),
                'total_score_500',
                700
            )
            expect(result.completedChallenges.length).toBeGreaterThanOrEqual(2)
        })

        it('should reset streak to 1 if last completion was not yesterday', async () => {
            const today = getTodayUTC()
            const todayDate = new Date(`${today}T00:00:00Z`)
            const twoDaysAgo = new Date(
                todayDate.getTime() - 2 * 24 * 60 * 60 * 1000
            )
                .toISOString()
                .split('T')[0]

            const mockChallenges = [
                { id: 'play_2_games', type: 'play_games', targetValue: 2 },
                {
                    id: 'score_tetris_100',
                    type: 'score_target',
                    targetValue: 100,
                },
                {
                    id: 'total_score_200',
                    type: 'total_score',
                    targetValue: 200,
                },
            ]
            vi.mocked(challenges.generateDailyChallenges).mockReturnValue(
                mockChallenges as any
            )

            vi.mocked(queries.getUserChallengeProgress).mockResolvedValue([
                {
                    id: 1,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'play_2_games',
                    current_value: 2,
                    target_value: 2,
                    completed_at: new Date(),
                    xp_awarded: 30,
                    created_at: new Date(),
                },
                {
                    id: 2,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'score_tetris_100',
                    current_value: 100,
                    target_value: 100,
                    completed_at: new Date(),
                    xp_awarded: 30,
                    created_at: new Date(),
                },
                {
                    id: 3,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'total_score_200',
                    current_value: 200,
                    target_value: 200,
                    completed_at: new Date(),
                    xp_awarded: 30,
                    created_at: new Date(),
                },
            ])

            vi.mocked(queries.getUserXPAndLevel).mockResolvedValue({
                xp: 100,
                level: 2,
                challengeStreak: 5,
                lastChallengeDate: twoDaysAgo,
            })

            await updateChallengeProgress('user-123', GameID.TETRIS, 500)

            expect(queries.atomicCheckAndUpdateStreak).toHaveBeenCalledWith(
                'user-123',
                today,
                true
            )
        })

        it('should increment streak if last completion was yesterday', async () => {
            const today = getTodayUTC()
            const todayDate = new Date(`${today}T00:00:00Z`)
            const yesterday = new Date(
                todayDate.getTime() - 24 * 60 * 60 * 1000
            )
                .toISOString()
                .split('T')[0]

            const mockChallenges = [
                { id: 'play_2_games', type: 'play_games', targetValue: 2 },
                {
                    id: 'score_tetris_100',
                    type: 'score_target',
                    targetValue: 100,
                },
                {
                    id: 'total_score_200',
                    type: 'total_score',
                    targetValue: 200,
                },
            ]
            vi.mocked(challenges.generateDailyChallenges).mockReturnValue(
                mockChallenges as any
            )

            vi.mocked(queries.getUserChallengeProgress).mockResolvedValue([
                {
                    id: 1,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'play_2_games',
                    current_value: 2,
                    target_value: 2,
                    completed_at: new Date(),
                    xp_awarded: 30,
                    created_at: new Date(),
                },
                {
                    id: 2,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'score_tetris_100',
                    current_value: 100,
                    target_value: 100,
                    completed_at: new Date(),
                    xp_awarded: 30,
                    created_at: new Date(),
                },
                {
                    id: 3,
                    user_id: 'user-123',
                    challenge_date: today,
                    challenge_id: 'total_score_200',
                    current_value: 200,
                    target_value: 200,
                    completed_at: new Date(),
                    xp_awarded: 30,
                    created_at: new Date(),
                },
            ])

            vi.mocked(queries.getUserXPAndLevel).mockResolvedValue({
                xp: 100,
                level: 2,
                challengeStreak: 5,
                lastChallengeDate: yesterday,
            })

            await updateChallengeProgress('user-123', GameID.TETRIS, 500)

            expect(queries.atomicCheckAndUpdateStreak).toHaveBeenCalledWith(
                'user-123',
                today,
                true
            )
        })
    })
})
