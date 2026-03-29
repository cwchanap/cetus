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

    return {
        Application: MockApplication,
        Container: MockContainer,
        Graphics: MockGraphics,
    }
})

import {
    setupPixiJS,
    clearPixiJS,
    drawGrid,
    drawSnakeSegment,
    drawFood,
    draw,
} from './renderer'
import type {
    GameConstants,
    GameState,
    SnakeSegment,
    Food,
    RendererState,
} from './types'
import { Application, Container, Graphics } from 'pixi.js'

function makeConstants(overrides: Partial<GameConstants> = {}): GameConstants {
    return {
        GRID_WIDTH: 20,
        GRID_HEIGHT: 20,
        CELL_SIZE: 20,
        GAME_WIDTH: 400,
        GAME_HEIGHT: 400,
        GAME_DURATION: 60,
        MOVE_INTERVAL: 150,
        FOOD_SPAWN_INTERVAL: 1000,
        SNAKE_COLOR: 0x00ff00,
        FOOD_COLOR: 0xff0000,
        GRID_COLOR: 0x444444,
        BACKGROUND_COLOR: 0x000000,
        ...overrides,
    }
}

function makeRendererState(
    overrides: Partial<RendererState> = {}
): RendererState {
    const MockApp = vi.mocked(Application)
    const MockCont = vi.mocked(Container)
    const MockGfx = vi.mocked(Graphics)

    const appInst = new MockApp() as unknown as RendererState['app']
    const contInst = () => new MockCont() as unknown as RendererState['stage']
    const gfxInst = () =>
        new MockGfx() as unknown as RendererState['graphics'][0]

    return {
        app: appInst,
        stage: contInst(),
        gameContainer: contInst(),
        gridContainer: contInst(),
        graphics: [gfxInst()],
        ...overrides,
    }
}

function makeSegment(x: number, y: number, id = 'seg-1'): SnakeSegment {
    return { x, y, id }
}

function makeFood(x: number, y: number): Food {
    return { x, y, id: 'food-1', spawnTime: Date.now() }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        snake: [makeSegment(5, 5), makeSegment(4, 5)],
        food: makeFood(10, 10),
        direction: 'right',
        nextDirection: 'right',
        score: 0,
        timeRemaining: 60,
        gameOver: false,
        gameStarted: true,
        paused: false,
        pauseStartedAt: null,
        lastFoodSpawnTime: 0,
        lastMoveTime: 0,
        gameStartTime: Date.now(),
        foodsEaten: 0,
        maxLength: 3,
        needsRedraw: true,
        ...overrides,
    }
}

describe('snake/renderer', () => {
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
        it('should create and return a RendererState', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)

            expect(state).toBeDefined()
            expect(state.app).toBeDefined()
            expect(state.stage).toBeDefined()
            expect(state.gameContainer).toBeDefined()
            expect(state.gridContainer).toBeDefined()
            expect(state.graphics).toBeInstanceOf(Array)
        })

        it('should initialize app with correct dimensions', async () => {
            const constants = makeConstants({
                GAME_WIDTH: 500,
                GAME_HEIGHT: 500,
            })
            await setupPixiJS(gameContainer, constants)

            const MockApp = vi.mocked(Application)
            const appInstance = MockApp.mock.results[0].value
            expect(appInstance.init).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 500,
                    height: 500,
                })
            )
        })

        it('should append canvas to the container', async () => {
            const constants = makeConstants()
            await setupPixiJS(gameContainer, constants)
            expect(gameContainer.children.length).toBeGreaterThan(0)
        })

        it('should add grid and game containers to stage', async () => {
            const constants = makeConstants()
            await setupPixiJS(gameContainer, constants)

            const MockApp = vi.mocked(Application)
            const appInstance = MockApp.mock.results[0].value
            expect(appInstance.stage.addChild).toHaveBeenCalledTimes(2)
        })

        it('should clear container and throw when PixiJS init fails', async () => {
            const MockApp = vi.mocked(Application)
            MockApp.mockImplementationOnce(() => {
                const fakeCanvas = document.createElement('canvas')
                return {
                    init: vi
                        .fn()
                        .mockRejectedValue(new Error('Canvas not supported')),
                    canvas: fakeCanvas,
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn(),
                } as unknown as InstanceType<typeof Application>
            })

            const child = document.createElement('span')
            gameContainer.appendChild(child)

            const constants = makeConstants()
            await expect(
                setupPixiJS(gameContainer, constants)
            ).rejects.toThrow()
            // Error div should be added, original child removed
            expect(gameContainer.innerHTML).toContain('Failed to initialize')
        })

        it('should return empty graphics array initially', async () => {
            const constants = makeConstants()
            const state = await setupPixiJS(gameContainer, constants)
            expect(state.graphics).toHaveLength(0)
        })
    })

    describe('clearPixiJS', () => {
        it('should remove all children from gameContainer', () => {
            const state = makeRendererState()
            clearPixiJS(state)
            expect(state.gameContainer.removeChildren).toHaveBeenCalled()
        })

        it('should destroy all graphics in the graphics array', () => {
            const MockGfx = vi.mocked(Graphics)
            const gfx1 =
                new MockGfx() as unknown as RendererState['graphics'][0]
            const gfx2 =
                new MockGfx() as unknown as RendererState['graphics'][0]
            const state = makeRendererState({ graphics: [gfx1, gfx2] })

            clearPixiJS(state)

            expect(gfx1.destroy).toHaveBeenCalled()
            expect(gfx2.destroy).toHaveBeenCalled()
        })

        it('should empty the graphics array', () => {
            const MockGfx = vi.mocked(Graphics)
            const gfx = new MockGfx() as unknown as RendererState['graphics'][0]
            const state = makeRendererState({ graphics: [gfx] })

            clearPixiJS(state)

            expect(state.graphics.length).toBe(0)
        })
    })

    describe('drawGrid', () => {
        it('should create a Graphics object and add it to gridContainer', () => {
            const state = makeRendererState({ graphics: [] })
            const constants = makeConstants({
                GRID_WIDTH: 5,
                GRID_HEIGHT: 5,
                CELL_SIZE: 20,
            })

            drawGrid(state, constants)

            const MockGfx = vi.mocked(Graphics)
            // Graphics should have been instantiated
            expect(MockGfx).toHaveBeenCalled()
            expect(state.gridContainer.addChild).toHaveBeenCalled()
        })

        it('should draw vertical lines (moveTo/lineTo calls)', () => {
            const state = makeRendererState({ graphics: [] })
            const constants = makeConstants({
                GRID_WIDTH: 3,
                GRID_HEIGHT: 3,
                CELL_SIZE: 20,
            })

            drawGrid(state, constants)

            const MockGfx = vi.mocked(Graphics)
            const gridGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            // Should have called moveTo and lineTo for vertical and horizontal lines
            expect(gridGfx.moveTo).toHaveBeenCalled()
            expect(gridGfx.lineTo).toHaveBeenCalled()
        })

        it('should set alpha on the grid graphic', () => {
            const state = makeRendererState({ graphics: [] })
            const constants = makeConstants({
                GRID_WIDTH: 3,
                GRID_HEIGHT: 3,
                CELL_SIZE: 20,
            })

            drawGrid(state, constants)

            const MockGfx = vi.mocked(Graphics)
            const gridGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gridGfx.alpha).toBe(0.15)
        })

        it('should call stroke with grid color', () => {
            const state = makeRendererState({ graphics: [] })
            const constants = makeConstants({ GRID_COLOR: 0x333333 })

            drawGrid(state, constants)

            const MockGfx = vi.mocked(Graphics)
            const gridGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(gridGfx.stroke).toHaveBeenCalledWith(
                expect.objectContaining({ color: 0x333333 })
            )
        })
    })

    describe('drawSnakeSegment', () => {
        it('should draw a body segment (not head) with roundRect and fill', () => {
            const state = makeRendererState({ graphics: [] })
            const segment = makeSegment(3, 4)
            const constants = makeConstants({
                CELL_SIZE: 20,
                SNAKE_COLOR: 0x00ff00,
            })

            drawSnakeSegment(state, segment, false, constants)

            const MockGfx = vi.mocked(Graphics)
            const segGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(segGfx.roundRect).toHaveBeenCalled()
            expect(segGfx.fill).toHaveBeenCalledWith(0x00ff00)
        })

        it('should add stroke when drawing the head segment', () => {
            const state = makeRendererState({ graphics: [] })
            const segment = makeSegment(5, 5)
            const constants = makeConstants({ CELL_SIZE: 20 })

            drawSnakeSegment(state, segment, true, constants)

            const MockGfx = vi.mocked(Graphics)
            const segGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(segGfx.stroke).toHaveBeenCalled()
        })

        it('should NOT add stroke for body segments', () => {
            const state = makeRendererState({ graphics: [] })
            const segment = makeSegment(5, 5)
            const constants = makeConstants({ CELL_SIZE: 20 })

            drawSnakeSegment(state, segment, false, constants)

            const MockGfx = vi.mocked(Graphics)
            const segGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(segGfx.stroke).not.toHaveBeenCalled()
        })

        it('should add the segment graphic to gameContainer', () => {
            const state = makeRendererState({ graphics: [] })
            const segment = makeSegment(2, 3)
            const constants = makeConstants()

            drawSnakeSegment(state, segment, false, constants)

            expect(state.gameContainer.addChild).toHaveBeenCalled()
        })

        it('should push the graphic to the graphics array', () => {
            const state = makeRendererState({ graphics: [] })
            const segment = makeSegment(1, 1)
            const constants = makeConstants()

            drawSnakeSegment(state, segment, false, constants)

            expect(state.graphics).toHaveLength(1)
        })

        it('should use correct pixel coordinates based on cell size', () => {
            const state = makeRendererState({ graphics: [] })
            const segment = makeSegment(3, 4) // x=3, y=4
            const constants = makeConstants({ CELL_SIZE: 20 })
            const padding = 2

            drawSnakeSegment(state, segment, false, constants)

            const MockGfx = vi.mocked(Graphics)
            const segGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            const cellSize = constants.CELL_SIZE
            const expectedX = segment.x * cellSize + padding
            const expectedY = segment.y * cellSize + padding
            const expectedSize = cellSize - padding * 2
            expect(segGfx.roundRect).toHaveBeenCalledWith(
                expectedX,
                expectedY,
                expectedSize,
                expectedSize,
                4
            )
        })
    })

    describe('drawFood', () => {
        it('should draw a food circle', () => {
            const state = makeRendererState({ graphics: [] })
            const food = makeFood(5, 5)
            const constants = makeConstants({
                CELL_SIZE: 20,
                FOOD_COLOR: 0xff0000,
            })

            drawFood(state, food, constants)

            const MockGfx = vi.mocked(Graphics)
            const foodGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(foodGfx.circle).toHaveBeenCalled()
            expect(foodGfx.fill).toHaveBeenCalledWith(0xff0000)
        })

        it('should add a stroke (pulse effect) to food', () => {
            const state = makeRendererState({ graphics: [] })
            const food = makeFood(3, 3)
            const constants = makeConstants({ CELL_SIZE: 20 })

            drawFood(state, food, constants)

            const MockGfx = vi.mocked(Graphics)
            const foodGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(foodGfx.stroke).toHaveBeenCalled()
        })

        it('should add the food graphic to gameContainer', () => {
            const state = makeRendererState({ graphics: [] })
            const food = makeFood(2, 2)
            const constants = makeConstants()

            drawFood(state, food, constants)

            expect(state.gameContainer.addChild).toHaveBeenCalled()
        })

        it('should push the graphic to the graphics array', () => {
            const state = makeRendererState({ graphics: [] })
            const food = makeFood(2, 2)
            const constants = makeConstants()

            drawFood(state, food, constants)

            expect(state.graphics).toHaveLength(1)
        })

        it('should compute center position using cell size', () => {
            const state = makeRendererState({ graphics: [] })
            const food = makeFood(4, 6) // x=4, y=6
            const constants = makeConstants({ CELL_SIZE: 20 })
            // Center: x = 4*20 + 10 = 90, y = 6*20 + 10 = 130, radius = 10 - 3 = 7

            drawFood(state, food, constants)

            const MockGfx = vi.mocked(Graphics)
            const foodGfx =
                MockGfx.mock.results[MockGfx.mock.results.length - 1].value
            expect(foodGfx.circle).toHaveBeenCalledWith(90, 130, 7)
        })
    })

    describe('draw', () => {
        it('should NOT clear or draw when needsRedraw is false', () => {
            const state = makeRendererState({ graphics: [] })
            const gameState = makeGameState({ needsRedraw: false })
            const constants = makeConstants()

            draw(state, gameState, constants)

            expect(state.gameContainer.removeChildren).not.toHaveBeenCalled()
        })

        it('should clear and draw snake when needsRedraw is true', () => {
            const state = makeRendererState({ graphics: [] })
            const gameState = makeGameState({
                needsRedraw: true,
                snake: [makeSegment(5, 5), makeSegment(4, 5)],
            })
            const constants = makeConstants()

            draw(state, gameState, constants)

            expect(state.gameContainer.removeChildren).toHaveBeenCalled()
        })

        it('should draw food when present', () => {
            const state = makeRendererState({ graphics: [] })
            const food = makeFood(10, 10)
            const gameState = makeGameState({
                needsRedraw: true,
                food,
            })
            const constants = makeConstants()

            draw(state, gameState, constants)

            const MockGfx = vi.mocked(Graphics)
            const cellSize = constants.CELL_SIZE
            const expectedX = food.x * cellSize + cellSize / 2
            const expectedY = food.y * cellSize + cellSize / 2
            const expectedRadius = cellSize / 2 - 3
            // Find the Graphics instance that had circle called on it — that's the food graphic
            const foodGfxResult = MockGfx.mock.results.find(
                r => r.value.circle.mock.calls.length > 0
            )
            expect(foodGfxResult).toBeDefined()
            expect(foodGfxResult!.value.circle).toHaveBeenCalledWith(
                expectedX,
                expectedY,
                expectedRadius
            )
        })

        it('should handle null food gracefully', () => {
            const state = makeRendererState({ graphics: [] })
            const gameState = makeGameState({
                needsRedraw: true,
                food: null,
            })
            const constants = makeConstants()

            expect(() => draw(state, gameState, constants)).not.toThrow()
        })

        it('should reset needsRedraw to false after drawing', () => {
            const state = makeRendererState({ graphics: [] })
            const gameState = makeGameState({ needsRedraw: true })
            const constants = makeConstants()

            draw(state, gameState, constants)

            expect(gameState.needsRedraw).toBe(false)
        })

        it('should draw head segment differently from body segments', () => {
            const state = makeRendererState({ graphics: [] })
            const gameState = makeGameState({
                needsRedraw: true,
                snake: [makeSegment(5, 5, 'head'), makeSegment(4, 5, 'body')],
                food: null,
            })
            const constants = makeConstants()

            // Track how many Graphics instances exist before draw()
            const MockGfx = vi.mocked(Graphics)
            const beforeCount = MockGfx.mock.results.length

            draw(state, gameState, constants)

            // Head graphic is the first one created during draw()
            const headGfx = MockGfx.mock.results[beforeCount].value
            const bodyGfx = MockGfx.mock.results[beforeCount + 1].value
            expect(headGfx.stroke).toHaveBeenCalled()
            expect(bodyGfx.stroke).not.toHaveBeenCalled()
        })
    })
})

describe('snake/renderer setupPixiJS devicePixelRatio fallback', () => {
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

    it('should use resolution 1 when devicePixelRatio is 0 (|| 1 branch)', async () => {
        vi.stubGlobal('devicePixelRatio', 0)
        const { Application } = await import('pixi.js')
        const constants = makeConstants()
        await setupPixiJS(gameContainer, constants)
        const MockApp = vi.mocked(Application)
        const lastApp =
            MockApp.mock.results[MockApp.mock.results.length - 1].value
        expect(lastApp.init).toHaveBeenCalledWith(
            expect.objectContaining({ resolution: 1 })
        )
    })

    it('should use resolution 1 when devicePixelRatio is undefined', async () => {
        vi.stubGlobal('devicePixelRatio', undefined)
        const { Application } = await import('pixi.js')
        const constants = makeConstants()
        await setupPixiJS(gameContainer, constants)
        const MockApp = vi.mocked(Application)
        const lastApp =
            MockApp.mock.results[MockApp.mock.results.length - 1].value
        expect(lastApp.init).toHaveBeenCalledWith(
            expect.objectContaining({ resolution: 1 })
        )
    })
})
