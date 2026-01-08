import type { APIRoute } from 'astro'
import { getLoginRewardStatusForUser } from '@/lib/services/loginRewardService'

/**
 * GET /api/login-rewards
 * Get current login reward status for authenticated user
 */
export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const status = await getLoginRewardStatusForUser(user.id)

        return new Response(JSON.stringify(status), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[GET /api/login-rewards] Error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
