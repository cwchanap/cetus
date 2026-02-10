import type { APIRoute } from 'astro'
import { getUserBestScore } from '@/lib/server/db/queries'
import { getGameById, GameID } from '@/lib/games'
import { auth } from '@/lib/auth'
import {
    jsonResponse,
    unauthorizedResponse,
    badRequestResponse,
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

        const bestScore = await getUserBestScore(session.user.id, gameId)

        return jsonResponse({ bestScore })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
