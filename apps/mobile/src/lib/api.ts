import { createApiClient } from '@cetus/api-client/api-client'

import { authClient } from './auth-client'
import { apiBaseUrl } from './env'

const apiOrigin = new URL(apiBaseUrl).origin

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
