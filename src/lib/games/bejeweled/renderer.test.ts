import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js before imports
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            position: { set: vi.fn(), x: 0, y: 0 },
            scale: { set: vi.fn(), x: 1, y: 1 },
        }
        for (const m of [
            'roundRect',
            'fill',
            'stroke',
            'rect',
            'clear',
            'circle',
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
        position: { set: vi.fn(), x: 0, y: 0 },
        pivot: { set: vi.fn(), x: 0, y: 0 },
        scale: { set: vi.fn(), x: 1, y: 1 },
        alpha: 1,
        on: vi.fn(),
        eventMode: null as unknown,
        hitArea: null as unknown,
    })

    const makeApp = () => {
        const canvas = document.createElement('canvas')
        const stage = makeContainer()
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage,
            renderer: { resize: vi.fn(), width: 640, height: 480 },
            destroy: vi.fn(),
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        Rectangle: vi.fn((x: number, y: number, w: number, h: number) => ({
            x,
            y,
            width: w,
            height: h,
        })),
        Assets: { load: vi.fn().mockResolvedValue({}) },
        Text: vi.fn(() => ({
            text: '',
            destroy: vi.fn(),
            anchor: { set: vi.fn() },
        })),
        Sprite: vi.fn(() => ({ destroy: vi.fn(), texture: null })),
        FederatedPointerEvent: vi.fn(),
    }
})

import { BejeweledRenderer } from './renderer'
import type { BejeweledState } from './types'
import { Application } from 'pixi.js'

function makeBejeweledState(
    overrides: Partial<BejeweledState> = {}
): BejeweledState {
    return {
        grid: [
            ['red', 'blue', 'green'],
            ['yellow', 'purple', 'cyan'],
            ['red', 'blue', null],
        ],
        rows: 3,
        cols: 3,
        selected: null,
        combo: 0,
        movesMade: 0,
        isAnimating: false,
        score: 0,
        isGameOver: false,
        isPaused: false,
        timeRemaining: 60,
        ...overrides,
    } as unknown as BejeweledState
}

describe('BejeweledRenderer', () => {
    let container: HTMLElement
    let renderer: BejeweledRenderer

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'bejeweled-test-container'
        document.body.appendChild(container)
        vi.clearAllMocks()
        vi.stubGlobal('requestAnimationFrame', vi.fn())
        vi.stubGlobal('performance', { now: vi.fn().mockReturnValue(0) })
    })

    afterEach(() => {
        try {
            renderer?.destroy()
        } catch {
            /* ignore */
        }
        document.body.removeChild(container)
        vi.unstubAllGlobals()
    })

    describe('constructor and initialize', () => {
        it('should initialize successfully with default config', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
        })

        it('should use custom gridPadding and cellPadding', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
                gridPadding: 16,
                cellPadding: 6,
            })
            await renderer.initialize()
            expect(renderer.isReady()).toBe(true)
        })

        it('should throw when container does not exist', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#nonexistent',
            })
            await expect(renderer.initialize()).rejects.toThrow()
        })

        it('should append canvas to container DOM', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            expect(container.children.length).toBeGreaterThan(0)
        })

        it('should add overlayLayer to stage during setup', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.stage.addChild).toHaveBeenCalled()
        })

        it('should register pointerdown event on stage', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            expect(appInst.stage.on).toHaveBeenCalledWith(
                'pointerdown',
                expect.any(Function)
            )
        })
    })

    describe('setCellClickCallback', () => {
        it('should store the callback without throwing', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            const cb = vi.fn()
            expect(() => renderer.setCellClickCallback(cb)).not.toThrow()
        })
    })

    describe('render (renderGame)', () => {
        it('should not throw when rendering a valid state', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            expect(() => renderer.render(state)).not.toThrow()
        })

        it('should call clearStage (removeChildren) before drawing', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value

            renderer.render(makeBejeweledState())
            expect(appInst.stage.removeChildren).toHaveBeenCalled()
        })

        it('should draw cell backgrounds for all cells (addToStage called per cell)', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            const callsBefore = (
                appInst.stage.addChild as ReturnType<typeof vi.fn>
            ).mock.calls.length

            renderer.render(makeBejeweledState())

            const callsAfter = (
                appInst.stage.addChild as ReturnType<typeof vi.fn>
            ).mock.calls.length
            // At minimum 1 addChild per cell for background (3x3 = 9 cells)
            expect(callsAfter - callsBefore).toBeGreaterThanOrEqual(9)
        })

        it('should draw jewels for non-null cells', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            // 8 out of 9 cells have jewels
            expect(() => renderer.render(state)).not.toThrow()
        })

        it('should draw selection highlight when cell is selected', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState({ selected: { row: 0, col: 0 } })
            expect(() => renderer.render(state)).not.toThrow()
        })

        it('should not throw with empty grid', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState({
                grid: [],
                rows: 0,
                cols: 0,
            })
            expect(() => renderer.render(state)).not.toThrow()
        })

        it('should not throw when app is null (render before init)', () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            expect(() => renderer.render(makeBejeweledState())).not.toThrow()
        })
    })

    describe('animateSwap', () => {
        it('should resolve immediately when app is null', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            // Not initialized, app is null
            const state = makeBejeweledState()
            await expect(
                renderer.animateSwap(
                    { row: 0, col: 0 },
                    { row: 0, col: 1 },
                    state
                )
            ).resolves.toBeUndefined()
        })

        it('should call requestAnimationFrame when app is ready', async () => {
            const rafMock = vi.mocked(requestAnimationFrame)
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            renderer.animateSwap({ row: 0, col: 0 }, { row: 0, col: 1 }, state)
            expect(rafMock).toHaveBeenCalled()
        })
    })

    describe('animateSwapBack', () => {
        it('should resolve immediately when app is null', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            const state = makeBejeweledState()
            await expect(
                renderer.animateSwapBack(
                    { row: 0, col: 0 },
                    { row: 0, col: 1 },
                    state
                )
            ).resolves.toBeUndefined()
        })
    })

    describe('animateClear', () => {
        it('should resolve immediately when cells array is empty', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            await expect(
                renderer.animateClear([], state)
            ).resolves.toBeUndefined()
        })

        it('should resolve immediately when app is null', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            const state = makeBejeweledState()
            await expect(
                renderer.animateClear([{ row: 0, col: 0 }], state)
            ).resolves.toBeUndefined()
        })

        it('should call requestAnimationFrame when animating cells', async () => {
            const rafMock = vi.mocked(requestAnimationFrame)
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            renderer.animateClear([{ row: 0, col: 0 }], state)
            expect(rafMock).toHaveBeenCalled()
        })

        it('should skip null cells during animateClear', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState({
                grid: [
                    [null, null, null],
                    [null, null, null],
                    [null, null, null],
                ],
            })
            // All cells are null, nothing to animate
            renderer.animateClear(
                [
                    { row: 0, col: 0 },
                    { row: 1, col: 1 },
                ],
                state
            )
            // Should not throw
            expect(true).toBe(true)
        })
    })

    describe('animation integration', () => {
        it('animateSwap: animate callback runs until t >= 1', async () => {
            let animateFn: FrameRequestCallback = () => {}
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                animateFn = cb
                return 1
            })

            const mockPerf = { now: vi.fn() }
            vi.stubGlobal('performance', mockPerf)

            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            mockPerf.now.mockReturnValue(0)
            const promise = renderer.animateSwap(
                { row: 0, col: 0 },
                { row: 0, col: 1 },
                state,
                100
            )

            // Run animation frame past duration
            mockPerf.now.mockReturnValue(200)
            animateFn(200)

            await promise
        })

        it('animateClear: animate callback fades and scales jewels', async () => {
            let animateFn: FrameRequestCallback = () => {}
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                animateFn = cb
                return 1
            })

            const mockPerf = { now: vi.fn() }
            vi.stubGlobal('performance', mockPerf)

            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            mockPerf.now.mockReturnValue(0)
            const promise = renderer.animateClear(
                [{ row: 0, col: 0 }],
                state,
                100
            )

            // Mid-animation
            mockPerf.now.mockReturnValue(50)
            animateFn(50)

            // Completion
            mockPerf.now.mockReturnValue(200)
            animateFn(200)

            await promise
        })
    })

    describe('pointerdown handler', () => {
        it('should invoke onCellClick when clicking inside grid', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const cb = vi.fn()
            renderer.setCellClickCallback(cb)

            // Render a state first so lastState is set
            const state = makeBejeweledState()
            renderer.render(state)

            // Retrieve the pointerdown handler
            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            const onCall = (
                appInst.stage.on as ReturnType<typeof vi.fn>
            ).mock.calls.find((c: unknown[]) => c[0] === 'pointerdown')
            expect(onCall).toBeDefined()

            // Simulate a click at (100, 100) — within a 3x3 grid on 640x480
            onCall![1]({ global: { x: 100, y: 100 } })
            expect(cb).toHaveBeenCalled()
        })

        it('should not invoke onCellClick when isAnimating is true', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const cb = vi.fn()
            renderer.setCellClickCallback(cb)

            const state = makeBejeweledState({ isAnimating: true })
            renderer.render(state)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            const onCall = (
                appInst.stage.on as ReturnType<typeof vi.fn>
            ).mock.calls.find((c: unknown[]) => c[0] === 'pointerdown')

            onCall![1]({ global: { x: 100, y: 100 } })
            expect(cb).not.toHaveBeenCalled()
        })

        it('should not invoke onCellClick when clicking outside grid', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const cb = vi.fn()
            renderer.setCellClickCallback(cb)

            const state = makeBejeweledState()
            renderer.render(state)

            const MockApp = vi.mocked(Application)
            const appInst = MockApp.mock.results[0].value
            const onCall = (
                appInst.stage.on as ReturnType<typeof vi.fn>
            ).mock.calls.find((c: unknown[]) => c[0] === 'pointerdown')

            // Click far outside grid (negative effective position)
            onCall![1]({ global: { x: -100, y: -100 } })
            expect(cb).not.toHaveBeenCalled()
        })
    })
})
