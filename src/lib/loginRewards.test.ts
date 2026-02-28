import { describe, it, expect } from 'vitest'
import {
    LOGIN_REWARD_CYCLE,
    MILESTONE_BADGES,
    getRewardForDay,
    getCycleDayFromStreak,
    isCycleComplete,
    getMilestoneForDays,
    getNextMilestone,
    getTotalConsecutiveDays,
} from './loginRewards'

describe('Login Reward Definitions', () => {
    it('should have 7 days in the reward cycle', () => {
        expect(LOGIN_REWARD_CYCLE.length).toBe(7)
    })

    it('should have escalating XP rewards', () => {
        for (let i = 1; i < LOGIN_REWARD_CYCLE.length; i++) {
            expect(LOGIN_REWARD_CYCLE[i].xp).toBeGreaterThan(
                LOGIN_REWARD_CYCLE[i - 1].xp
            )
        }
    })

    it('should have correct XP values for each day', () => {
        expect(LOGIN_REWARD_CYCLE[0].xp).toBe(10) // Day 1
        expect(LOGIN_REWARD_CYCLE[1].xp).toBe(20) // Day 2
        expect(LOGIN_REWARD_CYCLE[2].xp).toBe(30) // Day 3
        expect(LOGIN_REWARD_CYCLE[3].xp).toBe(40) // Day 4
        expect(LOGIN_REWARD_CYCLE[4].xp).toBe(50) // Day 5
        expect(LOGIN_REWARD_CYCLE[5].xp).toBe(75) // Day 6
        expect(LOGIN_REWARD_CYCLE[6].xp).toBe(100) // Day 7
    })

    it('should total 325 XP per cycle', () => {
        const totalXP = LOGIN_REWARD_CYCLE.reduce(
            (sum, reward) => sum + reward.xp,
            0
        )
        expect(totalXP).toBe(325)
    })

    it('should have valid reward definitions', () => {
        LOGIN_REWARD_CYCLE.forEach((reward, index) => {
            expect(reward.day).toBe(index + 1)
            expect(reward.icon).toBeTruthy()
            expect(reward.description).toBeTruthy()
            expect(reward.xp).toBeGreaterThan(0)
        })
    })
})

describe('Milestone Badges', () => {
    it('should have 3 milestone badges', () => {
        expect(MILESTONE_BADGES.length).toBe(3)
    })

    it('should have milestones at days 7, 30, and 100', () => {
        const days = MILESTONE_BADGES.map(m => m.totalDays)
        expect(days).toContain(7)
        expect(days).toContain(30)
        expect(days).toContain(100)
    })

    it('should have valid milestone definitions', () => {
        MILESTONE_BADGES.forEach(milestone => {
            expect(milestone.achievementId).toBeTruthy()
            expect(milestone.name).toBeTruthy()
            expect(milestone.description).toBeTruthy()
            expect(milestone.icon).toBeTruthy()
            expect(milestone.totalDays).toBeGreaterThan(0)
        })
    })

    it('should have achievement IDs matching expected format', () => {
        expect(MILESTONE_BADGES[0].achievementId).toBe('login_streak_7')
        expect(MILESTONE_BADGES[1].achievementId).toBe('login_streak_30')
        expect(MILESTONE_BADGES[2].achievementId).toBe('login_streak_100')
    })
})

describe('getRewardForDay', () => {
    it('should return correct reward for each day', () => {
        expect(getRewardForDay(1).xp).toBe(10)
        expect(getRewardForDay(2).xp).toBe(20)
        expect(getRewardForDay(3).xp).toBe(30)
        expect(getRewardForDay(4).xp).toBe(40)
        expect(getRewardForDay(5).xp).toBe(50)
        expect(getRewardForDay(6).xp).toBe(75)
        expect(getRewardForDay(7).xp).toBe(100)
    })

    it('should clamp to valid day range', () => {
        // Day 0 or below should return Day 1
        expect(getRewardForDay(0).day).toBe(1)
        expect(getRewardForDay(-1).day).toBe(1)

        // Day 8 or above should return Day 7
        expect(getRewardForDay(8).day).toBe(7)
        expect(getRewardForDay(100).day).toBe(7)
    })

    it('should handle non-finite and NaN input gracefully', () => {
        expect(getRewardForDay(NaN).day).toBe(1)
        expect(getRewardForDay(Infinity).day).toBe(1)
        expect(getRewardForDay(-Infinity).day).toBe(1)
    })
})

describe('getCycleDayFromStreak', () => {
    it('should return day 1 for streak 0', () => {
        expect(getCycleDayFromStreak(0)).toBe(1)
    })

    it('should return correct day for streaks 0-6', () => {
        expect(getCycleDayFromStreak(0)).toBe(1)
        expect(getCycleDayFromStreak(1)).toBe(2)
        expect(getCycleDayFromStreak(2)).toBe(3)
        expect(getCycleDayFromStreak(3)).toBe(4)
        expect(getCycleDayFromStreak(4)).toBe(5)
        expect(getCycleDayFromStreak(5)).toBe(6)
        expect(getCycleDayFromStreak(6)).toBe(7)
    })

    it('should cycle back to day 1 after day 7', () => {
        expect(getCycleDayFromStreak(7)).toBe(1)
        expect(getCycleDayFromStreak(8)).toBe(2)
        expect(getCycleDayFromStreak(14)).toBe(1)
    })
})

describe('isCycleComplete', () => {
    it('should return true only for streak 6 (Day 7)', () => {
        expect(isCycleComplete(0)).toBe(false)
        expect(isCycleComplete(1)).toBe(false)
        expect(isCycleComplete(5)).toBe(false)
        expect(isCycleComplete(6)).toBe(true)
        expect(isCycleComplete(7)).toBe(false)
    })

    it('should return false for negative inputs', () => {
        expect(isCycleComplete(-1)).toBe(false)
        expect(isCycleComplete(-7)).toBe(false)
        expect(isCycleComplete(-14)).toBe(false)
    })
})

describe('getMilestoneForDays', () => {
    it('should return milestone at exactly day 7', () => {
        const milestone = getMilestoneForDays(7)
        expect(milestone).not.toBeNull()
        expect(milestone?.achievementId).toBe('login_streak_7')
    })

    it('should return milestone at exactly day 30', () => {
        const milestone = getMilestoneForDays(30)
        expect(milestone).not.toBeNull()
        expect(milestone?.achievementId).toBe('login_streak_30')
    })

    it('should return milestone at exactly day 100', () => {
        const milestone = getMilestoneForDays(100)
        expect(milestone).not.toBeNull()
        expect(milestone?.achievementId).toBe('login_streak_100')
    })

    it('should return null for non-milestone days', () => {
        expect(getMilestoneForDays(1)).toBeNull()
        expect(getMilestoneForDays(6)).toBeNull()
        expect(getMilestoneForDays(8)).toBeNull()
        expect(getMilestoneForDays(29)).toBeNull()
        expect(getMilestoneForDays(50)).toBeNull()
    })
})

describe('getNextMilestone', () => {
    it('should return day 7 milestone for new users', () => {
        const milestone = getNextMilestone(0)
        expect(milestone?.totalDays).toBe(7)
    })

    it('should return day 30 milestone after completing day 7', () => {
        const milestone = getNextMilestone(7)
        expect(milestone?.totalDays).toBe(30)
    })

    it('should return day 100 milestone after completing day 30', () => {
        const milestone = getNextMilestone(30)
        expect(milestone?.totalDays).toBe(100)
    })

    it('should return null after completing all milestones', () => {
        const milestone = getNextMilestone(100)
        expect(milestone).toBeNull()
    })

    it('should return correct next milestone for various days', () => {
        expect(getNextMilestone(3)?.totalDays).toBe(7)
        expect(getNextMilestone(6)?.totalDays).toBe(7)
        expect(getNextMilestone(15)?.totalDays).toBe(30)
        expect(getNextMilestone(50)?.totalDays).toBe(100)
    })
})

describe('getTotalConsecutiveDays', () => {
    it('should return streak for 0 completed cycles', () => {
        expect(getTotalConsecutiveDays(0, 0)).toBe(0)
        expect(getTotalConsecutiveDays(0, 3)).toBe(3)
        expect(getTotalConsecutiveDays(0, 6)).toBe(6)
    })

    it('should calculate correctly for completed cycles', () => {
        expect(getTotalConsecutiveDays(1, 0)).toBe(7) // 1 cycle = 7 days
        expect(getTotalConsecutiveDays(1, 3)).toBe(10) // 1 cycle + 3 days
        expect(getTotalConsecutiveDays(2, 0)).toBe(14) // 2 cycles = 14 days
        expect(getTotalConsecutiveDays(4, 2)).toBe(30) // 4 cycles + 2 = 30 days
    })

    it('should match milestone days correctly', () => {
        // Day 7 milestone: 1 cycle completed
        expect(getTotalConsecutiveDays(1, 0)).toBe(7)

        // Day 30 milestone: 4 cycles + 2 days
        expect(getTotalConsecutiveDays(4, 2)).toBe(30)

        // Day 100 milestone: 14 cycles + 2 days
        expect(getTotalConsecutiveDays(14, 2)).toBe(100)
    })
})
