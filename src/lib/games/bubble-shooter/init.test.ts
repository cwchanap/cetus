import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initBubbleShooterGame } from './init'
import { GameID } from '@/lib/games'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock game module
vi.mock('./game', () => ({
    createGameState: vi.fn(() => ({
        grid: [],
        shooter: { x: 300, y: 740 },
        currentBubble: null,
        nextBubble: null,
        aimAngle: -Math.PI / 2,
        projectile: null,
        score: 0,
        bubblesRemaining: 0,
        gameStarted: false,
        gameOver: false,
        paused: false,
        rowOffset: 0,
        shotCount: 0,
        needsRedraw: true,
    })),
    initializeGrid: vi.fn(),
    generateBubble: vi.fn(),
    generateNextBubble: vi.fn(),
    updateCurrentBubbleDisplay: vi.fn(),
    updateNextBubbleDisplay: vi.fn(),
    handleMouseMove: vi.fn(),
    handleClick: vi.fn(),
    startGame: vi.fn(),
    resetGame: vi.fn(),
    togglePause: vi.fn(),
    gameLoop: vi.fn(),
    draw: vi.fn(),
    endGame: vi.fn(),
    GAME_CONSTANTS: {
        BUBBLE_RADIUS: 20,
        GRID_WIDTH: 14,
        GRID_HEIGHT: 20,
        GAME_WIDTH: 600,
        GAME_HEIGHT: 800,
        SHOOTER_Y: 740,
    },
}))

// Mock renderer module
vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn().mockResolvedValue({
        app: {
            canvas: {
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
            destroy: vi.fn(),
        },
        stage: null,
        bubbleContainer: null,
    }),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="game-container"></div>
        <canvas id="current-bubble" width="80" height="80"></canvas>
        <canvas id="next-bubble" width="80" height="80"></canvas>
        <span id="score">0</span>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <button id="start-btn" style="display:inline-flex">Start</button>
        <button id="end-btn" style="display:none">End</button>
        <button id="pause-btn">Pause</button>
        <button id="reset-btn">Reset</button>
        <button id="restart-btn">Restart</button>
        <button id="resume-btn">Resume</button>
    `

    // Mock canvas context for both canvas elements
    const mockCtx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillStyle: '',
    }
    const canvases = document.querySelectorAll('canvas')
    canvases.forEach(canvas => {
        Object.defineProperty(canvas, 'getContext', {
            value: vi.fn(() => mockCtx),
            writable: true,
        })
    })
}

describe('initBubbleShooterGame', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    let gameInst: Awaited<ReturnType<typeof initBubbleShooterGame>>

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
        it('should throw when game-container is missing', async () => {
            document.getElementById('game-container')!.remove()
            await expect(initBubbleShooterGame()).rejects.toThrow()
        })

        it('should throw when current-bubble canvas is missing', async () => {
            document.getElementById('current-bubble')!.remove()
            await expect(initBubbleShooterGame()).rejects.toThrow()
        })

        it('should throw when next-bubble canvas is missing', async () => {
            document.getElementById('next-bubble')!.remove()
            await expect(initBubbleShooterGame()).rejects.toThrow()
        })

        it('should return a game instance with required methods', async () => {
            gameInst = await initBubbleShooterGame()
            expect(gameInst).toBeDefined()
            expect(typeof gameInst.restart).toBe('function')
            expect(typeof gameInst.getState).toBe('function')
            expect(typeof gameInst.endGame).toBe('function')
            expect(typeof gameInst.cleanup).toBe('function')
        })

        it('should call setupPixiJS with the game container', async () => {
            const { setupPixiJS } = await import('./renderer')
            gameInst = await initBubbleShooterGame()
            expect(setupPixiJS).toHaveBeenCalledWith(
                expect.any(HTMLElement),
                expect.any(Object)
            )
        })

        it('should initialize the grid and bubbles', async () => {
            const { initializeGrid, generateBubble, generateNextBubble } =
                await import('./game')
            gameInst = await initBubbleShooterGame()
            expect(initializeGrid).toHaveBeenCalled()
            expect(generateBubble).toHaveBeenCalled()
            expect(generateNextBubble).toHaveBeenCalled()
        })

        it('should start the draw loop', async () => {
            gameInst = await initBubbleShooterGame()
            expect(rafCallbacks.length).toBeGreaterThan(0)
        })
    })

    describe('game instance methods', () => {
        it('restart should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInst = await initBubbleShooterGame()
            gameInst.restart()
            expect(resetGame).toHaveBeenCalled()
        })

        it('getState should return the current game state', async () => {
            gameInst = await initBubbleShooterGame()
            const state = gameInst.getState()
            expect(state).toBeDefined()
            expect(state).toHaveProperty('score')
        })

        it('endGame should call the endGame function', async () => {
            const { endGame } = await import('./game')
            gameInst = await initBubbleShooterGame()
            gameInst.endGame()
            expect(endGame).toHaveBeenCalled()
        })

        it('cleanup should be idempotent', async () => {
            gameInst = await initBubbleShooterGame()
            expect(() => {
                gameInst.cleanup()
                gameInst.cleanup()
            }).not.toThrow()
            gameInst = undefined
        })

        it('cleanup should cancel animation frame', async () => {
            gameInst = await initBubbleShooterGame()
            gameInst.cleanup()
            gameInst = undefined
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })
    })

    describe('button event listeners', () => {
        it('clicking start-btn should call startGame and toggle buttons', async () => {
            const { startGame } = await import('./game')
            gameInst = await initBubbleShooterGame()
            document.getElementById('start-btn')!.click()
            expect(startGame).toHaveBeenCalled()

            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })

        it('clicking end-btn should call endGame', async () => {
            const { endGame } = await import('./game')
            gameInst = await initBubbleShooterGame()
            document.getElementById('end-btn')!.click()
            expect(endGame).toHaveBeenCalled()
        })

        it('clicking pause-btn should call togglePause', async () => {
            const { togglePause } = await import('./game')
            gameInst = await initBubbleShooterGame()
            document.getElementById('pause-btn')!.click()
            expect(togglePause).toHaveBeenCalled()
        })

        it('clicking reset-btn should call resetGame and hide overlay', async () => {
            const { resetGame } = await import('./game')
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            gameInst = await initBubbleShooterGame()
            document.getElementById('reset-btn')!.click()
            expect(resetGame).toHaveBeenCalled()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('clicking restart-btn should call resetGame and hide overlay', async () => {
            const { resetGame } = await import('./game')
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            gameInst = await initBubbleShooterGame()
            document.getElementById('restart-btn')!.click()
            expect(resetGame).toHaveBeenCalled()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('clicking resume-btn should call togglePause', async () => {
            const { togglePause } = await import('./game')
            gameInst = await initBubbleShooterGame()
            document.getElementById('resume-btn')!.click()
            expect(togglePause).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('should handle p key for pause', async () => {
            const { togglePause } = await import('./game')
            gameInst = await initBubbleShooterGame()
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'p', bubbles: true })
            )
            expect(togglePause).toHaveBeenCalled()
        })

        it('should handle P key for pause', async () => {
            const { togglePause } = await import('./game')
            gameInst = await initBubbleShooterGame()
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'P', bubbles: true })
            )
            expect(togglePause).toHaveBeenCalled()
        })

        it('should ignore non-pause keys', async () => {
            const { togglePause } = await import('./game')
            gameInst = await initBubbleShooterGame()
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'a', bubbles: true })
            )
            expect(togglePause).not.toHaveBeenCalled()
        })
    })

    describe('callbacks', () => {
        it('should call external onGameOver callback when provided', async () => {
            const onGameOver = vi.fn()
            gameInst = await initBubbleShooterGame({ onGameOver })

            const state = gameInst.getState() as any
            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(200, {})
                expect(onGameOver).toHaveBeenCalledWith(200, {})
            }
        })

        it('should call saveScore when no callback provided', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            gameInst = await initBubbleShooterGame()

            const state = gameInst.getState() as any
            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(150, {})
                expect(saveGameScore).toHaveBeenCalledWith(
                    GameID.BUBBLE_SHOOTER,
                    150,
                    expect.any(Function),
                    expect.any(Function)
                )
            }
        })
    })

    describe('gameLoopFn', () => {
        it('should call gameLoop when state is active and startGame triggers gameLoopFn', async () => {
            const { startGame, gameLoop } = await import('./game')
            vi.mocked(startGame).mockImplementationOnce(
                (state: any, loopFn: any) => {
                    state.gameStarted = true
                    state.gameOver = false
                    state.paused = false
                    if (typeof loopFn === 'function') {
                        loopFn()
                    }
                }
            )
            gameInst = await initBubbleShooterGame()
            document.getElementById('start-btn')!.click()
            expect(gameLoop).toHaveBeenCalled()
        })

        it('should not call gameLoop when game is not started', async () => {
            const { startGame, gameLoop } = await import('./game')
            vi.mocked(startGame).mockImplementationOnce(
                (state: any, loopFn: any) => {
                    state.gameStarted = false
                    if (typeof loopFn === 'function') {
                        loopFn()
                    }
                }
            )
            gameInst = await initBubbleShooterGame()
            document.getElementById('start-btn')!.click()
            expect(gameLoop).not.toHaveBeenCalled()
        })
    })

    describe('canvas event handlers', () => {
        it('should invoke handleMouseMove when canvas mousemove fires', async () => {
            const { setupPixiJS } = await import('./renderer')
            const { handleMouseMove } = await import('./game')

            const capturedListeners: Record<
                string,
                (...args: unknown[]) => unknown
            > = {}
            const mockAppCanvas = {
                addEventListener: vi.fn(
                    (
                        event: string,
                        handler: (...args: unknown[]) => unknown
                    ) => {
                        capturedListeners[event] = handler
                    }
                ),
                removeEventListener: vi.fn(),
            }
            vi.mocked(setupPixiJS).mockResolvedValueOnce({
                app: {
                    canvas: mockAppCanvas as any,
                    destroy: vi.fn(),
                } as any,
                stage: null as any,
                bubbleContainer: null as any,
            })

            gameInst = await initBubbleShooterGame()

            const event = new MouseEvent('mousemove')
            capturedListeners['mousemove']?.(event)
            expect(handleMouseMove).toHaveBeenCalledWith(
                event,
                expect.any(Object),
                expect.any(Object)
            )
        })

        it('should invoke handleClick when canvas click fires', async () => {
            const { setupPixiJS } = await import('./renderer')
            const { handleClick } = await import('./game')

            const capturedListeners: Record<
                string,
                (...args: unknown[]) => unknown
            > = {}
            const mockAppCanvas = {
                addEventListener: vi.fn(
                    (
                        event: string,
                        handler: (...args: unknown[]) => unknown
                    ) => {
                        capturedListeners[event] = handler
                    }
                ),
                removeEventListener: vi.fn(),
            }
            vi.mocked(setupPixiJS).mockResolvedValueOnce({
                app: {
                    canvas: mockAppCanvas as any,
                    destroy: vi.fn(),
                } as any,
                stage: null as any,
                bubbleContainer: null as any,
            })

            gameInst = await initBubbleShooterGame()

            const event = new MouseEvent('click')
            capturedListeners['click']?.(event)
            expect(handleClick).toHaveBeenCalledWith(
                event,
                expect.any(Object),
                expect.any(Function)
            )
        })
    })

    describe('saveScore callbacks', () => {
        it('should dispatch achievementsEarned when saveScore gets new achievements', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, onSuccess) => {
                    onSuccess?.({ newAchievements: ['bubble_master'] })
                    return { success: true }
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            gameInst = await initBubbleShooterGame()
            const state = gameInst.getState() as any
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

        it('should log error when saveScore onError is called', async () => {
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

            gameInst = await initBubbleShooterGame()
            const state = gameInst.getState() as any
            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(50, {})
            }

            expect(errorSpy).toHaveBeenCalledWith(
                'Failed to submit score:',
                expect.any(Error)
            )
            errorSpy.mockRestore()
        })
    })

    describe('draw loop', () => {
        it('should call draw via requestAnimationFrame', async () => {
            const { draw } = await import('./game')
            gameInst = await initBubbleShooterGame()

            if (rafCallbacks.length > 0) {
                rafCallbacks[0](0)
            }

            expect(draw).toHaveBeenCalled()
        })

        it('should stop draw loop after cleanup', async () => {
            const { draw } = await import('./game')
            gameInst = await initBubbleShooterGame()
            gameInst.cleanup()
            gameInst = undefined

            const drawCallsBefore = vi.mocked(draw).mock.calls.length
            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }

            expect(vi.mocked(draw).mock.calls.length).toBe(drawCallsBefore)
        })
    })
})
