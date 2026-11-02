import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { authClient } from '@/lib/auth-client'

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

    it('configures Google as the social provider and omits Apple when unset', async () => {
        const { auth } = await import('@/lib/auth')

        const options = (auth as any).options || (auth as any)._options
        expect(options?.socialProviders?.google).toBeDefined()
        expect(options?.socialProviders?.google?.clientId).toBe(
            'test-google-client-id'
        )
        expect(options?.socialProviders?.apple).toBeUndefined()
    })

    it('registers the expo server plugin', async () => {
        const { auth } = await import('@/lib/auth')

        const options = (auth as any).options || (auth as any)._options
        const pluginIds = (options?.plugins ?? []).map(
            (plugin: { id: string }) => plugin.id
        )
        expect(pluginIds).toContain('expo')
    })

    it('trusts exactly the web origin plus the Expo and Apple origins', async () => {
        const { auth } = await import('@/lib/auth')

        const options = (auth as any).options || (auth as any)._options
        // vitest env sets BETTER_AUTH_URL=http://localhost:4321
        expect(options?.trustedOrigins).toEqual([
            'http://localhost:4321',
            'cetus://',
            'https://appleid.apple.com',
        ])
        expect(options?.baseURL).toBe('http://localhost:4321')
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
            'Google OAuth credentials are required'
        )
    })

    it('throws when Google OAuth credentials are placeholders', async () => {
        vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret')
        vi.stubEnv('GOOGLE_CLIENT_ID', 'placeholder')
        vi.stubEnv('GOOGLE_CLIENT_SECRET', 'placeholder')

        await expect(import('@/lib/auth')).rejects.toThrow(
            'Google OAuth credentials are required'
        )
    })

    it('throws when Google OAuth credentials are whitespace-only', async () => {
        vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret')
        vi.stubEnv('GOOGLE_CLIENT_ID', '   ')
        vi.stubEnv('GOOGLE_CLIENT_SECRET', '   ')

        await expect(import('@/lib/auth')).rejects.toThrow(
            'Google OAuth credentials are required'
        )
    })
})

describe('Auth Apple Modes', () => {
    const { privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
    })
    const testP8 = privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString()

    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('boots with a fully configured Apple provider whose retained options re-sign per oauth2 call', async () => {
        vi.stubEnv('APPLE_SERVICE_ID', 'com.cetus.web.service')
        vi.stubEnv('APPLE_TEAM_ID', 'TEAM123')
        vi.stubEnv('APPLE_KEY_ID', 'KEY123')
        vi.stubEnv('APPLE_PRIVATE_KEY', testP8)

        const { auth } = await import('@/lib/auth')

        const options = (auth as any).options || (auth as any)._options
        const apple = options?.socialProviders?.apple
        expect(typeof apple).toBe('function')
        // Google stays available alongside Apple.
        expect(options?.socialProviders?.google?.clientId).toBe(
            'test-google-client-id'
        )

        // The provider better-auth retains after resolving the factory once:
        // replicate create-context's own resolution (`await originalConfig()`)
        // and prove the retained options are callable so every oauth2 call
        // re-signs. (Context fields never populate in jsdom, so the retained
        // provider itself is asserted via the same resolution path.)
        const retainedOptions = await apple()
        expect(typeof retainedOptions).toBe('function')
        expect(retainedOptions.clientId).toBe('com.cetus.web.service')

        const first = await retainedOptions()
        expect(first.clientId).toBe('com.cetus.web.service')
        expect(first.clientSecret.split('.')).toHaveLength(3)

        const second = await retainedOptions()
        expect(second.clientSecret).not.toBe(first.clientSecret)
    })

    it('throws naming the missing vars on partial Apple config', async () => {
        vi.stubEnv('APPLE_SERVICE_ID', 'com.cetus.web.service')
        vi.stubEnv('APPLE_TEAM_ID', 'TEAM123')

        await expect(import('@/lib/auth')).rejects.toThrow(
            /missing APPLE_KEY_ID, APPLE_PRIVATE_KEY/
        )
    })

    it('wires the expo plugin with the exact-origin wrapper', async () => {
        vi.stubEnv('NODE_ENV', 'development')

        const { auth } = await import('@/lib/auth')

        // Context init never completes under unit-test mocks, so observe the
        // wired plugin directly: its init result must not carry the upstream
        // dev `exp://` origin that better-auth would merge into the
        // effective allowlist (source-verified merge path; see ledger).
        const options = (auth as any).options || (auth as any)._options
        const plugin = (options?.plugins ?? []).find(
            (p: { id: string }) => p.id === 'expo'
        )
        expect(plugin).toBeDefined()
        expect(typeof plugin.init).toBe('function')

        const result = await plugin.init({})
        const origins = result?.options?.trustedOrigins ?? []
        expect(origins).not.toContain('exp://')
    })
})

describe('Google-only Auth Integration', () => {
    // The better-auth client's typed `data` payload for social sign-in omits the
    // `user`/`isNewUser` fields the mock supplies, so assert against this typed
    // view of the response instead of an `any` cast.
    type SocialSignInData = {
        user?: {
            id: string
            email: string
            name?: string
            emailVerified?: boolean
        }
        isNewUser?: boolean
    }
    const socialData = (
        result: Awaited<ReturnType<typeof authClient.signIn.social>>
    ): SocialSignInData | undefined =>
        result.data as SocialSignInData | undefined

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
        expect(socialData(result)?.user).toEqual(googleUser)
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
        expect(socialData(result)?.isNewUser).toBe(true)
        expect(socialData(result)?.user).toEqual(newGoogleUser)
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
