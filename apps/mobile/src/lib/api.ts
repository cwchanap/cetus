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

// The single mobile API client. The cookie header is the only session
// transport: native fetch's implicit cookie jar is disabled with
// `credentials: 'omit'` (Better Auth's Expo guidance) so it cannot compete
// with the explicit SecureStore-backed Cookie header.
const omitCredentialsFetch = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
) => fetch(input, { ...init, credentials: 'omit' })

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

// A mismatching or failing verification re-reads the cookie a bounded
// number of times to absorb a SecureStore write that lands between the
// route's settled identity and this read.
const BIND_ATTEMPTS = 3
// Native fetch has no default timeout; an unbounded hang would keep a
// game host from ever creating its game.
const VERIFICATION_TIMEOUT_MS = 5000

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

/**
 * ONE identity-bound score submitter per mounted game host (HPA-425
 * final review). The play route keeps an old host mounted while the auth
 * session re-settles, so a live-cookie read at save time could attach a
 * NEW account's cookie to an old host's score. This factory instead
 * verifies one cookie snapshot against the host's settled identity at
 * the real get-session fetch boundary and freezes it for the host's
 * lifetime: every save reuses the same credentials verbatim, so a cookie
 * that flips mid-run (guest→account, A→B) can never switch the request's
 * account, and same-account renewals (which keep the token value) keep
 * saving. Guest hosts never send credentials at all; an unverifiable
 * account binding (mismatch or transport failure after bounded retries)
 * sends NO request and reports SCORE_CONTEXT_UNAVAILABLE — the account may
 * be valid, so it is never reported as signed out. Never rejects; the
 * returned submitter surfaces every transport failure through
 * ScoreSubmissionResult as before.
 */
export async function createScoreSubmitter(
    expectedUserId: string | null
): Promise<ScoreSubmitter> {
    // Guest binding: nothing to verify — no credentials may ever leave a
    // guest-bound host, even if a sign-in lands mid-run.
    let cookie: string | null = null
    if (expectedUserId !== null) {
        for (let attempt = 0; attempt < BIND_ATTEMPTS; attempt++) {
            let candidate: string | null
            try {
                const stored = await authClient.getCookie()
                candidate = stored && stored.length > 0 ? stored : null
            } catch {
                candidate = null
            }
            if (await cookieBelongsTo(candidate, expectedUserId)) {
                cookie = candidate
                break
            }
        }
    }
    // Fail closed for an unverifiable ACCOUNT binding (identity mismatch,
    // transport failure, no cookie): no score POST is sent at all. The
    // account itself may be perfectly valid — the host just could not
    // confirm it — so the result carries SCORE_CONTEXT_UNAVAILABLE, never
    // UNAUTHENTICATED (that would lie "you are signed out" and prompt a
    // bogus sign-in). Guest hosts keep the real POST: their cookieless
    // 401 IS the truthful outcome.
    if (expectedUserId !== null && cookie === null) {
        return async () => ({
            success: false,
            error: 'Account verification unavailable',
            code: 'SCORE_CONTEXT_UNAVAILABLE',
        })
    }
    const pinnedClient = createApiClient({
        baseUrl: apiBaseUrl,
        getHeaders: () => ({
            Origin: apiOrigin,
            ...(cookie ? { Cookie: cookie } : {}),
        }),
        fetchImpl: omitCredentialsFetch,
    })
    return data => pinnedClient.submitScore(data)
}
