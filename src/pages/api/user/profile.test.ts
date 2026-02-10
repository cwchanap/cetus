import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/pages/api/user/profile'
import { updateUser, isUsernameAvailable } from '@/lib/server/db/queries'

// Mock dependencies
vi.mock('@/lib/server/db/queries', () => ({
    updateUser: vi.fn(),
    isUsernameAvailable: vi.fn(),
}))

describe('POST /api/user/profile', () => {
    const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(updateUser).mockResolvedValue(true)
        vi.mocked(isUsernameAvailable).mockResolvedValue(true)
    })

    describe('authentication', () => {
        it('should return 401 when user is not authenticated', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Name' }),
            })

            const response = await POST({ request, locals: {} } as any)

            expect(response.status).toBe(401)
            const data = await response.json()
            expect(data).toHaveProperty('error', 'Unauthorized')
        })
    })

    describe('name validation', () => {
        it('should update user name successfully', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Name' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                name: 'New Name',
            })

            const data = await response.json()
            expect(data).toMatchObject({
                success: true,
                message: 'Profile updated successfully',
            })
        })

        it('should return 400 for empty name', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: '' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty('error', 'Name cannot be empty')
        })

        it('should return 400 for name that is too long', async () => {
            const longName = 'a'.repeat(101)
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: longName }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty(
                'error',
                'Name must be 100 characters or less'
            )
        })

        it('should trim whitespace from name', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: '  New Name  ' }),
            })

            await POST({ request, locals: { user: mockUser } } as any)

            expect(updateUser).toHaveBeenCalledWith('user-123', {
                name: 'New Name',
            })
        })
    })

    describe('displayName validation', () => {
        it('should update displayName successfully', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: 'Cool Display Name' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                displayName: 'Cool Display Name',
            })
        })

        it('should set displayName to null when empty string provided', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: '' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                displayName: null,
            })
        })

        it('should return 400 for displayName that is too long', async () => {
            const longDisplayName = 'a'.repeat(101)
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: longDisplayName }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty(
                'error',
                'Display name must be 100 characters or less'
            )
        })

        it('should set displayName to null when whitespace-only provided', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: '   ' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                displayName: null,
            })
        })
    })

    describe('username validation', () => {
        it('should update username successfully', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'newusername' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(isUsernameAvailable).toHaveBeenCalledWith(
                'newusername',
                'user-123'
            )
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                username: 'newusername',
            })
        })

        it('should normalize username to lowercase', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'NewUserName' }),
            })

            await POST({ request, locals: { user: mockUser } } as any)

            expect(isUsernameAvailable).toHaveBeenCalledWith(
                'newusername',
                'user-123'
            )
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                username: 'newusername',
            })
        })

        it('should return 400 for invalid username format', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'invalid@username' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty(
                'error',
                'Username must contain only lowercase letters, numbers, or underscores'
            )
        })

        it('should return 400 for username that is too short', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'ab' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty(
                'error',
                'Username must be at least 3 characters'
            )
        })

        it('should return 400 for username that is too long', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'a'.repeat(21) }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty(
                'error',
                'Username must be 20 characters or less'
            )
        })

        it('should return 409 for username that is already taken', async () => {
            vi.mocked(isUsernameAvailable).mockResolvedValue(false)

            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'existinguser' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(409)
            const data = await response.json()
            expect(data).toHaveProperty('error', 'Username is already taken')
        })

        it('should set username to null when empty string provided', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: '' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                username: null,
            })
        })
    })

    describe('multiple field updates', () => {
        it('should update multiple fields at once', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'New Name',
                    displayName: 'New Display',
                    username: 'newuser',
                }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(updateUser).toHaveBeenCalledWith('user-123', {
                name: 'New Name',
                displayName: 'New Display',
                username: 'newuser',
            })
        })
    })

    describe('error handling', () => {
        it('should return 400 when no valid fields provided', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty(
                'error',
                'At least one field must be provided'
            )
        })

        it('should return 500 when update fails', async () => {
            vi.mocked(updateUser).mockResolvedValue(false)

            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Name' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            const data = await response.json()
            expect(data).toHaveProperty('error', 'Failed to update profile')
        })

        it('should return 500 for database errors', async () => {
            vi.mocked(updateUser).mockRejectedValue(new Error('Database error'))

            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Name' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            const data = await response.json()
            expect(data).toHaveProperty('error', 'Internal server error')
        })

        it('should return 400 for invalid JSON', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'invalid json',
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(400)
            const data = await response.json()
            expect(data).toHaveProperty('error', 'Invalid JSON body')
        })
    })

    describe('response format', () => {
        it('should set correct content type header', async () => {
            const request = new Request('http://localhost/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Name' }),
            })

            const response = await POST({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.headers.get('Content-Type')).toBe(
                'application/json'
            )
        })
    })
})
