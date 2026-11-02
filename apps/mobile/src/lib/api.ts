import { createApiClient } from '@cetus/api-client/api-client'

import { authClient } from './auth-client'

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL
if (!baseUrl) {
    throw new Error(
        'EXPO_PUBLIC_API_BASE_URL is required. Point it at the fixed HTTPS backend origin (e.g. the Stage 0 Cloudflare tunnel) in app config or your environment.'
    )
}

// The single mobile API client. The cookie header is the only session
// transport: native fetch's implicit cookie jar is disabled with
// `credentials: 'omit'` (Better Auth's Expo guidance) so it cannot compete
// with the explicit SecureStore-backed Cookie header.
export const api = createApiClient({
    baseUrl,
    getHeaders: async (): Promise<Record<string, string>> => {
        const cookie = await authClient.getCookie()
        return cookie ? { Cookie: cookie } : {}
    },
    fetchImpl: (input, init) => fetch(input, { ...init, credentials: 'omit' }),
})
