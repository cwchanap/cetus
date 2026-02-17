import { betterAuth } from 'better-auth'
import { dialect } from './server/db'

// Check required environment variables
const secret = import.meta.env.BETTER_AUTH_SECRET
if (!secret) {
    throw new Error(
        'BETTER_AUTH_SECRET is required. Please set it in your environment variables.'
    )
}

// Determine baseURL with proper fallback and validation
const authUrl = import.meta.env.BETTER_AUTH_URL
let baseURL: string
if (authUrl) {
    baseURL = authUrl
} else if (!import.meta.env.PROD) {
    baseURL = 'http://localhost:4325'
} else {
    throw new Error(
        'BETTER_AUTH_URL is required in production. Please set it in your environment variables.'
    )
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
    trustedOrigins: [baseURL],
    secret,
    baseURL,
})

export type Session = typeof auth.$Infer.Session
