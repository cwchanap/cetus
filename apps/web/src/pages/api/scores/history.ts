import type { APIRoute } from 'astro'
import { getUserGameHistory } from '@/lib/server/db/queries'
import { auth } from '@/lib/auth'
import {
    jsonResponse,
    unauthorizedResponse,
    badRequestResponse,
    errorResponse,
} from '@/lib/server/api-utils'

export const GET: APIRoute = async ({ request, url }) => {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        })

        if (!session) {
            return unauthorizedResponse()
        }

        const limitParam = url.searchParams.get('limit')
        const limit = limitParam ? parseInt(limitParam, 10) : 10

        if (isNaN(limit) || limit <= 0 || limit > 100) {
            return badRequestResponse('Invalid limit parameter')
        }

        const history = await getUserGameHistory(session.user.id, limit)

        return jsonResponse({ history })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
