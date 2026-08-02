import type { APIRoute } from 'astro'
import { getUserBestScore } from '@/lib/server/db/queries'
import { getGameById, GameID } from '@/lib/games'
import { auth } from '@/lib/auth'
import {
    jsonResponse,
    unauthorizedResponse,
    badRequestResponse,
    codedErrorResponse,
    errorResponse,
} from '@/lib/server/api-utils'

const isGameId = (id: string): id is GameID =>
    Object.values(GameID).includes(id as GameID)

export const GET: APIRoute = async ({ request, url }) => {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        })

        if (!session) {
            return unauthorizedResponse()
        }

        const gameId = url.searchParams.get('gameId')

        if (!gameId) {
            return badRequestResponse('Missing gameId parameter')
        }

        if (!isGameId(gameId)) {
            return badRequestResponse('Invalid game ID')
        }

        // Verify game exists
        const game = getGameById(gameId)
        if (!game) {
            return badRequestResponse('Invalid game ID')
        }

        const result = await getUserBestScore(session.user.id, gameId)

        // A failed score-context probe is a retryable unavailable state,
        // distinct from the user simply having no scores (ok/null). Surface it
        // as a coded 503 instead of silently reporting null.
        if (result.status === 'unavailable') {
            return codedErrorResponse(
                'Score context is unavailable',
                'SCORE_CONTEXT_UNAVAILABLE',
                503
            )
        }

        return jsonResponse({ bestScore: result.bestScore })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
