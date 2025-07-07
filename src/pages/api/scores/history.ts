import type { APIRoute } from 'astro'
import { getUserGameHistory } from '@/lib/db/queries'
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

        const limitParam = url.searchParams.get('limit')
        const limit = limitParam ? parseInt(limitParam, 10) : 10

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

        const history = await getUserGameHistory(session.user.id, limit)

        return new Response(JSON.stringify({ history }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        })
    } catch (error) {
        console.error('Error in GET /api/scores/history:', error)
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
