import { auth } from '@/lib/auth'
import { defineMiddleware } from 'astro:middleware'

// Astro's built-in security.checkOrigin is disabled in astro.config and
// re-implemented here (same semantics: non-safe methods carrying form-like
// or absent content-type must come from the same origin) with one exemption:
// Apple posts its OAuth callback as a cross-site application/x-www-form-
// urlencoded POST from https://appleid.apple.com, which the stock check
// would 403 before Better Auth runs. Better Auth enforces its own
// trustedOrigins check on the callback, so the exemption is safe.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const FORM_CONTENT_TYPES = [
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
]
const ORIGIN_CHECK_EXEMPT_PATHS = new Set(['/api/auth/callback/apple'])

export const onRequest = defineMiddleware(async (context, next) => {
    const { request, url, isPrerendered } = context
    if (
        !isPrerendered &&
        !SAFE_METHODS.has(request.method) &&
        !ORIGIN_CHECK_EXEMPT_PATHS.has(url.pathname) &&
        request.headers.get('origin') !== url.origin
    ) {
        const contentType = request.headers.get('content-type')
        const formLike =
            contentType !== null &&
            FORM_CONTENT_TYPES.some(type =>
                contentType.toLowerCase().includes(type)
            )
        if (contentType === null || formLike) {
            return new Response(
                `Cross-site ${request.method} form submissions are forbidden`,
                { status: 403 }
            )
        }
    }

    const isAuthed = await auth.api.getSession({
        headers: request.headers,
    })

    if (isAuthed) {
        context.locals.user = isAuthed.user
        context.locals.session = isAuthed.session
    } else {
        context.locals.user = null
        context.locals.session = null
    }

    return next()
})
