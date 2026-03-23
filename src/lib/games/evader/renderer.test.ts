import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
        }
        const chained = [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'roundRect',
        ]
        for (const method of chained) {
            g[method] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }

    const makeContainer = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        clear: vi.fn(),
        x: 0,
        y: 0,
    })

    const makeStage = () => ({
        addChild: vi.fn(),
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
            stage: makeStage(),
            destroy: vi.fn(),
        }
    }

    const MockApplication = vi.fn(makeApp)
    const MockContainer = vi.fn(makeContainer)
    const MockGraphics = vi.fn(makeGraphics)
    const MockFillGradient = vi.fn(() => ({ addColorStop: vi.fn() }))
    const MockText = vi.fn(() => ({ text: '', destroy: vi.fn() }))

    return {
        Application: MockApplication,
        Container: MockContainer,
        Graphics: MockGraphics,
        FillGradient: MockFillGradient,
        Text: MockText,
    }
})

import { setupPixiJS, renderPlayer, renderObjects, cleanup } from './renderer'
import type { GameObject, GameConfig, RendererState, GameState } from './types'
import { Application, Container, Graphics, FillGradient } from 'pixi.js'

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
    return {
        gameDuration: 60,
        canvasWidth: 800,
        canvasHeight: 600,
        playerSize: 30,
        playerSpeed: 200,
        objectSize: 20,
        spawnInterval: 1,
        objectSpeed: 100,
        coinToBombRatio: 2,
        pointsForCoin: 10,
        pointsForBomb: -20,
        ...overrides,
    }
}

function makeRendererState(): RendererState {
    const MockApp = vi.mocked(Application)
    const MockCont = vi.mocked(Container)
    const MockGfx = vi.mocked(Graphics)

    const appInstance = new MockApp() as unknown as ReturnType<
        typeof Application
    >
    const containerStage = new MockCont() as unknown as ReturnType<
        typeof Container
    >
    const containerObjects = new MockCont() as unknown as ReturnType<
        typeof Container
    >
    const graphicsInstance = new MockGfx() as unknown as ReturnType<
        typeof Graphics
    >

    return {
        app: appInstance as unknown as RendererState['app'],
        stage: containerStage as unknown as RendererState['stage'],
        objectContainer:
            containerObjects as unknown as RendererState['objectContainer'],
        playerGraphic:
            graphicsInstance as unknown as RendererState['playerGraphic'],
        objectGraphics: new Map(),
    }
}

describe('evader/renderer', () => {
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
        it('should create and return a RendererState with app, stage, containers', async () => {
            const config = makeConfig()
            const state = await setupPixiJS(gameContainer, config)

            expect(state).toBeDefined()
            expect(state.app).toBeDefined()
            expect(state.stage).toBeDefined()
            expect(state.objectContainer).toBeDefined()
            expect(state.playerGraphic).toBeDefined()
            expect(state.objectGraphics).toBeInstanceOf(Map)
        })

        it('should initialize the PixiJS Application with correct dimensions', async () => {
            const config = makeConfig({ canvasWidth: 640, canvasHeight: 480 })
            await setupPixiJS(gameContainer, config)

            const MockApp = vi.mocked(Application)
            const appInstance = MockApp.mock.results[0].value
            expect(appInstance.init).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 640,
                    height: 480,
                })
            )
        })

        it('should append canvas to the game container', async () => {
            const config = makeConfig()
            await setupPixiJS(gameContainer, config)

            // Canvas should have been appended to gameContainer
            expect(gameContainer.children.length).toBeGreaterThan(0)
        })

        it('should add containers to the stage', async () => {
            const config = makeConfig()
            await setupPixiJS(gameContainer, config)

            const MockApp = vi.mocked(Application)
            const appInstance = MockApp.mock.results[0].value
            expect(appInstance.stage.addChild).toHaveBeenCalled()
        })

        it('should clear the container and throw when PixiJS init fails', async () => {
            const MockApp = vi.mocked(Application)
            // The next Application instance will throw on init
            MockApp.mockImplementationOnce(() => {
                const fakeCanvas = document.createElement('canvas')
                return {
                    init: vi
                        .fn()
                        .mockRejectedValue(new Error('WebGL not supported')),
                    canvas: fakeCanvas,
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn(),
                } as unknown as InstanceType<typeof Application>
            })

            const config = makeConfig()
            await expect(setupPixiJS(gameContainer, config)).rejects.toThrow()
        })

        it('should add canvas style properties', async () => {
            const config = makeConfig()
            await setupPixiJS(gameContainer, config)

            const MockApp = vi.mocked(Application)
            const appInstance = MockApp.mock.results[0].value
            // Canvas style should have been set
            expect(appInstance.canvas.style.border).toBeDefined()
        })
    })

    describe('renderPlayer', () => {
        it('should clear and draw player at the correct position', () => {
            const state = makeRendererState()
            const player: GameState['player'] = {
                x: 100,
                y: 200,
                size: 30,
                speed: 200,
            }
            const config = makeConfig({ playerSize: 30 })

            renderPlayer(state, player, config)

            expect(state.playerGraphic.clear).toHaveBeenCalled()
            expect(state.playerGraphic.rect).toHaveBeenCalledWith(
                100 - 15, // x - playerWidth/2
                200 - 15, // y - playerHeight/2
                30,
                30
            )
        })

        it('should fill and stroke the player graphic', () => {
            const state = makeRendererState()
            const player: GameState['player'] = {
                x: 50,
                y: 75,
                size: 30,
                speed: 200,
            }
            const config = makeConfig({ playerSize: 30 })

            renderPlayer(state, player, config)

            expect(state.playerGraphic.fill).toHaveBeenCalled()
            expect(state.playerGraphic.stroke).toHaveBeenCalled()
        })

        it('should handle different player sizes', () => {
            const state = makeRendererState()
            const player: GameState['player'] = {
                x: 0,
                y: 0,
                size: 40,
                speed: 200,
            }
            const config = makeConfig({ playerSize: 40 })

            renderPlayer(state, player, config)

            expect(state.playerGraphic.rect).toHaveBeenCalledWith(
                -20, // x - playerWidth/2
                -20, // y - playerHeight/2
                40,
                40
            )
        })
    })

    describe('renderObjects', () => {
        it('should add new coin objects to objectGraphics map', () => {
            const state = makeRendererState()
            const coin: GameObject = {
                id: 'coin-1',
                type: 'coin',
                x: 100,
                y: 200,
                speed: 100,
                spawnTime: 0,
            }
            const config = makeConfig({ objectSize: 20 })

            renderObjects(state, [coin], config)

            expect(state.objectGraphics.has('coin-1')).toBe(true)
            expect(state.objectContainer.addChild).toHaveBeenCalled()
        })

        it('should add new bomb objects to objectGraphics map', () => {
            const state = makeRendererState()
            const bomb: GameObject = {
                id: 'bomb-1',
                type: 'bomb',
                x: 300,
                y: 400,
                speed: 100,
                spawnTime: 0,
            }
            const config = makeConfig({ objectSize: 20 })

            renderObjects(state, [bomb], config)

            expect(state.objectGraphics.has('bomb-1')).toBe(true)
        })

        it('should remove graphics for objects no longer in the list', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            const existingGraphic =
                new MockGfx() as unknown as RendererState['playerGraphic']
            state.objectGraphics.set(
                'old-coin',
                existingGraphic as unknown as ReturnType<typeof Graphics>
            )

            // Render with empty objects list - old-coin should be removed
            renderObjects(state, [], makeConfig())

            expect(state.objectContainer.removeChild).toHaveBeenCalled()
            expect(state.objectGraphics.has('old-coin')).toBe(false)
        })

        it('should reuse existing graphics for objects still in the list', () => {
            const state = makeRendererState()
            const coin: GameObject = {
                id: 'coin-1',
                type: 'coin',
                x: 100,
                y: 200,
                speed: 100,
                spawnTime: 0,
            }
            const config = makeConfig({ objectSize: 20 })

            // First render
            renderObjects(state, [coin], config)
            const firstAddChildCallCount = (
                state.objectContainer.addChild as ReturnType<typeof vi.fn>
            ).mock.calls.length

            // Second render with same object
            renderObjects(state, [coin], config)
            const secondAddChildCallCount = (
                state.objectContainer.addChild as ReturnType<typeof vi.fn>
            ).mock.calls.length

            // addChild should not be called again since graphic already exists
            expect(secondAddChildCallCount).toBe(firstAddChildCallCount)
        })

        it('should use FillGradient for coin rendering', () => {
            const state = makeRendererState()
            const coin: GameObject = {
                id: 'coin-1',
                type: 'coin',
                x: 100,
                y: 200,
                speed: 100,
                spawnTime: 0,
            }
            const config = makeConfig({ objectSize: 20 })

            renderObjects(state, [coin], config)

            expect(vi.mocked(FillGradient)).toHaveBeenCalled()
        })

        it('should use FillGradient for bomb rendering', () => {
            const state = makeRendererState()
            const bomb: GameObject = {
                id: 'bomb-1',
                type: 'bomb',
                x: 100,
                y: 200,
                speed: 100,
                spawnTime: 0,
            }
            const config = makeConfig({ objectSize: 20 })

            renderObjects(state, [bomb], config)

            expect(vi.mocked(FillGradient)).toHaveBeenCalled()
        })

        it('should set x and y position on object graphic', () => {
            const state = makeRendererState()
            const coin: GameObject = {
                id: 'coin-2',
                type: 'coin',
                x: 150,
                y: 250,
                speed: 100,
                spawnTime: 0,
            }
            const config = makeConfig()

            renderObjects(state, [coin], config)

            const graphic = state.objectGraphics.get('coin-2')
            expect(graphic!.x).toBe(150)
            expect(graphic!.y).toBe(250)
        })
    })

    describe('cleanup', () => {
        it('should clear objectGraphics map', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            const graphic = new MockGfx() as unknown as ReturnType<
                typeof Graphics
            >
            state.objectGraphics.set('obj-1', graphic)
            expect(state.objectGraphics.size).toBe(1)

            cleanup(state)

            expect(state.objectGraphics.size).toBe(0)
        })

        it('should destroy the app', () => {
            const state = makeRendererState()
            cleanup(state)
            expect(state.app.destroy).toHaveBeenCalled()
        })
    })
})
