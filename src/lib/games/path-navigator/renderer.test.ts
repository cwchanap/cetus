import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
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
    clearRenderer,
    renderBackground,
    renderPath,
    renderGoal,
    renderCursor,
    renderUI,
    handleMouseMove,
} from './renderer'
import type {
    RendererState,
    GameConfig,
    GameLevel,
    Cursor,
    Point,
    PathSegment,
} from './types'
import { Application, Graphics } from 'pixi.js'

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
    return {
        gameDuration: 60,
        gameWidth: 800,
        gameHeight: 600,
        cursorRadius: 10,
        pathColor: 0x00aaff,
        cursorColor: 0x00ffff,
        goalColor: 0xffff00,
        backgroundColor: 0x000000,
        outOfBoundsColor: 0xff0000,
        ...overrides,
    }
}

function makeRendererState(): RendererState {
    const MockApp = vi.mocked(Application)
    const MockGfx = vi.mocked(Graphics)
    const appInst = new MockApp() as unknown as RendererState['app']

    const makeGfx = () =>
        new MockGfx() as unknown as RendererState['pathGraphics']
    const makeCont = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        x: 0,
        y: 0,
    })

    return {
        app: appInst as unknown as RendererState['app'],
        stage: makeCont() as unknown as RendererState['stage'],
        gameContainer: makeCont() as unknown as RendererState['gameContainer'],
        pathGraphics: makeGfx(),
        cursorGraphics: makeGfx(),
        goalGraphics: makeGfx(),
        backgroundGraphics: makeGfx(),
    }
}

function makeStraightSegment(
    overrides: Partial<PathSegment> = {}
): PathSegment {
    return {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        width: 30,
        type: 'straight',
        ...overrides,
    }
}

function makeCurveSegment(): PathSegment {
    return {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        width: 30,
        type: 'curve',
        controlPoint: { x: 50, y: 150 },
    }
}

function makeLevel(segments: PathSegment[] = []): GameLevel {
    return {
        id: 1,
        name: 'Test Level',
        difficulty: 'easy',
        path: {
            segments,
            startPoint: { x: 10, y: 10 },
            endPoint: { x: 400, y: 300 },
            totalWidth: 30,
        },
        timeBonus: 10,
        basePoints: 100,
    }
}

describe('path-navigator/renderer', () => {
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

            expect(state.app).toBeDefined()
            expect(state.stage).toBeDefined()
            expect(state.pathGraphics).toBeDefined()
            expect(state.cursorGraphics).toBeDefined()
            expect(state.goalGraphics).toBeDefined()
            expect(state.backgroundGraphics).toBeDefined()
        })

        it('should initialize app with correct dimensions', async () => {
            const config = makeConfig({ gameWidth: 640, gameHeight: 480 })
            await setupPixiJS(gameContainer, config)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.init).toHaveBeenCalledWith(
                expect.objectContaining({ width: 640, height: 480 })
            )
        })

        it('should append canvas to the container', async () => {
            const config = makeConfig()
            await setupPixiJS(gameContainer, config)
            expect(gameContainer.children.length).toBeGreaterThan(0)
        })

        it('should add gameContainerPixi to stage', async () => {
            const config = makeConfig()
            await setupPixiJS(gameContainer, config)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.stage.addChild).toHaveBeenCalled()
        })

        it('should create 4 Graphics objects (background, path, goal, cursor)', async () => {
            const config = makeConfig()
            const beforeCount = vi.mocked(Graphics).mock.results.length
            await setupPixiJS(gameContainer, config)
            const created =
                vi.mocked(Graphics).mock.results.length - beforeCount
            expect(created).toBe(4)
        })
    })

    describe('clearRenderer', () => {
        it('should destroy the app', () => {
            const state = makeRendererState()
            clearRenderer(state)
            expect(state.app.destroy).toHaveBeenCalledWith(true)
        })

        it('should not throw when called', () => {
            const state = makeRendererState()
            expect(() => clearRenderer(state)).not.toThrow()
        })
    })

    describe('renderBackground', () => {
        it('should clear background graphics', () => {
            const state = makeRendererState()
            renderBackground(state, makeConfig())
            expect(state.backgroundGraphics.clear).toHaveBeenCalled()
        })

        it('should draw a rect for the background', () => {
            const state = makeRendererState()
            renderBackground(
                state,
                makeConfig({ gameWidth: 800, gameHeight: 600 })
            )
            expect(state.backgroundGraphics.rect).toHaveBeenCalledWith(
                0,
                0,
                800,
                600
            )
        })

        it('should fill the background', () => {
            const state = makeRendererState()
            renderBackground(state, makeConfig())
            expect(state.backgroundGraphics.fill).toHaveBeenCalled()
        })

        it('should draw vertical grid lines', () => {
            const state = makeRendererState()
            renderBackground(
                state,
                makeConfig({ gameWidth: 100, gameHeight: 100 })
            )
            expect(state.backgroundGraphics.moveTo).toHaveBeenCalled()
            expect(state.backgroundGraphics.lineTo).toHaveBeenCalled()
        })
    })

    describe('renderPath', () => {
        it('should clear pathGraphics before drawing', () => {
            const state = makeRendererState()
            const level = makeLevel()
            renderPath(state, level, makeConfig())
            expect(state.pathGraphics.clear).toHaveBeenCalled()
        })

        it('should draw start circle', () => {
            const state = makeRendererState()
            const level = makeLevel()
            renderPath(state, level, makeConfig())
            expect(state.pathGraphics.circle).toHaveBeenCalled()
        })

        it('should draw straight path segments', () => {
            const state = makeRendererState()
            const level = makeLevel([makeStraightSegment()])
            renderPath(state, level, makeConfig())
            expect(state.pathGraphics.poly).toHaveBeenCalled()
        })

        it('should draw curved path segments', () => {
            const state = makeRendererState()
            const level = makeLevel([makeCurveSegment()])
            renderPath(state, level, makeConfig())
            expect(state.pathGraphics.poly).toHaveBeenCalled()
        })

        it('should handle zero-length straight segments (length = 0)', () => {
            const state = makeRendererState()
            const zeroLengthSegment = makeStraightSegment({
                start: { x: 50, y: 50 },
                end: { x: 50, y: 50 }, // same start/end = length 0
            })
            const level = makeLevel([zeroLengthSegment])
            expect(() => renderPath(state, level, makeConfig())).not.toThrow()
        })

        it('should handle curve segments without controlPoint (skip)', () => {
            const state = makeRendererState()
            const noControlCurve: PathSegment = {
                start: { x: 0, y: 0 },
                end: { x: 100, y: 100 },
                width: 30,
                type: 'curve',
                // No controlPoint
            }
            const level = makeLevel([noControlCurve])
            expect(() => renderPath(state, level, makeConfig())).not.toThrow()
        })
    })

    describe('renderGoal', () => {
        it('should clear goalGraphics', () => {
            const state = makeRendererState()
            renderGoal(state, { x: 200, y: 300 }, makeConfig())
            expect(state.goalGraphics.clear).toHaveBeenCalled()
        })

        it('should draw goal circles', () => {
            const state = makeRendererState()
            renderGoal(state, { x: 200, y: 300 }, makeConfig())
            expect(state.goalGraphics.circle).toHaveBeenCalledWith(
                200,
                300,
                expect.any(Number)
            )
        })

        it('should fill goal with goalColor', () => {
            const state = makeRendererState()
            renderGoal(
                state,
                { x: 100, y: 100 },
                makeConfig({ goalColor: 0xffff00 })
            )
            expect(state.goalGraphics.fill).toHaveBeenCalledWith(0xffff00)
        })
    })

    describe('renderCursor', () => {
        it('should clear cursorGraphics on every call', () => {
            const state = makeRendererState()
            const cursor: Cursor = {
                x: 100,
                y: 100,
                radius: 10,
                isVisible: true,
            }
            renderCursor(state, cursor, makeConfig(), true)
            expect(state.cursorGraphics.clear).toHaveBeenCalled()
        })

        it('should not draw when cursor is not visible', () => {
            const state = makeRendererState()
            const cursor: Cursor = {
                x: 100,
                y: 100,
                radius: 10,
                isVisible: false,
            }
            renderCursor(state, cursor, makeConfig(), true)
            expect(state.cursorGraphics.circle).not.toHaveBeenCalled()
        })

        it('should draw cursor when visible', () => {
            const state = makeRendererState()
            const cursor: Cursor = {
                x: 150,
                y: 200,
                radius: 8,
                isVisible: true,
            }
            renderCursor(state, cursor, makeConfig(), true)
            expect(state.cursorGraphics.circle).toHaveBeenCalled()
        })

        it('should draw trail stroke when on path', () => {
            const state = makeRendererState()
            const cursor: Cursor = {
                x: 150,
                y: 200,
                radius: 8,
                isVisible: true,
            }
            renderCursor(state, cursor, makeConfig(), true)
            expect(state.cursorGraphics.stroke).toHaveBeenCalled()
        })

        it('should not draw trail when off path', () => {
            const state = makeRendererState()
            const cursor: Cursor = {
                x: 150,
                y: 200,
                radius: 8,
                isVisible: true,
            }
            renderCursor(state, cursor, makeConfig(), false)
            expect(state.cursorGraphics.stroke).not.toHaveBeenCalled()
        })

        it('should use cursorColor when on path, outOfBoundsColor when off path', () => {
            const state1 = makeRendererState()
            const state2 = makeRendererState()
            const cursor: Cursor = {
                x: 100,
                y: 100,
                radius: 10,
                isVisible: true,
            }
            const config = makeConfig({
                cursorColor: 0x00ffff,
                outOfBoundsColor: 0xff0000,
            })

            renderCursor(state1, cursor, config, true)
            renderCursor(state2, cursor, config, false)

            expect(state1.cursorGraphics.fill).toHaveBeenCalledWith(0x00ffff)
            expect(state2.cursorGraphics.fill).toHaveBeenCalledWith(0xff0000)
        })
    })

    describe('renderUI', () => {
        it('should not throw', () => {
            const state = makeRendererState()
            expect(() =>
                renderUI(state, 100, 1, 30, makeConfig())
            ).not.toThrow()
        })
    })

    describe('handleMouseMove', () => {
        it('should return scaled coordinates from mouse event', () => {
            const state = makeRendererState()
            // canvas: width=800, height=600, getBoundingClientRect returns 800x600
            const event = new MouseEvent('mousemove', {
                clientX: 400,
                clientY: 300,
            })

            const point = handleMouseMove(state, event)

            expect(point.x).toBeCloseTo(400)
            expect(point.y).toBeCloseTo(300)
        })

        it('should account for canvas offset (left/top)', () => {
            const state = makeRendererState()
            // Override getBoundingClientRect to simulate offset canvas
            state.app.canvas.getBoundingClientRect = vi.fn().mockReturnValue({
                left: 100,
                top: 50,
                width: 800,
                height: 600,
            })

            const event = new MouseEvent('mousemove', {
                clientX: 500,
                clientY: 350,
            })
            const point = handleMouseMove(state, event)

            // (500 - 100) * (800/800) = 400, (350 - 50) * (600/600) = 300
            expect(point.x).toBeCloseTo(400)
            expect(point.y).toBeCloseTo(300)
        })
    })
})
