import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/pages/api/scores'
import { saveGameScore, getGameById } from '@/lib/db/queries'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/lib/db/queries', () => ({
  saveGameScore: vi.fn(),
  getGameById: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
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
    vi.mocked(getGameById).mockResolvedValue(mockGame)
    vi.mocked(saveGameScore).mockResolvedValue(true)

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
    expect(result).toEqual({ success: true })
    expect(getGameById).toHaveBeenCalledWith('tetris')
    expect(saveGameScore).toHaveBeenCalledWith('user-123', 'tetris', 5000)
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
    expect(saveGameScore).not.toHaveBeenCalled()
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
    expect(result).toEqual({ error: 'Invalid data' })
    expect(getGameById).not.toHaveBeenCalled()
    expect(saveGameScore).not.toHaveBeenCalled()
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
    expect(result).toEqual({ error: 'Invalid data' })
    expect(getGameById).not.toHaveBeenCalled()
    expect(saveGameScore).not.toHaveBeenCalled()
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
    expect(result).toEqual({ error: 'Invalid data' })
    expect(getGameById).not.toHaveBeenCalled()
    expect(saveGameScore).not.toHaveBeenCalled()
  })

  it('should return 400 for invalid game ID', async () => {
    // Arrange
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
    vi.mocked(getGameById).mockResolvedValue(null)

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

    // Assert
    expect(response.status).toBe(400)
    expect(result).toEqual({ error: 'Invalid game ID' })
    expect(getGameById).toHaveBeenCalledWith('invalid-game')
    expect(saveGameScore).not.toHaveBeenCalled()
  })

  it('should return 500 when save fails', async () => {
    // Arrange
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
    vi.mocked(getGameById).mockResolvedValue(mockGame)
    vi.mocked(saveGameScore).mockResolvedValue(false)

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
    expect(saveGameScore).toHaveBeenCalledWith('user-123', 'tetris', 5000)
  })

  it('should return 500 for database errors', async () => {
    // Arrange
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession)
    vi.mocked(getGameById).mockRejectedValue(new Error('Database error'))

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

  it('should return 500 for malformed JSON', async () => {
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

    // Assert
    expect(response.status).toBe(500)
    expect(result).toEqual({ error: 'Internal server error' })
  })
})
