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
    config = resolveAuthConfig({
        env: import.meta.env,
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
    plugins: [expoPluginWithExactOrigins()],
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
