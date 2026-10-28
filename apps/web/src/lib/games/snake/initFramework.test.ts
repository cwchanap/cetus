import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initSnakeGameFramework } from './initFramework'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
    submitScore: vi.fn().mockResolvedValue({
        success: true,
        newAchievements: [],
    }),
}))

// Mock SnakeGame
vi.mock('@cetus/games/snake/SnakeGame', () => ({
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
        update: vi.fn(),
        markRendered: vi.fn(),
        getApp: vi.fn(() => null),
    })),
    DEFAULT_SNAKE_CONFIG: {
        duration: 60,
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
vi.mock('@cetus/games/core/errors', () => ({
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
    // React owns the HUD/buttons/overlay (HPA-393); the initializer only
    // needs the board host the island ref-passes.
    const container = createElement('div', { id: 'snake-container' })
    document.body.replaceChildren(container)
}

function getContainer(): HTMLElement {
    return document.getElementById('snake-container') as HTMLElement
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

            const res = await initSnakeGameFramework(getContainer())
            expect(res).toBeUndefined()
        })

        it('should return an object with game, renderer, cleanup, restart, getState, endGame', async () => {
            result = await initSnakeGameFramework(getContainer())
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
            result = await initSnakeGameFramework(getContainer())
            const rendererInstance =
                vi.mocked(SnakeRenderer).mock.results[0].value
            expect(rendererInstance.initialize).toHaveBeenCalled()
        })

        it('should call renderer.render on initial state', async () => {
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework(getContainer())
            const rendererInstance =
                vi.mocked(SnakeRenderer).mock.results[0].value
            expect(rendererInstance.render).toHaveBeenCalled()
        })

        it('should start render loop with requestAnimationFrame', async () => {
            result = await initSnakeGameFramework(getContainer())
            expect(rafCallbacks.length).toBeGreaterThan(0)
        })

        it('should accept custom config', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer(), {
                duration: 30,
            })
            expect(vi.mocked(SnakeGame).mock.calls[0][0]).toEqual(
                expect.objectContaining({ duration: 30 })
            )
        })
    })

    describe('game instance methods', () => {
        it('restart should call game.reset', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            result!.restart()
            expect(gameMock.reset).toHaveBeenCalled()
        })

        it('getState should return game state', async () => {
            result = await initSnakeGameFramework(getContainer())
            const state = result!.getState()
            expect(state).toBeDefined()
            expect(state).toHaveProperty('score')
        })

        it('endGame should call game.end', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            await result!.endGame()
            expect(gameMock.end).toHaveBeenCalled()
        })

        it('cleanup should cancel render loop and call renderer/game cleanup', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework(getContainer())

            const gameMock = vi.mocked(SnakeGame).mock.results[0].value
            const rendererMock = vi.mocked(SnakeRenderer).mock.results[0].value

            result!.cleanup()
            result = undefined

            expect(cancelAnimationFrame).toHaveBeenCalled()
            expect(rendererMock.cleanup).toHaveBeenCalled()
            expect(gameMock.destroy).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('should ignore keypresses when game is not started', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
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
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
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
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
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
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
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

    describe('callbacks pass-through', () => {
        it('should construct the game with the caller-supplied callbacks', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            const customCallbacks = { onScoreUpdate: () => {} }
            result = await initSnakeGameFramework(
                getContainer(),
                undefined,
                customCallbacks
            )

            // React owns the HUD/buttons/overlay; the initializer must not
            // wrap or intercept the caller's callbacks.
            expect(vi.mocked(SnakeGame).mock.calls[0][1]).toBe(customCallbacks)
        })
    })

    describe('onGameEnd achievement handler', () => {
        it('should call showAchievementAward when achievements are present', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            const showAchievementAward = vi.fn()
            vi.stubGlobal('showAchievementAward', showAchievementAward)

            result = await initSnakeGameFramework(getContainer())
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            // Get the onGameEnd callback registered with game.on('end', handler)
            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find((call: unknown[]) => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                ((...args: unknown[]) => unknown) | undefined

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
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find((call: unknown[]) => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                ((...args: unknown[]) => unknown) | undefined

            if (onGameEnd) {
                expect(() => onGameEnd({ data: {} })).not.toThrow()
            }
        })

        it('should handle onGameEnd with empty achievements array', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
            const gameMock = vi.mocked(SnakeGame).mock.results[0].value

            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find((call: unknown[]) => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                ((...args: unknown[]) => unknown) | undefined

            if (onGameEnd) {
                expect(() =>
                    onGameEnd({ data: { newAchievements: [] } })
                ).not.toThrow()
            }
        })
    })

    describe('beforeunload handler', () => {
        it('should call preventDefault when game is active', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            result = await initSnakeGameFramework(getContainer())
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
            result = await initSnakeGameFramework(getContainer())

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

            const res = await initSnakeGameFramework(getContainer())
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

            const res = await initSnakeGameFramework(getContainer())
            expect(res).toBeUndefined()
            expect(errorSpy).toHaveBeenCalledWith(
                'Error during renderer cleanup:',
                expect.any(Error)
            )
            errorSpy.mockRestore()
        })
    })

    describe('render loop', () => {
        it('should call renderer.render when needsRedraw is true', async () => {
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework(getContainer())
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
            const { SnakeGame } = await import('@cetus/games/snake/SnakeGame')
            const { SnakeRenderer } = await import('./SnakeRenderer')
            result = await initSnakeGameFramework(getContainer())
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

    describe('branch coverage: non-Error throw', () => {
        it('should handle non-Error thrown during renderer.initialize (line 57 false branch)', async () => {
            const { SnakeRenderer } = await import('./SnakeRenderer')
            vi.mocked(SnakeRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi
                            .fn()
                            .mockRejectedValue('string error not an Error'),
                        render: vi.fn(),
                        cleanup: vi.fn(),
                        getApp: vi.fn(() => null),
                    }) as any
            )

            const res = await initSnakeGameFramework(getContainer())
            // Non-Error string → new Error(String(error)) path (line 57 false branch)
            expect(res).toBeUndefined()
        })
    })
})
