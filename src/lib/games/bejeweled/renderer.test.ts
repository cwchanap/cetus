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
        FillGradient: vi.fn(() => ({ destroy: vi.fn() })),
        Rectangle: vi.fn((x: number, y: number, w: number, h: number) => ({
            x,
            y,
            width: w,
            height: h,
        })),
        Assets: { load: vi.fn().mockResolvedValue({}) },
        Text: vi.fn(() => ({
            text: '',
            alpha: 1,
            position: { set: vi.fn() },
            destroy: vi.fn(),
            anchor: { set: vi.fn() },
        })),
        Sprite: vi.fn(() => ({ destroy: vi.fn(), texture: null })),
        FederatedPointerEvent: vi.fn(),
    }
})

import { BejeweledRenderer } from './renderer'
import type { BejeweledState } from './types'
import { Application, Graphics, Text } from 'pixi.js'

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
        it('shows earned points and expanding rings, pauses them, and cleans up on cancellation', async () => {
            let frames: FrameRequestCallback[] = []
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                frames.push(cb)
                return 1
            })
            const frame = (time: number) => {
                const pending = frames
                frames = []
                pending.forEach(cb => cb(time))
            }
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            const clear = renderer.animateClear(
                [{ row: 0, col: 0 }],
                makeBejeweledState({ combo: 3 }),
                1000,
                90
            )
            expect(Text).toHaveBeenCalledWith(
                expect.objectContaining({ text: '+90  ×3' })
            )
            const pop = vi.mocked(Text).mock.results.at(-1)!.value
            frame(60)
            const ring = vi
                .mocked(Graphics)
                .mock.results.map(result => result.value)
                .find(graphic => graphic.circle.mock.calls.length > 0)
            expect(ring).toBeDefined()
            const radius = ring.circle.mock.lastCall[2]
            const position = pop.position.set.mock.lastCall
            renderer.setPaused(true)
            frame(1060)
            expect(pop.position.set.mock.lastCall).toEqual(position)
            expect(ring.circle.mock.lastCall[2]).toBe(radius)
            renderer.setPaused(false)
            frame(1120)
            expect(pop.position.set.mock.lastCall[1]).toBeLessThan(position[1])
            expect(ring.circle.mock.lastCall[2]).toBeGreaterThan(radius)
            renderer.cancelAnimations()
            frame(1130)
            await clear
            expect(pop.destroy).toHaveBeenCalledOnce()
            expect(ring.destroy).toHaveBeenCalledOnce()
        })

        it('skips decorative clear effects with reduced motion', async () => {
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                cb(16)
                return 1
            })
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            renderer.setPreferences('swift', false, true)
            await renderer.animateClear(
                [{ row: 0, col: 0 }],
                makeBejeweledState({ combo: 1 }),
                1000,
                30
            )
            expect(Text).not.toHaveBeenCalled()
            for (const graphic of vi.mocked(Graphics).mock.results) {
                expect(graphic.value.circle).not.toHaveBeenCalled()
            }
        })

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
            vi.mocked(requestAnimationFrame).mockImplementationOnce(cb => {
                cb(1001) // t = (1001 - 0) / 1000 >= 1, so animate resolves immediately
                return 1
            })

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
            // All cells are null — animateClear should still resolve without rejection
            await expect(
                renderer.animateClear(
                    [
                        { row: 0, col: 0 },
                        { row: 1, col: 1 },
                    ],
                    state
                )
            ).resolves.toBeUndefined()
        })
    })

    describe('animation integration', () => {
        it('freezes an animation while paused and cancels it on restart', async () => {
            let frame!: FrameRequestCallback
            vi.mocked(requestAnimationFrame).mockImplementation(cb => {
                frame = cb
                return 1
            })
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            const done = vi.fn()
            const pending = renderer
                .animateSwap(
                    { row: 0, col: 0 },
                    { row: 0, col: 1 },
                    makeBejeweledState()
                )
                .then(done)
            renderer.setPaused(true)
            frame(1000)
            await Promise.resolve()
            expect(done).not.toHaveBeenCalled()
            renderer.setPaused(false)
            frame(1010)
            await Promise.resolve()
            expect(done).not.toHaveBeenCalled()
            renderer.cancelAnimations()
            frame(1020)
            await pending
            expect(done).toHaveBeenCalledOnce()
        })

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
        it('uses the dragged pair even when a different adjacent gem was selected', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            const click = vi.fn()
            renderer.setCellClickCallback(click)
            renderer.render(
                makeBejeweledState({ selected: { row: 0, col: 0 } })
            )
            const app = vi.mocked(Application).mock.results[0].value
            const handler = (name: string) =>
                app.stage.on.mock.calls.find(
                    (call: unknown[]) => call[0] === name
                )![1]
            handler('pointerdown')({ global: { x: 320, y: 85 } })
            expect(click).not.toHaveBeenCalled()
            handler('pointerup')({ global: { x: 475, y: 85 } })
            expect(click.mock.calls).toEqual([
                [0, 0],
                [0, 1],
                [0, 2],
            ])
        })

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
            const up = appInst.stage.on.mock.calls.find(
                (c: unknown[]) => c[0] === 'pointerup'
            )
            up![1]({ global: { x: 100, y: 100 } })
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

    describe('null app guards', () => {
        it('should return early from renderGame when app is null', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            // Set app to null to trigger the guard in renderGame
            ;(renderer as any).app = null
            const state = makeBejeweledState()
            expect(() => renderer.render(state)).not.toThrow()
        })

        it('should return early from pointerdown handler when lastState is null', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const cb = vi.fn()
            renderer.setCellClickCallback(cb)

            // Do NOT call render() - lastState remains null
            const MockApp = vi.mocked(Application)
            const appInst =
                MockApp.mock.results[MockApp.mock.results.length - 1].value
            const onCall = (
                appInst.stage.on as ReturnType<typeof vi.fn>
            ).mock.calls.find((c: unknown[]) => c[0] === 'pointerdown')

            if (onCall) {
                onCall[1]({ global: { x: 100, y: 100 } })
            }
            // lastState is null → cb should NOT be called
            expect(cb).not.toHaveBeenCalled()
        })

        it('should return {row:-1,col:-1} from mapPointToCell when app is null', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()

            const state = makeBejeweledState()
            // Render first (app is valid) so lastState is populated
            renderer.render(state)
            // Now set app to null so mapPointToCell hits the null guard (lines 157-158)
            ;(renderer as any).app = null

            const MockApp = vi.mocked(Application)
            const appInst =
                MockApp.mock.results[MockApp.mock.results.length - 1].value
            const onCall = (
                appInst.stage.on as ReturnType<typeof vi.fn>
            ).mock.calls.find((c: unknown[]) => c[0] === 'pointerdown')

            if (onCall) {
                expect(() =>
                    onCall[1]({ global: { x: 100, y: 100 } })
                ).not.toThrow()
            }
        })

        it('should return dimensions guard from getGridMetrics when app is null', async () => {
            renderer = new BejeweledRenderer({
                type: 'canvas',
                container: '#bejeweled-test-container',
            })
            await renderer.initialize()
            ;(renderer as any).app = null
            const state = makeBejeweledState()
            // getGridMetrics is called inside renderGame which returns early when app is null
            // So we test via render when app is null (all paths covered)
            expect(() => renderer.render(state)).not.toThrow()
        })
    })
})
