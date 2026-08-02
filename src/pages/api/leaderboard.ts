import type { APIRoute } from 'astro'
import {
    getGameLeaderboard,
    getScopedGameLeaderboard,
    toPublicScopedLeaderboardEntry,
} from '@/lib/server/db/queries'
import { getAllGames } from '@/lib/games'
import {
    jsonResponse,
    badRequestResponse,
    codedErrorResponse,
    errorResponse,
} from '@/lib/server/api-utils'
import { leaderboardQuerySchema, validateQuery } from '@/lib/server/validations'

export const GET: APIRoute = async ({ url }) => {
    try {
        const parsed = validateQuery(url, leaderboardQuerySchema)
        if (!parsed.success) {
            return badRequestResponse(parsed.error)
        }

        const { gameId, limit, mode, competitionKey } = parsed.data

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

        // Scoped branch: mode present → best-per-user via scoped query
        if (mode) {
            const scoped = await getScopedGameLeaderboard({
                gameId,
                mode,
                competitionKey,
                limit,
            })

            if (!scoped.success) {
                return codedErrorResponse(
                    'Scoped leaderboard is unavailable',
                    'SCOPED_LEADERBOARD_UNAVAILABLE'
                )
            }

            const leaderboard = scoped.rows.map((row, index) => ({
                rank: index + 1,
                ...toPublicScopedLeaderboardEntry(row),
            }))

            return jsonResponse({
                gameId,
                gameName: game.name,
                leaderboard,
            })
        }

        // Unscoped game-only branch
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
