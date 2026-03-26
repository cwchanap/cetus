import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initTetrisGame } from './init'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock game module
vi.mock('./game', () => ({
    createGameState: vi.fn(() => ({
        board: [],
        score: 0,
        level: 1,
        lines: 0,
        pieces: 0,
        tetrises: 0,
        currentPiece: null,
        nextPiece: null,
        gameStarted: false,
        gameOver: false,
        paused: false,
    })),
    generateNextPiece: vi.fn(() => ({ type: 'I', cells: [] })),
    movePiece: vi.fn(),
    rotatePiece: vi.fn(),
    hardDrop: vi.fn(),
    startGame: vi.fn(),
    togglePause: vi.fn(),
    resetGame: vi.fn(),
    gameLoop: vi.fn(),
    updateUI: vi.fn(),
    updateNextPieceDisplay: vi.fn(),
    draw: vi.fn(),
    endGame: vi.fn().mockResolvedValue(undefined),
    GAME_CONSTANTS: {
        COLS: 10,
        ROWS: 20,
        BLOCK_SIZE: 30,
        GAME_WIDTH: 300,
        GAME_HEIGHT: 600,
    },
}))

// Mock renderer module
vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn().mockResolvedValue({
        app: { destroy: vi.fn() },
        stage: null,
        boardContainer: null,
    }),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="tetris-container"></div>
        <canvas id="next-canvas" width="120" height="120"></canvas>
        <span id="score">0</span>
        <span id="level">1</span>
        <span id="lines">0</span>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <span id="final-level">1</span>
        <span id="final-lines">0</span>
        <span id="final-pieces">0</span>
        <span id="final-tetrises">0</span>
        <button id="start-btn" style="display:inline-flex">Start</button>
        <button id="end-btn" style="display:none">End</button>
        <button id="pause-btn">Pause</button>
        <button id="reset-btn">Reset</button>
        <button id="restart-btn">Restart</button>
    `
    // Mock canvas context
    const canvas = document.getElementById('next-canvas') as HTMLCanvasElement
    Object.defineProperty(canvas, 'getContext', {
        value: vi.fn(() => ({
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            fillStyle: '',
            strokeStyle: '',
        })),
        writable: true,
    })
}

describe('initTetrisGame', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    let gameInst: Awaited<ReturnType<typeof initTetrisGame>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        gameInst = undefined
    })

    afterEach(() => {
        if (gameInst) {
            try {
                gameInst.cleanup()
            } catch {
                // ignore
            }
        }
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
        rafCallbacks.length = 0
    })

    describe('initialization', () => {
        it('should return undefined when tetris-container is missing', async () => {
            document.getElementById('tetris-container')!.remove()
            const result = await initTetrisGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when next-canvas is missing', async () => {
            document.getElementById('next-canvas')!.remove()
            const result = await initTetrisGame()
            expect(result).toBeUndefined()
        })

        it('should return a game instance with required methods', async () => {
            gameInst = await initTetrisGame()
            expect(gameInst).toBeDefined()
            expect(typeof gameInst!.restart).toBe('function')
            expect(typeof gameInst!.getState).toBe('function')
            expect(typeof gameInst!.endGame).toBe('function')
            expect(typeof gameInst!.cleanup).toBe('function')
        })

        it('should call setupPixiJS with game container', async () => {
            const { setupPixiJS } = await import('./renderer')
            gameInst = await initTetrisGame()
            expect(setupPixiJS).toHaveBeenCalledWith(
                expect.any(HTMLElement),
                expect.any(Object)
            )
        })

        it('should call updateUI after setup', async () => {
            const { updateUI } = await import('./game')
            gameInst = await initTetrisGame()
            expect(updateUI).toHaveBeenCalled()
        })

        it('should start draw loop', async () => {
            gameInst = await initTetrisGame()
            expect(rafCallbacks.length).toBeGreaterThan(0)
        })

        it('should call generateNextPiece on setup', async () => {
            const { generateNextPiece } = await import('./game')
            gameInst = await initTetrisGame()
            expect(generateNextPiece).toHaveBeenCalled()
        })
    })

    describe('game instance methods', () => {
        it('restart should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInst = await initTetrisGame()
            gameInst!.restart()
            expect(resetGame).toHaveBeenCalled()
        })

        it('getState should return the current game state', async () => {
            gameInst = await initTetrisGame()
            const state = gameInst!.getState()
            expect(state).toBeDefined()
            expect(state).toHaveProperty('score')
        })

        it('endGame should call the endGame function', async () => {
            const { endGame } = await import('./game')
            gameInst = await initTetrisGame()
            await gameInst!.endGame()
            expect(endGame).toHaveBeenCalled()
        })

        it('cleanup should be idempotent', async () => {
            gameInst = await initTetrisGame()
            expect(() => {
                gameInst!.cleanup()
                gameInst!.cleanup() // second call should not throw
            }).not.toThrow()
            gameInst = undefined
        })

        it('cleanup should cancel animation frame', async () => {
            gameInst = await initTetrisGame()
            gameInst!.cleanup()
            gameInst = undefined
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })

        it('cleanup should destroy renderer app', async () => {
            const { setupPixiJS } = await import('./renderer')
            const mockDestroy = vi.fn()
            vi.mocked(setupPixiJS).mockResolvedValueOnce({
                app: { destroy: mockDestroy } as any,
                stage: null as any,
                boardContainer: null as any,
            })

            gameInst = await initTetrisGame()
            gameInst!.cleanup()
            gameInst = undefined
            expect(mockDestroy).toHaveBeenCalledWith(true, {
                children: true,
                texture: true,
            })
        })
    })

    describe('button event listeners', () => {
        it('clicking start-btn should call startGame', async () => {
            const { startGame } = await import('./game')
            gameInst = await initTetrisGame()
            document.getElementById('start-btn')!.click()
            expect(startGame).toHaveBeenCalled()
        })

        it('clicking pause-btn should call togglePause', async () => {
            const { togglePause } = await import('./game')
            gameInst = await initTetrisGame()
            document.getElementById('pause-btn')!.click()
            expect(togglePause).toHaveBeenCalled()
        })

        it('clicking reset-btn should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInst = await initTetrisGame()
            document.getElementById('reset-btn')!.click()
            expect(resetGame).toHaveBeenCalled()
        })

        it('clicking restart-btn should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInst = await initTetrisGame()
            document.getElementById('restart-btn')!.click()
            expect(resetGame).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('should ignore keys when game is not started', async () => {
            const { movePiece } = await import('./game')
            gameInst = await initTetrisGame()
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowLeft',
                    bubbles: true,
                })
            )
            expect(movePiece).not.toHaveBeenCalled()
        })

        it('should handle arrow keys when game is started and not paused', async () => {
            const { movePiece, rotatePiece, hardDrop } = await import('./game')
            gameInst = await initTetrisGame()

            // Simulate game started state
            const state = gameInst!.getState() as any
            state.gameStarted = true
            state.gameOver = false
            state.paused = false

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowLeft',
                    bubbles: true,
                })
            )
            expect(movePiece).toHaveBeenCalledWith(expect.any(Object), -1, 0)

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            expect(movePiece).toHaveBeenCalledWith(expect.any(Object), 1, 0)

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowDown',
                    bubbles: true,
                })
            )
            expect(movePiece).toHaveBeenCalledWith(expect.any(Object), 0, 1)

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
            )
            expect(rotatePiece).toHaveBeenCalled()

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: ' ', bubbles: true })
            )
            expect(hardDrop).toHaveBeenCalled()
        })

        it('should handle p/P for pause when game is active', async () => {
            const { togglePause } = await import('./game')
            gameInst = await initTetrisGame()

            const state = gameInst!.getState() as any
            state.gameStarted = true
            state.gameOver = false
            state.paused = false

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'p', bubbles: true })
            )
            expect(togglePause).toHaveBeenCalled()
        })

        it('should not handle keys when game is paused', async () => {
            const { movePiece } = await import('./game')
            gameInst = await initTetrisGame()

            const state = gameInst!.getState() as any
            state.gameStarted = true
            state.gameOver = false
            state.paused = true

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowLeft',
                    bubbles: true,
                })
            )
            expect(movePiece).not.toHaveBeenCalled()
        })
    })

    describe('draw loop', () => {
        it('should call draw via requestAnimationFrame', async () => {
            const { draw } = await import('./game')
            gameInst = await initTetrisGame()

            if (rafCallbacks.length > 0) {
                rafCallbacks[0](0)
            }

            expect(draw).toHaveBeenCalled()
        })

        it('should stop draw loop after cleanup', async () => {
            const { draw } = await import('./game')
            gameInst = await initTetrisGame()
            gameInst!.cleanup()
            gameInst = undefined

            const drawCallsBefore = vi.mocked(draw).mock.calls.length

            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }

            expect(vi.mocked(draw).mock.calls.length).toBe(drawCallsBefore)
        })
    })

    describe('onGameOver callback', () => {
        it('should update final stats elements', async () => {
            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any

            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(500, {
                    level: 3,
                    lines: 10,
                    pieces: 20,
                    tetrises: 2,
                })

                expect(
                    document.getElementById('final-score')!.textContent
                ).toBe('500')
                expect(
                    document.getElementById('final-level')!.textContent
                ).toBe('3')
                expect(
                    document.getElementById('final-lines')!.textContent
                ).toBe('10')
                expect(
                    document.getElementById('final-pieces')!.textContent
                ).toBe('20')
                expect(
                    document.getElementById('final-tetrises')!.textContent
                ).toBe('2')
            }
        })

        it('should show game-over-overlay and reset buttons', async () => {
            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any

            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(0, {})

                const overlay = document.getElementById('game-over-overlay')!
                expect(overlay.classList.contains('hidden')).toBe(false)

                const startBtn = document.getElementById(
                    'start-btn'
                ) as HTMLButtonElement
                const endBtn = document.getElementById(
                    'end-btn'
                ) as HTMLButtonElement
                expect(startBtn.style.display).toBe('inline-flex')
                expect(endBtn.style.display).toBe('none')
            }
        })

        it('should call saveGameScore', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any

            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(100, {})
                expect(saveGameScore).toHaveBeenCalledWith(
                    expect.any(String),
                    100,
                    expect.any(Function),
                    expect.any(Function),
                    expect.any(Object)
                )
            }
        })

        it('should handle missing DOM elements gracefully', async () => {
            document.getElementById('final-score')!.remove()
            document.getElementById('game-over-overlay')!.remove()
            document.getElementById('start-btn')!.remove()
            document.getElementById('end-btn')!.remove()

            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any

            if (typeof state.onGameOver === 'function') {
                await expect(state.onGameOver(0, {})).resolves.toBeUndefined()
            }
        })

        it('should dispatch achievementsEarned event when new achievements returned', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                (_id: any, _score: any, successCb: any) => {
                    successCb({
                        newAchievements: ['achievement-1', 'achievement-2'],
                    })
                    return Promise.resolve({ success: true }) as any
                }
            )

            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any
            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(200, {})
            }

            const achievementEvents = dispatchSpy.mock.calls.filter(
                call =>
                    call[0] instanceof CustomEvent &&
                    (call[0] as CustomEvent).type === 'achievementsEarned'
            )
            expect(achievementEvents.length).toBeGreaterThan(0)
        })
    })

    describe('beforeUnloadHandler', () => {
        it('should warn user when game is in progress and unloading', async () => {
            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any
            state.gameStarted = true
            state.gameOver = false
            state.paused = false

            const event = new Event('beforeunload', { cancelable: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            window.dispatchEvent(event)
            expect(preventDefaultSpy).toHaveBeenCalled()
        })

        it('should not warn when game is not started', async () => {
            gameInst = await initTetrisGame()
            // gameStarted is false by default

            const event = new Event('beforeunload', { cancelable: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            window.dispatchEvent(event)
            expect(preventDefaultSpy).not.toHaveBeenCalled()
        })
    })

    describe('saveGameScore error callback', () => {
        it('should log error when saveGameScore error callback is called', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                (_id: any, _score: any, _successCb: any, errorCb: any) => {
                    errorCb(new Error('network failure'))
                    return Promise.resolve({ success: false }) as any
                }
            )
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            gameInst = await initTetrisGame()
            const state = gameInst!.getState() as any
            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(0, {})
            }
            expect(errorSpy).toHaveBeenCalledWith(
                'Failed to submit score:',
                expect.any(Error)
            )
            errorSpy.mockRestore()
        })
    })

    describe('gameLoopFn', () => {
        it('should call gameLoop when invoked with active game state', async () => {
            const { startGame, gameLoop } = await import('./game')
            vi.mocked(startGame).mockImplementationOnce((_state, loopFn) => {
                if (typeof loopFn === 'function') {
                    ;(_state as any).gameStarted = true
                    ;(_state as any).gameOver = false
                    ;(_state as any).paused = false
                    loopFn()
                }
            })

            gameInst = await initTetrisGame()
            document.getElementById('start-btn')!.click()
            expect(gameLoop).toHaveBeenCalled()
        })
    })
})
