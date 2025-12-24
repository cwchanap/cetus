import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameID } from '../games'

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
    updateUserXP: vi.fn().mockResolvedValue(true),
    getUniqueGamesPlayedToday: vi.fn().mockResolvedValue([]),
    getTotalScoreToday: vi.fn().mockResolvedValue(0),
    getGamesPlayedCountToday: vi.fn().mockResolvedValue(0),
    updateChallengeStreak: vi.fn().mockResolvedValue(1),
}))

import {
    getUserDailyChallenges,
    updateChallengeProgress,
} from './challengeService'
import * as queries from '../server/db/queries'

describe('Challenge Service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
    })
})
