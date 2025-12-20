import { betterAuth } from 'better-auth'
import { dialect } from './server/db'

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
            secure: false,
            httpOnly: true,
        },
    },
    trustedOrigins: ['http://localhost:4325'],
    secret: import.meta.env.BETTER_AUTH_SECRET!,
    baseURL: import.meta.env.BETTER_AUTH_URL || '',
})

export type Session = typeof auth.$Infer.Session
