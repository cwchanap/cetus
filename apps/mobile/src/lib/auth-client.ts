import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import * as SecureStore from 'expo-secure-store'

// The mobile Better Auth client: same server as the web app, reached over the
// fixed HTTPS origin (Stage 0 tunnel H). The expo plugin persists cookies in
// SecureStore and handles the cetus:// deep-link return from browser OAuth.
const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL
if (!baseURL) {
    throw new Error(
        'EXPO_PUBLIC_API_BASE_URL is required. Point it at the fixed HTTPS backend origin (e.g. the Stage 0 Cloudflare tunnel) in app config or your environment.'
    )
}

export const authClient = createAuthClient({
    baseURL,
    plugins: [
        expoClient({
            scheme: 'cetus',
            storagePrefix: 'cetus',
            storage: SecureStore,
        }),
    ],
})
