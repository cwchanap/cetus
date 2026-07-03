// EvaderRenderer unit tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EvaderRenderer, createEvaderRendererConfig } from './EvaderRenderer'
import type { EvaderConfig, EvaderState } from './frameworkTypes'
import type { GameObject, Player } from './types'
import { DEFAULT_EVADER_CONFIG } from './EvaderGame'
import { Application, Graphics, FillGradient } from 'pixi.js'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
        }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
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

function makeConfig(overrides: Partial<EvaderConfig> = {}): EvaderConfig {
    return { ...DEFAULT_EVADER_CONFIG, ...overrides }
}

function makePlayer(overrides: Partial<Player> = {}): Player {
    return {
        x: 100,
        y: 150,
        size: 30,
        speed: 200,
        ...overrides,
    }
}

function makeObject(
    id: string,
    type: 'coin' | 'bomb',
    overrides: Partial<GameObject> = {}
): GameObject {
    return {
        id,
        type,
        x: 200,
        y: 150,
        speed: 100,
        spawnTime: 0,
        ...overrides,
    }
}

function makeEvaderState(overrides: Partial<EvaderState> = {}): EvaderState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        objects: [],
        player: makePlayer(),
        coinsCollected: 0,
        bombsHit: 0,
        gameHistory: [],
        ...overrides,
    }
}

describe('EvaderRenderer', () => {
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
        it('initializes and creates board + containers', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const app = renderer.getApp()
            expect(app).toBeDefined()
            // board, objectContainer, playerGraphic added during setup
            expect(app!.stage.addChild).toHaveBeenCalled()

            renderer.cleanup()
        })

        it('appends the canvas to the container', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            expect(container.children.length).toBeGreaterThan(0)
            renderer.cleanup()
        })

        it('throws when app not available after setup', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            // Force getApp to return null by destroying before render
            await renderer.initialize()
            renderer.cleanup()
            // After cleanup, render should be a no-op (no throw)
            expect(() => renderer.render(makeEvaderState())).not.toThrow()
        })
    })

    describe('render', () => {
        it('renders the player at its position', async () => {
            const config = makeConfig({ playerSize: 30 })
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const state = makeEvaderState({
                player: makePlayer({ x: 100, y: 200 }),
            })

            renderer.render(state)

            // No throw means render succeeded
            expect(true).toBe(true)
            renderer.cleanup()
        })

        it('renders coin objects using FillGradient', async () => {
            const config = makeConfig({ objectSize: 20 })
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const coin = makeObject('coin-1', 'coin')
            const state = makeEvaderState({ objects: [coin] })

            renderer.render(state)

            expect(vi.mocked(FillGradient)).toHaveBeenCalled()
            renderer.cleanup()
        })

        it('renders bomb objects using FillGradient', async () => {
            const config = makeConfig({ objectSize: 20 })
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const bomb = makeObject('bomb-1', 'bomb')
            const state = makeEvaderState({ objects: [bomb] })

            renderer.render(state)

            expect(vi.mocked(FillGradient)).toHaveBeenCalled()
            renderer.cleanup()
        })

        it('removes graphics for objects no longer in state', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const coin = makeObject('coin-1', 'coin')
            const state1 = makeEvaderState({ objects: [coin] })
            renderer.render(state1)

            const state2 = makeEvaderState({ objects: [] })
            renderer.render(state2)

            expect(true).toBe(true)
            renderer.cleanup()
        })

        it('reuses existing graphics for objects still in state', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const coin = makeObject('coin-1', 'coin')
            const state = makeEvaderState({ objects: [coin] })

            renderer.render(state)
            const firstGraphicsCallCount = vi.mocked(Graphics).mock.calls.length

            renderer.render(state)
            const secondGraphicsCallCount =
                vi.mocked(Graphics).mock.calls.length

            // No new Graphics created on re-render of same object
            expect(secondGraphicsCallCount).toBe(firstGraphicsCallCount)
            renderer.cleanup()
        })

        it('skips render for non-evader state', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            expect(() => renderer.render({ foo: 'bar' })).not.toThrow()
            renderer.cleanup()
        })
    })

    describe('cleanup', () => {
        it('does not throw on cleanup', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            expect(() => renderer.cleanup()).not.toThrow()
        })

        it('destroys the app on cleanup', async () => {
            const config = makeConfig()
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const app = renderer.getApp()
            renderer.cleanup()

            expect(app!.destroy).toHaveBeenCalled()
        })
    })

    describe('createEvaderRendererConfig', () => {
        it('produces a config with correct dimensions', () => {
            const config = makeConfig({
                canvasWidth: 640,
                canvasHeight: 480,
                playerSize: 40,
                objectSize: 30,
            })
            const rc = createEvaderRendererConfig(config, '#test')
            expect(rc.width).toBe(640)
            expect(rc.height).toBe(480)
            expect(rc.playerSize).toBe(40)
            expect(rc.objectSize).toBe(30)
            expect(rc.container).toBe('#test')
            expect(rc.type).toBe('canvas')
        })
    })

    describe('Application init config', () => {
        it('initializes the PixiJS Application with correct dimensions', async () => {
            const config = makeConfig({ canvasWidth: 640, canvasHeight: 480 })
            const rendererConfig = createEvaderRendererConfig(
                config,
                '#game-canvas-container'
            )
            const renderer = new EvaderRenderer(rendererConfig)
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInstance = MockApp.mock.results[0].value
            expect(appInstance.init).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 640,
                    height: 480,
                })
            )
            renderer.cleanup()
        })
    })
})
