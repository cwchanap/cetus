import type { APIRoute } from 'astro'
import { saveGameScoreWithAchievements } from '@/lib/server/db/queries'
import { getGameById, GameID } from '@/lib/games'
import { auth } from '@/lib/auth'
import { getAchievementNotifications } from '@/lib/services/achievementService'
import { updateChallengeProgress } from '@/lib/services/challengeService'
import {
    jsonResponse,
    errorResponse,
    codedErrorResponse,
    unauthorizedResponse,
    badRequestResponse,
} from '@/lib/server/api-utils'
import type { PersistedScoreContext } from '@/lib/server/db/game-score-context'
import { scoreSubmissionSchema, validateBody } from '@/lib/server/validations'

const isGameId = (id: string): id is GameID =>
    Object.values(GameID).includes(id as GameID)

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

        const { gameId, score, gameData, context } = validation.data
        if (!isGameId(gameId)) {
            return badRequestResponse('Invalid game ID')
        }
        const validatedGameId = gameId

        // Verify game exists
        const game = getGameById(validatedGameId)
        if (!game) {
            return badRequestResponse('Invalid game ID')
        }

        const persistedContext: PersistedScoreContext | undefined = context
            ? {
                  mode: context.mode,
                  competitionKey: context.competitionKey ?? null,
                  rulesetVersion: context.rulesetVersion,
                  gameDataJson:
                      gameData === undefined ? null : JSON.stringify(gameData),
              }
            : undefined

        const result = await saveGameScoreWithAchievements(
            session.user.id,
            validatedGameId,
            score,
            gameData,
            persistedContext
        )

        if (!result.success) {
            if (result.code === 'SCORE_CONTEXT_UNAVAILABLE') {
                return codedErrorResponse(
                    'Score context is unavailable',
                    'SCORE_CONTEXT_UNAVAILABLE'
                )
            }
            return errorResponse('Failed to save score')
        }

        // Convert achievement IDs to full achievement data
        const achievementNotifications = getAchievementNotifications(
            result.newAchievements
        )

        // Update challenge progress (best-effort)
        let challengeResult: {
            completedChallenges: {
                id: string
                name: string
                description: string
                icon: string
                xpReward: number
            }[]
            xpEarned: number
            levelUp: boolean
            newLevel?: number
        } = { completedChallenges: [], xpEarned: 0, levelUp: false }

        try {
            challengeResult = await updateChallengeProgress(
                session.user.id,
                validatedGameId,
                score
            )
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[scores API] Challenge update failed:', error)
        }

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
