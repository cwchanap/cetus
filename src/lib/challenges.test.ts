import { describe, it, expect } from 'vitest'
import {
    generateDailyChallenges,
    getLevelFromXP,
    getXPProgress,
    getChallengeById,
    CHALLENGE_POOL,
    LEVEL_THRESHOLDS,
    getTodayUTC,
    getSecondsUntilMidnightUTC,
} from './challenges'

describe('Challenge Definitions', () => {
    it('should have valid challenge pool', () => {
        expect(CHALLENGE_POOL.length).toBeGreaterThan(10)
        CHALLENGE_POOL.forEach(challenge => {
            expect(challenge.id).toBeTruthy()
            expect(challenge.name).toBeTruthy()
            expect(challenge.xpReward).toBeGreaterThan(0)
            expect(challenge.targetValue).toBeGreaterThan(0)
        })
    })

    it('should get challenge by ID', () => {
        const challenge = getChallengeById('play_2_games')
        expect(challenge).toBeDefined()
        expect(challenge?.name).toBe('Warm Up')
    })

    it('should return undefined for invalid challenge ID', () => {
        const challenge = getChallengeById('nonexistent_challenge')
        expect(challenge).toBeUndefined()
    })
})

describe('Daily Challenge Generation', () => {
    it('should generate 2-3 challenges', () => {
        const challenges = generateDailyChallenges(new Date('2025-01-15'))
        expect(challenges.length).toBeGreaterThanOrEqual(2)
        expect(challenges.length).toBeLessThanOrEqual(3)
    })

    it('should be deterministic for same date', () => {
        const date = new Date('2025-06-20')
        const challenges1 = generateDailyChallenges(date)
        const challenges2 = generateDailyChallenges(date)
        expect(challenges1.map(c => c.id)).toEqual(challenges2.map(c => c.id))
    })

    it('should generate different challenges for different dates', () => {
        const challenges1 = generateDailyChallenges(new Date('2025-01-01'))
        const challenges2 = generateDailyChallenges(new Date('2025-01-02'))
        // At least one should be different
        const ids1 = challenges1.map(c => c.id).sort()
        const ids2 = challenges2.map(c => c.id).sort()
        expect(ids1).not.toEqual(ids2)
    })

    it('should include at least one play_games type challenge', () => {
        const date = new Date('2025-03-15')
        const challenges = generateDailyChallenges(date)
        const hasPlayGames = challenges.some(c => c.type === 'play_games')
        expect(hasPlayGames).toBe(true)
    })
})

describe('Level System', () => {
    it('should calculate correct level from XP', () => {
        expect(getLevelFromXP(0)).toBe(1)
        expect(getLevelFromXP(50)).toBe(1)
        expect(getLevelFromXP(100)).toBe(2)
        expect(getLevelFromXP(250)).toBe(3)
        expect(getLevelFromXP(999)).toBe(4)
        expect(getLevelFromXP(1000)).toBe(5)
    })

    it('should handle high XP values', () => {
        expect(getLevelFromXP(16000)).toBe(10)
        expect(getLevelFromXP(100000)).toBe(10)
    })

    it('should calculate XP progress correctly', () => {
        const progress = getXPProgress(150)
        expect(progress.currentLevel).toBe(2)
        expect(progress.currentLevelXP).toBe(100)
        expect(progress.nextLevelXP).toBe(250)
        expect(progress.progress).toBeCloseTo(33.33, 1)
    })

    it('should have valid level thresholds', () => {
        expect(LEVEL_THRESHOLDS[0]).toBe(0)
        for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
            expect(LEVEL_THRESHOLDS[i]).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1])
        }
    })

    it('should cap progress at 100% for max level', () => {
        const progress = getXPProgress(50000)
        expect(progress.progress).toBeLessThanOrEqual(100)
    })
})

describe('Utility Functions', () => {
    it('should return today in YYYY-MM-DD format', () => {
        const today = getTodayUTC()
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should return positive seconds until midnight', () => {
        const seconds = getSecondsUntilMidnightUTC()
        expect(seconds).toBeGreaterThan(0)
        expect(seconds).toBeLessThanOrEqual(86400) // Max 24 hours
    })
})
