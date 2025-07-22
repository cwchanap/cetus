import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    submitScore,
    saveGameScore,
    getUserGameHistory,
    getUserBestScore,
    formatGameName,
    formatScore,
    formatDate,
} from './scoreService'

// Mock fetch globally
global.fetch = vi.fn()

// Mock window object for AchievementAward tests
const mockWindow = {
    showAchievementAward: vi.fn(),
}

describe('Score Service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset the mock function
        mockWindow.showAchievementAward = vi.fn()
        // Setup window mock
        global.window = mockWindow as any
    })

    describe('submitScore', () => {
        it('should submit score successfully and return achievements', async () => {
            const mockResponse = {
                success: true,
                newAchievements: [
                    {
                        id: 'first_score',
                        name: 'First Score',
                        description: 'Earned your first score',
                        icon: 'trophy',
                    },
                ],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const result = await submitScore({ gameId: 'tetris', score: 1000 })

            expect(result.success).toBe(true)
            expect(result.newAchievements).toHaveLength(1)
            expect(result.newAchievements?.[0].name).toBe('First Score')
        })

        it('should handle 401 unauthorized error', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: () => Promise.resolve('Unauthorized'),
            })

            const result = await submitScore({ gameId: 'tetris', score: 1000 })

            expect(result.success).toBe(false)
            expect(result.error).toBe('You must be logged in to save scores')
        })

        it('should handle 400 bad request error', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                text: () => Promise.resolve('Bad Request'),
            })

            const result = await submitScore({ gameId: 'tetris', score: 1000 })

            expect(result.success).toBe(false)
            expect(result.error).toBe('Invalid score data')
        })

        it('should handle network errors', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

            const result = await submitScore({ gameId: 'tetris', score: 1000 })

            expect(result.success).toBe(false)
            expect(result.error).toBe('Network error occurred')
        })
    })

    describe('saveGameScore', () => {
        it('should not save score if score is 0 or negative', async () => {
            const onSuccess = vi.fn()
            const onError = vi.fn()

            await saveGameScore('tetris', 0, onSuccess, onError)

            expect(onSuccess).not.toHaveBeenCalled()
            expect(onError).not.toHaveBeenCalled()
            expect(global.fetch).not.toHaveBeenCalled()
        })

        it('should call onSuccess when score is saved successfully', async () => {
            const mockResponse = {
                success: true,
                newAchievements: [],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const onSuccess = vi.fn()
            const onError = vi.fn()

            await saveGameScore('tetris', 1000, onSuccess, onError)

            expect(onSuccess).toHaveBeenCalledWith({
                success: true,
                newAchievements: [],
            })
            expect(onError).not.toHaveBeenCalled()
        })

        it('should call onError when score saving fails', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Server Error'),
            })

            const onSuccess = vi.fn()
            const onError = vi.fn()

            await saveGameScore('tetris', 1000, onSuccess, onError)

            expect(onSuccess).not.toHaveBeenCalled()
            expect(onError).toHaveBeenCalledWith('Failed to save score')
        })
    })

    describe('getUserGameHistory', () => {
        it('should fetch user game history successfully', async () => {
            const mockHistory = [
                {
                    game_id: 'tetris',
                    game_name: 'Tetris Challenge',
                    score: 1000,
                    created_at: '2023-01-01T00:00:00Z',
                },
            ]

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ history: mockHistory }),
            })

            const result = await getUserGameHistory(10)

            expect(result).toEqual(mockHistory)
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/scores/history?limit=10'
            )
        })

        it('should return empty array on error', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

            const result = await getUserGameHistory(10)

            expect(result).toEqual([])
        })
    })

    describe('getUserBestScore', () => {
        it('should fetch user best score successfully', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ bestScore: 1500 }),
            })

            const result = await getUserBestScore('tetris')

            expect(result).toBe(1500)
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/scores/best?gameId=tetris'
            )
        })

        it('should return null on error', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

            const result = await getUserBestScore('tetris')

            expect(result).toBeNull()
        })
    })

    describe('formatGameName', () => {
        it('should format game names correctly', () => {
            expect(formatGameName('tetris')).toBe('Tetris Challenge')
            expect(formatGameName('quick_math')).toBe('Quick Math')
            expect(formatGameName('bubble_shooter')).toBe('Bubble Shooter')
            expect(formatGameName('memory_matrix')).toBe('Memory Matrix')
            expect(formatGameName('unknown_game')).toBe('Unknown_game')
        })
    })

    describe('formatScore', () => {
        it('should format scores with locale string', () => {
            expect(formatScore(1000)).toBe('1,000')
            expect(formatScore(1234567)).toBe('1,234,567')
            expect(formatScore(42)).toBe('42')
        })
    })

    describe('formatDate', () => {
        it('should format dates correctly', () => {
            const result = formatDate('2023-01-15T10:30:00Z')
            expect(result).toMatch(/Jan 15, 2023/)
        })
    })

    describe('AchievementAward Integration', () => {
        it('should call showAchievementAward when achievements are earned', async () => {
            const mockResponse = {
                success: true,
                newAchievements: [
                    {
                        id: 'tetris_novice',
                        name: 'Tetris Novice',
                        description: 'Score 100 points in Tetris',
                        icon: '🔰',
                        rarity: 'common',
                    },
                ],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const onSuccess = vi.fn()

            await saveGameScore('tetris', 150, onSuccess)

            expect(mockWindow.showAchievementAward).toHaveBeenCalledWith(
                mockResponse.newAchievements
            )
            expect(onSuccess).toHaveBeenCalledWith(mockResponse)
        })

        it('should not call showAchievementAward when no achievements are earned', async () => {
            const mockResponse = {
                success: true,
                newAchievements: [],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const onSuccess = vi.fn()
            await saveGameScore('tetris', 50, onSuccess)

            expect(mockWindow.showAchievementAward).not.toHaveBeenCalled()
            expect(onSuccess).toHaveBeenCalledWith(mockResponse)
        })

        it('should handle multiple achievements correctly', async () => {
            const mockResponse = {
                success: true,
                newAchievements: [
                    {
                        id: 'tetris_novice',
                        name: 'Tetris Novice',
                        description: 'Score 100 points in Tetris',
                        icon: '🔰',
                        rarity: 'common',
                    },
                    {
                        id: 'tetris_apprentice',
                        name: 'Tetris Apprentice',
                        description: 'Score 250 points in Tetris',
                        icon: '⭐',
                        rarity: 'common',
                    },
                ],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const onSuccess = vi.fn()
            await saveGameScore('tetris', 300, onSuccess)

            expect(mockWindow.showAchievementAward).toHaveBeenCalledWith(
                mockResponse.newAchievements
            )
            expect(mockResponse.newAchievements).toHaveLength(2)
        })

        it('should work without window.showAchievementAward available', async () => {
            // Remove showAchievementAward from window
            delete (global.window as any).showAchievementAward

            const mockResponse = {
                success: true,
                newAchievements: [
                    {
                        id: 'tetris_novice',
                        name: 'Tetris Novice',
                        description: 'Score 100 points in Tetris',
                        icon: '🔰',
                        rarity: 'common',
                    },
                ],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const onSuccess = vi.fn()

            // Should not throw error even without showAchievementAward
            await expect(
                saveGameScore('tetris', 150, onSuccess)
            ).resolves.toBeUndefined()
            expect(onSuccess).toHaveBeenCalledWith(mockResponse)
        })

        it('should work in non-browser environment', async () => {
            // Remove window object
            delete (global as any).window

            const mockResponse = {
                success: true,
                newAchievements: [
                    {
                        id: 'tetris_novice',
                        name: 'Tetris Novice',
                        description: 'Score 100 points in Tetris',
                        icon: '🔰',
                        rarity: 'common',
                    },
                ],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const onSuccess = vi.fn()

            // Should not throw error even without window
            await expect(
                saveGameScore('tetris', 150, onSuccess)
            ).resolves.toBeUndefined()
            expect(onSuccess).toHaveBeenCalledWith(mockResponse)
        })

        it('should handle different rarity achievements', async () => {
            const mockResponse = {
                success: true,
                newAchievements: [
                    {
                        id: 'tetris_master',
                        name: 'Tetris Master',
                        description: 'Score 1000 points in Tetris',
                        icon: '👑',
                        rarity: 'epic',
                    },
                ],
            }

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            })

            const onSuccess = vi.fn()
            await saveGameScore('tetris', 1200, onSuccess)

            expect(mockWindow.showAchievementAward).toHaveBeenCalledWith(
                mockResponse.newAchievements
            )
            expect(mockResponse.newAchievements[0].rarity).toBe('epic')
        })
    })
})
