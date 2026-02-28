import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/pages/api/scores'
import { saveGameScoreWithAchievements } from '@/lib/server/db/queries'
import { getGameById } from '@/lib/games'
import { AchievementRarity } from '@/lib/achievements'
import { auth } from '@/lib/auth'
import { updateChallengeProgress } from '@/lib/services/challengeService'

// Mock dependencies
vi.mock('@/lib/server/db/queries', () => ({
    saveGameScoreWithAchievements: vi.fn(),
}))

vi.mock('@/lib/games', async importOriginal => {
    const actual = await importOriginal()
    return {
        ...actual,
        getGameById: vi.fn(),
    }
})

vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: vi.fn(),
        },
    },
}))

vi.mock('@/lib/services/challengeService', () => ({
    updateChallengeProgress: vi.fn().mockResolvedValue({
        completedChallenges: [],
        xpEarned: 0,
        levelUp: false,
    }),
}))

describe('POST /api/scores', () => {
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

    it('should successfully save a score for authenticated user', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(saveGameScoreWithAchievements).mockResolvedValue({
            success: true,
            newAchievements: ['tetris_welcome'],
        })

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'tetris',
                score: 5000,
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(200)
        expect(result).toEqual({
            success: true,
            newAchievements: [
                {
                    id: 'tetris_welcome',
                    name: 'First Drop',
                    description:
                        'Welcome to Tetris! You scored your first points.',
                    icon: '🎮',
                    rarity: AchievementRarity.COMMON,
                },
            ],
        })
        expect(getGameById).toHaveBeenCalledWith('tetris')
        expect(saveGameScoreWithAchievements).toHaveBeenCalledWith(
            'user-123',
            'tetris',
            5000,
            undefined
        )
    })

    it('should return 401 for unauthenticated user', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(null)

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'tetris',
                score: 5000,
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(401)
        expect(result).toEqual({ error: 'Unauthorized' })
        expect(getGameById).not.toHaveBeenCalled()
        expect(saveGameScoreWithAchievements).not.toHaveBeenCalled()
    })

    it('should return 400 for missing gameId', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                score: 5000,
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result.error).toBeDefined()
        expect(getGameById).not.toHaveBeenCalled()
        expect(saveGameScoreWithAchievements).not.toHaveBeenCalled()
    })

    it('should return 400 for missing score', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'tetris',
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result.error).toBeDefined()
        expect(getGameById).not.toHaveBeenCalled()
        expect(saveGameScoreWithAchievements).not.toHaveBeenCalled()
    })

    it('should return 400 for invalid score type', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'tetris',
                score: 'invalid',
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(400)
        expect(result.error).toBeDefined()
        expect(getGameById).not.toHaveBeenCalled()
        expect(saveGameScoreWithAchievements).not.toHaveBeenCalled()
    })

    it('should return 400 for invalid game ID', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'invalid-game',
                score: 5000,
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert - Zod validates against game ID enum, so invalid IDs are caught during validation
        // before getGameById is called
        expect(response.status).toBe(400)
        expect(result.error).toBeDefined()
        expect(getGameById).not.toHaveBeenCalled()
        expect(saveGameScoreWithAchievements).not.toHaveBeenCalled()
    })

    it('should return 500 when save fails', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(saveGameScoreWithAchievements).mockResolvedValue({
            success: false,
            newAchievements: [],
        })

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'tetris',
                score: 5000,
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(500)
        expect(result).toEqual({ error: 'Failed to save score' })
        expect(getGameById).toHaveBeenCalledWith('tetris')
        expect(saveGameScoreWithAchievements).toHaveBeenCalledWith(
            'user-123',
            'tetris',
            5000,
            undefined
        )
    })

    it('should return 500 for database errors', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockImplementation(() => {
            throw new Error('Database error')
        })

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'tetris',
                score: 5000,
            }),
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert
        expect(response.status).toBe(500)
        expect(result).toEqual({ error: 'Internal server error' })
    })

    it('should return 400 for malformed JSON', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: 'invalid json',
        })

        // Act
        const response = await POST({ request })
        const result = await response.json()

        // Assert - Zod validation catches malformed JSON and returns 400
        expect(response.status).toBe(400)
        expect(result).toEqual({ error: 'Invalid JSON body' })
    })

    it('should return 400 when getGameById returns null', async () => {
        // Arrange: pass a valid GameID enum value but mock getGameById to return null
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(null)

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: 'tetris', score: 1000 }),
        })

        const response = await POST({ request })
        const result = await response.json()

        expect(response.status).toBe(400)
        expect(result.error).toBe('Invalid game ID')
        expect(saveGameScoreWithAchievements).not.toHaveBeenCalled()
    })

    it('should include challengeUpdates when challenges are completed', async () => {
        // Arrange
        vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
        const { getGameById } = await import('@/lib/games')
        vi.mocked(getGameById).mockReturnValue(mockGame)
        vi.mocked(saveGameScoreWithAchievements).mockResolvedValue({
            success: true,
            newAchievements: [],
        })
        vi.mocked(updateChallengeProgress).mockResolvedValueOnce({
            completedChallenges: [
                {
                    id: 'c1',
                    name: 'First Win',
                    description: 'Win once',
                    icon: '🏆',
                    xpReward: 100,
                },
            ],
            xpEarned: 100,
            levelUp: true,
            newLevel: 2,
        })

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: 'tetris', score: 9999 }),
        })

        const response = await POST({ request })
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.challengeUpdates).toBeDefined()
        expect(result.challengeUpdates.completedChallenges).toHaveLength(1)
        expect(result.challengeUpdates.xpEarned).toBe(100)
        expect(result.challengeUpdates.levelUp).toBe(true)
        expect(result.challengeUpdates.newLevel).toBe(2)
    })

    it('should continue and return success even when updateChallengeProgress throws', async () => {
        vi.mocked(saveGameScoreWithAchievements).mockResolvedValue({
            success: true,
            newAchievements: [],
        })
        vi.mocked(updateChallengeProgress).mockRejectedValueOnce(
            new Error('Challenge service unavailable')
        )

        const request = new Request('http://localhost:4321/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: 'tetris', score: 500 }),
        })

        const response = await POST({ request })
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.success).toBe(true)
    })
})
