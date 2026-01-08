import type { APIRoute } from 'astro'
import { claimDailyLoginReward } from '@/lib/services/loginRewardService'

/**
 * POST /api/login-rewards/claim
 * Claim today's login reward
 */
export const POST: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const result = await claimDailyLoginReward(user.id)

        if (!result.success) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: result.error || 'Failed to claim reward',
                }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[POST /api/login-rewards/claim] Error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
}
