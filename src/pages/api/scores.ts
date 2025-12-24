import type { APIRoute } from 'astro'
import { saveGameScoreWithAchievements } from '@/lib/server/db/queries'
import { getGameById, GameID } from '@/lib/games'
import { auth } from '@/lib/auth'
import { getAchievementNotifications } from '@/lib/services/achievementService'
import { updateChallengeProgress } from '@/lib/services/challengeService'
import type { GameType } from '@/lib/server/db/types'
import {
    jsonResponse,
    errorResponse,
    unauthorizedResponse,
    badRequestResponse,
} from '@/lib/server/api-utils'
import { scoreSubmissionSchema, validateBody } from '@/lib/server/validations'

export const POST: APIRoute = async ({ request }) => {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        })

        if (!session) {
            return unauthorizedResponse()
        }

        // Validate request body with Zod
        const validation = await validateBody(request, scoreSubmissionSchema)
        if (!validation.success) {
            return badRequestResponse(validation.error)
        }

        const { gameId, score, gameData } = validation.data

        // Verify game exists
        const game = getGameById(gameId as GameID)
        if (!game) {
            return badRequestResponse('Invalid game ID')
        }

        const result = await saveGameScoreWithAchievements(
            session.user.id,
            gameId,
            score,
            gameData
        )

        if (!result.success) {
            return errorResponse('Failed to save score')
        }

        // Convert achievement IDs to full achievement data
        const achievementNotifications = getAchievementNotifications(
            result.newAchievements
        )

        // Update challenge progress
        const challengeResult = await updateChallengeProgress(
            session.user.id,
            gameId as GameType,
            score
        )

        return jsonResponse({
            success: true,
            newAchievements: achievementNotifications.map(achievement => ({
                id: achievement.id,
                name: achievement.name,
                description: achievement.description,
                icon: achievement.logo,
                rarity: achievement.rarity,
            })),
            challengeUpdates:
                challengeResult.completedChallenges.length > 0
                    ? {
                          completedChallenges:
                              challengeResult.completedChallenges,
                          xpEarned: challengeResult.xpEarned,
                          levelUp: challengeResult.levelUp,
                          newLevel: challengeResult.newLevel,
                      }
                    : undefined,
        })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
