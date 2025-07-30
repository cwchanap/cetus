import type { APIRoute } from 'astro'
import { getGameLeaderboard } from '@/lib/server/db/queries'
import { getAllGames } from '@/lib/games'

export const GET: APIRoute = async ({ url }) => {
    try {
        const gameId = url.searchParams.get('gameId')
        const limitParam = url.searchParams.get('limit')
        const limit = limitParam ? parseInt(limitParam, 10) : 10

        // Validate limit parameter
        if (isNaN(limit) || limit <= 0 || limit > 100) {
            return new Response(
                JSON.stringify({ error: 'Invalid limit parameter' }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            )
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

            for (const game of games) {
                const leaderboard = await getGameLeaderboard(game.id, limit)
                leaderboards[game.id] = leaderboard.map((entry, index) => ({
                    rank: index + 1,
                    ...entry,
                }))
            }

            return new Response(JSON.stringify({ leaderboards }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }

        // Verify game exists
        const games = getAllGames()
        const game = games.find(g => g.id === gameId)
        if (!game) {
            return new Response(JSON.stringify({ error: 'Invalid game ID' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }

        const leaderboard = await getGameLeaderboard(gameId, limit)
        const leaderboardWithRanks = leaderboard.map((entry, index) => ({
            rank: index + 1,
            ...entry,
        }))

        return new Response(
            JSON.stringify({
                gameId,
                gameName: game.name,
                leaderboard: leaderboardWithRanks,
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
    } catch (_error) {
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
    }
}
