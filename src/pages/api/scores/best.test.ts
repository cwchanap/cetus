import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/pages/api/scores/best'
import { getUserBestScoreByGame } from '@/lib/db/queries'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/lib/db/queries', () => ({
    getUserBestScoreByGame: vi.fn(),
}))

vi.mock('@/lib/games', () => ({
    getGameById: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: vi.fn(),
        },
    },
}))

describe('GET /api/scores/best', () => {
    const mockUser = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
    }

    const mockSession = {
        user: mockUser,
        id: 'session-123',
    }

    const mockGame = {
        id: 'tetris',
        name: 'Tetris Challenge',
        description: 'Classic block-stacking puzzle game',
        created_at: new Date(),
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return best score for authenticated user and valid game', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(getUserBestScoreByGame).mockResolvedValue(15000)

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=tetris'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ bestScore: 15000 })
        expect(getGameById).toHaveBeenCalledWith('tetris')
        expect(getUserBestScoreByGame).toHaveBeenCalledWith(
            'user-123',
            'tetris'
        )
    })

    it('should return null when user has no scores for the game', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(getUserBestScoreByGame).mockResolvedValue(null)

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=tetris'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ bestScore: null })
        expect(getGameById).toHaveBeenCalledWith('tetris')
        expect(getUserBestScoreByGame).toHaveBeenCalledWith(
            'user-123',
            'tetris'
        )
    })

    it('should return 401 for unauthenticated user', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(null)

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=tetris'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(401)
        expect(result).toEqual({ error: 'Unauthorized' })
        expect(getGameById).not.toHaveBeenCalled()
        expect(getUserBestScoreByGame).not.toHaveBeenCalled()
    })

    it('should return 400 for missing gameId parameter', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const url = new URL('http://localhost:4321/api/scores/best')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Missing gameId parameter' })
        expect(getGameById).not.toHaveBeenCalled()
        expect(getUserBestScoreByGame).not.toHaveBeenCalled()
    })

    it('should return 400 for empty gameId parameter', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const url = new URL('http://localhost:4321/api/scores/best?gameId=')
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Missing gameId parameter' })
        expect(getGameById).not.toHaveBeenCalled()
        expect(getUserBestScoreByGame).not.toHaveBeenCalled()
    })

    it('should return 400 for invalid game ID', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(null)

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=invalid-game'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Invalid game ID' })
        expect(getGameById).toHaveBeenCalledWith('invalid-game')
        expect(getUserBestScoreByGame).not.toHaveBeenCalled()
    })

    it('should handle URL encoded gameId parameters', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(getUserBestScoreByGame).mockResolvedValue(8000)

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=quick_draw'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ bestScore: 8000 })
        expect(getGameById).toHaveBeenCalledWith('quick_draw')
        expect(getUserBestScoreByGame).toHaveBeenCalledWith(
            'user-123',
            'quick_draw'
        )
    })

    it('should return 500 for database errors during game lookup', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockImplementation(() => {
            throw new Error('Database error')
        })

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=tetris'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(500)
        expect(result).toEqual({ error: 'Internal server error' })
    })

    it('should return 500 for database errors during score lookup', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(getUserBestScoreByGame).mockRejectedValue(
            new Error('Database error')
        )

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=tetris'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(500)
        expect(result).toEqual({ error: 'Internal server error' })
    })

    it('should handle authentication errors', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockRejectedValue(
            new Error('Auth error')
        )

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=tetris'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(500)
        expect(result).toEqual({ error: 'Internal server error' })
    })

    it('should handle multiple valid game IDs', async () => {
        // Arrange
        const gameIds = ['tetris', 'quick_draw']
        const expectedScores = [15000, 8000]

        for (let i = 0; i < gameIds.length; i++) {
            vi.clearAllMocks()

            vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
            vi.mocked(getGameById).mockResolvedValue({
                ...mockGame,
                id: gameIds[i],
            })
            vi.mocked(getUserBestScoreByGame).mockResolvedValue(
                expectedScores[i]
            )

            const url = new URL(
                `http://localhost:4321/api/scores/best?gameId=${gameIds[i]}`
            )
            const request = new Request(url)

            // Act
            const response = await GET({ request, url })
            const result = await response.json()

            // Assert
            expect(response.status).toBe(200)
            expect(result).toEqual({ bestScore: expectedScores[i] })
            expect(getGameById).toHaveBeenCalledWith(gameIds[i])
            expect(getUserBestScoreByGame).toHaveBeenCalledWith(
                'user-123',
                gameIds[i]
            )
        }
    })

    it('should handle zero scores correctly', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(getUserBestScoreByGame).mockResolvedValue(0)

        const url = new URL(
            'http://localhost:4321/api/scores/best?gameId=tetris'
        )
        const request = new Request(url)

        // Act
        const response = await GET({ request, url })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({ bestScore: 0 })
        expect(getGameById).toHaveBeenCalledWith('tetris')
        expect(getUserBestScoreByGame).toHaveBeenCalledWith(
            'user-123',
            'tetris'
        )
    })
})
