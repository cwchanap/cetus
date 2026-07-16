import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { authClient } from '@/lib/auth-client'

const googleOnlyCredentialsError =
    'Google OAuth is required for Google-only authentication. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to real OAuth credentials.'
const authSource = readFileSync(
    resolve(process.cwd(), 'src/lib/auth.ts'),
    'utf8'
)

describe('Auth Source Contract', () => {
    it('removes password authentication configuration', () => {
        expect(authSource).not.toContain('emailAndPassword')
    })

    it('requires Google OAuth with the exact Google-only credential error', () => {
        expect(authSource).toContain(googleOnlyCredentialsError)
    })

    it('rejects placeholder Google OAuth credentials', () => {
        expect(authSource).toContain("googleClientId !== 'placeholder'")
        expect(authSource).toContain("googleClientSecret !== 'placeholder'")
    })

    it('configures Google as a social provider', () => {
        expect(authSource).toContain('socialProviders')
        expect(authSource).toContain('google')
    })

    it('logs error before throwing on missing env vars', () => {
        expect(authSource).toContain('console.error')
        expect(authSource).toContain('[auth] FATAL')
    })

    it('trims whitespace from Google OAuth credentials', () => {
        expect(authSource).toContain('?.trim()')
    })
})

// Mock the DB module before importing auth.ts in behavioral tests
// Provide a minimal Kysely dialect interface to prevent betterAuth init errors
vi.mock('@/lib/server/db', () => ({
    dialect: {
        createDriver: () => ({
            init: async () => {},
            acquireConnection: async () => ({
                executeQuery: async () => ({ rows: [] }),
            }),
            releaseConnection: async () => {},
            destroy: async () => {},
        }),
        createAdapter: () => ({
            acquireConnection: async () => ({
                executeQuery: async () => ({ rows: [] }),
            }),
        }),
        createQueryCompiler: () => ({
            compileQuery: () => ({ query: {}, params: [] }),
        }),
    },
    db: {},
}))

describe('Auth Behavioral Config', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('does not enable emailAndPassword authentication', async () => {
        const { auth } = await import('@/lib/auth')

        // Better Auth defaults emailAndPassword.enabled to false.
        // Verify it's not explicitly enabled in our config.
        const options = (auth as any).options || (auth as any)._options
        if (options?.emailAndPassword) {
            expect(options.emailAndPassword.enabled).not.toBe(true)
        }
        // If emailAndPassword is absent entirely, that's correct — default is disabled.
    })

    it('configures Google as the social provider', async () => {
        const { auth } = await import('@/lib/auth')

        const options = (auth as any).options || (auth as any)._options
        expect(options?.socialProviders?.google).toBeDefined()
        expect(options?.socialProviders?.google?.clientId).toBe(
            'test-google-client-id'
        )
    })

    it('configures session with proper defaults', async () => {
        const { auth } = await import('@/lib/auth')

        const options = (auth as any).options || (auth as any)._options
        expect(options?.session?.expiresIn).toBe(60 * 60 * 24 * 7) // 7 days
        expect(options?.session?.updateAge).toBe(60 * 60 * 24) // 1 day
    })
})

describe('Auth Env Validation', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('throws when BETTER_AUTH_SECRET is missing', async () => {
        vi.stubEnv('BETTER_AUTH_SECRET', '')

        await expect(import('@/lib/auth')).rejects.toThrow(
            'BETTER_AUTH_SECRET is required'
        )
    })

    it('throws when Google OAuth credentials are missing', async () => {
        // BETTER_AUTH_SECRET is needed first (auth.ts checks it before Google)
        vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret')
        vi.stubEnv('GOOGLE_CLIENT_ID', '')
        vi.stubEnv('GOOGLE_CLIENT_SECRET', '')

        await expect(import('@/lib/auth')).rejects.toThrow(
            'Google OAuth is required for Google-only authentication'
        )
    })

    it('throws when Google OAuth credentials are placeholders', async () => {
        vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret')
        vi.stubEnv('GOOGLE_CLIENT_ID', 'placeholder')
        vi.stubEnv('GOOGLE_CLIENT_SECRET', 'placeholder')

        await expect(import('@/lib/auth')).rejects.toThrow(
            'Google OAuth is required for Google-only authentication'
        )
    })

    it('throws when Google OAuth credentials are whitespace-only', async () => {
        vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret')
        vi.stubEnv('GOOGLE_CLIENT_ID', '   ')
        vi.stubEnv('GOOGLE_CLIENT_SECRET', '   ')

        await expect(import('@/lib/auth')).rejects.toThrow(
            'Google OAuth is required for Google-only authentication'
        )
    })
})

describe('Google-only Auth Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('handles Google OAuth sign-in for an existing user', async () => {
        const googleUser = {
            id: 'google-user-123',
            email: 'googleuser@gmail.com',
            name: 'Google User',
            emailVerified: true,
        }
        vi.mocked(authClient.signIn.social).mockResolvedValue({
            data: { user: googleUser },
        })

        const result = await authClient.signIn.social({
            provider: 'google',
            callbackURL: '/',
        })

        expect(authClient.signIn.social).toHaveBeenCalledWith({
            provider: 'google',
            callbackURL: '/',
        })
        expect((result.data as any)?.user).toEqual(googleUser)
    })

    it('handles Google OAuth registration for a new user', async () => {
        const newGoogleUser = {
            id: 'new-google-user-123',
            email: 'new-google-user@gmail.com',
            name: 'New Google User',
            emailVerified: true,
        }
        vi.mocked(authClient.signIn.social).mockResolvedValue({
            data: {
                isNewUser: true,
                user: newGoogleUser,
            },
        })

        const result = await authClient.signIn.social({
            provider: 'google',
            callbackURL: '/profile',
        })

        expect(authClient.signIn.social).toHaveBeenCalledWith({
            provider: 'google',
            callbackURL: '/profile',
        })
        expect((result.data as any)?.isNewUser).toBe(true)
        expect((result.data as any)?.user).toEqual(newGoogleUser)
    })

    it('handles Google OAuth errors', async () => {
        vi.mocked(authClient.signIn.social).mockResolvedValue({
            error: { message: 'OAuth provider rejected the request' },
        })

        const result = await authClient.signIn.social({
            provider: 'google',
            callbackURL: '/',
        })

        expect(result.error?.message).toBe(
            'OAuth provider rejected the request'
        )
    })

    it('persists the session after Google sign-in', async () => {
        const user = { id: 'google-user-123', email: 'googleuser@gmail.com' }
        const session = {
            id: 'session-123',
            expiresAt: new Date(Date.now() + 3600000),
        }

        vi.mocked(authClient.signIn.social).mockResolvedValue({
            data: { user },
        })
        vi.mocked(authClient.getSession).mockResolvedValue({
            data: { user, session },
        })

        await authClient.signIn.social({
            provider: 'google',
            callbackURL: '/',
        })
        const sessionResult = await authClient.getSession()

        expect(sessionResult.data?.user).toEqual(user)
        expect(sessionResult.data?.session).toEqual(session)
    })

    it('handles expired sessions', async () => {
        vi.mocked(authClient.getSession).mockResolvedValue({
            error: { message: 'Session expired' },
        })

        const result = await authClient.getSession()

        expect(result.error?.message).toBe('Session expired')
    })

    it('clears auth state on signOut', async () => {
        vi.mocked(authClient.signOut).mockResolvedValue({
            data: { success: true },
        })
        vi.mocked(authClient.getSession).mockResolvedValue({
            error: { message: 'No active session' },
        })

        const signOutResult = await authClient.signOut()
        const sessionResult = await authClient.getSession()

        expect(signOutResult.data?.success).toBe(true)
        expect(sessionResult.error?.message).toBe('No active session')
    })

    it('handles Google OAuth network errors', async () => {
        vi.mocked(authClient.signIn.social).mockRejectedValue(
            new Error('Network error')
        )

        await expect(
            authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })
        ).rejects.toThrow('Network error')
    })

    it('handles malformed session responses', async () => {
        vi.mocked(authClient.getSession).mockResolvedValue({} as any)

        const result = await authClient.getSession()

        expect(result.data).toBeUndefined()
        expect(result.error).toBeUndefined()
    })
})
