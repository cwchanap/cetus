import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAndAwardAchievements } from './achievementService'
import { GameID } from '@cetus/shared/games'

// Mock the database queries so checkAndAwardAchievements can be exercised
// through the production evaluator without a live database. Only the score
// threshold branch of checkAndAwardAchievements touches these mocks; the
// achievement definitions in @cetus/shared/achievements remain real (unmocked).
vi.mock('../server/db/queries', () => ({
    awardAchievement: vi.fn(),
    hasUserEarnedAchievement: vi.fn(),
    getUserBestScore: vi.fn(),
}))

import {
    awardAchievement,
    hasUserEarnedAchievement,
} from '../server/db/queries'

const mockAwardAchievement = vi.mocked(awardAchievement)
const mockHasUserEarnedAchievement = vi.mocked(hasUserEarnedAchievement)

describe('checkAndAwardAchievements threshold evaluation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockHasUserEarnedAchievement.mockResolvedValue(false)
        mockAwardAchievement.mockResolvedValue(true)
    })

    it('mine_grid_welcome is not awarded below its threshold (score 0)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.MINE_GRID,
            0
        )
        expect(result).not.toContain('mine_grid_welcome')
        expect(mockAwardAchievement).not.toHaveBeenCalledWith(
            'user123',
            'mine_grid_welcome'
        )
    })

    it('mine_grid_welcome is awarded at its exact threshold (score 1)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.MINE_GRID,
            1
        )
        expect(result).toContain('mine_grid_welcome')
        expect(mockAwardAchievement).toHaveBeenCalledWith(
            'user123',
            'mine_grid_welcome'
        )
    })

    it('mine_grid_welcome is awarded above its threshold (score 2)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.MINE_GRID,
            2
        )
        expect(result).toContain('mine_grid_welcome')
    })

    it('mine_grid_demolition_expert is not awarded below its threshold (score 4999)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.MINE_GRID,
            4999
        )
        expect(result).not.toContain('mine_grid_demolition_expert')
        expect(mockAwardAchievement).not.toHaveBeenCalledWith(
            'user123',
            'mine_grid_demolition_expert'
        )
    })

    it('mine_grid_demolition_expert is awarded at its exact threshold (score 5000)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.MINE_GRID,
            5000
        )
        expect(result).toContain('mine_grid_demolition_expert')
        expect(mockAwardAchievement).toHaveBeenCalledWith(
            'user123',
            'mine_grid_demolition_expert'
        )
    })

    it('mine_grid_demolition_expert is awarded above its threshold (score 5001)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.MINE_GRID,
            5001
        )
        expect(result).toContain('mine_grid_demolition_expert')
    })

    it('potion_sorter_welcome is not awarded below its threshold (score 0)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.POTION_SORTER,
            0
        )
        expect(result).not.toContain('potion_sorter_welcome')
        expect(mockAwardAchievement).not.toHaveBeenCalledWith(
            'user123',
            'potion_sorter_welcome'
        )
    })

    it('potion_sorter_welcome is awarded at its exact threshold (score 1)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.POTION_SORTER,
            1
        )
        expect(result).toContain('potion_sorter_welcome')
        expect(mockAwardAchievement).toHaveBeenCalledWith(
            'user123',
            'potion_sorter_welcome'
        )
    })

    it('potion_sorter_perfect_mixture is not awarded below its threshold (score 5499)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.POTION_SORTER,
            5499
        )
        expect(result).not.toContain('potion_sorter_perfect_mixture')
        expect(mockAwardAchievement).not.toHaveBeenCalledWith(
            'user123',
            'potion_sorter_perfect_mixture'
        )
    })

    it('potion_sorter_perfect_mixture is awarded at its exact threshold (score 5500)', async () => {
        const result = await checkAndAwardAchievements(
            'user123',
            GameID.POTION_SORTER,
            5500
        )
        expect(result).toContain('potion_sorter_perfect_mixture')
        expect(mockAwardAchievement).toHaveBeenCalledWith(
            'user123',
            'potion_sorter_perfect_mixture'
        )
    })
})
