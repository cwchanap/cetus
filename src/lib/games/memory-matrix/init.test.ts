import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initMemoryMatrixGame } from './init'

// Mock saveGameScore to avoid network calls
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

describe('initMemoryMatrixGame', () => {
    beforeEach(() => {
        // Set up required DOM elements
        const container = document.createElement('div')
        container.id = 'memory-matrix-container'
        document.body.appendChild(container)

        const memoryBoard = document.createElement('div')
        memoryBoard.id = 'memory-board'
        document.body.appendChild(memoryBoard)
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.clearAllMocks()
    })

    describe('initialization', () => {
        it('should return a game instance object', async () => {
            const instance = await initMemoryMatrixGame()
            expect(instance).toBeDefined()
            expect(typeof instance.restart).toBe('function')
            expect(typeof instance.getState).toBe('function')
            expect(typeof instance.getStats).toBe('function')
            expect(typeof instance.endGame).toBe('function')
            expect(typeof instance.cleanup).toBe('function')
        })

        it('should initialize game state with correct defaults', async () => {
            const instance = await initMemoryMatrixGame()
            const state = instance.getState()
            expect(state.score).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.gameOver).toBe(false)
        })

        it('should initialize game stats', async () => {
            const instance = await initMemoryMatrixGame()
            const stats = instance.getStats()
            expect(stats.matchesFound).toBe(0)
            expect(stats.totalAttempts).toBe(0)
        })

        it('should handle multiple initializations (cleanup previous)', async () => {
            // First init
            await initMemoryMatrixGame()
            // Second init should clean up the first without throwing
            await expect(initMemoryMatrixGame()).resolves.toBeDefined()
        })

        it('should accept optional callbacks', async () => {
            const onGameComplete = vi.fn()
            const instance = await initMemoryMatrixGame({ onGameComplete })
            expect(instance).toBeDefined()
        })
    })

    describe('returned game instance methods', () => {
        it('restart() should reset game state', async () => {
            const instance = await initMemoryMatrixGame()
            expect(() => instance.restart()).not.toThrow()
            const state = instance.getState()
            expect(state.score).toBe(0)
        })

        it('getState() should return current game state', async () => {
            const instance = await initMemoryMatrixGame()
            const state = instance.getState()
            expect(state).toHaveProperty('board')
            expect(state).toHaveProperty('score')
            expect(state).toHaveProperty('timeLeft')
        })

        it('getStats() should return current game stats', async () => {
            const instance = await initMemoryMatrixGame()
            const stats = instance.getStats()
            expect(stats).toHaveProperty('matchesFound')
            expect(stats).toHaveProperty('totalAttempts')
            expect(stats).toHaveProperty('accuracy')
        })

        it('endGame() should end the game early', async () => {
            const instance = await initMemoryMatrixGame()
            expect(() => instance.endGame()).not.toThrow()
        })

        it('cleanup() should clean up resources', async () => {
            const instance = await initMemoryMatrixGame()
            expect(() => instance.cleanup()).not.toThrow()
        })
    })

    describe('game controls', () => {
        it('should wire up start button click when it exists', async () => {
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            document.body.appendChild(startBtn)

            const instance = await initMemoryMatrixGame()

            startBtn.click()
            // After click, game should be started
            const state = instance.getState()
            expect(state.gameStarted).toBe(true)
        })

        it('should not start game if already started when start btn clicked again', async () => {
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            document.body.appendChild(startBtn)

            await initMemoryMatrixGame()
            startBtn.click()
            startBtn.click() // Second click should be ignored
            expect(startBtn.disabled).toBe(true)
        })

        it('should wire up reset button click when it exists', async () => {
            const resetBtn = document.createElement('button')
            resetBtn.id = 'reset-btn'
            document.body.appendChild(resetBtn)

            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            document.body.appendChild(startBtn)

            await initMemoryMatrixGame()
            expect(() => resetBtn.click()).not.toThrow()
        })

        it('should respond to memory-matrix-restart event', async () => {
            await initMemoryMatrixGame()
            const event = new CustomEvent('memory-matrix-restart')
            expect(() => window.dispatchEvent(event)).not.toThrow()
        })
    })

    describe('game end callback', () => {
        it('should call onGameComplete when provided and game ends', async () => {
            const onGameComplete = vi.fn().mockResolvedValue(undefined)
            const instance = await initMemoryMatrixGame({ onGameComplete })
            instance.endGame()

            // Wait for async callback
            await vi.waitFor(() => {
                expect(onGameComplete).toHaveBeenCalled()
            })
        })

        it('should reset start button state after game ends', async () => {
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            startBtn.disabled = true
            document.body.appendChild(startBtn)

            const instance = await initMemoryMatrixGame()
            instance.endGame()

            await vi.waitFor(() => {
                expect(startBtn.disabled).toBe(false)
                expect(startBtn.textContent).toBe('Start Game')
            })
        })

        it('should fall back to saveScore when no onGameComplete provided', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )

            const instance = await initMemoryMatrixGame()
            instance.endGame()

            await vi.waitFor(() => {
                expect(vi.mocked(saveGameScore)).toHaveBeenCalled()
            })
        })
    })

    describe('restart after cleanup', () => {
        it('cleanup() then calling methods should be handled gracefully', async () => {
            const instance = await initMemoryMatrixGame()
            instance.cleanup()
            // After cleanup, the module-level game is null
            // Re-initializing should work
            const newInstance = await initMemoryMatrixGame()
            expect(newInstance).toBeDefined()
        })
    })
})
