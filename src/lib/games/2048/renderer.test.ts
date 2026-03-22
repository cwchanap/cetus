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
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', display: '' },
            writable: true,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: makeStage(),
            destroy: vi.fn(),
        }
    }

    const MockApplication = vi.fn(makeApp)
    const MockContainer = vi.fn(makeContainer)
    const MockGraphics = vi.fn(makeGraphics)
    const MockText = vi.fn(makeText)
    const MockTextStyle = vi.fn(() => ({}))

    return {
        Application: MockApplication,
        Container: MockContainer,
        Graphics: MockGraphics,
        Text: MockText,
        TextStyle: MockTextStyle,
    }
})

import {
    setupPixiJS,
    drawBoard,
    drawTiles,
    animateTileMove,
    animateTileMerge,
    animateTileSpawn,
    draw,
    destroyRenderer,
    type RendererState,
} from './renderer'
import type { GameState, Position, Animation } from './types'
import { Application, Container, Graphics } from 'pixi.js'

function makeRendererState(): RendererState {
    const MockApp = vi.mocked(Application)
    const appInst = new MockApp() as unknown as RendererState['app']

    const makeCont = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        position: { set: vi.fn(), x: 0, y: 0 },
        pivot: { set: vi.fn(), x: 0, y: 0 },
        scale: { set: vi.fn(), x: 1, y: 1 },
        alpha: 1,
    })

    return {
        app: appInst as unknown as RendererState['app'],
        stage: makeCont() as unknown as RendererState['stage'],
        boardContainer:
            makeCont() as unknown as RendererState['boardContainer'],
        tilesContainer:
            makeCont() as unknown as RendererState['tilesContainer'],
        tileSprites: new Map(),
    }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        board: [
            [null, null, null, null],
            [null, null, null, null],
            [null, null, null, null],
            [null, null, null, null],
        ],
        score: 0,
        bestScore: 0,
        isGameOver: false,
        isWon: false,
        gameStarted: true,
        isPaused: false,
        timeRemaining: 60,
        animations: [],
        ...overrides,
    } as unknown as GameState
}

function makeTile(id: string, value: number) {
    return { id, value, isNew: false, isMerged: false }
}

describe('2048/renderer', () => {
    let gameContainer: HTMLElement

    beforeEach(() => {
        gameContainer = document.createElement('div')
        document.body.appendChild(gameContainer)
        vi.clearAllMocks()
        vi.stubGlobal('requestAnimationFrame', vi.fn())
        vi.stubGlobal('performance', { now: vi.fn().mockReturnValue(0) })
    })

    afterEach(() => {
        document.body.removeChild(gameContainer)
        vi.unstubAllGlobals()
    })

    describe('setupPixiJS', () => {
        it('should create a RendererState with required fields', async () => {
            const state = await setupPixiJS(gameContainer)
            expect(state.app).toBeDefined()
            expect(state.stage).toBeDefined()
            expect(state.boardContainer).toBeDefined()
            expect(state.tilesContainer).toBeDefined()
            expect(state.tileSprites).toBeInstanceOf(Map)
        })

        it('should append canvas to game container', async () => {
            await setupPixiJS(gameContainer)
            expect(gameContainer.children.length).toBeGreaterThan(0)
        })

        it('should add boardContainer and tilesContainer to stage', async () => {
            await setupPixiJS(gameContainer)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.stage.addChild).toHaveBeenCalledTimes(2)
        })

        it('should clear container and add error div when init fails', async () => {
            const MockApp = vi.mocked(Application)
            MockApp.mockImplementationOnce(
                () =>
                    ({
                        init: vi
                            .fn()
                            .mockRejectedValue(new Error('WebGL error')),
                        canvas: document.createElement('canvas'),
                        stage: { addChild: vi.fn() },
                        destroy: vi.fn(),
                    }) as unknown as InstanceType<typeof Application>
            )

            await expect(setupPixiJS(gameContainer)).rejects.toThrow()
            expect(gameContainer.innerHTML).toContain('Failed to initialize')
        })
    })

    describe('drawBoard', () => {
        it('should remove children from boardContainer and add grid graphic', () => {
            const state = makeRendererState()
            drawBoard(state)

            expect(state.boardContainer.removeChildren).toHaveBeenCalled()
            expect(state.boardContainer.addChild).toHaveBeenCalled()
        })

        it('should create a Graphics object and draw background', () => {
            const state = makeRendererState()
            const beforeCount = vi.mocked(Graphics).mock.results.length

            drawBoard(state)

            expect(vi.mocked(Graphics).mock.results.length).toBeGreaterThan(
                beforeCount
            )
            const gfx = vi.mocked(Graphics).mock.results[beforeCount].value
            expect(gfx.roundRect).toHaveBeenCalled()
            expect(gfx.fill).toHaveBeenCalled()
        })
    })

    describe('drawTiles', () => {
        it('should clear tilesContainer and tileSprites', () => {
            const state = makeRendererState()
            state.tileSprites.set(
                'existing',
                {} as unknown as RendererState['tilesContainer']
            )

            const gameState = makeGameState()
            drawTiles(state, gameState)

            expect(state.tilesContainer.removeChildren).toHaveBeenCalled()
            expect(state.tileSprites.size).toBe(0)
        })

        it('should add tile sprites for non-null tiles', () => {
            const state = makeRendererState()
            const gameState = makeGameState({
                board: [
                    [makeTile('tile-1', 2) as any, null, null, null],
                    [null, null, null, null],
                    [null, null, null, null],
                    [null, null, null, null],
                ],
            })

            drawTiles(state, gameState)

            expect(state.tileSprites.has('tile-1')).toBe(true)
            expect(state.tilesContainer.addChild).toHaveBeenCalled()
        })

        it('should handle high value tiles (>= 128) with glow effect', () => {
            const state = makeRendererState()
            const gameState = makeGameState({
                board: [
                    [makeTile('tile-high', 256) as any, null, null, null],
                    [null, null, null, null],
                    [null, null, null, null],
                    [null, null, null, null],
                ],
            })

            expect(() => drawTiles(state, gameState)).not.toThrow()
            expect(state.tileSprites.has('tile-high')).toBe(true)
        })

        it('should skip null tiles', () => {
            const state = makeRendererState()
            const gameState = makeGameState() // all null board

            drawTiles(state, gameState)

            expect(state.tileSprites.size).toBe(0)
        })
    })

    describe('animateTileMove', () => {
        it('should resolve immediately when sprite not found', async () => {
            const state = makeRendererState()
            // tileSprites is empty
            await expect(
                animateTileMove(
                    state,
                    'missing-tile',
                    { row: 0, col: 0 },
                    { row: 1, col: 0 }
                )
            ).resolves.toBeUndefined()
        })

        it('should call requestAnimationFrame when sprite exists', () => {
            const rafMock = vi.mocked(requestAnimationFrame)
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-1', sprite)

            animateTileMove(
                state,
                'tile-1',
                { row: 0, col: 0 },
                { row: 1, col: 0 }
            )
            expect(rafMock).toHaveBeenCalled()
        })
    })

    describe('animateTileMerge', () => {
        it('should resolve immediately when sprite not found', async () => {
            const state = makeRendererState()
            await expect(
                animateTileMerge(state, 'missing-tile', { row: 0, col: 0 }, 4)
            ).resolves.toBeUndefined()
        })

        it('should call requestAnimationFrame when sprite exists', () => {
            const rafMock = vi.mocked(requestAnimationFrame)
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-1', sprite)

            animateTileMerge(state, 'tile-1', { row: 0, col: 0 }, 4)
            expect(rafMock).toHaveBeenCalled()
        })
    })

    describe('animateTileSpawn', () => {
        it('should resolve immediately when sprite not found', async () => {
            const state = makeRendererState()
            await expect(
                animateTileSpawn(state, 'missing-tile', { row: 0, col: 0 })
            ).resolves.toBeUndefined()
        })

        it('should set initial alpha and scale when sprite exists', () => {
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-1', sprite)

            animateTileSpawn(state, 'tile-1', { row: 0, col: 0 })

            expect(sprite.alpha).toBe(0)
            expect(sprite.scale.set).toHaveBeenCalledWith(0.5)
        })
    })

    describe('draw', () => {
        it('should call drawBoard and drawTiles', () => {
            const state = makeRendererState()
            const gameState = makeGameState()

            draw(state, gameState)

            expect(state.boardContainer.removeChildren).toHaveBeenCalled()
            expect(state.tilesContainer.removeChildren).toHaveBeenCalled()
        })
    })

    describe('destroyRenderer', () => {
        it('should remove children from tilesContainer and boardContainer', () => {
            const state = makeRendererState()
            destroyRenderer(state)

            expect(state.tilesContainer.removeChildren).toHaveBeenCalled()
            expect(state.boardContainer.removeChildren).toHaveBeenCalled()
        })

        it('should clear tileSprites map', () => {
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            state.tileSprites.set(
                'tile-1',
                new MockCont() as unknown as RendererState['tilesContainer']
            )

            destroyRenderer(state)

            expect(state.tileSprites.size).toBe(0)
        })

        it('should destroy the app', () => {
            const state = makeRendererState()
            destroyRenderer(state)
            expect(state.app.destroy).toHaveBeenCalled()
        })
    })

    describe('animation integrate callbacks', () => {
        it('animateTileMove: animate callback runs until progress >= 1', async () => {
            let animateFn: FrameRequestCallback = () => {}
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                animateFn = cb
                return 1
            })

            const mockPerf = { now: vi.fn() }
            vi.stubGlobal('performance', mockPerf)

            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-1', sprite)

            mockPerf.now.mockReturnValue(0)
            const promise = animateTileMove(
                state,
                'tile-1',
                { row: 0, col: 0 },
                { row: 1, col: 1 },
                100
            )

            // Simulate animation completion (elapsed > duration)
            mockPerf.now.mockReturnValue(200)
            animateFn(200)

            await promise
            // Should have set final position
            expect(sprite.position.set).toHaveBeenCalled()
        })

        it('animateTileMerge: animate callback runs pop effect', async () => {
            let animateFn: FrameRequestCallback = () => {}
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                animateFn = cb
                return 1
            })

            const mockPerf = { now: vi.fn() }
            vi.stubGlobal('performance', mockPerf)

            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-1', sprite)

            mockPerf.now.mockReturnValue(0)
            const promise = animateTileMerge(
                state,
                'tile-1',
                { row: 0, col: 0 },
                4,
                100
            )

            // First half (< 0.5 progress) - scale up
            mockPerf.now.mockReturnValue(30)
            animateFn(30)
            expect(sprite.scale.set).toHaveBeenCalled()

            // Completion
            mockPerf.now.mockReturnValue(200)
            animateFn(200)

            await promise
        })

        it('animateTileSpawn: animate callback fades in tile', async () => {
            let animateFn: FrameRequestCallback = () => {}
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                animateFn = cb
                return 1
            })

            const mockPerf = { now: vi.fn() }
            vi.stubGlobal('performance', mockPerf)

            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-spawn', sprite)

            mockPerf.now.mockReturnValue(0)
            const promise = animateTileSpawn(
                state,
                'tile-spawn',
                { row: 0, col: 0 },
                100
            )

            // Mid animation
            mockPerf.now.mockReturnValue(50)
            animateFn(50)

            // Completion
            mockPerf.now.mockReturnValue(200)
            animateFn(200)

            await promise
            expect(sprite.alpha).toBe(1)
        })
    })
})
