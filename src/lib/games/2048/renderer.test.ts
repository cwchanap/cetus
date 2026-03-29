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
    playAnimations,
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

        it('should remove pre-existing container children when init fails (lines 71-72)', async () => {
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

            // Pre-populate container with a child so the while loop body (line 71) executes
            const preexisting = document.createElement('span')
            gameContainer.appendChild(preexisting)

            await expect(setupPixiJS(gameContainer)).rejects.toThrow()
            // Preexisting child removed, error div added instead
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

        it('should call requestAnimationFrame again when progress < 1 (animation loop)', async () => {
            // Track call count to performance.now - only count calls INSIDE animate()
            // startTime gets 0, first animate() call gets 0 (progress=0 < 1), second gets 1000 (progress=1)
            const nowValues = [0, 0, 0, 1000] // indexed by call order
            let nowIdx = 0
            vi.stubGlobal('performance', {
                now: vi.fn(
                    () => nowValues[Math.min(nowIdx++, nowValues.length - 1)]
                ),
            })

            // RAF executes callback synchronously each time it's called
            let rafCallCount = 0
            vi.stubGlobal(
                'requestAnimationFrame',
                (cb: FrameRequestCallback) => {
                    rafCallCount++
                    cb(0) // pass 0 as timestamp, animate() uses performance.now() internally
                    return rafCallCount
                }
            )

            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-1', sprite)

            // duration=100ms; first animate call: elapsed=0, progress=0 → recurse (line 218)
            // second animate call: elapsed=1000, progress=1 → resolve
            await animateTileMove(
                state,
                'tile-1',
                { row: 0, col: 0 },
                { row: 1, col: 0 },
                100
            )
            // RAF should have been called more than once (line 218 executed)
            expect(rafCallCount).toBeGreaterThan(1)
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

    describe('playAnimations', () => {
        beforeEach(() => {
            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn().mockImplementation(cb => {
                    cb(performance.now ? performance.now() : 0)
                    return 1
                })
            )
        })

        it('should resolve with empty animations array', async () => {
            const state = makeRendererState()
            const gameState = makeGameState()
            await expect(
                playAnimations(state, [], gameState)
            ).resolves.toBeUndefined()
        })

        it('should play move animations', async () => {
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-move', sprite)

            const gameState = makeGameState()
            const animations: Animation[] = [
                {
                    type: 'move',
                    tileId: 'tile-move',
                    from: { row: 0, col: 0 },
                    to: { row: 0, col: 1 },
                },
            ]

            await expect(
                playAnimations(state, animations, gameState)
            ).resolves.toBeUndefined()
        })

        it('should play merge animations', async () => {
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-merge', sprite)

            const gameState = makeGameState()
            const animations: Animation[] = [
                {
                    type: 'merge',
                    tileId: 'tile-merge',
                    from: { row: 0, col: 0 },
                    to: { row: 0, col: 1 },
                    value: 8,
                },
            ]

            await expect(
                playAnimations(state, animations, gameState)
            ).resolves.toBeUndefined()
        })

        it('should play spawn animations', async () => {
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            const sprite =
                new MockCont() as unknown as RendererState['tilesContainer']
            state.tileSprites.set('tile-spawn', sprite)

            const gameState = makeGameState()
            const animations: Animation[] = [
                {
                    type: 'spawn',
                    tileId: 'tile-spawn',
                    from: { row: 0, col: 0 },
                    to: { row: 1, col: 1 },
                },
            ]

            await expect(
                playAnimations(state, animations, gameState)
            ).resolves.toBeUndefined()
        })

        it('should play mixed animation types', async () => {
            const state = makeRendererState()
            const MockCont = vi.mocked(Container)
            for (const id of ['tile-a', 'tile-b', 'tile-c']) {
                state.tileSprites.set(
                    id,
                    new MockCont() as unknown as RendererState['tilesContainer']
                )
            }

            const gameState = makeGameState()
            const animations: Animation[] = [
                {
                    type: 'move',
                    tileId: 'tile-a',
                    from: { row: 0, col: 0 },
                    to: { row: 0, col: 1 },
                },
                {
                    type: 'merge',
                    tileId: 'tile-b',
                    from: { row: 1, col: 0 },
                    to: { row: 1, col: 1 },
                    value: 4,
                },
                {
                    type: 'spawn',
                    tileId: 'tile-c',
                    from: { row: 2, col: 0 },
                    to: { row: 2, col: 0 },
                },
            ]

            await expect(
                playAnimations(state, animations, gameState)
            ).resolves.toBeUndefined()
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
