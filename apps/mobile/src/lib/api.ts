import { createApiClient } from '@cetus/api-client/api-client'

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

// The single mobile API client. The cookie header is the only session
// transport: native fetch's implicit cookie jar is disabled with
// `credentials: 'omit'` (Better Auth's Expo guidance) so it cannot compete
// with the explicit SecureStore-backed Cookie header.
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
    fetchImpl: (input, init) => fetch(input, { ...init, credentials: 'omit' }),
})
