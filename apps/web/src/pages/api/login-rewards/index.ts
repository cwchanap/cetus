import type { APIRoute } from 'astro'
import { getLoginRewardStatusForUser } from '@/lib/services/loginRewardService'
import {
    jsonResponse,
    unauthorizedResponse,
    errorResponse,
} from '@/lib/server/api-utils'

/**
 * GET /api/login-rewards
 * Get current login reward status for authenticated user
 */
export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user
    if (!user) {
        return unauthorizedResponse()
    }

    try {
        const status = await getLoginRewardStatusForUser(user.id)

        return jsonResponse(status)
    } catch (error) {
        console.error('[GET /api/login-rewards] Error:', error)
        return errorResponse('Internal server error')
    }
}
