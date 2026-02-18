import type { APIRoute } from 'astro'
import { claimDailyLoginReward } from '@/lib/services/loginRewardService'
import {
    jsonResponse,
    unauthorizedResponse,
    errorResponse,
} from '@/lib/server/api-utils'

/**
 * POST /api/login-rewards/claim
 * Claim today's login reward
 */
export const POST: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        const result = await claimDailyLoginReward(user.id)

        if (!result.success) {
            return jsonResponse(
                {
                    success: false,
                    error: result.error || 'Failed to claim reward',
                },
                400
            )
        }

        return jsonResponse(result)
    } catch (error) {
        console.error('[POST /api/login-rewards/claim] Error:', error)
        return errorResponse('Internal server error')
    }
}
