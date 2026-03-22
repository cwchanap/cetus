import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
            scale: { set: vi.fn() },
        }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'poly',
            'addChild',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }

    const makeContainer = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        x: 0,
        y: 0,
    })

    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', boxShadow: '' },
            writable: true,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
        }
    }

    const MockApplication = vi.fn(makeApp)
    const MockContainer = vi.fn(makeContainer)
    const MockGraphics = vi.fn(makeGraphics)
    const MockFillGradient = vi.fn(() => ({ addColorStop: vi.fn() }))
    const MockText = vi.fn(() => ({
        text: '',
        destroy: vi.fn(),
        anchor: { set: vi.fn() },
    }))

    return {
        Application: MockApplication,
        Container: MockContainer,
        Graphics: MockGraphics,
        FillGradient: MockFillGradient,
        Text: MockText,
    }
})

import {
    setupPixiJS,
    renderGrid,
    renderObject,
    removeObject,
    showClickEffect,
    getCellFromPosition,
    cleanup,
} from './renderer'
import type { RendererState, GameConfig, GameObject, Cell } from './types'
import { Application, Graphics } from 'pixi.js'

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
    return {
        gameDuration: 60,
        gridSize: 6,
        cellSize: 40,
        objectLifetime: 2,
        spawnInterval: 1,
        coinToBombRatio: 8,
        pointsForCoin: 10,
        pointsForBomb: -20,
        pointsForMissedCoin: -5,
        ...overrides,
    }
}

function makeCell(row: number, col: number): Cell {
    return {
        id: `cell-${row}-${col}`,
        row,
        col,
        x: col * 40,
        y: row * 40,
    }
}

function makeGameObject(
    id: string,
    type: 'coin' | 'bomb',
    row = 0,
    col = 0,
    isActive = true
): GameObject {
    return {
        id,
        type,
        cell: makeCell(row, col),
        spawnTime: Date.now(),
        expirationTime: Date.now() + 2000,
        isActive,
        clicked: false,
    }
}

function makeRendererState(config: GameConfig = makeConfig()): RendererState {
    const MockApp = vi.mocked(Application)
    const appInst = new MockApp() as unknown as RendererState['app']

    // Build cellGraphics grid
    const MockGfx = vi.mocked(Graphics)
    const cellGraphics: ReturnType<typeof Graphics>[][] = []
    for (let r = 0; r < config.gridSize; r++) {
        cellGraphics[r] = []
        for (let c = 0; c < config.gridSize; c++) {
            cellGraphics[r][c] = new MockGfx() as unknown as ReturnType<
                typeof Graphics
            >
        }
    }

    const makeContainer = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        x: 0,
        y: 0,
    })

    return {
        app: appInst as unknown as RendererState['app'],
        stage: makeContainer() as unknown as RendererState['stage'],
        gridContainer:
            makeContainer() as unknown as RendererState['gridContainer'],
        objectContainer:
            makeContainer() as unknown as RendererState['objectContainer'],
        cellGraphics: cellGraphics as unknown as RendererState['cellGraphics'],
        objectGraphics: new Map(),
    }
}

describe('reflex/renderer', () => {
    let gameContainer: HTMLElement

    beforeEach(() => {
        gameContainer = document.createElement('div')
        document.body.appendChild(gameContainer)
        vi.clearAllMocks()
    })

    afterEach(() => {
        document.body.removeChild(gameContainer)
    })

    describe('setupPixiJS', () => {
        it('should create and return a valid RendererState', async () => {
            const config = makeConfig()
            const state = await setupPixiJS(gameContainer, config)

            expect(state).toBeDefined()
            expect(state.app).toBeDefined()
            expect(state.stage).toBeDefined()
            expect(state.gridContainer).toBeDefined()
            expect(state.objectContainer).toBeDefined()
            expect(state.cellGraphics).toBeDefined()
            expect(state.objectGraphics).toBeInstanceOf(Map)
        })

        it('should initialize app with canvas size based on gridSize * cellSize', async () => {
            const config = makeConfig({ gridSize: 5, cellSize: 50 })
            await setupPixiJS(gameContainer, config)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            const expectedSize = 5 * 50 + 40 // padding
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: expectedSize,
                    height: expectedSize,
                })
            )
        })

        it('should append canvas to game container', async () => {
            const config = makeConfig()
            await setupPixiJS(gameContainer, config)
            expect(gameContainer.children.length).toBeGreaterThan(0)
        })

        it('should create cellGraphics grid with correct size', async () => {
            const config = makeConfig({ gridSize: 4 })
            const state = await setupPixiJS(gameContainer, config)

            expect(state.cellGraphics).toHaveLength(4)
            expect(state.cellGraphics[0]).toHaveLength(4)
        })

        it('should clear container and throw when app init fails', async () => {
            const MockApp = vi.mocked(Application)
            MockApp.mockImplementationOnce(() => {
                return {
                    init: vi.fn().mockRejectedValue(new Error('WebGL failed')),
                    canvas: document.createElement('canvas'),
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn(),
                } as unknown as InstanceType<typeof Application>
            })

            const config = makeConfig()
            await expect(setupPixiJS(gameContainer, config)).rejects.toThrow()
        })
    })

    describe('renderGrid', () => {
        it('should clear and redraw each cell graphic', () => {
            const config = makeConfig({ gridSize: 2 })
            const state = makeRendererState(config)

            renderGrid(state, [], config)

            // Each of the 4 cells (2x2) should have clear() called
            for (let r = 0; r < 2; r++) {
                for (let c = 0; c < 2; c++) {
                    expect(state.cellGraphics[r][c].clear).toHaveBeenCalled()
                }
            }
        })

        it('should draw rect and apply fill and stroke for each cell', () => {
            const config = makeConfig({ gridSize: 2 })
            const state = makeRendererState(config)

            renderGrid(state, [], config)

            const cell = state.cellGraphics[0][0]
            expect(cell.rect).toHaveBeenCalled()
            expect(cell.fill).toHaveBeenCalled()
            expect(cell.stroke).toHaveBeenCalled()
        })
    })

    describe('renderObject', () => {
        it('should add a coin to objectGraphics map', () => {
            const config = makeConfig()
            const state = makeRendererState(config)
            const coin = makeGameObject('coin-1', 'coin', 0, 0)

            renderObject(state, coin, config)

            expect(state.objectGraphics.has('coin-1')).toBe(true)
            expect(state.objectContainer.addChild).toHaveBeenCalled()
        })

        it('should add a bomb to objectGraphics map', () => {
            const config = makeConfig()
            const state = makeRendererState(config)
            const bomb = makeGameObject('bomb-1', 'bomb', 1, 1)

            renderObject(state, bomb, config)

            expect(state.objectGraphics.has('bomb-1')).toBe(true)
        })

        it('should remove inactive object without adding to map', () => {
            const config = makeConfig()
            const state = makeRendererState(config)
            const inactiveObj = makeGameObject('obj-1', 'coin', 0, 0, false)

            renderObject(state, inactiveObj, config)

            expect(state.objectGraphics.has('obj-1')).toBe(false)
        })

        it('should remove existing graphic before re-rendering', () => {
            const config = makeConfig()
            const state = makeRendererState(config)
            const MockGfx = vi.mocked(Graphics)
            const existing = new MockGfx() as unknown as ReturnType<
                typeof Graphics
            >
            state.objectGraphics.set(
                'coin-1',
                existing as unknown as RendererState['cellGraphics'][0][0]
            )

            const coin = makeGameObject('coin-1', 'coin', 0, 0)
            renderObject(state, coin, config)

            expect(state.objectContainer.removeChild).toHaveBeenCalled()
        })

        it('should use FillGradient for coin and bomb', async () => {
            const config = makeConfig()
            const state = makeRendererState(config)

            renderObject(state, makeGameObject('coin-1', 'coin'), config)
            renderObject(state, makeGameObject('bomb-1', 'bomb', 1, 1), config)

            const { FillGradient } = await import('pixi.js')
            expect(vi.mocked(FillGradient)).toHaveBeenCalled()
        })

        it('should scale object when lifetime is < 50%', () => {
            const config = makeConfig({ objectLifetime: 2 })
            const state = makeRendererState(config)
            // Create an object that is 60% through its life (< 50% remaining)
            const now = Date.now()
            const obj: GameObject = {
                id: 'obj-expiring',
                type: 'coin',
                cell: makeCell(0, 0),
                spawnTime: now - 1400,
                expirationTime: now + 600, // 30% remaining lifetime
                isActive: true,
                clicked: false,
            }

            renderObject(state, obj, config)

            const MockGfx = vi.mocked(Graphics)
            const objGfx = state.objectGraphics.get('obj-expiring')
            expect(objGfx).toBeDefined()
            // Scale should have been set (pulsing effect)
            expect(objGfx!.scale.set).toHaveBeenCalled()
        })
    })

    describe('removeObject', () => {
        it('should remove an existing object graphic', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            const graphic =
                new MockGfx() as unknown as RendererState['cellGraphics'][0][0]
            state.objectGraphics.set('obj-1', graphic)

            removeObject(state, 'obj-1')

            expect(state.objectContainer.removeChild).toHaveBeenCalled()
            expect(state.objectGraphics.has('obj-1')).toBe(false)
        })

        it('should not throw when removing non-existent object', () => {
            const state = makeRendererState()
            expect(() => removeObject(state, 'nonexistent')).not.toThrow()
        })
    })

    describe('showClickEffect', () => {
        it('should add a positive click effect (green) to objectContainer', () => {
            const config = makeConfig()
            const state = makeRendererState(config)

            vi.stubGlobal('requestAnimationFrame', vi.fn())

            showClickEffect(state, 0, 0, config, true)

            expect(state.objectContainer.addChild).toHaveBeenCalled()
            const MockGfx = vi.mocked(Graphics)
            const effectGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(effectGfx.circle).toHaveBeenCalled()
            expect(effectGfx.fill).toHaveBeenCalledWith(
                expect.objectContaining({ color: 0x00ff00 })
            )

            vi.unstubAllGlobals()
        })

        it('should add a negative click effect (red) to objectContainer', () => {
            const config = makeConfig()
            const state = makeRendererState(config)

            vi.stubGlobal('requestAnimationFrame', vi.fn())

            showClickEffect(state, 1, 2, config, false)

            const MockGfx = vi.mocked(Graphics)
            const effectGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(effectGfx.fill).toHaveBeenCalledWith(
                expect.objectContaining({ color: 0xff0000 })
            )

            vi.unstubAllGlobals()
        })

        it('should call requestAnimationFrame to animate effect', () => {
            const config = makeConfig()
            const state = makeRendererState(config)
            const rafMock = vi.fn()
            vi.stubGlobal('requestAnimationFrame', rafMock)

            showClickEffect(state, 0, 0, config, true)

            expect(rafMock).toHaveBeenCalled()
            vi.unstubAllGlobals()
        })

        it('animate callback removes effect when alpha reaches 0', () => {
            const config = makeConfig()
            const state = makeRendererState(config)
            let animateFn: FrameRequestCallback = () => {}
            vi.stubGlobal(
                'requestAnimationFrame',
                (cb: FrameRequestCallback) => {
                    animateFn = cb
                    return 1
                }
            )

            showClickEffect(state, 0, 0, config, true)

            // Simulate animation running until alpha <= 0 (9 steps)
            for (let i = 0; i < 9; i++) {
                animateFn(0)
            }

            expect(state.objectContainer.removeChild).toHaveBeenCalled()
            vi.unstubAllGlobals()
        })
    })

    describe('getCellFromPosition', () => {
        it('should return correct row/col for valid position', () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            const padding = 20

            // Click at (60, 100) → adjusted (40, 80) → col=1, row=2
            const result = getCellFromPosition(
                padding + 40,
                padding + 80,
                config
            )
            expect(result).toEqual({ row: 2, col: 1 })
        })

        it('should return null when x is negative after padding', () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            const result = getCellFromPosition(5, 50, config) // adjustedX = -15
            expect(result).toBeNull()
        })

        it('should return null when y is negative after padding', () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            const result = getCellFromPosition(50, 5, config) // adjustedY = -15
            expect(result).toBeNull()
        })

        it('should return null when col is out of grid bounds', () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            // col would be 10, out of bounds
            const result = getCellFromPosition(20 + 400 + 1, 50, config)
            expect(result).toBeNull()
        })

        it('should return null when row is out of grid bounds', () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            // row would be 10, out of bounds
            const result = getCellFromPosition(50, 20 + 400 + 1, config)
            expect(result).toBeNull()
        })

        it('should return {row: 0, col: 0} for top-left cell click', () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            // Click just inside padding (20, 20) → (0, 0) → col=0, row=0
            const result = getCellFromPosition(21, 21, config)
            expect(result).toEqual({ row: 0, col: 0 })
        })
    })

    describe('cleanup', () => {
        it('should clear objectGraphics map', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            const g =
                new MockGfx() as unknown as RendererState['cellGraphics'][0][0]
            state.objectGraphics.set('obj-1', g)

            cleanup(state)

            expect(state.objectGraphics.size).toBe(0)
        })

        it('should destroy the PixiJS app', () => {
            const state = makeRendererState()
            cleanup(state)
            expect(state.app.destroy).toHaveBeenCalled()
        })
    })
})
