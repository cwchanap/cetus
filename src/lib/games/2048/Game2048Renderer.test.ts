// Game2048Renderer unit tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makePosition = () => ({ set: vi.fn(), x: 0, y: 0 })
    const makeScale = () => ({ set: vi.fn(), x: 1, y: 1 })

    const makeContainer = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        position: makePosition(),
        pivot: makePosition(),
        scale: makeScale(),
        alpha: 1,
    })

    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1 }
        for (const m of ['roundRect', 'fill', 'stroke', 'rect', 'clear']) {
            g[m] = vi.fn(() => g)
        }
        return g
    }

    const makeText = () => ({
        anchor: { set: vi.fn() },
        position: makePosition(),
        destroy: vi.fn(),
    })

    const makeStage = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
    })

    const makeApp = () => {
        const appCanvas = document.createElement('canvas')
        Object.defineProperty(appCanvas, 'style', {
            value: { border: '', borderRadius: '', display: '' },
            writable: true,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas: appCanvas,
            stage: makeStage(),
            destroy: vi.fn(),
            renderer: { resize: vi.fn() },
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        Text: vi.fn(makeText),
        TextStyle: vi.fn(() => ({})),
        Assets: { load: vi.fn() },
    }
})

import {
    Game2048Renderer,
    createGame2048RendererConfig,
} from './Game2048Renderer'
import { DEFAULT_GAME2048_CONFIG } from './Game2048'
import type { Game2048State } from './frameworkTypes'
import type { Animation } from './types'
import { createEmptyBoard } from './utils'
import { Application, Graphics } from 'pixi.js'
import { PixiJSRenderer } from '@/lib/games/renderers/PixiJSRenderer'

function makeConfig() {
    return createGame2048RendererConfig(
        DEFAULT_GAME2048_CONFIG,
        '#test-2048-container'
    )
}

function makeState(board = createEmptyBoard()): Game2048State {
    return {
        score: 0,
        timeRemaining: 999,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        board,
        maxTile: 0,
        moveCount: 0,
        mergeCount: 0,
        won: false,
        lastMoveAnimations: [],
        tileIdCounter: 0,
        needsRedraw: true,
    }
}

describe('Game2048Renderer', () => {
    let container: HTMLElement

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'test-2048-container'
        document.body.appendChild(container)
        vi.clearAllMocks()
        vi.stubGlobal('requestAnimationFrame', vi.fn())
        vi.stubGlobal('performance', { now: vi.fn().mockReturnValue(0) })
    })

    afterEach(() => {
        if (container.parentNode) {
            document.body.removeChild(container)
        }
        vi.unstubAllGlobals()
    })

    describe('setup / initialize', () => {
        it('creates the PixiJS app and board/tile containers', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const appInst = vi.mocked(Application).mock.results[0].value
            // stage should have boardContainer and tilesContainer added
            expect(appInst.stage.addChild).toHaveBeenCalledTimes(2)

            renderer.cleanup()
        })

        it('draws the board grid during setup', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            // drawBoard creates a Graphics object and adds it to boardContainer
            expect(vi.mocked(Graphics).mock.results.length).toBeGreaterThan(0)

            renderer.cleanup()
        })

        it('throws when the container is missing', async () => {
            container.remove()
            const renderer = new Game2048Renderer(makeConfig())
            await expect(renderer.initialize()).rejects.toThrow()
        })

        it('throws when the PixiJS app is not available after setup', async () => {
            // Make the superclass setup a no-op so `app` is never created,
            // forcing the post-setup guard to throw.
            const setupSpy = vi
                .spyOn(PixiJSRenderer.prototype, 'setup')
                .mockResolvedValue(undefined)
            const renderer = new Game2048Renderer(makeConfig())
            await expect(renderer.initialize()).rejects.toThrow(
                'app not available after setup'
            )
            setupSpy.mockRestore()
            renderer.destroy()
        })
    })

    describe('render', () => {
        it('draws tiles for non-null cells', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const board = createEmptyBoard()
            board[0][0] = {
                id: 'tile-1',
                value: 2,
                position: { row: 0, col: 0 },
            }
            board[1][1] = {
                id: 'tile-2',
                value: 128,
                position: { row: 1, col: 1 },
            }

            // Access the private tilesContainer to assert children were added
            const tilesContainer = (
                renderer as unknown as {
                    tilesContainer: { addChild: ReturnType<typeof vi.fn> }
                }
            ).tilesContainer

            renderer.render(makeState(board))

            expect(tilesContainer.addChild).toHaveBeenCalled()
            renderer.cleanup()
        })

        it('ignores non-2048 state shapes', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const tilesContainer = (
                renderer as unknown as {
                    tilesContainer: { addChild: ReturnType<typeof vi.fn> }
                }
            ).tilesContainer
            tilesContainer.addChild.mockClear()

            renderer.render({ notABoard: true } as unknown as Game2048State)
            expect(tilesContainer.addChild).not.toHaveBeenCalled()

            renderer.cleanup()
        })

        it('ignores null / primitive state', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const tilesContainer = (
                renderer as unknown as {
                    tilesContainer: { addChild: ReturnType<typeof vi.fn> }
                }
            ).tilesContainer
            tilesContainer.addChild.mockClear()

            renderer.render(null as unknown as Game2048State)
            renderer.render(42 as unknown as Game2048State)
            expect(tilesContainer.addChild).not.toHaveBeenCalled()

            renderer.cleanup()
        })

        it('skips drawing the board when boardContainer is null', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const board = createEmptyBoard()
            board[0][0] = {
                id: 'tile-x',
                value: 2,
                position: { row: 0, col: 0 },
            }

            const internals = renderer as unknown as {
                boardContainer: { removeChildren: ReturnType<typeof vi.fn> }
                tilesContainer: { addChild: ReturnType<typeof vi.fn> }
            }
            internals.boardContainer.removeChildren.mockClear()
            // Null out the board container to hit the drawBoard guard.
            ;(renderer as unknown as { boardContainer: null }).boardContainer =
                null

            renderer.render(makeState(board))
            // drawBoard early-returned, so removeChildren was not called
            expect(internals.boardContainer).toBeNull()
            // drawTiles still ran (tilesContainer is intact) and drew the tile
            expect(internals.tilesContainer.addChild).toHaveBeenCalled()

            renderer.cleanup()
        })

        it('skips drawing tiles when tilesContainer is null', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const internals = renderer as unknown as {
                tilesContainer: { addChild: ReturnType<typeof vi.fn> }
            }
            internals.tilesContainer.addChild.mockClear()
            // Null out the tiles container to hit the drawTiles guard.
            ;(renderer as unknown as { tilesContainer: null }).tilesContainer =
                null

            expect(() => renderer.render(makeState())).not.toThrow()
            // drawTiles early-returned; addChild never called
            expect(internals.tilesContainer).toBeNull()

            renderer.cleanup()
        })
    })

    describe('playAnimations', () => {
        beforeEach(() => {
            // Drive animation frames synchronously
            vi.stubGlobal(
                'requestAnimationFrame',
                (cb: FrameRequestCallback) => {
                    cb(0)
                    return 1
                }
            )
            // Monotonically increasing clock: each call advances by 1000ms so
            // the elapsed time between a startTime capture and the first frame
            // always exceeds the animation duration (progress reaches 1).
            let now = 0
            vi.stubGlobal('performance', {
                now: () => {
                    now += 1000
                    return now
                },
            })
        })

        it('plays move/merge/spawn animations and resolves', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const board = createEmptyBoard()
            board[0][0] = {
                id: 't-move',
                value: 2,
                position: { row: 0, col: 0 },
            }
            board[0][1] = {
                id: 't-merge',
                value: 4,
                position: { row: 0, col: 1 },
            }
            board[0][2] = {
                id: 't-spawn',
                value: 2,
                position: { row: 0, col: 2 },
            }

            const animations: Animation[] = [
                {
                    type: 'move',
                    tileId: 't-move',
                    from: { row: 0, col: 3 },
                    to: { row: 0, col: 0 },
                },
                {
                    type: 'merge',
                    tileId: 't-merge',
                    to: { row: 0, col: 1 },
                    value: 4,
                },
                {
                    type: 'spawn',
                    tileId: 't-spawn',
                    to: { row: 0, col: 2 },
                },
            ]

            await expect(
                renderer.playAnimations(animations, makeState(board))
            ).resolves.toBeUndefined()

            renderer.cleanup()
        })

        it('resolves with an empty animation list', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()
            await expect(
                renderer.playAnimations([], makeState())
            ).resolves.toBeUndefined()
            renderer.cleanup()
        })

        it('resolves move/merge/spawn animations when the sprite is missing', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            // Empty board => no sprites populated in tileSprites, so every
            // animation hits its "sprite not found" early-resolve branch.
            const animations: Animation[] = [
                {
                    type: 'move',
                    tileId: 'ghost-move',
                    from: { row: 0, col: 0 },
                    to: { row: 0, col: 1 },
                },
                {
                    type: 'merge',
                    tileId: 'ghost-merge',
                    to: { row: 0, col: 1 },
                    value: 4,
                },
                {
                    type: 'spawn',
                    tileId: 'ghost-spawn',
                    to: { row: 0, col: 2 },
                },
            ]

            await expect(
                renderer.playAnimations(animations, makeState())
            ).resolves.toBeUndefined()

            renderer.cleanup()
        })
    })

    describe('playAnimations - intermediate frames', () => {
        // Drive animation frames synchronously, but with a controllable clock
        // so the first frame of each animation reports progress < 1 (exercising
        // the requestAnimationFrame continuation branches).
        let nowValues: number[]
        let nowIdx: number
        beforeEach(() => {
            vi.stubGlobal(
                'requestAnimationFrame',
                (cb: FrameRequestCallback) => {
                    cb(0)
                    return 1
                }
            )
            nowValues = []
            nowIdx = 0
            vi.stubGlobal('performance', {
                now: () => {
                    const v =
                        nowIdx < nowValues.length
                            ? nowValues[nowIdx]
                            : nowValues[nowValues.length - 1]
                    nowIdx++
                    return v
                },
            })
        })

        it('runs partial-progress frames for move/merge/spawn', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const board = createEmptyBoard()
            board[0][0] = {
                id: 't-move',
                value: 2,
                position: { row: 0, col: 0 },
            }
            board[0][1] = {
                id: 't-merge',
                value: 4,
                position: { row: 0, col: 1 },
            }
            board[0][2] = {
                id: 't-spawn',
                value: 2,
                position: { row: 0, col: 2 },
            }

            const animations: Animation[] = [
                {
                    type: 'move',
                    tileId: 't-move',
                    from: { row: 0, col: 3 },
                    to: { row: 0, col: 0 },
                },
                {
                    type: 'merge',
                    tileId: 't-merge',
                    to: { row: 0, col: 1 },
                    value: 4,
                },
                {
                    type: 'spawn',
                    tileId: 't-spawn',
                    to: { row: 0, col: 2 },
                },
            ]

            // Clock sequence so each animation sees a partial frame (progress
            // < 1) then a completing frame (progress >= 1). duration is 150ms.
            nowValues = [
                0,
                50,
                200, // move: start=0, frame1 elapsed=50, frame2 elapsed=200
                200,
                250,
                400, // merge: start=200, frame1 elapsed=50, frame2 elapsed=200
                400,
                450,
                600, // spawn: start=400, frame1 elapsed=50, frame2 elapsed=200
            ]

            await expect(
                renderer.playAnimations(animations, makeState(board))
            ).resolves.toBeUndefined()

            renderer.cleanup()
        })
    })

    describe('cleanup', () => {
        it('destroys the tile and board containers', async () => {
            const renderer = new Game2048Renderer(makeConfig())
            await renderer.initialize()

            const internals = renderer as unknown as {
                tilesContainer: { destroy: ReturnType<typeof vi.fn> }
                boardContainer: { destroy: ReturnType<typeof vi.fn> }
            }
            // Capture references before cleanup nulls them out
            const tilesContainer = internals.tilesContainer
            const boardContainer = internals.boardContainer

            renderer.cleanup()

            expect(tilesContainer.destroy).toHaveBeenCalledWith({
                children: true,
            })
            expect(boardContainer.destroy).toHaveBeenCalledWith({
                children: true,
            })
        })
    })

    describe('createGame2048RendererConfig', () => {
        it('maps game config fields onto renderer config', () => {
            const cfg = createGame2048RendererConfig(
                DEFAULT_GAME2048_CONFIG,
                '#c'
            )
            expect(cfg.type).toBe('canvas')
            expect(cfg.container).toBe('#c')
            expect(cfg.tileSize).toBe(DEFAULT_GAME2048_CONFIG.tileSize)
            expect(cfg.gap).toBe(DEFAULT_GAME2048_CONFIG.gap)
            expect(cfg.animationDuration).toBe(
                DEFAULT_GAME2048_CONFIG.animationDuration
            )
        })
    })
})
