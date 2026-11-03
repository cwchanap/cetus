import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import * as SecureStore from 'expo-secure-store'

import { apiBaseUrl } from './env'

// The mobile Better Auth client: same server as the web app, reached over the
// fixed HTTPS origin (Stage 0 tunnel H). The expo plugin persists cookies in
// SecureStore and handles the cetus:// deep-link return from browser OAuth.
export const authClient = createAuthClient({
    baseURL: apiBaseUrl,
    plugins: [
        expoClient({
            scheme: 'cetus',
            storagePrefix: 'cetus',
            storage: SecureStore,
        }),
    ],
})
