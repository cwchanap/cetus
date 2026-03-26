import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initMemoryMatrixGame } from './init'
import { testMemoryMatrixGame } from './test'

// Mock saveGameScore to avoid network calls
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Spy wrappers so individual tests can access/manipulate instances
vi.mock('./game', async importOriginal => {
    const actual = await importOriginal<typeof import('./game')>()
    return {
        ...actual,
        MemoryMatrixGame: vi
            .fn()
            .mockImplementation(() => new actual.MemoryMatrixGame()),
    }
})

vi.mock('./renderer', async importOriginal => {
    const actual = await importOriginal<typeof import('./renderer')>()
    return {
        ...actual,
        MemoryMatrixRenderer: vi
            .fn()
            .mockImplementation(
                (...args: [string]) => new actual.MemoryMatrixRenderer(...args)
            ),
    }
})

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

    describe('null guard errors after cleanup', () => {
        it('restart() should throw when game has been cleaned up', async () => {
            const instance = await initMemoryMatrixGame()
            instance.cleanup()
            expect(() => instance.restart()).toThrow(
                'Memory Matrix game has been cleaned up'
            )
        })

        it('getState() should throw when game has been cleaned up', async () => {
            const instance = await initMemoryMatrixGame()
            instance.cleanup()
            expect(() => instance.getState()).toThrow(
                'Memory Matrix game has been cleaned up'
            )
        })

        it('getStats() should throw when game has been cleaned up', async () => {
            const instance = await initMemoryMatrixGame()
            instance.cleanup()
            expect(() => instance.getStats()).toThrow(
                'Memory Matrix game has been cleaned up'
            )
        })

        it('endGame() should throw when game has been cleaned up', async () => {
            const instance = await initMemoryMatrixGame()
            instance.cleanup()
            expect(() => instance.endGame()).toThrow(
                'Memory Matrix game has been cleaned up'
            )
        })
    })

    describe('beforeunload handler', () => {
        it('should call cleanup when window beforeunload fires', async () => {
            await initMemoryMatrixGame()
            expect(() =>
                window.dispatchEvent(new Event('beforeunload'))
            ).not.toThrow()
            // After beforeunload cleanup, re-initialization should work
            const newInstance = await initMemoryMatrixGame()
            expect(newInstance).toBeDefined()
        })
    })

    describe('game end callback error handling', () => {
        it('should log error when onGameComplete callback throws', async () => {
            const onGameComplete = vi
                .fn()
                .mockRejectedValue(new Error('callback error'))
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            const instance = await initMemoryMatrixGame({ onGameComplete })
            instance.endGame()

            await vi.waitFor(() => {
                expect(errorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Error in game end callback'),
                    expect.any(Error)
                )
            })

            errorSpy.mockRestore()
        })
    })

    describe('saveScore achievement dispatch', () => {
        it('should dispatch achievementsEarned when saveGameScore returns achievements', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, onSuccess) => {
                    onSuccess?.({ newAchievements: ['memory_master'] })
                    return { success: true }
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            const instance = await initMemoryMatrixGame()
            instance.endGame()

            await vi.waitFor(() => {
                const achievementEvents = dispatchSpy.mock.calls.filter(
                    call =>
                        call[0] instanceof CustomEvent &&
                        (call[0] as CustomEvent).type === 'achievementsEarned'
                )
                expect(achievementEvents.length).toBeGreaterThan(0)
            })
        })

        it('should log error when saveGameScore onError is called', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, _onSuccess, onError) => {
                    onError?.(new Error('save failed'))
                    return { success: false }
                }
            )
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            const instance = await initMemoryMatrixGame()
            instance.endGame()

            await vi.waitFor(() => {
                expect(errorSpy).toHaveBeenCalledWith(
                    '[MemoryMatrix] Failed to save score:',
                    expect.any(Error)
                )
            })
            errorSpy.mockRestore()
        })
    })

    describe('destroy throw on re-initialization', () => {
        it('should log warn when previous game.destroy() throws during re-init', async () => {
            const { MemoryMatrixGame } = await import('./game')

            // First init
            await initMemoryMatrixGame()

            // Make the existing game instance's destroy throw
            const prevGameInst =
                vi.mocked(MemoryMatrixGame).mock.results[
                    vi.mocked(MemoryMatrixGame).mock.results.length - 1
                ]?.value
            if (prevGameInst) {
                vi.spyOn(prevGameInst, 'destroy').mockImplementationOnce(() => {
                    throw new Error('game destroy failed')
                })
            }

            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})
            // Second init triggers cleanup of the first game
            await initMemoryMatrixGame()
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to destroy previous game'),
                expect.any(Error)
            )
            warnSpy.mockRestore()
        })

        it('should log warn when previous renderer.destroy() throws during re-init', async () => {
            const { MemoryMatrixRenderer } = await import('./renderer')

            await initMemoryMatrixGame()

            const prevRendererInst =
                vi.mocked(MemoryMatrixRenderer).mock.results[
                    vi.mocked(MemoryMatrixRenderer).mock.results.length - 1
                ]?.value
            if (prevRendererInst) {
                vi.spyOn(prevRendererInst, 'destroy').mockImplementationOnce(
                    () => {
                        throw new Error('renderer destroy failed')
                    }
                )
            }

            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})
            await initMemoryMatrixGame()
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to destroy previous renderer'),
                expect.any(Error)
            )
            warnSpy.mockRestore()
        })
    })

    describe('cleanup destroy throw', () => {
        it('should log warn when game.destroy() throws during cleanup()', async () => {
            const { MemoryMatrixGame } = await import('./game')

            const instance = await initMemoryMatrixGame()

            const gameInst =
                vi.mocked(MemoryMatrixGame).mock.results[
                    vi.mocked(MemoryMatrixGame).mock.results.length - 1
                ]?.value
            if (gameInst) {
                vi.spyOn(gameInst, 'destroy').mockImplementationOnce(() => {
                    throw new Error('cleanup game destroy failed')
                })
            }

            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})
            instance.cleanup()
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to destroy game'),
                expect.any(Error)
            )
            warnSpy.mockRestore()
        })

        it('should log warn when renderer.destroy() throws during cleanup()', async () => {
            const { MemoryMatrixRenderer } = await import('./renderer')

            const instance = await initMemoryMatrixGame()

            const rendererInst =
                vi.mocked(MemoryMatrixRenderer).mock.results[
                    vi.mocked(MemoryMatrixRenderer).mock.results.length - 1
                ]?.value
            if (rendererInst) {
                vi.spyOn(rendererInst, 'destroy').mockImplementationOnce(() => {
                    throw new Error('cleanup renderer destroy failed')
                })
            }

            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})
            instance.cleanup()
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to destroy renderer'),
                expect.any(Error)
            )
            warnSpy.mockRestore()
        })
    })

    describe('renderer card click callback', () => {
        it('should call game.flipCard when renderer card click callback is invoked', async () => {
            const { MemoryMatrixGame } = await import('./game')
            const { MemoryMatrixRenderer } = await import('./renderer')

            await initMemoryMatrixGame()

            const allGame = vi.mocked(MemoryMatrixGame).mock.results
            const gameInst = allGame[allGame.length - 1]?.value
            const allRenderer = vi.mocked(MemoryMatrixRenderer).mock.results
            const rendererInst = allRenderer[allRenderer.length - 1]?.value

            if (gameInst && rendererInst) {
                const flipSpy = vi.spyOn(gameInst, 'flipCard')
                // Directly invoke the private onCardClick callback
                ;(rendererInst as any).onCardClick?.(1, 2)
                expect(flipSpy).toHaveBeenCalledWith({ row: 1, col: 2 })
            }
        })
    })
})

describe('testMemoryMatrixGame utility', () => {
    it('should be a callable function that does nothing', () => {
        expect(typeof testMemoryMatrixGame).toBe('function')
        expect(() => testMemoryMatrixGame()).not.toThrow()
    })

    it('should register on window when window is available', () => {
        expect((window as any).testMemoryMatrix).toBe(testMemoryMatrixGame)
    })
})
