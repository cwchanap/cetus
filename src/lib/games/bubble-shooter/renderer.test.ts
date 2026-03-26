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
        }
    }

    const MockApplication = vi.fn(makeApp)
    const MockContainer = vi.fn(makeContainer)
    const MockGraphics = vi.fn(makeGraphics)

    return {
        Application: MockApplication,
        Container: MockContainer,
        Graphics: MockGraphics,
    }
})

import {
    setupPixiJS,
    clearPixiJS,
    drawBubble,
    drawCurrentBubble,
    drawShooter,
    drawAimLine,
    drawProjectile,
    draw,
    type RendererState,
} from './renderer'
import type { GameConstants, GameState, Position } from './types'
import { Application, Container, Graphics } from 'pixi.js'

function makeConstants(overrides: Partial<GameConstants> = {}): GameConstants {
    return {
        BUBBLE_RADIUS: 20,
        GRID_WIDTH: 10,
        GRID_HEIGHT: 12,
        COLORS: [0xff0000, 0x00ff00, 0x0000ff],
        GAME_WIDTH: 400,
        GAME_HEIGHT: 600,
        SHOOTER_Y: 550,
        ...overrides,
    }
}

function makeRendererState(): RendererState {
    const MockApp = vi.mocked(Application)
    const appInst = new MockApp() as unknown as RendererState['app']
    const MockCont = vi.mocked(Container)

    return {
        app: appInst,
        stage: new MockCont() as unknown as RendererState['stage'],
        gridContainer:
            new MockCont() as unknown as RendererState['gridContainer'],
        uiContainer: new MockCont() as unknown as RendererState['uiContainer'],
        bubbleGraphics: [],
    }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        grid: Array.from({ length: 12 }, () => Array(10).fill(null)),
        shooter: { x: 200, y: 550 },
        currentBubble: null,
        nextBubble: null,
        aimAngle: -Math.PI / 2,
        projectile: null,
        score: 0,
        bubblesRemaining: 50,
        gameStarted: true,
        gameOver: false,
        paused: false,
        rowOffset: 0,
        shotCount: 0,
        needsRedraw: true,
        ...overrides,
    }
}

describe('bubble-shooter/renderer', () => {
    let gameContainer: HTMLElement

    beforeEach(() => {
        gameContainer = document.createElement('div')
        document.body.appendChild(gameContainer)
        vi.clearAllMocks()
    })

    afterEach(() => {
        document.body.removeChild(gameContainer)
        vi.unstubAllGlobals()
    })

    describe('setupPixiJS', () => {
        it('should return a valid RendererState', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)

            expect(state).toBeDefined()
            expect(state.app).toBeDefined()
            expect(state.stage).toBeDefined()
            expect(state.gridContainer).toBeDefined()
            expect(state.uiContainer).toBeDefined()
            expect(state.bubbleGraphics).toBeInstanceOf(Array)
        })

        it('should initialize app with correct dimensions', async () => {
            const constants = makeConstants({
                GAME_WIDTH: 400,
                GAME_HEIGHT: 600,
            })
            await setupPixiJS(gameContainer, constants)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 400,
                    height: 600,
                })
            )
        })

        it('should append canvas to game container', async () => {
            const constants = makeConstants()
            await setupPixiJS(gameContainer, constants)
            expect(gameContainer.children.length).toBeGreaterThan(0)
        })

        it('should add gridContainer and uiContainer to stage', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)
            expect(state.app.stage.addChild).toHaveBeenCalledTimes(2)
        })

        it('should start with empty bubbleGraphics array', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)
            expect(state.bubbleGraphics).toHaveLength(0)
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

            const constants = makeConstants()
            await expect(
                setupPixiJS(gameContainer, constants)
            ).rejects.toThrow()
            expect(gameContainer.innerHTML).toContain('Failed to initialize')
        })
    })

    describe('clearPixiJS', () => {
        it('should call removeChildren on gridContainer and uiContainer', () => {
            const state = makeRendererState()
            clearPixiJS(state)

            expect(state.gridContainer.removeChildren).toHaveBeenCalled()
            expect(state.uiContainer.removeChildren).toHaveBeenCalled()
        })

        it('should destroy all bubble graphics', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            const g1 = new MockGfx() as unknown as Graphics
            const g2 = new MockGfx() as unknown as Graphics
            state.bubbleGraphics.push(g1, g2)

            clearPixiJS(state)

            expect(g1.destroy).toHaveBeenCalled()
            expect(g2.destroy).toHaveBeenCalled()
        })

        it('should empty bubbleGraphics array after clearing', () => {
            const state = makeRendererState()
            const MockGfx = vi.mocked(Graphics)
            state.bubbleGraphics.push(
                new MockGfx() as unknown as Graphics,
                new MockGfx() as unknown as Graphics
            )

            clearPixiJS(state)

            expect(state.bubbleGraphics).toHaveLength(0)
        })
    })

    describe('drawBubble', () => {
        it('should add graphic to gridContainer', () => {
            const state = makeRendererState()
            const constants = makeConstants()

            drawBubble(state, 100, 200, 0xff0000, constants)

            expect(state.gridContainer.addChild).toHaveBeenCalled()
        })

        it('should push graphic into bubbleGraphics array', () => {
            const state = makeRendererState()
            const constants = makeConstants()

            drawBubble(state, 100, 200, 0xff0000, constants)

            expect(state.bubbleGraphics).toHaveLength(1)
        })

        it('should draw circle with BUBBLE_RADIUS', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BUBBLE_RADIUS: 20 })

            drawBubble(state, 50, 80, 0x00ff00, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gfxInst.circle).toHaveBeenCalledWith(50, 80, 20)
        })

        it('should draw highlight circle', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BUBBLE_RADIUS: 20 })

            drawBubble(state, 100, 100, 0x0000ff, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            // circle is called 3 times: main, border, highlight
            expect(gfxInst.circle).toHaveBeenCalledTimes(3)
        })
    })

    describe('drawCurrentBubble', () => {
        it('should do nothing when currentBubble is null', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({ currentBubble: null })

            drawCurrentBubble(state, gameState, constants)

            expect(state.uiContainer.addChild).not.toHaveBeenCalled()
        })

        it('should add graphic to uiContainer when currentBubble exists', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                currentBubble: { x: 200, y: 500, color: 0xff0000 },
            })

            drawCurrentBubble(state, gameState, constants)

            expect(state.uiContainer.addChild).toHaveBeenCalled()
        })

        it('should draw circle at current bubble position', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BUBBLE_RADIUS: 20 })
            const gameState = makeGameState({
                currentBubble: { x: 150, y: 520, color: 0x00ff00 },
            })

            drawCurrentBubble(state, gameState, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gfxInst.circle).toHaveBeenCalledWith(150, 520, 20)
        })
    })

    describe('drawShooter', () => {
        it('should add graphic to uiContainer', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const shooter: Position = { x: 200, y: 550 }

            drawShooter(state, shooter, constants)

            expect(state.uiContainer.addChild).toHaveBeenCalled()
        })

        it('should draw circle at shooter position', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BUBBLE_RADIUS: 20 })
            const shooter: Position = { x: 200, y: 550 }

            drawShooter(state, shooter, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            // circle called twice: main and border
            expect(gfxInst.circle).toHaveBeenCalledTimes(2)
            expect(gfxInst.circle).toHaveBeenCalledWith(200, 550, 20 * 0.8)
        })
    })

    describe('drawAimLine', () => {
        it('should add graphic to uiContainer', () => {
            const state = makeRendererState()
            const shooter: Position = { x: 200, y: 550 }

            drawAimLine(state, shooter, -Math.PI / 2)

            expect(state.uiContainer.addChild).toHaveBeenCalled()
        })

        it('should draw line from shooter using moveTo and lineTo', () => {
            const state = makeRendererState()
            const shooter: Position = { x: 200, y: 550 }
            const angle = -Math.PI / 2

            drawAimLine(state, shooter, angle)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gfxInst.moveTo).toHaveBeenCalledWith(200, 550)
            expect(gfxInst.lineTo).toHaveBeenCalled()
        })

        it('should draw an arrowhead at the end of the line', () => {
            const state = makeRendererState()
            const shooter: Position = { x: 200, y: 550 }

            drawAimLine(state, shooter, 0)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gfxInst.poly).toHaveBeenCalled()
        })
    })

    describe('drawProjectile', () => {
        it('should do nothing when projectile is null', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({ projectile: null })

            drawProjectile(state, gameState, constants)

            expect(state.uiContainer.addChild).not.toHaveBeenCalled()
        })

        it('should add graphic to uiContainer when projectile exists', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                projectile: {
                    x: 200,
                    y: 300,
                    vx: 2,
                    vy: -5,
                    color: 0xff0000,
                },
            })

            drawProjectile(state, gameState, constants)

            expect(state.uiContainer.addChild).toHaveBeenCalled()
        })

        it('should draw projectile at correct position', () => {
            const state = makeRendererState()
            const constants = makeConstants({ BUBBLE_RADIUS: 20 })
            const gameState = makeGameState({
                projectile: {
                    x: 150,
                    y: 250,
                    vx: 1,
                    vy: -3,
                    color: 0x00ff00,
                },
            })

            drawProjectile(state, gameState, constants)

            const MockGfx = vi.mocked(Graphics)
            const gfxInst =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gfxInst.circle).toHaveBeenCalledWith(150, 250, 20)
        })
    })

    describe('draw', () => {
        it('should not redraw if needsRedraw is false', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({ needsRedraw: false })

            draw(state, gameState, constants)

            expect(state.gridContainer.removeChildren).not.toHaveBeenCalled()
        })

        it('should redraw and reset needsRedraw flag', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({ needsRedraw: true })

            draw(state, gameState, constants)

            expect(state.gridContainer.removeChildren).toHaveBeenCalled()
            expect(gameState.needsRedraw).toBe(false)
        })

        it('should draw grid bubbles', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const grid = Array.from({ length: 12 }, () => Array(10).fill(null))
            grid[0][0] = { x: 20, y: 20, color: 0xff0000 }
            grid[1][2] = { x: 80, y: 60, color: 0x00ff00 }
            const gameState = makeGameState({ needsRedraw: true, grid })

            draw(state, gameState, constants)

            // Two bubbles were drawn to gridContainer
            expect(state.bubbleGraphics).toHaveLength(2)
        })

        it('should skip undefined rows in sparse grid', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            // Create sparse grid with undefined rows
            const sparseGrid = new Array(5) as GameState['grid']
            // All 5 rows are undefined (not set)
            const gameState = makeGameState({
                needsRedraw: true,
                grid: sparseGrid,
            })

            // Should not throw when iterating sparse grid with undefined rows
            expect(() => draw(state, gameState, constants)).not.toThrow()
        })

        it('should draw current bubble when no projectile', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                needsRedraw: true,
                currentBubble: { x: 200, y: 500, color: 0xff0000 },
                projectile: null,
            })

            draw(state, gameState, constants)

            expect(state.uiContainer.addChild).toHaveBeenCalled()
        })

        it('should draw aim line when game is active and no projectile', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                needsRedraw: true,
                currentBubble: { x: 200, y: 500, color: 0xff0000 },
                projectile: null,
                gameStarted: true,
                gameOver: false,
                paused: false,
            })

            draw(state, gameState, constants)

            // aim line uses moveTo on its graphic
            const MockGfx = vi.mocked(Graphics)
            const allGfx = MockGfx.mock.results
            const anyMoveTo = allGfx.some(
                r => r.value.moveTo.mock.calls.length > 0
            )
            expect(anyMoveTo).toBe(true)
        })

        it('should draw projectile when present', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                needsRedraw: true,
                projectile: {
                    x: 100,
                    y: 200,
                    vx: 1,
                    vy: -3,
                    color: 0xffff00,
                },
            })

            draw(state, gameState, constants)

            // uiContainer should have projectile added
            expect(state.uiContainer.addChild).toHaveBeenCalled()
        })

        it('should not draw aim line when projectile exists', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                needsRedraw: true,
                currentBubble: { x: 200, y: 500, color: 0xff0000 },
                projectile: {
                    x: 100,
                    y: 200,
                    vx: 1,
                    vy: -3,
                    color: 0xff0000,
                },
            })

            draw(state, gameState, constants)

            // moveTo should not be called for aim line when projectile exists
            const MockGfx = vi.mocked(Graphics)
            const allGfx = MockGfx.mock.results
            const moveToCalls = allGfx.flatMap(r => r.value.moveTo.mock.calls)
            expect(moveToCalls).toHaveLength(0)
        })

        it('should not draw aim line when game is paused', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                needsRedraw: true,
                currentBubble: { x: 200, y: 500, color: 0xff0000 },
                projectile: null,
                paused: true,
            })

            draw(state, gameState, constants)

            const MockGfx = vi.mocked(Graphics)
            const allGfx = MockGfx.mock.results
            const moveToCalls = allGfx.flatMap(r => r.value.moveTo.mock.calls)
            expect(moveToCalls).toHaveLength(0)
        })

        it('should not draw aim line when game is over', () => {
            const state = makeRendererState()
            const constants = makeConstants()
            const gameState = makeGameState({
                needsRedraw: true,
                currentBubble: { x: 200, y: 500, color: 0xff0000 },
                projectile: null,
                gameOver: true,
            })

            draw(state, gameState, constants)

            const MockGfx = vi.mocked(Graphics)
            const allGfx = MockGfx.mock.results
            const moveToCalls = allGfx.flatMap(r => r.value.moveTo.mock.calls)
            expect(moveToCalls).toHaveLength(0)
        })
    })
})
