/**
 * Login Rewards System
 * 7-day reward cycle with escalating XP bonuses and milestone badges
 */

export interface LoginRewardDefinition {
    day: number // 1-7 in cycle
    xp: number
    icon: string
    description: string
}

export interface MilestoneBadge {
    totalDays: number // Total consecutive days required
    achievementId: string
    name: string
    description: string
    icon: string
}

/**
 * 7-day reward cycle
 * Day 1: 10 XP → Day 7: 100 XP (total 325 XP per cycle)
 */
export const LOGIN_REWARD_CYCLE: LoginRewardDefinition[] = [
    { day: 1, xp: 10, icon: '🌟', description: 'Day 1 - Welcome back!' },
    { day: 2, xp: 20, icon: '⭐', description: 'Day 2 - Keeping momentum!' },
    { day: 3, xp: 30, icon: '✨', description: 'Day 3 - Half way there!' },
    { day: 4, xp: 40, icon: '💫', description: 'Day 4 - On a roll!' },
    { day: 5, xp: 50, icon: '🌠', description: 'Day 5 - Almost there!' },
    { day: 6, xp: 75, icon: '🔥', description: 'Day 6 - One more day!' },
    { day: 7, xp: 100, icon: '👑', description: 'Day 7 - Weekly Champion!' },
]

/**
 * Milestone badges awarded at specific streak lengths
 */
export const MILESTONE_BADGES: MilestoneBadge[] = [
    {
        totalDays: 7,
        achievementId: 'login_streak_7',
        name: 'Weekly Warrior',
        description: 'Complete a 7-day login streak',
        icon: '🏅',
    },
    {
        totalDays: 30,
        achievementId: 'login_streak_30',
        name: 'Monthly Master',
        description: 'Complete 30 days of consecutive logins',
        icon: '🎖️',
    },
    {
        totalDays: 100,
        achievementId: 'login_streak_100',
        name: 'Legendary Loyalist',
        description: 'Complete 100 days of consecutive logins',
        icon: '👑',
    },
]

/**
 * Get the reward for a specific day in the cycle (1-7)
 */
export function getRewardForDay(day: number): LoginRewardDefinition {
    const index = Math.max(0, Math.min(6, day - 1))
    return LOGIN_REWARD_CYCLE[index]
}

/**
 * Calculate which day in the 7-day cycle based on current streak
 * streak 0 = day 1, streak 1 = day 2, ..., streak 6 = day 7
 */
export function getCycleDayFromStreak(streak: number): number {
    return (streak % 7) + 1
}

/**
 * Check if completing this day completes a 7-day cycle
 */
export function isCycleComplete(currentStreak: number): boolean {
    return currentStreak === 6 // Day 7 is the 6th index (0-6)
}

/**
 * Get milestone badge that would be earned at a given total consecutive days
 * Returns null if no milestone is reached at exactly that day count
 */
export function getMilestoneForDays(totalDays: number): MilestoneBadge | null {
    return MILESTONE_BADGES.find(m => m.totalDays === totalDays) ?? null
}

/**
 * Get the next upcoming milestone for a user
 */
export function getNextMilestone(
    currentTotalDays: number
): MilestoneBadge | null {
    return MILESTONE_BADGES.find(m => m.totalDays > currentTotalDays) ?? null
}

/**
 * Calculate total consecutive days from cycles completed + current streak
 */
export function getTotalConsecutiveDays(
    totalCycles: number,
    currentStreak: number
): number {
    return totalCycles * 7 + currentStreak
}
