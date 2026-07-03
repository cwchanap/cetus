import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as PIXI from 'pixi.js'
import {
    PathNavigatorRenderer,
    createPathNavigatorRendererConfig,
} from './PathNavigatorRenderer'
import { DEFAULT_PATH_NAVIGATOR_CONFIG } from './PathNavigatorGame'
import type { PathNavigatorState } from './types'

// Mock pixi.js Application/Container/Graphics to allow running in jsdom.
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'poly',
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

    const makeStage = () => ({ addChild: vi.fn() })

    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.assign(canvas, { width: 800, height: 600 })
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', cursor: '' },
            writable: true,
        })
        canvas.getBoundingClientRect = vi.fn().mockReturnValue({
            left: 0,
            top: 0,
            width: 800,
            height: 600,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: makeStage(),
            renderer: { resize: vi.fn() },
            destroy: vi.fn(),
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        Assets: { load: vi.fn() },
        Text: vi.fn(),
        Sprite: vi.fn(),
        Texture: { EMPTY: {} },
    }
})

function makeState(
    overrides: Partial<PathNavigatorState> = {}
): PathNavigatorState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: false,
        isPaused: false,
        isGameOver: false,
        gameStarted: false,
        currentLevel: 1,
        isGameWon: false,
        gameStartTime: null,
        cursor: { x: 50, y: 300, radius: 8, isVisible: true },
        isOnPath: true,
        hasReachedGoal: false,
        totalLevels: 4,
        levelStartTime: null,
        isBoundaryDetectionEnabled: false,
        ...overrides,
    }
}

describe('PathNavigatorRenderer', () => {
    let container: HTMLElement

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'path-navigator-container'
        document.body.appendChild(container)
    })

    afterEach(() => {
        document.body.removeChild(container)
    })

    function makeRenderer() {
        const config = createPathNavigatorRendererConfig(
            DEFAULT_PATH_NAVIGATOR_CONFIG,
            '#path-navigator-container'
        )
        return new PathNavigatorRenderer(config)
    }

    describe('initialize', () => {
        it('should set up the PixiJS app and containers', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const app = renderer.getApp()
            expect(app).toBeDefined()
            expect(container.children.length).toBeGreaterThan(0)
            renderer.cleanup()
        })

        it('should create 4 graphics objects during setup', async () => {
            const renderer = makeRenderer()
            const beforeCount = vi.mocked(PIXI.Graphics).mock.results.length
            await renderer.initialize()
            const created =
                vi.mocked(PIXI.Graphics).mock.results.length - beforeCount
            expect(created).toBe(4)
            renderer.cleanup()
        })

        it('should throw when container is missing', async () => {
            const config = createPathNavigatorRendererConfig(
                DEFAULT_PATH_NAVIGATOR_CONFIG,
                '#does-not-exist'
            )
            const renderer = new PathNavigatorRenderer(config)
            await expect(renderer.initialize()).rejects.toThrow()
        })
    })

    describe('render', () => {
        it('should draw background, path, goal and cursor for a valid state', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()

            const app = renderer.getApp()
            const stage = app!.stage as unknown as {
                addChild: ReturnType<typeof vi.fn>
            }

            renderer.render(makeState())

            // Graphics methods should have been invoked for each layer
            expect(stage.addChild).toHaveBeenCalled()
            renderer.cleanup()
        })

        it('should ignore state that is not a PathNavigatorState', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            // Render with invalid state should not throw
            expect(() => renderer.render({})).not.toThrow()
            expect(() =>
                renderer.render({ foo: 'bar' } as unknown as PathNavigatorState)
            ).not.toThrow()
            renderer.cleanup()
        })

        it('should render the cursor in cursorColor when on path', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()

            const state = makeState({
                cursor: { x: 100, y: 100, radius: 10, isVisible: true },
                isOnPath: true,
            })
            expect(() => renderer.render(state)).not.toThrow()
            renderer.cleanup()
        })

        it('should render the cursor in outOfBoundsColor when off path', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()

            const state = makeState({
                cursor: { x: 100, y: 100, radius: 10, isVisible: true },
                isOnPath: false,
            })
            expect(() => renderer.render(state)).not.toThrow()
            renderer.cleanup()
        })

        it('should not draw cursor when not visible', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()

            const state = makeState({
                cursor: { x: 100, y: 100, radius: 10, isVisible: false },
                isOnPath: true,
            })
            expect(() => renderer.render(state)).not.toThrow()
            renderer.cleanup()
        })
    })

    describe('createPathNavigatorRendererConfig', () => {
        it('should build a config from game config', () => {
            const cfg = createPathNavigatorRendererConfig(
                DEFAULT_PATH_NAVIGATOR_CONFIG,
                '#path-navigator-container'
            )
            expect(cfg.type).toBe('canvas')
            expect(cfg.container).toBe('#path-navigator-container')
            expect(cfg.gameWidth).toBe(DEFAULT_PATH_NAVIGATOR_CONFIG.gameWidth)
            expect(cfg.gameHeight).toBe(
                DEFAULT_PATH_NAVIGATOR_CONFIG.gameHeight
            )
            expect(cfg.pathColor).toBe(DEFAULT_PATH_NAVIGATOR_CONFIG.pathColor)
        })
    })

    describe('cleanup', () => {
        it('should not throw when cleaning up', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            expect(() => renderer.cleanup()).not.toThrow()
        })
    })
})
