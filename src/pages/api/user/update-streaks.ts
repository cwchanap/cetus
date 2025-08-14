import type { APIRoute } from 'astro'
import { updateAllUserStreaksForUTC } from '@/lib/server/db/queries'

export const POST: APIRoute = async ({ request, locals }) => {
    const cronSecret =
        process.env.CRON_SECRET ??
        (import.meta.env.CRON_SECRET as string | undefined)

    // If a secret is configured, require it via header in all environments
    if (cronSecret) {
        const provided = request.headers.get('x-cron-secret')
        if (provided !== cronSecret) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            })
        }
    } else {
        // No secret configured. In production, deny; in dev, allow authenticated users to trigger manually.
        if (import.meta.env.PROD) {
            return new Response(
                JSON.stringify({
                    error: 'Missing CRON_SECRET. Set it on the server to enable this endpoint.',
                }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            )
        }
        const user = locals.user
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }
    }

    try {
        const result = await updateAllUserStreaksForUTC()
        return new Response(JSON.stringify({ success: true, ...result }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (_e) {
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
