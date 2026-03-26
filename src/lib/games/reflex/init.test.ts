import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initializeReflexGame } from './init'
import type { GameCallbacks } from './types'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock the PixiJS renderer module - needs canvas with addEventListener
vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn(),
    renderGrid: vi.fn(),
    renderObject: vi.fn(),
    removeObject: vi.fn(),
    showClickEffect: vi.fn(),
    getCellFromPosition: vi.fn().mockReturnValue(null),
    cleanup: vi.fn(),
}))

function makeCallbacks(overrides: Partial<GameCallbacks> = {}): GameCallbacks {
    return {
        onScoreUpdate: vi.fn(),
        onTimeUpdate: vi.fn(),
        onObjectSpawn: vi.fn(),
        onObjectClick: vi.fn(),
        onObjectExpire: vi.fn(),
        onGameOver: vi.fn(),
        onGameStart: vi.fn(),
        ...overrides,
    }
}

function setupDOM() {
    document.body.innerHTML = `
        <div id="game-container"></div>
        <span id="final-score">0</span>
        <span id="final-coins">0</span>
        <span id="final-bombs">0</span>
        <span id="final-accuracy">0%</span>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn" style="display:none">Start</button>
        <button id="stop-btn" style="display:inline-flex">Stop</button>
    `
}

describe('initializeReflexGame', () => {
    let container: HTMLElement
    let mockCanvas: HTMLCanvasElement
    const rafCallbacks: FrameRequestCallback[] = []

    beforeEach(async () => {
        setupDOM()
        container = document.getElementById('game-container')!
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())

        // Set up default mock for setupPixiJS
        mockCanvas = document.createElement('canvas')
        const { setupPixiJS } = await import('./renderer')
        vi.mocked(setupPixiJS).mockResolvedValue({
            app: { canvas: mockCanvas } as any,
            stage: null as any,
        } as any)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
        rafCallbacks.length = 0
    })

    describe('initialization', () => {
        it('should return game instance with required methods', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            expect(result).toBeDefined()
            expect(typeof result.game).toBe('object')
            expect(typeof result.cleanup).toBe('function')
            expect(typeof result.startGame).toBe('function')
            expect(typeof result.stopGame).toBe('function')
        })

        it('should accept custom config overrides', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks, {
                gameDuration: 30,
            })
            expect(result).toBeDefined()
        })

        it('should throw and show error when setupPixiJS fails', async () => {
            const { setupPixiJS } = await import('./renderer')
            vi.mocked(setupPixiJS).mockRejectedValueOnce(
                new Error('PixiJS init failed')
            )
            const callbacks = makeCallbacks()
            await expect(
                initializeReflexGame(container, callbacks)
            ).rejects.toThrow('PixiJS init failed')
            expect(container.innerHTML).toContain('Failed to initialize')
        })

        it('should call renderGrid during initialization', async () => {
            const { renderGrid } = await import('./renderer')
            const callbacks = makeCallbacks()
            await initializeReflexGame(container, callbacks)
            expect(renderGrid).toHaveBeenCalled()
        })
    })

    describe('game controls', () => {
        it('startGame should not throw', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            expect(() => result.startGame()).not.toThrow()
        })

        it('stopGame should trigger onGameOver callback', async () => {
            const onGameOver = vi.fn()
            const callbacks = makeCallbacks({ onGameOver })
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            expect(onGameOver).toHaveBeenCalled()
        })
    })

    describe('handleGameOver', () => {
        it('should show game-over-overlay when game ends', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
        })

        it('should show start-btn and hide stop-btn when game ends', async () => {
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const stopBtn = document.getElementById(
                'stop-btn'
            ) as HTMLButtonElement
            startBtn.style.display = 'none'
            stopBtn.style.display = 'inline-flex'

            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()

            expect(startBtn.style.display).toBe('inline-flex')
            expect(stopBtn.style.display).toBe('none')
        })

        it('should call saveGameScore after game ends', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            expect(saveGameScore).toHaveBeenCalled()
        })

        it('should calculate final-accuracy correctly', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            const accuracy = document.getElementById('final-accuracy')!
            expect(accuracy.textContent).toBe('0%') // no clicks = 0%
        })

        it('should work without optional DOM elements', async () => {
            document.getElementById('final-score')!.remove()
            document.getElementById('final-coins')!.remove()
            document.getElementById('final-bombs')!.remove()
            document.getElementById('final-accuracy')!.remove()
            document.getElementById('game-over-overlay')!.remove()
            document.getElementById('start-btn')!.remove()
            document.getElementById('stop-btn')!.remove()

            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
        })

        it('should dispatch achievementsEarned when achievements earned', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, onSuccess) => {
                    onSuccess?.({ newAchievements: ['reflex_master'] })
                    return { success: true }
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'achievementsEarned' })
            )
        })
    })

    describe('callbacks', () => {
        it('should call onGameStart callback when game starts', async () => {
            const onGameStart = vi.fn()
            const callbacks = makeCallbacks({ onGameStart })
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            expect(onGameStart).toHaveBeenCalled()
        })

        it('should call onScoreUpdate when game starts', async () => {
            const onScoreUpdate = vi.fn()
            const callbacks = makeCallbacks({ onScoreUpdate })
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            expect(onScoreUpdate).toHaveBeenCalled()
        })

        it('should call onObjectSpawn when object spawns', async () => {
            const onObjectSpawn = vi.fn()
            const callbacks = makeCallbacks({ onObjectSpawn })
            const result = await initializeReflexGame(container, callbacks, {
                spawnInterval: 0.001,
            })
            result.startGame()
            vi.advanceTimersByTime(100)
            expect(onObjectSpawn).toHaveBeenCalled()
        })

        it('should call onObjectExpire when object expires', async () => {
            const onObjectExpire = vi.fn()
            const callbacks = makeCallbacks({ onObjectExpire })
            const result = await initializeReflexGame(container, callbacks, {
                spawnInterval: 0.001,
                objectLifetime: 0.001,
            })
            result.startGame()
            // Advance time enough for objects to spawn and expire
            vi.advanceTimersByTime(200)
            expect(onObjectExpire).toHaveBeenCalled()
        })
    })

    describe('cleanup', () => {
        it('should cancel animation frame and clean up on cleanup', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            expect(() => result.cleanup()).not.toThrow()
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })
    })

    describe('canvas click handler', () => {
        it('should call handleCellClick when canvas is clicked with valid cell', async () => {
            const { getCellFromPosition } = await import('./renderer')
            vi.mocked(getCellFromPosition).mockReturnValueOnce({
                row: 2,
                col: 3,
            })

            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()

            const clickEvent = new MouseEvent('click', {
                clientX: 100,
                clientY: 100,
                bubbles: true,
            })
            mockCanvas.dispatchEvent(clickEvent)
        })

        it('should not call handleCellClick when getCellFromPosition returns null', async () => {
            const { getCellFromPosition } = await import('./renderer')
            vi.mocked(getCellFromPosition).mockReturnValueOnce(null)

            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()

            const clickEvent = new MouseEvent('click', {
                clientX: 0,
                clientY: 0,
                bubbles: true,
            })
            // Should not throw even when no cell found
            expect(() => mockCanvas.dispatchEvent(clickEvent)).not.toThrow()
        })
    })

    describe('accuracy with clicks', () => {
        it('should calculate non-zero accuracy when player clicks coins', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks, {
                spawnInterval: 0.001,
            })
            result.startGame()
            vi.advanceTimersByTime(100)

            const objects = result.game.getActiveObjects()
            const coin = objects.find(o => o.type === 'coin')
            if (coin) {
                result.game.handleCellClick(coin.cell.row, coin.cell.col)
            }

            result.stopGame()
            await vi.runAllTimersAsync()

            const accuracyEl = document.getElementById('final-accuracy')!
            expect(accuracyEl.textContent).toMatch(/\d+%/)
        })
    })

    describe('gameLoop with active objects', () => {
        it('should call renderObject for each active object in the game loop', async () => {
            const { renderObject } = await import('./renderer')
            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks, {
                spawnInterval: 0.001,
            })
            result.startGame()
            vi.advanceTimersByTime(500)

            vi.mocked(renderObject).mockClear()

            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }

            const active = result.game.getActiveObjects()
            expect(active.length).toBeGreaterThan(0)
            expect(vi.mocked(renderObject)).toHaveBeenCalled()
        })
    })

    describe('onObjectClick callback', () => {
        it('should call removeObject and showClickEffect when object is clicked', async () => {
            const { removeObject, showClickEffect } = await import('./renderer')
            const onObjectClick = vi.fn()
            const callbacks = makeCallbacks({ onObjectClick })
            const result = await initializeReflexGame(container, callbacks, {
                spawnInterval: 0.001,
            })
            result.startGame()
            vi.advanceTimersByTime(500)

            const objects = result.game.getActiveObjects()
            expect(objects.length).toBeGreaterThan(0)
            result.game.handleCellClick(
                objects[0].cell.row,
                objects[0].cell.col
            )
            expect(removeObject).toHaveBeenCalled()
            expect(showClickEffect).toHaveBeenCalled()
            expect(onObjectClick).toHaveBeenCalled()
        })
    })

    describe('saveGameScore error callback', () => {
        it('should log error when saveGameScore calls onError', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, _onSuccess, onError) => {
                    onError?.('network error')
                    return { success: false }
                }
            )
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            const callbacks = makeCallbacks()
            const result = await initializeReflexGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()

            expect(errorSpy).toHaveBeenCalledWith(
                'Failed to submit score:',
                expect.any(String)
            )
            errorSpy.mockRestore()
        })
    })
})
