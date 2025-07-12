import type { APIRoute } from 'astro'
import { getUserBestScoreByGame } from '@/lib/db/queries'
import { getGameById } from '@/lib/games'
import { auth } from '@/lib/auth'

export const GET: APIRoute = async ({ request, url }) => {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        })

        if (!session) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }

        const gameId = url.searchParams.get('gameId')

        if (!gameId) {
            return new Response(
                JSON.stringify({ error: 'Missing gameId parameter' }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            )
        }

        // Verify game exists
        const game = getGameById(gameId as any)
        if (!game) {
            return new Response(JSON.stringify({ error: 'Invalid game ID' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }

        const bestScore = await getUserBestScoreByGame(session.user.id, gameId)

        return new Response(JSON.stringify({ bestScore }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        })
    } catch (error) {
        console.error('Error in GET /api/scores/best:', error)
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
