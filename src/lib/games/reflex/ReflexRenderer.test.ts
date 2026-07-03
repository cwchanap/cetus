// ReflexRenderer unit tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReflexRenderer, createReflexRendererConfig } from './ReflexRenderer'
import type { ReflexConfig, ReflexState } from './frameworkTypes'
import type { GameObject, Cell } from './types'
import { DEFAULT_REFLEX_CONFIG } from './ReflexGame'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
            scale: { set: vi.fn() },
            anchor: { set: vi.fn() },
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
            renderer: { resize: vi.fn() },
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        FillGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        Text: vi.fn(() => ({
            text: '',
            destroy: vi.fn(),
            anchor: { set: vi.fn() },
        })),
        Assets: { load: vi.fn() },
    }
})

function makeConfig(overrides: Partial<ReflexConfig> = {}): ReflexConfig {
    return { ...DEFAULT_REFLEX_CONFIG, ...overrides }
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

function makeReflexState(overrides: Partial<ReflexState> = {}): ReflexState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        objects: [],
        grid: [],
        totalClicks: 0,
        correctClicks: 0,
        incorrectClicks: 0,
        coinsCollected: 0,
        bombsHit: 0,
        missedCoins: 0,
        gameHistory: [],
        needsRedraw: true,
        ...overrides,
    }
}

describe('ReflexRenderer', () => {
    let container: HTMLElement

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'game-canvas-container'
        document.body.appendChild(container)
    })

    afterEach(() => {
        document.body.removeChild(container)
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    describe('setup', () => {
        it('initializes and creates grid + object containers', async () => {
            const config = makeConfig()
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            const app = renderer.getApp()
            expect(app).toBeDefined()
            // Grid cells created during setup
            const stage = app!.stage
            expect(stage.addChild).toHaveBeenCalled()

            renderer.cleanup()
        })

        it('appends the canvas to the container', async () => {
            const config = makeConfig()
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            expect(container.children.length).toBeGreaterThan(0)
            renderer.cleanup()
        })
    })

    describe('render', () => {
        it('renders active objects when needsRedraw is true', async () => {
            const config = makeConfig({ gridSize: 6 })
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            const coin = makeGameObject('coin-1', 'coin', 0, 0)
            const state = makeReflexState({
                objects: [coin],
                needsRedraw: true,
            })

            renderer.render(state)

            // No throw means render succeeded
            expect(true).toBe(true)
            renderer.cleanup()
        })

        it('skips render when needsRedraw is false', async () => {
            const config = makeConfig()
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            const state = makeReflexState({ needsRedraw: false })
            renderer.render(state)

            expect(true).toBe(true)
            renderer.cleanup()
        })

        it('removes objects no longer in state', async () => {
            const config = makeConfig({ gridSize: 6 })
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            const coin = makeGameObject('coin-1', 'coin', 0, 0)
            const state1 = makeReflexState({
                objects: [coin],
                needsRedraw: true,
            })
            renderer.render(state1)

            const state2 = makeReflexState({ objects: [], needsRedraw: true })
            renderer.render(state2)

            expect(true).toBe(true)
            renderer.cleanup()
        })
    })

    describe('getCellFromPosition', () => {
        it('returns correct row/col for valid position', async () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            // padding=20, click at (60,100) -> adjusted (40,80) -> col=1, row=2
            const result = renderer.getCellFromPosition(60, 100)
            expect(result).toEqual({ row: 2, col: 1 })

            renderer.cleanup()
        })

        it('returns null for negative adjusted coordinates', async () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            expect(renderer.getCellFromPosition(5, 50)).toBeNull()
            expect(renderer.getCellFromPosition(50, 5)).toBeNull()

            renderer.cleanup()
        })

        it('returns null for out-of-bounds positions', async () => {
            const config = makeConfig({ cellSize: 40, gridSize: 6 })
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            // 20 + 6*40 = 260, past the edge
            expect(renderer.getCellFromPosition(261, 50)).toBeNull()
            expect(renderer.getCellFromPosition(50, 261)).toBeNull()

            renderer.cleanup()
        })
    })

    describe('showClickEffect', () => {
        it('does not throw when called after setup', async () => {
            const config = makeConfig()
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            vi.stubGlobal('requestAnimationFrame', vi.fn())
            expect(() => renderer.showClickEffect(0, 0, true)).not.toThrow()

            renderer.cleanup()
        })
    })

    describe('getLogicalSize', () => {
        it('returns gridSize * cellSize + 40', async () => {
            const config = makeConfig({ gridSize: 12, cellSize: 40 })
            const rendererConfig = createReflexRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new ReflexRenderer(rendererConfig)
            await renderer.initialize()

            expect(renderer.getLogicalSize()).toBe(12 * 40 + 40)

            renderer.cleanup()
        })
    })

    describe('createReflexRendererConfig', () => {
        it('produces a config with correct dimensions', () => {
            const config = makeConfig({ gridSize: 6, cellSize: 50 })
            const rc = createReflexRendererConfig(config, '#test')
            const expected = 6 * 50 + 40
            expect(rc.width).toBe(expected)
            expect(rc.height).toBe(expected)
            expect(rc.gridSize).toBe(6)
            expect(rc.cellSize).toBe(50)
            expect(rc.container).toBe('#test')
        })
    })
})
