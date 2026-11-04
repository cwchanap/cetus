import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/pages/api/user/profile'
import {
    updateUser,
    isUsernameAvailable,
    getUserIdentityByIdStrict,
    getUserStatsStrict,
    getUserAchievementsStrict,
} from '@/lib/server/db/queries'

// Mock dependencies
vi.mock('@/lib/server/db/queries', () => ({
    updateUser: vi.fn(),
    isUsernameAvailable: vi.fn(),
    getUserIdentityByIdStrict: vi.fn(),
    getUserStatsStrict: vi.fn(),
    getUserAchievementsStrict: vi.fn(),
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

describe('GET /api/user/profile', () => {
    const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
    }

    const mockIdentity = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test Display',
        image: 'https://example.com/avatar.png',
        createdAt: '2024-01-15T00:00:00.000Z',
    }

    const mockStats = {
        id: 1,
        user_id: 'user-123',
        total_games_played: 7,
        total_score: 42000,
        favorite_game: 'tetris',
        streak_days: 5,
        xp: 1300,
        level: 4,
    }

    const mockAchievements = [
        { id: 1, user_id: 'user-123', achievement_id: 'first_win' },
        { id: 2, user_id: 'user-123', achievement_id: 'global_ace' },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getUserIdentityByIdStrict).mockResolvedValue(mockIdentity)
        vi.mocked(getUserStatsStrict).mockResolvedValue(mockStats as any)
        vi.mocked(getUserAchievementsStrict).mockResolvedValue(
            mockAchievements as any
        )
    })

    describe('authentication', () => {
        it('should return 401 when user is not authenticated', async () => {
            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({ request, locals: {} } as any)

            expect(response.status).toBe(401)
            const data = await response.json()
            expect(data).toHaveProperty('error', 'Unauthorized')
            expect(getUserIdentityByIdStrict).not.toHaveBeenCalled()
        })
    })

    describe('success', () => {
        it('should return the canonical overview for the session user', async () => {
            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            expect(getUserIdentityByIdStrict).toHaveBeenCalledWith('user-123')
            expect(getUserStatsStrict).toHaveBeenCalledWith('user-123')
            expect(getUserAchievementsStrict).toHaveBeenCalledWith('user-123')

            const data = await response.json()
            expect(data).toEqual({
                profile: {
                    name: 'Test User',
                    displayName: 'Test Display',
                    username: 'testuser',
                    image: 'https://example.com/avatar.png',
                    createdAt: '2024-01-15T00:00:00.000Z',
                },
                stats: {
                    totalGamesPlayed: 7,
                    totalScore: 42000,
                    favoriteGame: 'tetris',
                    streakDays: 5,
                    xp: 1300,
                    level: 4,
                },
                earnedAchievementIds: ['first_win', 'global_ace'],
            })
        })

        it('should not expose email or other personal data in the profile', async () => {
            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({
                request,
                locals: { user: mockUser },
            } as any)

            const data = await response.json()
            expect(data.profile).not.toHaveProperty('email')
            expect(data.profile).not.toHaveProperty('id')
        })

        it('should return zeroed stats and empty achievements when no stats row exists', async () => {
            vi.mocked(getUserStatsStrict).mockResolvedValue(null)
            vi.mocked(getUserAchievementsStrict).mockResolvedValue([])

            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(200)
            const data = await response.json()
            expect(data.stats).toEqual({
                totalGamesPlayed: 0,
                totalScore: 0,
                favoriteGame: null,
                streakDays: 0,
                xp: 0,
                level: 1,
            })
            expect(data.earnedAchievementIds).toEqual([])
        })
    })

    describe('missing identity', () => {
        it('should return 404 when the session user has no identity row', async () => {
            vi.mocked(getUserIdentityByIdStrict).mockResolvedValue(null)

            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(404)
            const data = await response.json()
            expect(data).toHaveProperty('error')
        })
    })

    describe('database errors', () => {
        it('should return 500 when the identity read fails', async () => {
            vi.mocked(getUserIdentityByIdStrict).mockRejectedValue(
                new Error('Database error')
            )

            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            const data = await response.json()
            expect(data).toHaveProperty('error')
        })

        it('should return 500 when the stats read fails', async () => {
            vi.mocked(getUserStatsStrict).mockRejectedValue(
                new Error('Database error')
            )

            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            const data = await response.json()
            expect(data).toHaveProperty('error')
        })

        it('should return 500 when the achievements read fails', async () => {
            vi.mocked(getUserAchievementsStrict).mockRejectedValue(
                new Error('Database error')
            )

            const request = new Request('http://localhost/api/user/profile')

            const response = await GET({
                request,
                locals: { user: mockUser },
            } as any)

            expect(response.status).toBe(500)
            const data = await response.json()
            expect(data).toHaveProperty('error')
        })
    })
})
