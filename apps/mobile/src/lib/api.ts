import { createApiClient } from '@cetus/api-client/api-client'
import type { ScoreSubmitter } from '@cetus/shared/scores'

import { authClient } from './auth-client'
import { apiBaseUrl } from './env'

// React Native's URL shim (Libraries/Blob/URL.js) resolves `origin` with a
// case-sensitive scheme regex and never normalizes host case or strips a
// default port, so `HTTPS://Cetus.example.com:443` would produce an Origin
// the server's exact-match check (middleware) rejects with 403. Normalize
// scheme/host casing and drop the scheme's default port explicitly.
const apiOrigin = (() => {
    const match = apiBaseUrl.match(
        /^([a-zA-Z][a-zA-Z\d+\-.]*):\/\/(?:[^@/?#]+@)?(\[[0-9a-fA-F:]+\]|[^:/?#]+)(?::(\d+))?(?:[/?#]|$)/
    )
    if (match === null) {
        return apiBaseUrl.replace(/\/+$/, '')
    }
    const scheme = match[1].toLowerCase()
    const host = match[2].toLowerCase()
    const port = match[3]
    const isDefaultPort =
        port === undefined ||
        (scheme === 'https' && port === '443') ||
        (scheme === 'http' && port === '80')
    return `${scheme}://${host}${isDefaultPort ? '' : `:${port}`}`
})()

// Trailing-slash-normalized base URL for endpoints built by hand here
// (get-session verification): the typed client strips trailing slashes
// from its own baseUrl, and this origin must match that exactly.
const apiBase = apiBaseUrl.replace(/\/+$/, '')

// Native fetch has no default timeout; bound every mobile request and
// session-verification call so hung sockets cannot stall UI states forever.
const REQUEST_TIMEOUT_MS = 10_000
const VERIFICATION_TIMEOUT_MS = 5000

// The single mobile API client. The cookie header is the only session
// transport: native fetch's implicit cookie jar is disabled with
// `credentials: 'omit'` (Better Auth's Expo guidance) so it cannot compete
// with the explicit SecureStore-backed Cookie header.
const omitCredentialsFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
): Promise<Response> => {
    const controller = new AbortController()
    const callerSignal = init?.signal
    const onCallerAbort = () => controller.abort()
    if (callerSignal) {
        if (callerSignal.aborted) {
            controller.abort()
        } else {
            callerSignal.addEventListener('abort', onCallerAbort, {
                once: true,
            })
        }
    }
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        return await fetch(input, {
            ...init,
            credentials: 'omit',
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timeout)
        callerSignal?.removeEventListener('abort', onCallerAbort)
    }
}

export const api = createApiClient({
    baseUrl: apiBaseUrl,
    getHeaders: async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = { Origin: apiOrigin }
        const cookie = await authClient.getCookie()
        if (cookie) {
            headers.Cookie = cookie
        }
        return headers
    },
    fetchImpl: omitCredentialsFetch,
})

async function readStoredCookie(): Promise<string | null> {
    try {
        const stored = await authClient.getCookie()
        return stored && stored.length > 0 ? stored : null
    } catch {
        return null
    }
}

// Server-side truth for one candidate cookie: does THIS cookie string
// authenticate as the expected user? The fetch pins the candidate so the
// verdict and the credential cannot drift apart mid-flight.
async function cookieBelongsTo(
    cookie: string | null,
    expectedUserId: string
): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(
        () => controller.abort(),
        VERIFICATION_TIMEOUT_MS
    )
    try {
        const response = await fetch(`${apiBase}/api/auth/get-session`, {
            headers: {
                Origin: apiOrigin,
                ...(cookie ? { Cookie: cookie } : {}),
            },
            credentials: 'omit',
            signal: controller.signal,
        })
        if (!response.ok) {
            return false
        }
        const body: unknown = await response.json()
        const userId =
            body !== null && typeof body === 'object' && 'user' in body
                ? (body as { user?: { id?: unknown } }).user?.id
                : undefined
        const verified =
            typeof userId === 'string' && userId.length > 0 ? userId : null
        return verified === expectedUserId
    } catch {
        return false
    } finally {
        clearTimeout(timeout)
    }
}

// The pinned transport every bound host submits through: the verified
// snapshot cookie (or none, for guests) goes out verbatim on every save.
const pinnedClientFor = (boundCookie: string | null) =>
    createApiClient({
        baseUrl: apiBaseUrl,
        getHeaders: () => ({
            Origin: apiOrigin,
            ...(boundCookie ? { Cookie: boundCookie } : {}),
        }),
        fetchImpl: omitCredentialsFetch,
    })

/**
 * ONE identity-bound score submitter per mounted game host (HPA-425
 * final review). The play route keeps an old host mounted while the auth
 * session re-settles, so a live-cookie read at save time could attach a
 * NEW account's cookie to an old host's score. This factory captures one
 * local cookie snapshot at mount (no network call at startup) and
 * verifies it against the host's settled identity at the real
 * get-session fetch boundary on the first save, pinning the verified
 * client for the host's remaining lifetime. Guest hosts never send
 * credentials at all; an unverifiable account binding (missing cookie,
 * mismatch, or transport failure) sends NO score POST and reports
 * SCORE_CONTEXT_UNAVAILABLE. Never rejects; the returned submitter
 * surfaces every transport failure through ScoreSubmissionResult.
 */
export async function createScoreSubmitter(
    expectedUserId: string | null
): Promise<ScoreSubmitter> {
    // Guest binding: nothing to verify — no credentials may ever leave a
    // guest-bound host, even if a sign-in lands mid-run.
    if (expectedUserId === null) {
        const guestClient = pinnedClientFor(null)
        return data => guestClient.submitScore(data)
    }

    // Snapshot the stored cookie locally at mount without blocking startup
    // on a get-session round-trip; save time verifies it once against
    // expectedUserId and pins the recovered client.
    const snapshotCookie = await readStoredCookie()
    let verifiedClient: ReturnType<typeof pinnedClientFor> | null = null
    return async data => {
        if (verifiedClient === null) {
            const candidate = snapshotCookie ?? (await readStoredCookie())
            if (
                candidate === null ||
                !(await cookieBelongsTo(candidate, expectedUserId))
            ) {
                return {
                    success: false,
                    error: 'Account verification unavailable',
                    code: 'SCORE_CONTEXT_UNAVAILABLE',
                }
            }
            verifiedClient = pinnedClientFor(candidate)
        }
        return verifiedClient.submitScore(data)
    }
}
