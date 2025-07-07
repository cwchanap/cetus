import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/pages/api/scores/history'
import { getUserGameHistory } from '@/lib/db/queries'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/lib/db/queries', () => ({
    getUserGameHistory: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: vi.fn(),
        },
    },
}))

describe('GET /api/scores/history', () => {
    const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
    }

    const mockSession = {
        user: mockUser,
        id: 'session-123',
    }

    const mockGameHistory = [
        {
            game_id: 'tetris',
            game_name: 'Tetris Challenge',
            score: 5000,
            created_at: '2023-01-01T00:00:00Z',
        },
        {
            game_id: 'quick_draw',
            game_name: 'Quick Draw',
            score: 3000,
            created_at: '2023-01-02T00:00:00Z',
        },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return game history for authenticated user', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        vi.mocked(getUserGameHistory).mockResolvedValue(mockGameHistory)

        const url = new URL('http://localhost:4321/api/scores/history')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ history: mockGameHistory })
        expect(getUserGameHistory).toHaveBeenCalledWith('user-123', 10)
    })

    it('should return game history with custom limit', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        vi.mocked(getUserGameHistory).mockResolvedValue(
            mockGameHistory.slice(0, 5)
        )

        const url = new URL('http://localhost:4321/api/scores/history?limit=5')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ history: mockGameHistory.slice(0, 5) })
        expect(getUserGameHistory).toHaveBeenCalledWith('user-123', 5)
    })

    it('should return 401 for unauthenticated user', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(null)

        const url = new URL('http://localhost:4321/api/scores/history')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(401)
        expect(result).toEqual({ error: 'Unauthorized' })
        expect(getUserGameHistory).not.toHaveBeenCalled()
    })

    it('should return 400 for invalid limit parameter (negative)', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const url = new URL('http://localhost:4321/api/scores/history?limit=-1')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Invalid limit parameter' })
        expect(getUserGameHistory).not.toHaveBeenCalled()
    })

    it('should return 400 for invalid limit parameter (zero)', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const url = new URL('http://localhost:4321/api/scores/history?limit=0')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Invalid limit parameter' })
        expect(getUserGameHistory).not.toHaveBeenCalled()
    })

    it('should return 400 for invalid limit parameter (too large)', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const url = new URL(
            'http://localhost:4321/api/scores/history?limit=101'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Invalid limit parameter' })
        expect(getUserGameHistory).not.toHaveBeenCalled()
    })

    it('should return 400 for invalid limit parameter (non-numeric)', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const url = new URL(
            'http://localhost:4321/api/scores/history?limit=abc'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Invalid limit parameter' })
        expect(getUserGameHistory).not.toHaveBeenCalled()
    })

    it('should use default limit when not specified', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        vi.mocked(getUserGameHistory).mockResolvedValue(mockGameHistory)

        const url = new URL('http://localhost:4321/api/scores/history')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ history: mockGameHistory })
        expect(getUserGameHistory).toHaveBeenCalledWith('user-123', 10)
    })

    it('should return empty array when no history exists', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        vi.mocked(getUserGameHistory).mockResolvedValue([])

        const url = new URL('http://localhost:4321/api/scores/history')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ history: [] })
        expect(getUserGameHistory).toHaveBeenCalledWith('user-123', 10)
    })

    it('should return 500 for database errors', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        vi.mocked(getUserGameHistory).mockRejectedValue(
            new Error('Database error')
        )

        const url = new URL('http://localhost:4321/api/scores/history')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(500)
        expect(result).toEqual({ error: 'Internal server error' })
    })

    it('should handle edge case limits correctly', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        vi.mocked(getUserGameHistory).mockResolvedValue([])

        const testCases = [
            { limit: '1', expected: 1 },
            { limit: '100', expected: 100 },
            { limit: '50', expected: 50 },
        ]

        for (const { limit, expected } of testCases) {
            vi.clearAllMocks()

            const url = new URL(
                `http://localhost:4321/api/scores/history?limit=${limit}`
            )
            const request = new Request(url)

            // Act
            const response = await GET({ request, url })

            // Assert
            expect(response.status).toBe(200)
            expect(getUserGameHistory).toHaveBeenCalledWith(
                'user-123',
                expected
            )
        }
    })
})
