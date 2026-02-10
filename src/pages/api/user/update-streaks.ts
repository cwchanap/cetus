import type { APIRoute } from 'astro'
import { updateAllUserStreaksForUTC } from '@/lib/server/db/queries'
import {
    jsonResponse,
    unauthorizedResponse,
    errorResponse,
} from '@/lib/server/api-utils'

export const POST: APIRoute = async ({ request, locals }) => {
    const cronSecret =
        process.env.CRON_SECRET ??
        (import.meta.env.CRON_SECRET as string | undefined)

    // If a secret is configured, require it via header in all environments
    if (cronSecret) {
        const provided = request.headers.get('x-cron-secret')
        if (provided !== cronSecret) {
            return errorResponse('Forbidden', 403)
        }
    } else {
        // No secret configured. In production, deny; in dev, allow authenticated users to trigger manually.
        if (import.meta.env.PROD) {
            return errorResponse(
                'Missing CRON_SECRET. Set it on the server to enable this endpoint.',
                403
            )
        }
        const user = locals.user
        if (!user) {
            return unauthorizedResponse()
        }
    }

    try {
        const result = await updateAllUserStreaksForUTC()
        return jsonResponse({ success: true, ...result })
    } catch (_e) {
        return errorResponse('Internal server error')
    }
}
