import { betterAuth } from 'better-auth'
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

// Determine baseURL - use env var, fallback to localhost, or empty in production (inferred from request)
let baseURL: string
if (import.meta.env.BETTER_AUTH_URL) {
    baseURL = import.meta.env.BETTER_AUTH_URL
} else if (import.meta.env.PROD) {
    baseURL = '' // Better Auth will infer from request headers in production
} else {
    baseURL = 'http://localhost:4325'
}

// Check if Google OAuth is properly configured
const googleClientId = import.meta.env.GOOGLE_CLIENT_ID
const googleClientSecret = import.meta.env.GOOGLE_CLIENT_SECRET
const isGoogleOAuthConfigured =
    googleClientId?.trim() &&
    googleClientSecret?.trim() &&
    googleClientId !== 'placeholder' &&
    googleClientSecret !== 'placeholder'

if (!isGoogleOAuthConfigured) {
    console.error(
        '[auth] FATAL: Google OAuth is required for Google-only authentication. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to real OAuth credentials.'
    )
    throw new Error(
        'Google OAuth is required for Google-only authentication. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to real OAuth credentials.'
    )
}

export const auth = betterAuth({
    database: {
        dialect,
        type: 'sqlite',
    },
    socialProviders: {
        google: {
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string,
        },
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
    trustedOrigins: baseURL ? [baseURL] : [],
    secret,
    baseURL,
})

export type Session = typeof auth.$Infer.Session
