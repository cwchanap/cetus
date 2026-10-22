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
    { day: 3, xp: 30, icon: '✨', description: 'Day 3 - Building momentum!' },
    { day: 4, xp: 40, icon: '💫', description: 'Day 4 - Half way there!' },
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
 * Clamps out-of-range values to nearest valid day for resilience
 * Guards against non-finite/NaN input
 */
export function getRewardForDay(day: number): LoginRewardDefinition {
    // Guard against non-finite/NaN input
    if (!Number.isFinite(day) || Number.isNaN(day)) {
        day = 1
    }
    const clampedDay = Math.max(1, Math.min(day, LOGIN_REWARD_CYCLE.length))
    return LOGIN_REWARD_CYCLE[clampedDay - 1]
}

/**
 * Calculate which day in the 7-day cycle based on days completed
 * daysCompleted 0 = day 1, daysCompleted 1 = day 2, ..., daysCompleted 6 = day 7
 * Uses positive modulo to handle negative inputs correctly
 */
export function getCycleDayFromStreak(daysCompleted: number): number {
    // Normalize to positive modulo, then +1 for 1-7 range
    const normalized = ((daysCompleted % 7) + 7) % 7
    return normalized + 1
}

/**
 * Check if completing this day completes a 7-day cycle
 * Returns true for days 6, 13, 20, etc. (every 7th day)
 * Rejects negative inputs as they cannot complete a cycle
 */
export function isCycleComplete(daysCompleted: number): boolean {
    if (daysCompleted < 0) {
        return false
    } // Reject negative inputs
    return (daysCompleted + 1) % 7 === 0 // Every 7th day completes a cycle
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
 * Calculate total consecutive days from cycles completed + days completed in current cycle
 */
export function getTotalConsecutiveDays(
    totalCycles: number,
    daysCompleted: number
): number {
    return totalCycles * 7 + daysCompleted
}
