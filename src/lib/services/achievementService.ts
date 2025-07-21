import {
    ACHIEVEMENTS,
    getAchievementsByGame,
    type Achievement,
} from '../achievements'
import {
    awardAchievement,
    hasUserEarnedAchievement,
    getUserBestScoreForGame,
} from '../server/db/queries'
import type { GameType } from '../server/db/types'

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

/**
 * Check and award in-game achievements for Tetris
 */
export async function checkTetrisInGameAchievements(
    userId: string,
    gameEvent: {
        type: 'lines_cleared'
        linesCleared: number
        consecutiveLineClears: number
    }
): Promise<string[]> {
    const newlyEarnedAchievements: string[] = []

    try {
        // Check for double clear (2 lines in single strike)
        if (
            gameEvent.type === 'lines_cleared' &&
            gameEvent.linesCleared === 2
        ) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'tetris_double_clear'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'tetris_double_clear'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('tetris_double_clear')
                }
            }
        }

        // Check for quadruple clear (4 lines in single strike)
        if (
            gameEvent.type === 'lines_cleared' &&
            gameEvent.linesCleared === 4
        ) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'tetris_quadruple_clear'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'tetris_quadruple_clear'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('tetris_quadruple_clear')
                }
            }
        }

        // Check for consecutive line clears (2 times in a row)
        if (
            gameEvent.type === 'lines_cleared' &&
            gameEvent.consecutiveLineClears >= 2
        ) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'tetris_double_streak'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'tetris_double_streak'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('tetris_double_streak')
                }
            }
        }

        // Check for consecutive line clears (4 times in a row)
        if (
            gameEvent.type === 'lines_cleared' &&
            gameEvent.consecutiveLineClears >= 4
        ) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'tetris_combo_streak'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'tetris_combo_streak'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('tetris_combo_streak')
                }
            }
        }

        return newlyEarnedAchievements
    } catch (error) {
        return []
    }
}

/**
 * Check and award in-game achievements for Reflex
 */
export async function checkReflexInGameAchievements(
    userId: string,
    gameStats: {
        finalScore: number
        coinsCollected: number
        bombsHit: number
        gameHistory: Array<{
            objectId: string
            type: 'coin' | 'bomb'
            clicked: boolean
            timeToClick?: number
            pointsAwarded: number
        }>
    }
): Promise<string[]> {
    const newlyEarnedAchievements: string[] = []

    try {
        // Check for 10 coins in a row
        const coinStreak = checkConsecutiveObjectType(
            gameStats.gameHistory,
            'coin',
            10
        )
        if (coinStreak) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'reflex_coin_streak'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'reflex_coin_streak'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('reflex_coin_streak')
                }
            }
        }

        // Check for 10 bombs in a row
        const bombStreak = checkConsecutiveObjectType(
            gameStats.gameHistory,
            'bomb',
            10
        )
        if (bombStreak) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'reflex_bomb_streak'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'reflex_bomb_streak'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('reflex_bomb_streak')
                }
            }
        }

        // Check for perfect run (score > 500 with 0 bombs hit)
        if (gameStats.finalScore > 500 && gameStats.bombsHit === 0) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'reflex_perfect_run'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'reflex_perfect_run'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('reflex_perfect_run')
                }
            }
        }

        // Check for balanced collection (same number of coins and bombs)
        if (
            gameStats.coinsCollected === gameStats.bombsHit &&
            gameStats.coinsCollected > 0
        ) {
            const alreadyEarned = await hasUserEarnedAchievement(
                userId,
                'reflex_balanced_collector'
            )
            if (!alreadyEarned) {
                const awarded = await awardAchievement(
                    userId,
                    'reflex_balanced_collector'
                )
                if (awarded) {
                    newlyEarnedAchievements.push('reflex_balanced_collector')
                }
            }
        }

        return newlyEarnedAchievements
    } catch (error) {
        return []
    }
}

/**
 * Helper function to check for consecutive object types in game history
 */
function checkConsecutiveObjectType(
    gameHistory: Array<{
        objectId: string
        type: 'coin' | 'bomb'
        clicked: boolean
        timeToClick?: number
        pointsAwarded: number
    }>,
    targetType: 'coin' | 'bomb',
    requiredCount: number
): boolean {
    let consecutiveCount = 0
    let maxConsecutiveCount = 0

    // Only consider clicked objects for streaks
    const clickedObjects = gameHistory.filter(entry => entry.clicked)

    for (const entry of clickedObjects) {
        if (entry.type === targetType) {
            consecutiveCount++
            maxConsecutiveCount = Math.max(
                maxConsecutiveCount,
                consecutiveCount
            )
        } else {
            consecutiveCount = 0
        }
    }

    return maxConsecutiveCount >= requiredCount
}

/**
 * Generic function to check in-game achievements for any game
 */
export async function checkInGameAchievements(
    userId: string,
    gameId: GameType,
    gameEvent: any
): Promise<string[]> {
    switch (gameId) {
        case 'tetris':
            return await checkTetrisInGameAchievements(userId, gameEvent)
        case 'reflex':
            return await checkReflexInGameAchievements(userId, gameEvent)
        default:
            return []
    }
}
