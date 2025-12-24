import {
    generateDailyChallenges,
    getLevelFromXP,
    getTodayUTC,
    ChallengeType,
    type UserChallengeProgress,
} from '../challenges'
import type { GameType } from '../server/db/types'
import {
    getUserChallengeProgress,
    upsertChallengeProgress,
    updateChallengeProgressValue,
    completeChallengeAndAwardXP,
    getUserXPAndLevel,
    updateUserXP,
    getUniqueGamesPlayedToday,
    getTotalScoreToday,
    getGamesPlayedCountToday,
    updateChallengeStreak,
} from '../server/db/queries'

export interface ChallengeUpdateResult {
    completedChallenges: CompletedChallengeInfo[]
    xpEarned: number
    levelUp: boolean
    newLevel?: number
}

export interface CompletedChallengeInfo {
    id: string
    name: string
    description: string
    icon: string
    xpReward: number
}

/**
 * Get today's challenges with user progress
 */
export async function getUserDailyChallenges(
    userId: string
): Promise<UserChallengeProgress[]> {
    const today = getTodayUTC()
    const dailyChallenges = generateDailyChallenges(new Date())

    // Initialize progress records for any missing challenges
    for (const challenge of dailyChallenges) {
        await upsertChallengeProgress(
            userId,
            today,
            challenge.id,
            challenge.targetValue
        )
    }

    // Get current progress from database
    const progressRecords = await getUserChallengeProgress(userId, today)
    const progressMap = new Map(progressRecords.map(p => [p.challenge_id, p]))

    // Combine challenge definitions with progress
    return dailyChallenges.map(challenge => {
        const progress = progressMap.get(challenge.id)
        return {
            challengeId: challenge.id,
            name: challenge.name,
            description: challenge.description,
            icon: challenge.icon,
            type: challenge.type,
            gameId: challenge.gameId,
            targetValue: challenge.targetValue,
            currentValue: progress?.current_value ?? 0,
            xpReward: challenge.xpReward,
            difficulty: challenge.difficulty,
            completed:
                progress?.completed_at !== null &&
                progress?.completed_at !== undefined,
            completedAt: progress?.completed_at
                ? new Date(progress.completed_at)
                : null,
        }
    })
}

/**
 * Update challenge progress after a game score
 */
export async function updateChallengeProgress(
    userId: string,
    gameId: GameType,
    score: number
): Promise<ChallengeUpdateResult> {
    const today = getTodayUTC()
    const dailyChallenges = generateDailyChallenges(new Date())
    const completedChallenges: CompletedChallengeInfo[] = []
    let totalXPEarned = 0

    // Get current game stats for today
    const gamesPlayedToday = await getGamesPlayedCountToday(userId)
    const uniqueGamesToday = await getUniqueGamesPlayedToday(userId)
    const totalScoreToday = await getTotalScoreToday(userId)

    // Check each challenge
    for (const challenge of dailyChallenges) {
        // Ensure progress record exists
        await upsertChallengeProgress(
            userId,
            today,
            challenge.id,
            challenge.targetValue
        )

        // Get current progress
        const progressRecords = await getUserChallengeProgress(userId, today)
        const progress = progressRecords.find(
            p => p.challenge_id === challenge.id
        )

        // Skip if already completed
        if (progress?.completed_at) {
            continue
        }

        // Calculate new value based on challenge type
        let newValue = progress?.current_value ?? 0

        switch (challenge.type) {
            case ChallengeType.SCORE_TARGET:
                // Only update if this game matches and score beats current
                if (challenge.gameId === gameId && score > newValue) {
                    newValue = score
                }
                break

            case ChallengeType.PLAY_GAMES:
                newValue = gamesPlayedToday
                break

            case ChallengeType.VARIETY:
                newValue = uniqueGamesToday.length
                break

            case ChallengeType.TOTAL_SCORE:
                newValue = totalScoreToday
                break
        }

        // Update progress
        await updateChallengeProgressValue(
            userId,
            today,
            challenge.id,
            newValue
        )

        // Check if completed
        if (newValue >= challenge.targetValue && !progress?.completed_at) {
            await completeChallengeAndAwardXP(
                userId,
                today,
                challenge.id,
                challenge.xpReward
            )
            completedChallenges.push({
                id: challenge.id,
                name: challenge.name,
                description: challenge.description,
                icon: challenge.icon,
                xpReward: challenge.xpReward,
            })
            totalXPEarned += challenge.xpReward
        }
    }

    // Award XP and check for level up
    let levelUp = false
    let newLevel: number | undefined

    if (totalXPEarned > 0) {
        const { xp: currentXP, level: currentLevel } =
            await getUserXPAndLevel(userId)
        const updatedXP = currentXP + totalXPEarned
        const calculatedLevel = getLevelFromXP(updatedXP)

        if (calculatedLevel > currentLevel) {
            levelUp = true
            newLevel = calculatedLevel
        }

        await updateUserXP(userId, totalXPEarned, calculatedLevel)
    }

    // Check if all challenges completed for streak bonus
    await checkAndUpdateStreak(userId)

    return {
        completedChallenges,
        xpEarned: totalXPEarned,
        levelUp,
        newLevel,
    }
}

/**
 * Check if all daily challenges are completed and update streak
 */
async function checkAndUpdateStreak(userId: string): Promise<void> {
    const today = getTodayUTC()
    const progressRecords = await getUserChallengeProgress(userId, today)
    const dailyChallenges = generateDailyChallenges(new Date())

    // Check if all challenges are completed
    const allCompleted = dailyChallenges.every(challenge => {
        const progress = progressRecords.find(
            p => p.challenge_id === challenge.id
        )
        return (
            progress?.completed_at !== null &&
            progress?.completed_at !== undefined
        )
    })

    if (allCompleted) {
        const { lastChallengeDate } = await getUserXPAndLevel(userId)
        // Only update if this is the first time completing all today
        if (lastChallengeDate !== today) {
            await updateChallengeStreak(userId, true, today)
        }
    }
}

/**
 * Format challenge notifications for UI
 */
export function getChallengeNotifications(
    completedChallenges: CompletedChallengeInfo[]
): CompletedChallengeInfo[] {
    return completedChallenges
}
