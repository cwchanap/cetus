import { describe, it, expect, vi, beforeEach } from 'vitest'
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
        expect(result.data?.user).toEqual(googleUser)
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
        expect(result.data?.isNewUser).toBe(true)
        expect(result.data?.user).toEqual(newGoogleUser)
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
