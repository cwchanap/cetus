import { betterAuth } from 'better-auth'
import { dialect } from './server/db'

// Check required environment variables
const secret = import.meta.env.BETTER_AUTH_SECRET
if (!secret) {
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
    googleClientId &&
    googleClientSecret &&
    googleClientId !== 'placeholder' &&
    googleClientSecret !== 'placeholder'

export const auth = betterAuth({
    database: {
        dialect,
        type: 'sqlite',
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // Set to true in production
    },
    // Only enable Google OAuth if properly configured
    ...(isGoogleOAuthConfigured && {
        socialProviders: {
            google: {
                clientId: googleClientId,
                clientSecret: googleClientSecret,
            },
        },
    }),
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        cookie: {
            sameSite: 'lax',
            secure: import.meta.env.PROD,
            httpOnly: true,
        },
    },
    trustedOrigins: baseURL ? [baseURL] : [],
    secret,
    baseURL,
})

export type Session = typeof auth.$Infer.Session
