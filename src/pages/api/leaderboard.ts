import type { APIRoute } from 'astro'
import { getGameLeaderboard } from '@/lib/server/db/queries'
import { getAllGames } from '@/lib/games'
import {
    jsonResponse,
    badRequestResponse,
    errorResponse,
} from '@/lib/server/api-utils'

export const GET: APIRoute = async ({ url }) => {
    try {
        const gameId = url.searchParams.get('gameId')
        const limitParam = url.searchParams.get('limit')
        const limit = limitParam ? parseInt(limitParam, 10) : 10

        // Validate limit parameter
        if (isNaN(limit) || limit <= 0 || limit > 100) {
            return badRequestResponse('Invalid limit parameter')
        }

        // If no gameId provided, return leaderboards for all games
        if (!gameId) {
            const games = getAllGames()
            const leaderboards: Record<
                string,
                Array<{
                    rank: number
                    name: string
                    score: number
                    created_at: string
                }>
            > = {}

            const results = await Promise.all(
                games.map(game => getGameLeaderboard(game.id, limit))
            )
            games.forEach((game, i) => {
                leaderboards[game.id] = results[i].map((entry, index) => ({
                    rank: index + 1,
                    ...entry,
                }))
            })

            return jsonResponse({ leaderboards })
        }

        // Verify game exists
        const games = getAllGames()
        const game = games.find(g => g.id === gameId)
        if (!game) {
            return badRequestResponse('Invalid game ID')
        }

        const leaderboard = await getGameLeaderboard(gameId, limit)
        const leaderboardWithRanks = leaderboard.map((entry, index) => ({
            rank: index + 1,
            ...entry,
        }))

        return jsonResponse({
            gameId,
            gameName: game.name,
            leaderboard: leaderboardWithRanks,
        })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
