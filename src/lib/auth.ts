import { betterAuth } from 'better-auth'
import { dialect } from './server/db'

export const auth = betterAuth({
    database: {
        dialect,
        type: 'sqlite',
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // Set to true in production
    },
    socialProviders: {
        google: {
            clientId: import.meta.env.GOOGLE_CLIENT_ID || 'placeholder',
            clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET || 'placeholder',
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        cookie: {
            sameSite: 'lax',
            secure: false,
            httpOnly: true,
        },
    },
    trustedOrigins: [
        'http://localhost:4321',
        'http://localhost:4322',
        'https://cetus.vercel.app',
        'http://localhost:4321/#games',
        'http://localhost:4322/#games',
        'https://cetus.vercel.app/#games',
    ],
    secret: import.meta.env.BETTER_AUTH_SECRET!,
    baseURL: import.meta.env.BETTER_AUTH_URL || '',
})

export type Session = typeof auth.$Infer.Session
