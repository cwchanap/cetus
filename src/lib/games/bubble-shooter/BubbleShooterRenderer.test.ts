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
        const stage = makeContainer()
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage,
            destroy: vi.fn(),
            renderer: { resize: vi.fn() },
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

import {
    BubbleShooterRenderer,
    createBubbleShooterRendererConfig,
} from './BubbleShooterRenderer'
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from './BubbleShooterGame'
import type { BubbleShooterState } from './types'
import { Graphics, Container } from 'pixi.js'

function makeRenderer(): BubbleShooterRenderer {
    const config = createBubbleShooterRendererConfig(
        DEFAULT_BUBBLE_SHOOTER_CONFIG,
        '#test-container'
    )
    return new BubbleShooterRenderer(config)
}

function makeState(
    overrides: Partial<BubbleShooterState> = {}
): BubbleShooterState {
    return {
        score: 0,
        timeRemaining: 9999,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        grid: [],
        shooter: { x: 300, y: 740 },
        currentBubble: null,
        nextBubble: null,
        aimAngle: -Math.PI / 2,
        projectile: null,
        bubblesRemaining: 0,
        rowOffset: 0,
        shotCount: 0,
        shotsFired: 0,
        bubblesPopped: 0,
        largestCombo: 0,
        needsRedraw: true,
        ...overrides,
    }
}

describe('BubbleShooterRenderer', () => {
    let container: HTMLElement

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'test-container'
        document.body.appendChild(container)
        vi.clearAllMocks()
    })

    afterEach(() => {
        document.body.removeChild(container)
    })

    describe('setup', () => {
        it('initializes and creates grid/ui containers on the stage', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const app = renderer.getApp()
            expect(app).not.toBeNull()
            // stage.addChild called for gridContainer + uiContainer
            expect(app!.stage.addChild).toHaveBeenCalledTimes(2)
            renderer.cleanup()
        })
    })

    describe('render', () => {
        it('does nothing when needsRedraw is false', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const state = makeState({ needsRedraw: false })
            renderer.render(state)
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('draws grid bubbles when needsRedraw is true', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const grid: BubbleShooterState['grid'] = []
            grid[0] = [
                { color: 0xff0000, x: 20, y: 20 },
                null,
                { color: 0x00ff00, x: 100, y: 20 },
            ]
            renderer.render(makeState({ grid }))
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).toHaveBeenCalledTimes(2)
            renderer.cleanup()
        })

        it('draws the current bubble when no projectile is in flight', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            renderer.render(
                makeState({
                    currentBubble: { x: 300, y: 700, color: 0xff0000 },
                    projectile: null,
                })
            )
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).toHaveBeenCalled()
            renderer.cleanup()
        })

        it('draws the aim line when active and idle', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            renderer.render(
                makeState({
                    currentBubble: { x: 300, y: 700, color: 0xff0000 },
                    projectile: null,
                    isActive: true,
                    isPaused: false,
                    isGameOver: false,
                })
            )
            const MockGfx = vi.mocked(Graphics)
            const allGfx = MockGfx.mock.results
            const anyMoveTo = allGfx.some(
                r =>
                    (r.value as { moveTo: { mock: { calls: unknown[] } } })
                        .moveTo.mock.calls.length > 0
            )
            expect(anyMoveTo).toBe(true)
            renderer.cleanup()
        })

        it('does not draw the aim line when a projectile exists', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            renderer.render(
                makeState({
                    currentBubble: { x: 300, y: 700, color: 0xff0000 },
                    projectile: {
                        x: 100,
                        y: 200,
                        vx: 1,
                        vy: -3,
                        color: 0xff0000,
                    },
                })
            )
            const MockGfx = vi.mocked(Graphics)
            const allGfx = MockGfx.mock.results
            const moveToCalls = allGfx.flatMap(
                r =>
                    (
                        r.value as {
                            moveTo: { mock: { calls: unknown[] } }
                        }
                    ).moveTo.mock.calls
            )
            expect(moveToCalls).toHaveLength(0)
            renderer.cleanup()
        })

        it('draws the projectile when present', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            renderer.render(
                makeState({
                    projectile: {
                        x: 150,
                        y: 250,
                        vx: 1,
                        vy: -3,
                        color: 0x00ff00,
                    },
                })
            )
            const MockGfx = vi.mocked(Graphics)
            const lastGfx = MockGfx.mock.results[
                MockGfx.mock.results.length - 1
            ].value as { circle: { mock: { calls: number[][] } } }
            expect(lastGfx.circle).toHaveBeenCalledWith(150, 250, 20)
            renderer.cleanup()
        })

        it('does not throw on a sparse grid with undefined rows', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const sparseGrid: BubbleShooterState['grid'] = new Array(5)
            expect(() =>
                renderer.render(makeState({ grid: sparseGrid }))
            ).not.toThrow()
            renderer.cleanup()
        })
    })

    describe('cleanup', () => {
        it('destroys containers on cleanup', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            const MockCont = vi.mocked(Container)
            const createdContainers = MockCont.mock.results.map(r => r.value)
            renderer.cleanup()
            createdContainers.forEach(c => {
                expect(c.destroy).toHaveBeenCalledWith({ children: true })
            })
        })
    })

    describe('setup error handling', () => {
        it('throws when app is not available after setup', async () => {
            const renderer = makeRenderer()
            vi.spyOn(renderer, 'getApp').mockReturnValue(null)
            await expect(renderer.initialize()).rejects.toThrow(
                'app not available after setup'
            )
            renderer.cleanup()
        })
    })

    describe('renderGame invalid state guards', () => {
        it('returns early when state is null', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            expect(() => renderer.render(null)).not.toThrow()
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('returns early when state is a non-object', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            expect(() => renderer.render('not-a-state')).not.toThrow()
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('returns early when state is missing required fields', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            expect(() => renderer.render({})).not.toThrow()
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('returns early when grid is not an array', async () => {
            const renderer = makeRenderer()
            await renderer.initialize()
            expect(() =>
                renderer.render({
                    grid: 'nope',
                    needsRedraw: true,
                    projectile: null,
                })
            ).not.toThrow()
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).not.toHaveBeenCalled()
            renderer.cleanup()
        })
    })

    describe('null container guards', () => {
        it('skips drawing grid/current bubble/aim line when containers are null', async () => {
            const renderer = makeRenderer()
            vi.spyOn(renderer, 'createContainer').mockReturnValue(
                null as unknown as Container
            )
            await renderer.initialize()
            const grid: BubbleShooterState['grid'] = []
            grid[0] = [{ color: 0xff0000, x: 20, y: 20 }]
            expect(() =>
                renderer.render(
                    makeState({
                        grid,
                        currentBubble: { x: 300, y: 700, color: 0xff0000 },
                        projectile: null,
                        isActive: true,
                        isPaused: false,
                        isGameOver: false,
                    })
                )
            ).not.toThrow()
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).not.toHaveBeenCalled()
            renderer.cleanup()
        })

        it('skips drawing projectile when uiContainer is null', async () => {
            const renderer = makeRenderer()
            vi.spyOn(renderer, 'createContainer').mockReturnValue(
                null as unknown as Container
            )
            await renderer.initialize()
            expect(() =>
                renderer.render(
                    makeState({
                        projectile: {
                            x: 150,
                            y: 250,
                            vx: 1,
                            vy: -3,
                            color: 0x00ff00,
                        },
                    })
                )
            ).not.toThrow()
            const MockGfx = vi.mocked(Graphics)
            expect(MockGfx).not.toHaveBeenCalled()
            renderer.cleanup()
        })
    })

    describe('createBubbleShooterRendererConfig', () => {
        it('builds a renderer config from a game config', () => {
            const cfg = createBubbleShooterRendererConfig(
                DEFAULT_BUBBLE_SHOOTER_CONFIG,
                '#game-container'
            )
            expect(cfg.container).toBe('#game-container')
            expect(cfg.width).toBe(DEFAULT_BUBBLE_SHOOTER_CONFIG.gameWidth)
            expect(cfg.height).toBe(DEFAULT_BUBBLE_SHOOTER_CONFIG.gameHeight)
            expect(cfg.bubbleRadius).toBe(
                DEFAULT_BUBBLE_SHOOTER_CONFIG.bubbleRadius
            )
            expect(cfg.backgroundColor).toBe(
                DEFAULT_BUBBLE_SHOOTER_CONFIG.backgroundColor
            )
        })
    })
})
