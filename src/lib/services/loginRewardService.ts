/**
 * Login Reward Service
 * Handles daily login reward claiming and status retrieval
 */

import {
    getLoginRewardStatus,
    claimLoginReward,
    getUserStats,
    hasUserEarnedAchievement,
    awardAchievement,
} from '../server/db/queries'
import {
    getRewardForDay,
    getCycleDayFromStreak,
    isCycleComplete,
    getMilestoneForDays,
    getNextMilestone,
    getTotalConsecutiveDays,
    type LoginRewardDefinition,
    type MilestoneBadge,
} from '../loginRewards'
import { getTodayUTC } from '../challenges'

export interface LoginRewardStatusResult {
    /** Current position in 7-day cycle (0-6) */
    loginStreak: number
    /** Day number to display (1-7) */
    currentCycleDay: number
    /** Total completed 7-day cycles */
    totalCycles: number
    /** Total consecutive days (cycles * 7 + current streak) */
    totalConsecutiveDays: number
    /** Today's reward if claimable */
    todayReward: LoginRewardDefinition
    /** Whether reward has been claimed today */
    alreadyClaimed: boolean
    /** Whether user can claim today */
    canClaim: boolean
    /** Next milestone badge to earn */
    nextMilestone: MilestoneBadge | null
    /** Days until next milestone */
    daysUntilMilestone: number | null
}

export interface ClaimRewardResult {
    success: boolean
    error?: string
    /** XP earned from this claim */
    xpEarned?: number
    /** New total XP */
    newTotalXP?: number
    /** New level after claim */
    newLevel?: number
    /** Whether user leveled up */
    leveledUp?: boolean
    /** Previous level before claim */
    previousLevel?: number
    /** Milestone badge earned (if any) */
    milestoneBadge?: MilestoneBadge
    /** Updated status after claim */
    updatedStatus?: LoginRewardStatusResult
}

/**
 * Get current login reward status for a user
 */
export async function getLoginRewardStatusForUser(
    userId: string
): Promise<LoginRewardStatusResult> {
    const today = getTodayUTC()

    // Get login reward data
    const rewardStatus = await getLoginRewardStatus(userId)
    const userStats = await getUserStats(userId)

    // Default values for new users
    const loginStreak = rewardStatus?.login_streak ?? 0
    const lastClaimDate = rewardStatus?.last_login_reward_date ?? null
    const totalCycles = rewardStatus?.total_login_cycles ?? 0

    // Calculate current state
    const alreadyClaimed = lastClaimDate === today
    const canClaim = !alreadyClaimed

    // Current day in cycle (for display: 1-7)
    // If already claimed today, show current day; otherwise show next day to claim
    const currentCycleDay = alreadyClaimed
        ? getCycleDayFromStreak(loginStreak > 0 ? loginStreak - 1 : 6)
        : getCycleDayFromStreak(loginStreak)

    // Get today's reward (what they can claim or just claimed)
    const todayReward = getRewardForDay(currentCycleDay)

    // Calculate total consecutive days
    const totalConsecutiveDays = getTotalConsecutiveDays(
        totalCycles,
        loginStreak
    )

    // Get next milestone
    const nextMilestone = getNextMilestone(totalConsecutiveDays)
    const daysUntilMilestone = nextMilestone
        ? nextMilestone.totalDays - totalConsecutiveDays
        : null

    return {
        loginStreak,
        currentCycleDay,
        totalCycles,
        totalConsecutiveDays,
        todayReward,
        alreadyClaimed,
        canClaim,
        nextMilestone,
        daysUntilMilestone,
    }
}

/**
 * Claim today's login reward
 */
export async function claimDailyLoginReward(
    userId: string
): Promise<ClaimRewardResult> {
    const today = getTodayUTC()

    // Get current status
    const currentStatus = await getLoginRewardStatus(userId)
    const userStats = await getUserStats(userId)

    // Check if already claimed today
    if (currentStatus?.last_login_reward_date === today) {
        return {
            success: false,
            error: 'Reward already claimed today',
        }
    }

    // Calculate new streak (increment by 1, starting from 0)
    const currentStreak = currentStatus?.login_streak ?? 0
    const newStreak = currentStreak + 1
    const totalCycles = currentStatus?.total_login_cycles ?? 0

    // Get reward for this day
    const cycleDay = getCycleDayFromStreak(currentStreak)
    const reward = getRewardForDay(cycleDay)

    // Check if this completes a 7-day cycle
    const cycleCompleted = isCycleComplete(currentStreak)

    // Store previous level for level-up detection
    const previousLevel = userStats?.level ?? 1

    // Claim the reward (atomic database operation)
    const claimResult = await claimLoginReward(
        userId,
        today,
        newStreak,
        reward.xp,
        cycleCompleted
    )

    if (!claimResult.success) {
        return {
            success: false,
            error: 'Failed to claim reward',
        }
    }

    const newLevel = claimResult.newLevel ?? previousLevel
    const leveledUp = newLevel > previousLevel

    // Calculate total consecutive days after claim
    const newTotalCycles = cycleCompleted ? totalCycles + 1 : totalCycles
    const effectiveStreak = cycleCompleted ? 0 : newStreak
    const totalConsecutiveDays = getTotalConsecutiveDays(
        newTotalCycles,
        effectiveStreak
    )

    // Check for milestone badge
    let milestoneBadge: MilestoneBadge | undefined
    const milestone = getMilestoneForDays(totalConsecutiveDays)

    if (milestone) {
        // Check if user already has this badge
        const alreadyHas = await hasUserEarnedAchievement(
            userId,
            milestone.achievementId
        )

        if (!alreadyHas) {
            // Award the milestone badge
            await awardAchievement(userId, milestone.achievementId)
            milestoneBadge = milestone
        }
    }

    // Get updated status
    const updatedStatus = await getLoginRewardStatusForUser(userId)

    return {
        success: true,
        xpEarned: reward.xp,
        newTotalXP: claimResult.newXP,
        newLevel,
        leveledUp,
        previousLevel,
        milestoneBadge,
        updatedStatus,
    }
}
