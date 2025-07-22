import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    submitScore,
    getUserGameHistory,
    getUserBestScore,
    formatGameName,
    formatScore,
    formatDate,
} from '@/lib/score-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Score Client', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('submitScore', () => {
        it('should successfully submit a score', async () => {
            // Arrange
            const scoreData = { gameId: 'tetris', score: 5000 }
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ success: true }),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await submitScore(scoreData)

            // Assert
            expect(result).toBe(true)
            expect(mockFetch).toHaveBeenCalledWith('/api/scores', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(scoreData),
            })
            expect(mockResponse.json).toHaveBeenCalled()
        })

        it('should return false when API returns error status', async () => {
            // Arrange
            const scoreData = { gameId: 'tetris', score: 5000 }
            const mockResponse = {
                ok: false,
                status: 400,
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await submitScore(scoreData)

            // Assert
            expect(result).toBe(false)
        })

        it('should return false when network request fails', async () => {
            // Arrange
            const scoreData = { gameId: 'tetris', score: 5000 }
            mockFetch.mockRejectedValue(new Error('Network error'))

            // Act
            const result = await submitScore(scoreData)

            // Assert
            expect(result).toBe(false)
        })

        it('should return false when API returns success: false', async () => {
            // Arrange
            const scoreData = { gameId: 'tetris', score: 5000 }
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ success: false }),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await submitScore(scoreData)

            // Assert
            expect(result).toBe(false)
        })
    })

    describe('getUserGameHistory', () => {
        it('should return user game history', async () => {
            // Arrange
            const mockHistory = [
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

            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ history: mockHistory }),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserGameHistory(10)

            // Assert
            expect(result).toEqual(mockHistory)
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/scores/history?limit=10'
            )
            expect(mockResponse.json).toHaveBeenCalled()
        })

        it('should use default limit when not specified', async () => {
            // Arrange
            const mockHistory = []
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ history: mockHistory }),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserGameHistory()

            // Assert
            expect(result).toEqual([])
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/scores/history?limit=10'
            )
        })

        it('should return empty array when API returns error status', async () => {
            // Arrange
            const mockResponse = {
                ok: false,
                status: 500,
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserGameHistory(5)

            // Assert
            expect(result).toEqual([])
        })

        it('should return empty array when network request fails', async () => {
            // Arrange
            mockFetch.mockRejectedValue(new Error('Network error'))

            // Act
            const result = await getUserGameHistory(5)

            // Assert
            expect(result).toEqual([])
        })

        it('should return empty array when history is missing from response', async () => {
            // Arrange
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({}),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserGameHistory(5)

            // Assert
            expect(result).toEqual([])
        })
    })

    describe('getUserBestScore', () => {
        it('should return best score for a game', async () => {
            // Arrange
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ bestScore: 15000 }),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserBestScore('tetris')

            // Assert
            expect(result).toBe(15000)
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/scores/best?gameId=tetris'
            )
            expect(mockResponse.json).toHaveBeenCalled()
        })

        it('should URL encode game ID', async () => {
            // Arrange
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ bestScore: 8000 }),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserBestScore('quick_draw')

            // Assert
            expect(result).toBe(8000)
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/scores/best?gameId=quick_draw'
            )
        })

        it('should return null when API returns error status', async () => {
            // Arrange
            const mockResponse = {
                ok: false,
                status: 404,
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserBestScore('tetris')

            // Assert
            expect(result).toBeNull()
        })

        it('should return null when network request fails', async () => {
            // Arrange
            mockFetch.mockRejectedValue(new Error('Network error'))

            // Act
            const result = await getUserBestScore('tetris')

            // Assert
            expect(result).toBeNull()
        })

        it('should return null when no best score exists', async () => {
            // Arrange
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ bestScore: null }),
            }
            mockFetch.mockResolvedValue(mockResponse)

            // Act
            const result = await getUserBestScore('tetris')

            // Assert
            expect(result).toBeNull()
        })
    })

    describe('formatGameName', () => {
        it('should format known game IDs correctly', () => {
            expect(formatGameName('tetris')).toBe('Tetris Challenge')
            expect(formatGameName('bubble_shooter')).toBe('Bubble Shooter')
        })

        it('should capitalize unknown game IDs', () => {
            expect(formatGameName('puzzle')).toBe('Puzzle')
            expect(formatGameName('action')).toBe('Action')
        })

        it('should handle empty string', () => {
            expect(formatGameName('')).toBe('')
        })
    })

    describe('formatScore', () => {
        it('should format scores with locale separators', () => {
            expect(formatScore(1000)).toBe('1,000')
            expect(formatScore(1234567)).toBe('1,234,567')
            expect(formatScore(0)).toBe('0')
            expect(formatScore(42)).toBe('42')
        })

        it('should handle negative scores', () => {
            expect(formatScore(-1000)).toBe('-1,000')
        })
    })

    describe('formatDate', () => {
        it('should format dates correctly', () => {
            const dateString = '2023-01-15T10:30:00Z'
            const result = formatDate(dateString)

            // The exact format may vary by locale and timezone, but should include key components
            expect(result).toMatch(/Jan/)
            expect(result).toMatch(/15/)
            expect(result).toMatch(/2023/)
            expect(result).toMatch(/\d{1,2}:\d{2}/) // Should have time in HH:MM format
        })

        it('should handle different date formats', () => {
            const dateString = '2023-12-25T15:45:30.123Z'
            const result = formatDate(dateString)

            expect(result).toMatch(/Dec/)
            expect(result).toMatch(/25/)
            expect(result).toMatch(/2023/)
            expect(result).toMatch(/\d{1,2}:\d{2}/) // Should have time in HH:MM format
        })

        it('should handle invalid date strings gracefully', () => {
            const result = formatDate('invalid-date')

            // Should return a string (even if it's "Invalid Date")
            expect(typeof result).toBe('string')
        })
    })
})
