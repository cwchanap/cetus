import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initSnakeGameFramework } from './initFramework'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock SnakeGame
vi.mock('./SnakeGame', () => ({
    SnakeGame: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getState: vi.fn(() => ({
            score: 0,
            timeRemaining: 60,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            snake: [{ x: 10, y: 10 }],
            food: [],
            direction: 'right',
            needsRedraw: false,
            foodsEaten: 0,
            maxLength: 1,
        })),
        changeDirection: vi.fn(),
        markRendered: vi.fn(),
        getApp: vi.fn(() => null),
    })),
    DEFAULT_SNAKE_CONFIG: {
        duration: 60,
        achievementIntegration: true,
        pausable: true,
        resettable: true,
        gridWidth: 20,
        gridHeight: 20,
        cellSize: 25,
        moveInterval: 150,
    },
}))

// Mock SnakeRenderer
vi.mock('./SnakeRenderer', () => ({
    SnakeRenderer: vi.fn().mockImplementation(() => ({
        initialize: vi.fn().mockResolvedValue(undefined),
        render: vi.fn(),
        cleanup: vi.fn(),
        getApp: vi.fn(() => ({
            canvas: {
                style: {},
                parentNode: null,
            },
        })),
    })),
    createSnakeRendererConfig: vi.fn(() => ({
        type: 'canvas',
        container: '#snake-container',
    })),
}))

// Mock errors module
vi.mock('@/lib/games/core/errors', () => ({
    DOMElementNotFoundError: class DOMElementNotFoundError extends Error {
        constructor(id: string) {
            super(`DOM element not found: ${id}`)
        }
    },
    handleGameError: vi.fn(),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="snake-container"></div>
        <span id="score">0</span>
        <span id="time-remaining">60s</span>
        <span id="snake-length">1</span>
        <span id="snake-length-stats">1</span>
        <span id="foods-eaten">0</span>
        <span id="final-score">0</span>
        <span id="final-length">1</span>
        <span id="final-foods">0</span>
        <span id="final-time">0s</span>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn" style="display:inline-flex">Start</button>
        <button id="end-btn" style="display:none">End</button>
        <button id="pause-btn">Pause</button>
        <button id="reset-btn">Reset</button>
        <button id="restart-btn">Restart</button>
        <button id="play-again-btn">Play Again</button>
    `
}

describe('initSnakeGameFramework', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    let result: Awaited<ReturnType<typeof initSnakeGameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        result = undefined
    })

    afterEach(() => {
        if (result) {
            try {
                result.cleanup()
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
        it('should return undefined when snake-container is missing', async () => {
            document.getElementById('snake-container')!.remove()
            const res = await initSnakeGameFramework()
            expect(res).toBeUndefined()
        })

        it('should return undefined when renderer initialization fails', async () => {
            const { SnakeRenderer } = await import('./SnakeRenderer')
            vi.mocked(SnakeRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi
                            .fn()
                            .mockRejectedValue(new Error('PixiJS failed')),
                        render: vi.fn(),
                        cleanup: vi.fn(),
                        getApp: vi.fn(() => null),
                    }) as any
            )

            const res = await initSnakeGameFramework()
            expect(res).toBeUndefined()
        })

        it('should return an object with game, renderer, cleanup, restart, getState, endGame', async () => {
            result = await initSnakeGameFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
        })

        it('should call renderer.initialize', async () => {
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework()
            const rendererInstance =
                vi.mocked(SnakeRenderer).mock.results[0].value
            expect(rendererInstance.initialize).toHaveBeenCalled()
        })

        it('should call renderer.render on initial state', async () => {
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework()
            const rendererInstance =
                vi.mocked(SnakeRenderer).mock.results[0].value
            expect(rendererInstance.render).toHaveBeenCalled()
        })

        it('should start render loop with requestAnimationFrame', async () => {
            result = await initSnakeGameFramework()
            expect(rafCallbacks.length).toBeGreaterThan(0)
        })

        it('should accept custom config', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework({ duration: 30 })
            expect(vi.mocked(SnakeGame)).toHaveBeenCalledWith(
                expect.objectContaining({ duration: 30 }),
                expect.any(Object)
            )
        })
    })

    describe('game instance methods', () => {
        it('restart should call game.reset', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            result!.restart()
            expect(gameMock.reset).toHaveBeenCalled()
        })

        it('getState should return game state', async () => {
            result = await initSnakeGameFramework()
            const state = result!.getState()
            expect(state).toBeDefined()
            expect(state).toHaveProperty('score')
        })

        it('endGame should call game.end', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            await result!.endGame()
            expect(gameMock.end).toHaveBeenCalled()
        })

        it('cleanup should cancel render loop and call renderer/game cleanup', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework()

            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            const rendererMock = vi.mocked(SnakeRenderer).mock.results[0].value

            result!.cleanup()
            result = undefined

            expect(cancelAnimationFrame).toHaveBeenCalled()
            expect(rendererMock.cleanup).toHaveBeenCalled()
            expect(gameMock.destroy).toHaveBeenCalled()
        })
    })

    describe('button event listeners', () => {
        it('clicking start-btn should call game.start', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            document.getElementById('start-btn')!.click()
            expect(gameMock.start).toHaveBeenCalled()
        })

        it('clicking end-btn should call game.end', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            document.getElementById('end-btn')!.click()
            expect(gameMock.end).toHaveBeenCalled()
        })

        it('clicking pause-btn when not paused should call game.pause', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            // Default state has isPaused: false
            document.getElementById('pause-btn')!.click()
            expect(gameMock.pause).toHaveBeenCalled()
        })

        it('clicking pause-btn when paused should call game.resume', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            vi.mocked(gameMock.getState).mockReturnValueOnce({
                ...gameMock.getState(),
                isPaused: true,
            })
            document.getElementById('pause-btn')!.click()
            expect(gameMock.resume).toHaveBeenCalled()
        })

        it('clicking reset-btn should call game.reset', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            document.getElementById('reset-btn')!.click()
            expect(gameMock.reset).toHaveBeenCalled()
        })

        it('clicking restart-btn should call game.reset and hide overlay', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            document.getElementById('restart-btn')!.click()
            expect(gameMock.reset).toHaveBeenCalled()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('clicking play-again-btn should call game.reset', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            document.getElementById('play-again-btn')!.click()
            expect(gameMock.reset).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('should ignore keypresses when game is not started', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            for (const key of [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
            ]) {
                document.dispatchEvent(
                    new KeyboardEvent('keydown', { key, bubbles: true })
                )
            }
            expect(gameMock.changeDirection).not.toHaveBeenCalled()
        })

        it('should change direction when game is active', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                gameStarted: true,
                isGameOver: false,
            } as any)

            const directionKeys = [
                ['ArrowLeft', 'left'],
                ['ArrowRight', 'right'],
                ['ArrowUp', 'up'],
                ['ArrowDown', 'down'],
                ['a', 'left'],
                ['d', 'right'],
                ['w', 'up'],
                ['s', 'down'],
                ['A', 'left'],
                ['D', 'right'],
                ['W', 'up'],
                ['S', 'down'],
            ]

            for (const [key, direction] of directionKeys) {
                vi.mocked(gameMock.changeDirection).mockClear()
                document.dispatchEvent(
                    new KeyboardEvent('keydown', { key, bubbles: true })
                )
                expect(gameMock.changeDirection).toHaveBeenCalledWith(direction)
            }
        })

        it('should handle p key for pause toggle', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                gameStarted: true,
                isGameOver: false,
                isPaused: false,
            } as any)

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'p', bubbles: true })
            )
            expect(gameMock.pause).toHaveBeenCalled()
        })

        it('should handle P key for resume when paused', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                gameStarted: true,
                isGameOver: false,
                isPaused: true,
            } as any)

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'P', bubbles: true })
            )
            expect(gameMock.resume).toHaveBeenCalled()
        })
    })

    describe('enhanced callbacks', () => {
        it('onScoreUpdate should update score element', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onScoreUpdate(100)
            expect(document.getElementById('score')!.textContent).toBe('100')
        })

        it('onTimeUpdate should update time-remaining element', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onTimeUpdate(45)
            expect(document.getElementById('time-remaining')!.textContent).toBe(
                '45s'
            )
        })

        it('onStart should hide start-btn and show end-btn', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onStart()

            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })

        it('onEnd should show game-over-overlay with final stats', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onEnd(250, {
                finalScore: 250,
                timeElapsed: 30,
                gameCompleted: false,
                maxLength: 8,
                foodsEaten: 5,
            })

            expect(document.getElementById('final-score')!.textContent).toBe(
                '250'
            )
            expect(
                document
                    .getElementById('game-over-overlay')!
                    .classList.contains('hidden')
            ).toBe(false)
        })

        it('onStateChange should call updateUI', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onStateChange({
                snake: [
                    { x: 1, y: 1 },
                    { x: 2, y: 1 },
                ],
                foodsEaten: 3,
                score: 0,
                timeRemaining: 60,
                isActive: true,
                isPaused: false,
                isGameOver: false,
                gameStarted: true,
                direction: 'right',
                food: [],
                needsRedraw: false,
                maxLength: 2,
            })
            expect(document.getElementById('snake-length')!.textContent).toBe(
                '2'
            )
            expect(document.getElementById('foods-eaten')!.textContent).toBe(
                '3'
            )
        })
    })

    describe('render loop', () => {
        it('should call renderer.render when needsRedraw is true', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            const rendererMock = vi.mocked(SnakeRenderer).mock.results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                needsRedraw: true,
            } as any)

            vi.mocked(rendererMock.render).mockClear()

            // Run one frame
            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }

            expect(rendererMock.render).toHaveBeenCalled()
            expect(gameMock.markRendered).toHaveBeenCalled()
        })

        it('should not call renderer.render when needsRedraw is false', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            const rendererMock = vi.mocked(SnakeRenderer).mock.results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                needsRedraw: false,
            } as any)

            vi.mocked(rendererMock.render).mockClear()

            // Run one frame
            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }

            expect(rendererMock.render).not.toHaveBeenCalled()
        })
    })
})
