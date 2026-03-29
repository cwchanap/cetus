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

function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {}
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value)
    }
    return el
}

function setupDOM() {
    const container = createElement('div', { id: 'snake-container' })
    const score = createElement('span', { id: 'score' })
    score.textContent = '0'
    const timeRemaining = createElement('span', { id: 'time-remaining' })
    timeRemaining.textContent = '60s'
    const snakeLength = createElement('span', { id: 'snake-length' })
    snakeLength.textContent = '1'
    const snakeLengthStats = createElement('span', { id: 'snake-length-stats' })
    snakeLengthStats.textContent = '1'
    const foodsEaten = createElement('span', { id: 'foods-eaten' })
    foodsEaten.textContent = '0'
    const finalScore = createElement('span', { id: 'final-score' })
    finalScore.textContent = '0'
    const finalLength = createElement('span', { id: 'final-length' })
    finalLength.textContent = '1'
    const finalFoods = createElement('span', { id: 'final-foods' })
    finalFoods.textContent = '0'
    const finalTime = createElement('span', { id: 'final-time' })
    finalTime.textContent = '0s'
    const overlay = createElement('div', {
        id: 'game-over-overlay',
        class: 'hidden',
    })
    const startBtn = createElement('button', { id: 'start-btn' })
    startBtn.style.display = 'inline-flex'
    startBtn.textContent = 'Start'
    const endBtn = createElement('button', { id: 'end-btn' })
    endBtn.style.display = 'none'
    endBtn.textContent = 'End'
    const pauseBtn = createElement('button', { id: 'pause-btn' })
    pauseBtn.textContent = 'Pause'
    const resetBtn = createElement('button', { id: 'reset-btn' })
    resetBtn.textContent = 'Reset'
    const restartBtn = createElement('button', { id: 'restart-btn' })
    restartBtn.textContent = 'Restart'
    const playAgainBtn = createElement('button', { id: 'play-again-btn' })
    playAgainBtn.textContent = 'Play Again'

    document.body.replaceChildren(
        container,
        score,
        timeRemaining,
        snakeLength,
        snakeLengthStats,
        foodsEaten,
        finalScore,
        finalLength,
        finalFoods,
        finalTime,
        overlay,
        startBtn,
        endBtn,
        pauseBtn,
        resetBtn,
        restartBtn,
        playAgainBtn
    )
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
        document.body.replaceChildren()
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

    describe('onGameEnd achievement handler', () => {
        it('should call showAchievementAward when achievements are present', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const showAchievementAward = vi.fn()
            vi.stubGlobal('showAchievementAward', showAchievementAward)

            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            // Get the onGameEnd callback registered with game.on('end', handler)
            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find(call => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                | ((...args: unknown[]) => unknown)
                | undefined

            if (onGameEnd) {
                onGameEnd({
                    data: { newAchievements: [{ id: 'first_blood' }] },
                })
                expect(showAchievementAward).toHaveBeenCalledWith([
                    { id: 'first_blood' },
                ])
            }

            vi.unstubAllGlobals()
        })

        it('should handle onGameEnd with no achievements', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find(call => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                | ((...args: unknown[]) => unknown)
                | undefined

            if (onGameEnd) {
                expect(() => onGameEnd({ data: {} })).not.toThrow()
            }
        })

        it('should handle onGameEnd with empty achievements array', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find(call => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                | ((...args: unknown[]) => unknown)
                | undefined

            if (onGameEnd) {
                expect(() =>
                    onGameEnd({ data: { newAchievements: [] } })
                ).not.toThrow()
            }
        })
    })

    describe('beforeunload handler', () => {
        it('should call preventDefault when game is active', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            result = await initSnakeGameFramework()
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                gameStarted: true,
                isGameOver: false,
                isPaused: false,
            } as any)

            const event = new Event('beforeunload', { cancelable: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            window.dispatchEvent(event)
            expect(preventDefaultSpy).toHaveBeenCalled()
        })

        it('should not call preventDefault when game is not started', async () => {
            result = await initSnakeGameFramework()

            const event = new Event('beforeunload', { cancelable: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            window.dispatchEvent(event)
            expect(preventDefaultSpy).not.toHaveBeenCalled()
        })
    })

    describe('renderer cleanup with canvas parentNode', () => {
        it('should remove canvas from parentNode during error cleanup', async () => {
            const { SnakeRenderer } = await import('./SnakeRenderer')
            const mockRemoveChild = vi.fn()
            const mockParentNode = { removeChild: mockRemoveChild }
            const mockCanvas = { style: {}, parentNode: mockParentNode }

            vi.mocked(SnakeRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi
                            .fn()
                            .mockRejectedValue(new Error('PixiJS failed')),
                        render: vi.fn(),
                        cleanup: vi.fn(),
                        getApp: vi.fn(() => ({ canvas: mockCanvas })),
                    }) as any
            )

            const res = await initSnakeGameFramework()
            expect(res).toBeUndefined()
            expect(mockRemoveChild).toHaveBeenCalledWith(mockCanvas)
        })

        it('should handle cleanup error when renderer.cleanup throws', async () => {
            const { SnakeRenderer } = await import('./SnakeRenderer')
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            const mockCanvas = { style: {}, parentNode: null }

            vi.mocked(SnakeRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi
                            .fn()
                            .mockRejectedValue(new Error('PixiJS failed')),
                        render: vi.fn(),
                        cleanup: vi.fn().mockImplementation(() => {
                            throw new Error('cleanup error')
                        }),
                        getApp: vi.fn(() => ({ canvas: mockCanvas })),
                    }) as any
            )

            const res = await initSnakeGameFramework()
            expect(res).toBeUndefined()
            expect(errorSpy).toHaveBeenCalledWith(
                'Error during renderer cleanup:',
                expect.any(Error)
            )
            errorSpy.mockRestore()
        })
    })

    describe('custom callbacks passthrough', () => {
        it('should forward onStateChange to customCallbacks.onStateChange', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const onStateChange = vi.fn()
            result = await initSnakeGameFramework(undefined, { onStateChange })

            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            const state = {
                snake: [{ x: 1, y: 1 }],
                foodsEaten: 0,
                score: 0,
                timeRemaining: 60,
                isActive: true,
                isPaused: false,
                isGameOver: false,
                gameStarted: true,
                direction: 'right',
                food: [],
                needsRedraw: false,
                maxLength: 1,
            }
            callbacksArg.onStateChange(state)
            expect(onStateChange).toHaveBeenCalledWith(state)
        })

        it('should forward onScoreUpdate to customCallbacks.onScoreUpdate', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const onScoreUpdate = vi.fn()
            result = await initSnakeGameFramework(undefined, { onScoreUpdate })

            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onScoreUpdate(42)
            expect(onScoreUpdate).toHaveBeenCalledWith(42)
        })

        it('should forward onTimeUpdate to customCallbacks.onTimeUpdate', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const onTimeUpdate = vi.fn()
            result = await initSnakeGameFramework(undefined, { onTimeUpdate })

            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onTimeUpdate(30)
            expect(onTimeUpdate).toHaveBeenCalledWith(30)
        })

        it('should forward onStart to customCallbacks.onStart', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const onStart = vi.fn()
            result = await initSnakeGameFramework(undefined, { onStart })

            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onStart()
            expect(onStart).toHaveBeenCalled()
        })

        it('should forward onEnd to customCallbacks.onEnd', async () => {
            const { SnakeGame } = await import('./SnakeGame')
            const onEnd = vi.fn()
            result = await initSnakeGameFramework(undefined, { onEnd })

            const callbacksArg = vi.mocked(SnakeGame).mock.calls[0][1] as any
            callbacksArg.onEnd(100, {
                finalScore: 100,
                timeElapsed: 10,
                gameCompleted: false,
                maxLength: 3,
                foodsEaten: 2,
            })
            expect(onEnd).toHaveBeenCalledWith(100, expect.any(Object))
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
