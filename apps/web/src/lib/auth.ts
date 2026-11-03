import { betterAuth } from 'better-auth'
import {
    expoPluginWithExactOrigins,
    resolveAuthConfig,
    type ResolvedAuthConfig,
} from './auth-config'
import { dialect } from './server/db'

// Check required environment variables
const secret = import.meta.env.BETTER_AUTH_SECRET
if (!secret) {
    console.error(
        '[auth] FATAL: BETTER_AUTH_SECRET is required. Please set it in your environment variables.'
    )
    throw new Error(
        'BETTER_AUTH_SECRET is required. Please set it in your environment variables.'
    )
}

// Provider/baseURL/trusted-origin decisions live in the pure, unit-tested
// helper; this file stays a thin singleton call over it.
let config: ResolvedAuthConfig
try {
    // Name every private key explicitly: Astro's production build inlines
    // import.meta.env properties that are referenced by name in this module
    // — passing the whole env object would strip GOOGLE_*/APPLE_* from the
    // server bundle and crash auth at module init in production.
    config = resolveAuthConfig({
        env: {
            BETTER_AUTH_URL: import.meta.env.BETTER_AUTH_URL,
            GOOGLE_CLIENT_ID: import.meta.env.GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET: import.meta.env.GOOGLE_CLIENT_SECRET,
            APPLE_SERVICE_ID: import.meta.env.APPLE_SERVICE_ID,
            APPLE_TEAM_ID: import.meta.env.APPLE_TEAM_ID,
            APPLE_KEY_ID: import.meta.env.APPLE_KEY_ID,
            APPLE_PRIVATE_KEY: import.meta.env.APPLE_PRIVATE_KEY,
            ENABLE_EXPO_AUTH: import.meta.env.ENABLE_EXPO_AUTH,
        },
        isProd: import.meta.env.PROD,
    })
} catch (error) {
    console.error(`[auth] FATAL: ${(error as Error).message}`)
    throw error
}

export const auth = betterAuth({
    database: {
        dialect,
        type: 'sqlite',
    },
    // The expo plugin ships an authorization proxy that redirects to any
    // external https origin — register it only when the mobile backend is
    // actually enabled (ENABLE_EXPO_AUTH), not on production web.
    plugins: config.expoEnabled ? [expoPluginWithExactOrigins()] : [],
    socialProviders: {
        google: config.google,
        ...(config.apple ? { apple: config.apple } : {}),
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        // `cookie` is accepted by Better Auth at runtime but absent from the
        // generated session-options type; cast to satisfy the type checker.
        cookie: {
            sameSite: 'lax',
            secure: import.meta.env.PROD,
            httpOnly: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
    },
    trustedOrigins: config.trustedOrigins,
    secret,
    baseURL: config.baseURL,
})

export type Session = typeof auth.$Infer.Session
