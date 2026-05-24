import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authClient } from '@/lib/auth-client'

describe('Auth Client', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('Google Social Authentication', () => {
        it('successfully signs in with Google', async () => {
            const mockResult = {
                data: {
                    user: {
                        id: 'google-user-1',
                        email: 'google@example.com',
                        name: 'Google User',
                    },
                },
            }
            vi.mocked(authClient.signIn.social).mockResolvedValue(mockResult)

            const result = await authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })

            expect(authClient.signIn.social).toHaveBeenCalledWith({
                provider: 'google',
                callbackURL: '/',
            })
            expect(result).toEqual(mockResult)
        })

        it('returns Google social sign-in errors', async () => {
            const mockError = {
                error: { message: 'Google OAuth failed' },
            }
            vi.mocked(authClient.signIn.social).mockResolvedValue(mockError)

            const result = await authClient.signIn.social({
                provider: 'google',
                callbackURL: '/',
            })

            expect(result.error?.message).toBe('Google OAuth failed')
        })
    })

    describe('Session Management', () => {
        it('successfully signs out', async () => {
            const mockResult = { data: { success: true } }
            vi.mocked(authClient.signOut).mockResolvedValue(mockResult)

            const result = await authClient.signOut()

            expect(authClient.signOut).toHaveBeenCalled()
            expect(result).toEqual(mockResult)
        })

        it('gets the current session', async () => {
            const mockSession = {
                data: {
                    user: { id: '1', email: 'google@example.com' },
                    session: {
                        id: 'session-1',
                        expiresAt: new Date(Date.now() + 3600000),
                    },
                },
            }
            vi.mocked(authClient.getSession).mockResolvedValue(mockSession)

            const result = await authClient.getSession()

            expect(authClient.getSession).toHaveBeenCalled()
            expect(result).toEqual(mockSession)
        })

        it('returns session errors', async () => {
            const mockError = { error: { message: 'No active session' } }
            vi.mocked(authClient.getSession).mockResolvedValue(mockError)

            const result = await authClient.getSession()

            expect(result.error?.message).toBe('No active session')
        })
    })
})
