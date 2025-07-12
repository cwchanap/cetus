import {
    ACHIEVEMENTS,
    getAchievementsByGame,
    type Achievement,
} from './achievements'
import {
    awardAchievement,
    hasUserEarnedAchievement,
    getUserBestScoreForGame,
} from './db/queries'
import type { GameType } from './db/types'

/**
 * Check and award achievements for a user after a game score
 */
export async function checkAndAwardAchievements(
    userId: string,
    gameId: GameType,
    score: number
): Promise<string[]> {
    const newlyEarnedAchievements: string[] = []

    try {
        // Get all achievements for this game
        const gameAchievements = getAchievementsByGame(gameId)

        // Check score-based achievements
        for (const achievement of gameAchievements) {
            if (
                achievement.condition.type === 'score_threshold' &&
                achievement.condition.threshold
            ) {
                // Check if user's new score meets the threshold
                if (score >= achievement.condition.threshold) {
                    // Check if user already has this achievement
                    const alreadyEarned = await hasUserEarnedAchievement(
                        userId,
                        achievement.id
                    )

                    if (!alreadyEarned) {
                        const awarded = await awardAchievement(
                            userId,
                            achievement.id
                        )
                        if (awarded) {
                            newlyEarnedAchievements.push(achievement.id)
                        }
                    }
                }
            }
        }

        return newlyEarnedAchievements
    } catch (error) {
        console.error('Error checking achievements:', error)
        return []
    }
}

/**
 * Award global achievements (like first login)
 */
export async function awardGlobalAchievement(
    userId: string,
    achievementId: string
): Promise<boolean> {
    try {
        const achievement = ACHIEVEMENTS.find(
            a => a.id === achievementId && a.gameId === 'global'
        )
        if (!achievement) {
            console.error(`Global achievement ${achievementId} not found`)
            return false
        }

        const alreadyEarned = await hasUserEarnedAchievement(
            userId,
            achievementId
        )
        if (alreadyEarned) {
            return true // Already earned
        }

        return await awardAchievement(userId, achievementId)
    } catch (error) {
        console.error('Error awarding global achievement:', error)
        return false
    }
}

/**
 * Get user's achievement progress for a specific game
 */
export async function getUserGameAchievementProgress(
    userId: string,
    gameId: GameType
): Promise<
    Array<{
        achievement: Achievement
        earned: boolean
        progress: number
    }>
> {
    try {
        const gameAchievements = getAchievementsByGame(gameId)
        const userBestScore = await getUserBestScoreForGame(userId, gameId)

        const progress = []

        for (const achievement of gameAchievements) {
            const earned = await hasUserEarnedAchievement(
                userId,
                achievement.id
            )

            let progressPercentage = 0
            if (
                achievement.condition.type === 'score_threshold' &&
                achievement.condition.threshold
            ) {
                progressPercentage = Math.min(
                    (userBestScore / achievement.condition.threshold) * 100,
                    100
                )
            }

            progress.push({
                achievement,
                earned,
                progress: progressPercentage,
            })
        }

        return progress
    } catch (error) {
        console.error('Error getting user achievement progress:', error)
        return []
    }
}

/**
 * Get achievement notification data for newly earned achievements
 */
export function getAchievementNotifications(achievementIds: string[]): Array<{
    id: string
    name: string
    description: string
    logo: string
    rarity: string
}> {
    return achievementIds
        .map(id => ACHIEVEMENTS.find(a => a.id === id))
        .filter(Boolean)
        .map(achievement => ({
            id: achievement!.id,
            name: achievement!.name,
            description: achievement!.description,
            logo: achievement!.logo,
            rarity: achievement!.rarity,
        }))
}

/**
 * Check if user should earn the "Space Explorer" achievement (on registration)
 */
export async function checkSpaceExplorerAchievement(
    userId: string
): Promise<boolean> {
    return await awardGlobalAchievement(userId, 'space_explorer')
}
