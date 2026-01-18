import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    getLoginRewardStatusForUser,
    claimDailyLoginReward,
} from './loginRewardService'
import {
    getLoginRewardStatus,
    claimLoginReward,
    getUserStats,
} from '../server/db/queries'
import type { UserStats } from '../server/db/types'
import { getTodayUTC } from '../challenges'

// Mock the date utility
vi.mock('../challenges', () => ({
    getTodayUTC: vi.fn(),
}))

// Mock the database queries
vi.mock('../server/db/queries', () => ({
    getLoginRewardStatus: vi.fn(),
    claimLoginReward: vi.fn(),
    getUserStats: vi.fn(),
}))

// Helper function to create mock UserStats
function createMockUserStats(overrides: Partial<UserStats> = {}): UserStats {
    return {
        id: 1,
        user_id: 'test-user-123',
        level: 1,
        xp: 0,
        total_games_played: 0,
        total_score: 0,
        favorite_game: null,
        streak_days: 0,
        challenge_streak: 0,
        last_challenge_date: null,
        login_streak: 0,
        last_login_reward_date: null,
        total_login_cycles: 0,
        email_notifications: 1,
        push_notifications: 0,
        challenge_reminders: 1,
        created_at: new Date(),
        updated_at: new Date(),
        ...overrides,
    }
}

describe('getLoginRewardStatusForUser - Streak Reset Logic', () => {
    const userId = 'test-user-123'
    const today = '2024-01-03' // Wednesday
    const yesterday = '2024-01-02' // Tuesday
    const twoDaysAgo = '2024-01-01' // Monday

    beforeEach(() => {
        vi.clearAllMocks()
        // Mock date utilities
        vi.mocked(getTodayUTC).mockReturnValue(today)
    })

    describe('when user has consecutive days (no reset)', () => {
        it('should return correct status for consecutive daily claims', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 1, // Streak of 1 means next claim is day 2
                last_login_reward_date: yesterday,
                total_login_cycles: 0,
            })

            const status = await getLoginRewardStatusForUser(userId)

            // Streak should be valid (consecutive from yesterday)
            expect(status.loginStreak).toBe(1)
            // Next to claim should be day 2 (streak 1 + 1 = day 2)
            expect(status.currentCycleDay).toBe(2)
            expect(status.alreadyClaimed).toBe(false)
            expect(status.canClaim).toBe(true)
        })

        it('should return correct status when claimed today', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 2,
                last_login_reward_date: today,
                total_login_cycles: 0,
            })

            const status = await getLoginRewardStatusForUser(userId)

            expect(status.loginStreak).toBe(2)
            // Already claimed today, show day 2 (streak 2 - 1 = day 2)
            expect(status.currentCycleDay).toBe(2)
            expect(status.alreadyClaimed).toBe(true)
            expect(status.canClaim).toBe(false)
        })
    })

    describe('when user missed consecutive days (streak reset)', () => {
        it('should reset streak display when last claim was 2+ days ago (stored streak=1)', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 1, // Stored streak from last claim
                last_login_reward_date: twoDaysAgo, // 2 days ago - missed yesterday
                total_login_cycles: 0,
            })

            const status = await getLoginRewardStatusForUser(userId)

            // Effective streak should be 0 (broken streak)
            expect(status.loginStreak).toBe(0)
            // Should show day 1 (streak 0 means start of cycle)
            expect(status.currentCycleDay).toBe(1)
            expect(status.alreadyClaimed).toBe(false)
            expect(status.canClaim).toBe(true)
        })

        it('should reset streak display when last claim was 2+ days ago (stored streak>1)', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 5, // Previously had a long streak
                last_login_reward_date: '2024-01-01', // 2 days ago
                total_login_cycles: 0,
            })

            const status = await getLoginRewardStatusForUser(userId)

            // Effective streak should be 0 (broken streak despite stored value of 5)
            expect(status.loginStreak).toBe(0)
            // Should show day 1 (streak reset)
            expect(status.currentCycleDay).toBe(1)
            expect(status.alreadyClaimed).toBe(false)
            expect(status.canClaim).toBe(true)
        })

        it('should reset streak for new user (no claims ever)', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue(null)

            const status = await getLoginRewardStatusForUser(userId)

            // New user has no streak
            expect(status.loginStreak).toBe(0)
            expect(status.currentCycleDay).toBe(1)
            expect(status.alreadyClaimed).toBe(false)
            expect(status.canClaim).toBe(true)
        })
    })

    describe('UI/backend consistency', () => {
        it('should show day 1 in UI when backend will reset to day 1 on claim', async () => {
            // Simulate: User claimed on day 2 (streak 2), then missed 2 days
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 2, // Last claim was day 2 (streak 2)
                last_login_reward_date: twoDaysAgo, // 2 days ago
                total_login_cycles: 0,
            })

            const status = await getLoginRewardStatusForUser(userId)

            // UI should show day 1 (matching what backend will give)
            expect(status.loginStreak).toBe(0)
            expect(status.currentCycleDay).toBe(1)
            expect(status.todayReward.day).toBe(1)
            expect(status.todayReward.xp).toBe(10)
        })

        it('should show correct consecutive day in UI when streak is intact', async () => {
            // Simulate: User claimed yesterday, streak is intact
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 3, // Last claim was day 3 (streak 3)
                last_login_reward_date: yesterday, // Yesterday - consecutive
                total_login_cycles: 0,
            })

            const status = await getLoginRewardStatusForUser(userId)

            // UI should show day 4 (matching what backend will give)
            expect(status.loginStreak).toBe(3)
            expect(status.currentCycleDay).toBe(4)
            expect(status.todayReward.day).toBe(4)
            expect(status.todayReward.xp).toBe(40)
        })

        it('should handle cycle wrap-around correctly with broken streak', async () => {
            // Simulate: User completed 1 cycle (7 days), claimed day 7, then missed days
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 0, // After completing cycle, streak reset to 0
                last_login_reward_date: twoDaysAgo, // 2 days ago
                total_login_cycles: 1, // Completed 1 full cycle
            })

            const status = await getLoginRewardStatusForUser(userId)

            // UI should show day 1 (new cycle, streak broken)
            expect(status.loginStreak).toBe(0)
            expect(status.currentCycleDay).toBe(1)
            // When streak is broken, totalCycles should also be 0 to match claim behavior
            expect(status.totalCycles).toBe(0)
            expect(status.totalConsecutiveDays).toBe(0) // Streak broken, starting over
        })
    })

    describe('edge cases', () => {
        it('should handle day-7 cycle completion correctly (streak reset to 0)', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 0, // After completing day 7, streak resets to 0 for next cycle
                last_login_reward_date: today, // Claimed today
                total_login_cycles: 1, // Completed 1 full cycle
            })

            const status = await getLoginRewardStatusForUser(userId)

            // Should return 7 for UI to correctly show all 7 days as claimed
            expect(status.loginStreak).toBe(7)
            // Should show day 7 (the day just claimed)
            expect(status.currentCycleDay).toBe(7)
            expect(status.alreadyClaimed).toBe(true)
            expect(status.canClaim).toBe(false)
        })
    })
})

describe('claimDailyLoginReward - Streak Reset Logic', () => {
    const userId = 'test-user-123'
    const today = '2024-01-03'
    const yesterday = '2024-01-02'
    const twoDaysAgo = '2024-01-01'

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getTodayUTC).mockReturnValue(today)
    })

    describe('streak calculation on claim', () => {
        it('should increment streak when claiming consecutively', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 1, // Day 1 claimed (streak 1)
                last_login_reward_date: yesterday,
                total_login_cycles: 0,
            })
            vi.mocked(getUserStats).mockResolvedValue(
                createMockUserStats({
                    login_streak: 1,
                    last_login_reward_date: yesterday,
                })
            )
            vi.mocked(claimLoginReward).mockResolvedValue({
                success: true,
                newXP: 20,
                newLevel: 1,
            })

            const result = await claimDailyLoginReward(userId)

            expect(result.success).toBe(true)
            expect(result.xpEarned).toBe(20) // Day 2 reward (streak 1 claimed, claiming day 2)

            // Claim should have been made with streak 2
            expect(claimLoginReward).toHaveBeenCalledWith(
                userId,
                today,
                2, // Streak incremented to 2
                20, // Day 2 XP
                false, // cycleCompleted
                false // streakBroken (not broken)
            )
        })

        it('should reset streak when claiming after missing days', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 5, // Previously had streak
                last_login_reward_date: twoDaysAgo, // Missed yesterday
                total_login_cycles: 0,
            })
            vi.mocked(getUserStats).mockResolvedValue(
                createMockUserStats({
                    login_streak: 5,
                    last_login_reward_date: twoDaysAgo,
                })
            )
            vi.mocked(claimLoginReward).mockResolvedValue({
                success: true,
                newXP: 10,
                newLevel: 1,
            })

            const result = await claimDailyLoginReward(userId)

            expect(result.success).toBe(true)
            expect(result.xpEarned).toBe(10) // Day 1 reward (streak reset, starting over)

            // Claim should have been made with streak 1
            expect(claimLoginReward).toHaveBeenCalledWith(
                userId,
                today,
                1, // Streak reset to 1
                10, // Day 1 XP
                false, // cycleCompleted
                true // streakBroken (yes, streak was broken)
            )
        })

        it('should handle first-time claimer', async () => {
            vi.mocked(getLoginRewardStatus).mockResolvedValue(null)
            vi.mocked(getUserStats).mockResolvedValue(createMockUserStats())
            vi.mocked(claimLoginReward).mockResolvedValue({
                success: true,
                newXP: 10,
                newLevel: 1,
            })

            const result = await claimDailyLoginReward(userId)

            expect(result.success).toBe(true)
            expect(result.xpEarned).toBe(10) // Day 1 reward (first claim)

            // Claim should have been made with streak 1
            expect(claimLoginReward).toHaveBeenCalledWith(
                userId,
                today,
                1, // First claim, streak set to 1
                10, // Day 1 XP
                false, // cycleCompleted
                true // streakBroken (no previous claims)
            )
        })
    })

    describe('bug fix: total_login_cycles reset on streak break', () => {
        it('should reset total_login_cycles when streak is broken after completing a cycle', async () => {
            // Scenario: User completed 7-day cycle, missed a day, now claiming day 1 of new cycle
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 0, // Streak was reset to 0 after completing cycle
                last_login_reward_date: twoDaysAgo, // 2 days ago - streak broken
                total_login_cycles: 1, // Previously completed 1 cycle
            })
            vi.mocked(getUserStats).mockResolvedValue(
                createMockUserStats({
                    login_streak: 0,
                    last_login_reward_date: twoDaysAgo,
                    total_login_cycles: 1,
                })
            )
            vi.mocked(claimLoginReward).mockResolvedValue({
                success: true,
                newXP: 10,
                newLevel: 1,
            })

            const result = await claimDailyLoginReward(userId)

            expect(result.success).toBe(true)
            expect(result.xpEarned).toBe(10) // Day 1 reward

            // Claim should have been made with streak 1 and streakBroken=true
            expect(claimLoginReward).toHaveBeenCalledWith(
                userId,
                today,
                1, // Streak reset to 1
                10, // Day 1 XP
                false, // cycleCompleted
                true // streakBroken (yes, streak was broken)
            )
        })

        it('should NOT reset total_login_cycles when streak is NOT broken', async () => {
            // Scenario: User is in middle of cycle, claiming consecutively
            vi.mocked(getLoginRewardStatus).mockResolvedValue({
                login_streak: 3, // In middle of cycle
                last_login_reward_date: yesterday, // Yesterday - consecutive
                total_login_cycles: 1, // Previously completed 1 cycle
            })
            vi.mocked(getUserStats).mockResolvedValue(
                createMockUserStats({
                    login_streak: 3,
                    last_login_reward_date: yesterday,
                    total_login_cycles: 1,
                })
            )
            vi.mocked(claimLoginReward).mockResolvedValue({
                success: true,
                newXP: 40, // Day 4 XP
                newLevel: 1,
            })

            const result = await claimDailyLoginReward(userId)

            expect(result.success).toBe(true)
            expect(result.xpEarned).toBe(40)

            // Claim should have been made with streak 4 and streakBroken=false
            expect(claimLoginReward).toHaveBeenCalledWith(
                userId,
                today,
                4, // Streak incremented to 4
                40, // Day 4 XP
                false, // cycleCompleted
                false // streakBroken (no, streak is intact)
            )
        })
    })
})
