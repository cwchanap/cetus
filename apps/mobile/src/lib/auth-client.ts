import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import * as SecureStore from 'expo-secure-store'

import { apiBaseUrl } from './env'

// The mobile Better Auth client: same server as the web app, reached over the
// fixed HTTPS origin (Stage 0 tunnel H). The expo plugin persists cookies in
// SecureStore and handles the cetus:// deep-link return from browser OAuth.
export const authClient = createAuthClient({
    baseURL: apiBaseUrl,
    fetchOptions: {
        onResponse({ request, response }) {
            // A proxy login page must never reach Expo's session cache.
            if (
                new URL(request.url).pathname.endsWith('/get-session') &&
                response.ok &&
                response.headers
                    .get('content-type')
                    ?.split(';')[0]
                    .trim()
                    .toLowerCase() !== 'application/json'
            ) {
                throw new Error(
                    'Authentication server returned a non-JSON session response'
                )
            }
        },
    },
    plugins: [
        expoClient({
            scheme: 'cetus',
            storagePrefix: 'cetus',
            storage: SecureStore,
        }),
    ],
})
