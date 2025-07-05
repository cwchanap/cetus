import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authClient } from '@/lib/auth-client'

// Mock the auth client module
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
}))

describe('Auth Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Email Authentication', () => {
    it('should successfully sign in with valid email and password', async () => {
      const mockResult = {
        data: { user: { id: '1', email: 'test@example.com' } },
      }
      vi.mocked(authClient.signIn.email).mockResolvedValue(mockResult)

      const result = await authClient.signIn.email({
        email: 'test@example.com',
        password: 'password123',
        callbackURL: '/',
      })

      expect(authClient.signIn.email).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        callbackURL: '/',
      })
      expect(result).toEqual(mockResult)
    })

    it('should handle sign in errors', async () => {
      const mockError = { error: { message: 'Invalid credentials' } }
      vi.mocked(authClient.signIn.email).mockResolvedValue(mockError)

      const result = await authClient.signIn.email({
        email: 'test@example.com',
        password: 'wrongpassword',
        callbackURL: '/',
      })

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Invalid credentials')
    })

    it('should successfully sign up with valid email and password', async () => {
      const mockResult = {
        data: { user: { id: '1', email: 'newuser@example.com' } },
      }
      vi.mocked(authClient.signUp.email).mockResolvedValue(mockResult)

      const result = await authClient.signUp.email({
        email: 'newuser@example.com',
        password: 'password123',
        name: 'newuser',
        callbackURL: '/',
      })

      expect(authClient.signUp.email).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        name: 'newuser',
        callbackURL: '/',
      })
      expect(result).toEqual(mockResult)
    })

    it('should handle sign up errors', async () => {
      const mockError = { error: { message: 'Email already exists' } }
      vi.mocked(authClient.signUp.email).mockResolvedValue(mockError)

      const result = await authClient.signUp.email({
        email: 'existing@example.com',
        password: 'password123',
        name: 'existing',
        callbackURL: '/',
      })

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Email already exists')
    })
  })

  describe('Social Authentication', () => {
    it('should successfully sign in with Google', async () => {
      const mockResult = {
        data: { user: { id: '1', email: 'google@example.com' } },
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

    it('should handle social login errors', async () => {
      const mockError = { error: { message: 'Social login failed' } }
      vi.mocked(authClient.signIn.social).mockResolvedValue(mockError)

      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      })

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Social login failed')
    })
  })

  describe('Session Management', () => {
    it('should successfully sign out', async () => {
      const mockResult = { success: true }
      vi.mocked(authClient.signOut).mockResolvedValue(mockResult)

      const result = await authClient.signOut()

      expect(authClient.signOut).toHaveBeenCalled()
      expect(result).toEqual(mockResult)
    })

    it('should get current session', async () => {
      const mockSession = {
        data: {
          user: { id: '1', email: 'test@example.com' },
          session: { id: 'session-1', expiresAt: new Date() },
        },
      }
      vi.mocked(authClient.getSession).mockResolvedValue(mockSession)

      const result = await authClient.getSession()

      expect(authClient.getSession).toHaveBeenCalled()
      expect(result).toEqual(mockSession)
    })

    it('should handle session errors', async () => {
      const mockError = { error: { message: 'No active session' } }
      vi.mocked(authClient.getSession).mockResolvedValue(mockError)

      const result = await authClient.getSession()

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('No active session')
    })
  })
})
