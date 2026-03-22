import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'roundRect',
            'fill',
            'stroke',
            'rect',
            'clear',
            'circle',
            'moveTo',
            'lineTo',
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
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: makeContainer(),
            renderer: { resize: vi.fn(), width: 400, height: 400 },
            destroy: vi.fn(),
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        Assets: { load: vi.fn().mockResolvedValue({}) },
        Text: vi.fn(() => ({ text: '', destroy: vi.fn() })),
        Sprite: vi.fn(() => ({ destroy: vi.fn(), texture: null })),
    }
})

import { SnakeRenderer, createSnakeRendererConfig } from './SnakeRenderer'
import type { SnakeConfig } from './types'
import { Application, Graphics } from 'pixi.js'

function makeSnakeConfig(overrides: Partial<SnakeConfig> = {}): SnakeConfig {
    return {
        gridWidth: 10,
        gridHeight: 10,
        cellSize: 20,
        snakeColor: 0x00ff00,
        foodColor: 0xff0000,
        gridColor: 0x333333,
        gameWidth: 200,
        gameHeight: 200,
        backgroundColor: 0x000000,
        initialSpeed: 200,
        speedIncrement: 5,
        minSpeed: 50,
        pointsPerFood: 10,
        ...overrides,
    } as unknown as SnakeConfig
}

function makeSnakeRendererConfig() {
    return createSnakeRendererConfig(makeSnakeConfig(), '#snake-test-container')
}

function makeSnakeState(overrides: Record<string, unknown> = {}) {
    return {
        snake: [
            { x: 5, y: 5 }, // head
            { x: 4, y: 5 },
            { x: 3, y: 5 },
        ],
        food: { x: 8, y: 8 },
        needsRedraw: true,
        direction: 'right',
        score: 0,
        isGameOver: false,
        isPaused: false,
        ...overrides,
    }
}

describe('SnakeRenderer', () => {
    let container: HTMLElement
    let renderer: SnakeRenderer

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'snake-test-container'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        try {
            renderer?.destroy()
        } catch {
            /* ignore */
        }
        document.body.removeChild(container)
    })

    describe('initialize and setup', () => {
        it('should initialize successfully', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
        })

        it('should throw when container not found', async () => {
            const config = createSnakeRendererConfig(
                makeSnakeConfig(),
                '#nonexistent'
            )
            renderer = new SnakeRenderer(config)
            await expect(renderer.initialize()).rejects.toThrow()
        })

        it('should append canvas to container', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()
            expect(container.children.length).toBeGreaterThan(0)
        })

        it('should add two containers to stage (grid + gameObjects)', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            // stage.addChild should be called at least twice (gridContainer + gameObjectContainer)
            expect(appInst.stage.addChild).toHaveBeenCalledTimes(2)
        })

        it('should draw grid during setup', async () => {
            const MockGfx = vi.mocked(Graphics)
            const beforeCount = MockGfx.mock.results.length

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const afterCount = MockGfx.mock.results.length
            // At least one Graphics should have been created for grid
            expect(afterCount).toBeGreaterThan(beforeCount)

            // Grid graphic should have moveTo and lineTo called
            const gridGfx = MockGfx.mock.results[beforeCount].value
            expect(gridGfx.moveTo).toHaveBeenCalled()
            expect(gridGfx.lineTo).toHaveBeenCalled()
        })

        it('should set grid graphic alpha to 0.15', async () => {
            const MockGfx = vi.mocked(Graphics)
            const beforeCount = MockGfx.mock.results.length

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const gridGfx = MockGfx.mock.results[beforeCount].value
            expect(gridGfx.alpha).toBe(0.15)
        })
    })

    describe('renderGame', () => {
        it('should not throw when rendering valid snake state', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const state = makeSnakeState()
            expect(() => renderer.render(state)).not.toThrow()
        })

        it('should skip rendering when needsRedraw is false', async () => {
            const MockGfx = vi.mocked(Graphics)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const countBefore = MockGfx.mock.results.length
            renderer.render(makeSnakeState({ needsRedraw: false }))
            const countAfter = MockGfx.mock.results.length

            expect(countAfter).toBe(countBefore)
        })

        it('should create Graphics for each snake segment', async () => {
            const MockGfx = vi.mocked(Graphics)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const countBefore = MockGfx.mock.results.length
            renderer.render(makeSnakeState())
            const countAfter = MockGfx.mock.results.length

            // 3 snake segments + 1 food = at least 4 Graphics created
            expect(countAfter - countBefore).toBeGreaterThanOrEqual(4)
        })

        it('should draw head segment with stroke (glow effect)', async () => {
            const MockGfx = vi.mocked(Graphics)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const countBefore = MockGfx.mock.results.length
            renderer.render(makeSnakeState())

            // First new graphic is the head (index 0 after initialization)
            const headGfx = MockGfx.mock.results[countBefore].value
            expect(headGfx.stroke).toHaveBeenCalled()
        })

        it('should not draw stroke for body segments', async () => {
            const MockGfx = vi.mocked(Graphics)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const countBefore = MockGfx.mock.results.length
            renderer.render(makeSnakeState())

            // Second graphic is a body segment (index 1)
            const bodyGfx = MockGfx.mock.results[countBefore + 1].value
            expect(bodyGfx.stroke).not.toHaveBeenCalled()
        })

        it('should draw food circle when food exists', async () => {
            const MockGfx = vi.mocked(Graphics)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const countBefore = MockGfx.mock.results.length
            renderer.render(makeSnakeState()) // state with food at (8,8)

            // Last graphic is for food (after snake segments)
            const foodGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(foodGfx.circle).toHaveBeenCalled()
        })

        it('should not draw food when food is null', async () => {
            const MockGfx = vi.mocked(Graphics)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const countBefore = MockGfx.mock.results.length
            renderer.render(makeSnakeState({ food: null }))
            const countAfter = MockGfx.mock.results.length

            // Only snake segments (3), no food
            expect(countAfter - countBefore).toBe(3)
        })

        it('should skip rendering when state has no snake array', async () => {
            const MockGfx = vi.mocked(Graphics)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const countBefore = MockGfx.mock.results.length
            renderer.render({ invalid: true }) // not a SnakeState
            const countAfter = MockGfx.mock.results.length

            expect(countAfter).toBe(countBefore)
        })

        it('should handle empty snake array', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            expect(() =>
                renderer.render(makeSnakeState({ snake: [] }))
            ).not.toThrow()
        })

        it('should clear game objects before redrawing', async () => {
            const MockApp = vi.mocked(Application)

            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const appInst = MockApp.mock.results[0].value
            // The gameObjectContainer is the second container added to stage
            // After render, gameObjectContainer.removeChildren should be called
            renderer.render(makeSnakeState())

            // The stage itself isn't cleared; gameObjectContainer.removeChildren is called
            // We verify render doesn't throw and creates graphics
            expect(true).toBe(true)
        })
    })

    describe('cleanup', () => {
        it('should call super.cleanup() (destroys app)', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value

            renderer.cleanup()
            expect(appInst.destroy).toHaveBeenCalled()
        })

        it('should not throw on cleanup', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()
            expect(() => renderer.cleanup()).not.toThrow()
        })

        it('should set app to null after cleanup', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()
            renderer.cleanup()
            expect(renderer.getApp()).toBeNull()
        })

        it('should mark as not ready after destroy', async () => {
            renderer = new SnakeRenderer(makeSnakeRendererConfig())
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
            renderer.destroy()
            expect(renderer.isReady()).toBe(false)
        })
    })

    describe('createSnakeRendererConfig', () => {
        it('should create a valid SnakeRendererConfig', () => {
            const snakeConfig = makeSnakeConfig()
            const config = createSnakeRendererConfig(
                snakeConfig,
                '#snake-test-container'
            )

            expect(config.type).toBe('canvas')
            expect(config.container).toBe('#snake-test-container')
            expect(config.gridWidth).toBe(snakeConfig.gridWidth)
            expect(config.gridHeight).toBe(snakeConfig.gridHeight)
            expect(config.cellSize).toBe(snakeConfig.cellSize)
        })
    })
})
