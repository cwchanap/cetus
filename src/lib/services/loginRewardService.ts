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

    // Default values for new users
    const loginStreak = rewardStatus?.login_streak ?? 0
    const lastClaimDate = rewardStatus?.last_login_reward_date ?? null
    const totalCycles = rewardStatus?.total_login_cycles ?? 0

    // Calculate current state
    const alreadyClaimed = lastClaimDate === today
    const canClaim = !alreadyClaimed

    // Current day in cycle (for display: 1-7)
    // If already claimed today, show current day; otherwise show next day to claim
    let currentCycleDay: number
    if (alreadyClaimed) {
        // Handle potential data inconsistency: already claimed but streak is 0
        if (loginStreak === 0) {
            console.warn(
                `Data inconsistency for user ${userId}: alreadyClaimed=true but loginStreak=0. Assuming prior day streak of 6.`
            )
        }
        // Safely compute prior day streak, defaulting to 6 (day 7) if streak is 0
        const priorDayStreak = loginStreak > 0 ? loginStreak - 1 : 6
        currentCycleDay = getCycleDayFromStreak(priorDayStreak)
    } else {
        currentCycleDay = getCycleDayFromStreak(loginStreak)
    }

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

    // Calculate yesterday's date (UTC) for consecutive check
    // Parse today as UTC to avoid local time issues
    const todayUTCDate = new Date(`${today}T00:00:00.000Z`)
    const yesterdayUTCDate = new Date(
        todayUTCDate.getTime() - 24 * 60 * 60 * 1000
    )
    const yesterdayUTC = yesterdayUTCDate.toISOString().split('T')[0]

    const currentStreak = currentStatus?.login_streak ?? 0
    const lastClaimDate = currentStatus?.last_login_reward_date ?? null

    // Reset streak if last claim was not yesterday (consecutive days only)
    let newStreak: number
    if (lastClaimDate === yesterdayUTC) {
        // Consecutive day - increment streak
        newStreak = currentStreak + 1
    } else {
        // Missed days - reset to day 1
        newStreak = 1
    }

    const totalCycles = currentStatus?.total_login_cycles ?? 0

    // Get reward for this day (use newStreak after reset)
    const cycleDay = getCycleDayFromStreak(newStreak)
    const reward = getRewardForDay(cycleDay)

    // Check if this completes a 7-day cycle (use newStreak after reset)
    const cycleCompleted = isCycleComplete(newStreak)

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
            // Award the milestone badge with error handling
            try {
                await awardAchievement(userId, milestone.achievementId)
                milestoneBadge = milestone
            } catch (error) {
                console.error('Failed to award login streak milestone:', {
                    userId,
                    achievementId: milestone.achievementId,
                    error,
                })
                // Don't set milestoneBadge on failure - user can retry
            }
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
