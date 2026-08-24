import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initRhythmReactorGameFramework } from './initFramework'
import { RHYTHM_REACTOR_RULES, type RhythmReactorStats } from './types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'
import { RhythmReactorRenderer } from './RhythmReactorRenderer'

interface MockRendererInstance {
    canvas: HTMLCanvasElement
    initialize: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    getApp: ReturnType<typeof vi.fn>
}

const h = vi.hoisted(() => ({
    rendererInstances: [] as MockRendererInstance[],
}))

vi.mock('./RhythmReactorRenderer', () => {
    class MockRhythmReactorRenderer {
        readonly canvas = document.createElement('canvas')

        initialize = vi.fn(async () => {
            document
                .getElementById('rhythm-reactor-canvas')
                ?.appendChild(this.canvas)
        })

        render = vi.fn()

        destroy = vi.fn(() => {
            this.canvas.remove()
        })

        getApp = vi.fn(() => ({ canvas: this.canvas }))

        constructor() {
            h.rendererInstances.push({
                canvas: this.canvas,
                initialize: this.initialize,
                render: this.render,
                destroy: this.destroy,
                getApp: this.getApp,
            })
        }
    }

    return {
        RhythmReactorRenderer: vi
            .fn()
            .mockImplementation(() => new MockRhythmReactorRenderer()),
        createRhythmReactorRendererConfig: vi.fn(() => ({
            type: 'canvas',
            container: '#rhythm-reactor-canvas',
            width: RHYTHM_REACTOR_RULES.canvasWidth,
            height: RHYTHM_REACTOR_RULES.canvasHeight,
            responsive: false,
        })),
    }
})

vi.mock('@/lib/games/core/errors', async importOriginal => {
    const actual =
        await importOriginal<typeof import('@/lib/games/core/errors')>()
    return { ...actual, handleGameError: vi.fn() }
})

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="rhythm-reactor-container">
            <div id="rhythm-reactor-canvas"></div>
            <p id="rhythm-reactor-status" aria-live="polite"></p>
        </div>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <span id="rhythm-reactor-combo">0</span>
        <span id="rhythm-reactor-hits">0</span>
        <span id="rhythm-reactor-judgment">READY</span>
        <span id="rhythm-reactor-stability">60</span>
        <button id="start-btn" type="button">Start</button>
        <button id="reset-btn" type="button">Reset</button>
        <div id="rhythm-reactor-controls" role="group">
            <button type="button" data-rhythm-lane="0" disabled>Lane 1 · D</button>
            <button type="button" data-rhythm-lane="1" disabled>Lane 2 · F</button>
            <button type="button" data-rhythm-lane="2" disabled>Lane 3 · J</button>
            <button type="button" data-rhythm-lane="3" disabled>Lane 4 · K</button>
        </div>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">RHYTHM REACTOR OFFLINE</h3>
            <span id="final-score">0</span>
            <span id="final-hits">0</span>
            <span id="final-misses">0</span>
            <span id="final-stray-presses">0</span>
            <span id="final-perfect">0</span>
            <span id="final-good">0</span>
            <span id="final-max-combo">0</span>
            <span id="final-accuracy">0.0%</span>
            <span id="final-stability">60</span>
            <button id="play-again-btn" type="button">Play Again</button>
        </div>
    `
}

function laneButtons(): HTMLButtonElement[] {
    return Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-rhythm-lane]')
    )
}

function statusText(): string {
    return document.getElementById('rhythm-reactor-status')?.textContent ?? ''
}

function stubFinalSave(
    handle: NonNullable<
        Awaited<ReturnType<typeof initRhythmReactorGameFramework>>
    >
): void {
    vi.spyOn(handle.game.getScoreManager(), 'saveFinalScore').mockResolvedValue(
        { success: true }
    )
}

function advanceToFirstNote(
    handle: NonNullable<
        Awaited<ReturnType<typeof initRhythmReactorGameFramework>>
    >
): void {
    handle.game.start()
    for (let index = 0; index < 20; index += 1) {
        handle.game.update(0.1)
    }
}

describe('initRhythmReactorGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initRhythmReactorGameFramework>>
    let rafCallbacks: FrameRequestCallback[]
    let eventReturnValueSpy: { mockRestore: () => void } | undefined

    beforeEach(() => {
        setupDOM()
        h.rendererInstances.length = 0
        rafCallbacks = []
        eventReturnValueSpy = undefined
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    newAchievements: [],
                    challengeUpdates: undefined,
                }),
            })
        )
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((callback: FrameRequestCallback) => {
                rafCallbacks.push(callback)
                return rafCallbacks.length
            })
        )
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        handle = undefined
    })

    afterEach(() => {
        eventReturnValueSpy?.mockRestore()
        eventReturnValueSpy = undefined
        handle?.cleanup()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.replaceChildren()
    })

    it('reports a missing root with the existing game-error path', async () => {
        document.getElementById('rhythm-reactor-container')?.remove()

        expect(await initRhythmReactorGameFramework()).toBeUndefined()
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(DOMElementNotFoundError),
            'RhythmReactor'
        )
    })

    it('cleans a partial renderer when renderer setup fails', async () => {
        const failedRenderer = {
            initialize: vi.fn().mockRejectedValue(new Error('renderer failed')),
            destroy: vi.fn(),
            render: vi.fn(),
            getApp: vi.fn(() => ({ canvas: document.createElement('canvas') })),
        }
        vi.mocked(RhythmReactorRenderer).mockImplementationOnce(
            () => failedRenderer as never
        )

        expect(await initRhythmReactorGameFramework()).toBeUndefined()
        expect(failedRenderer.destroy).toHaveBeenCalledTimes(1)
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(Error),
            'RhythmReactor'
        )
    })

    it('maps four delegated lane buttons to hitLane', async () => {
        handle = await initRhythmReactorGameFramework()
        const hitLane = vi.spyOn(handle!.game, 'hitLane')
        handle!.game.start()

        fireEvent.click(laneButtons()[0])
        fireEvent.click(laneButtons()[1])
        fireEvent.click(laneButtons()[2])
        fireEvent.click(laneButtons()[3])
        fireEvent.click(document.getElementById('rhythm-reactor-controls')!)

        expect(hitLane.mock.calls.map(([lane]) => lane)).toEqual([0, 1, 2, 3])
    })

    it('maps case-insensitive DFJK keyboard input through hitLane', async () => {
        handle = await initRhythmReactorGameFramework()
        const hitLane = vi.spyOn(handle!.game, 'hitLane')
        hitLane.mockReturnValue({ accepted: true, judgment: 'miss', points: 0 })
        handle!.game.start()

        for (const key of ['D', 'F', 'J', 'K']) {
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    bubbles: true,
                    cancelable: true,
                })
            )
        }

        expect(hitLane.mock.calls.map(([lane]) => lane)).toEqual([0, 1, 2, 3])
    })

    it('ignores repeat, modifier, and editable keyboard events', async () => {
        handle = await initRhythmReactorGameFramework()
        const hitLane = vi.spyOn(handle!.game, 'hitLane')
        handle!.game.start()
        const input = document.createElement('input')
        const textarea = document.createElement('textarea')
        const select = document.createElement('select')
        const editable = document.createElement('div')
        editable.contentEditable = 'true'
        Object.defineProperty(editable, 'isContentEditable', { value: true })
        document.body.append(input, textarea, select, editable)

        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'd',
                repeat: true,
                bubbles: true,
            })
        )
        for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'd',
                    [modifier]: true,
                    bubbles: true,
                })
            )
        }
        for (const target of [input, textarea, select, editable]) {
            target.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'd',
                    bubbles: true,
                })
            )
        }

        expect(hitLane).not.toHaveBeenCalled()
    })

    it('routes lane keys past focused buttons but suppresses Enter/Space activation keys', async () => {
        handle = await initRhythmReactorGameFramework()
        const hitLane = vi.spyOn(handle!.game, 'hitLane')
        hitLane.mockReturnValue({ accepted: true, judgment: 'miss', points: 0 })
        handle!.game.start()

        laneButtons()[0].focus()
        laneButtons()[0].dispatchEvent(
            new KeyboardEvent('keydown', { key: 'd', bubbles: true })
        )
        laneButtons()[1].focus()
        laneButtons()[1].dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        )
        laneButtons()[2].focus()
        laneButtons()[2].dispatchEvent(
            new KeyboardEvent('keydown', { key: ' ', bubbles: true })
        )

        expect(hitLane).toHaveBeenCalledTimes(1)
        expect(hitLane).toHaveBeenCalledWith(0)
    })

    it('hides Start and enables lanes when a run starts', async () => {
        handle = await initRhythmReactorGameFramework()

        expect(laneButtons().every(button => button.disabled)).toBe(true)
        document.getElementById('start-btn')!.click()

        expect(document.getElementById('start-btn')!.style.display).toBe('none')
        expect(laneButtons().every(button => !button.disabled)).toBe(true)
    })

    it('syncs visible combo, hits, judgment, and stability state', async () => {
        handle = await initRhythmReactorGameFramework()
        advanceToFirstNote(handle!)
        handle!.game.hitLane(0)

        expect(
            document.getElementById('rhythm-reactor-combo')
        ).toHaveTextContent('1')
        expect(
            document.getElementById('rhythm-reactor-hits')
        ).toHaveTextContent('1')
        expect(
            document.getElementById('rhythm-reactor-judgment')
        ).toHaveTextContent('PERFECT')
        expect(
            document.getElementById('rhythm-reactor-stability')
        ).toHaveTextContent('64')
    })

    it('announces judgments and completion through the live region', async () => {
        handle = await initRhythmReactorGameFramework()
        stubFinalSave(handle!)
        advanceToFirstNote(handle!)
        handle!.game.hitLane(0)

        expect(statusText()).toContain('PERFECT')

        await handle!.game.end()
        expect(statusText()).toContain('complete')
    })

    it('reset restores idle HUD, controls, timer, and overlay', async () => {
        handle = await initRhythmReactorGameFramework()
        advanceToFirstNote(handle!)
        handle!.game.hitLane(0)
        document.getElementById('game-over-overlay')!.classList.remove('hidden')

        document.getElementById('reset-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            timeRemaining: RHYTHM_REACTOR_RULES.duration,
            perfectHits: 0,
            goodHits: 0,
            misses: 0,
            strayPresses: 0,
            combo: 0,
            stability: RHYTHM_REACTOR_RULES.initialStability,
            lastJudgment: null,
        })
        expect(
            document.getElementById('rhythm-reactor-hits')
        ).toHaveTextContent('0')
        expect(
            document.getElementById('rhythm-reactor-judgment')
        ).toHaveTextContent('READY')
        expect(laneButtons().every(button => button.disabled)).toBe(true)
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
        expect(document.getElementById('start-btn')!.style.display).toBe(
            'inline-flex'
        )
    })

    it('Play Again calls game.start after game over', async () => {
        handle = await initRhythmReactorGameFramework()
        stubFinalSave(handle!)
        const startSpy = vi.spyOn(handle!.game, 'start')
        handle!.game.start()
        await handle!.game.end()

        document.getElementById('play-again-btn')!.click()

        expect(startSpy).toHaveBeenCalledTimes(2)
        expect(handle!.game.getState()).toMatchObject({
            isActive: true,
            isGameOver: false,
            gameStarted: true,
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
    })

    it('fills every final stat including stray presses and one-decimal accuracy', async () => {
        handle = await initRhythmReactorGameFramework()
        stubFinalSave(handle!)
        const stats: RhythmReactorStats = {
            finalScore: 730,
            timeElapsed: 12,
            gameCompleted: true,
            hits: 7,
            misses: 3,
            strayPresses: 2,
            perfectHits: 4,
            goodHits: 3,
            maxCombo: 5,
            accuracy: 83.333,
            finalStability: 74,
        }
        vi.spyOn(handle!.game, 'getGameStats').mockReturnValue(stats)
        handle!.game.start()
        await handle!.game.end()

        expect(document.getElementById('final-hits')).toHaveTextContent('7')
        expect(document.getElementById('final-misses')).toHaveTextContent('3')
        expect(
            document.getElementById('final-stray-presses')
        ).toHaveTextContent('2')
        expect(document.getElementById('final-perfect')).toHaveTextContent('4')
        expect(document.getElementById('final-good')).toHaveTextContent('3')
        expect(document.getElementById('final-max-combo')).toHaveTextContent(
            '5'
        )
        expect(document.getElementById('final-accuracy')).toHaveTextContent(
            '83.3%'
        )
        expect(document.getElementById('final-stability')).toHaveTextContent(
            '74'
        )
    })

    it('warns beforeunload only while active', async () => {
        handle = await initRhythmReactorGameFramework()
        stubFinalSave(handle!)
        eventReturnValueSpy = vi.spyOn(Event.prototype, 'returnValue', 'set')
        handle!.game.start()

        const activeEvent = new Event('beforeunload', { cancelable: true })
        const activePreventDefaultSpy = vi.spyOn(activeEvent, 'preventDefault')
        window.dispatchEvent(activeEvent)

        expect(activePreventDefaultSpy).toHaveBeenCalledTimes(1)
        expect(eventReturnValueSpy).toHaveBeenCalledWith(
            'You have a game in progress. Are you sure you want to leave?'
        )

        await handle!.game.end()
        const endedEvent = new Event('beforeunload', { cancelable: true })
        const endedPreventDefaultSpy = vi.spyOn(endedEvent, 'preventDefault')
        window.dispatchEvent(endedEvent)

        expect(endedPreventDefaultSpy).not.toHaveBeenCalled()
    })

    it('runs one rAF update/render loop and clamps delta to maxUpdateDelta', async () => {
        handle = await initRhythmReactorGameFramework()
        const render = h.rendererInstances[0].render
        const update = vi.spyOn(handle!.game, 'update')

        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
        handle!.game.start()
        rafCallbacks[0](0)

        expect(update).toHaveBeenLastCalledWith(0)
        expect(render).toHaveBeenCalledTimes(2)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

        rafCallbacks[1](1000)
        expect(update).toHaveBeenLastCalledWith(
            RHYTHM_REACTOR_RULES.maxUpdateDelta
        )
        expect(render).toHaveBeenCalledTimes(3)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(3)
    })

    it('cleans up listeners and resources idempotently', async () => {
        handle = await initRhythmReactorGameFramework()
        const rendererDestroy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroy = vi.spyOn(handle!.game, 'destroy')
        const cancel = vi.mocked(cancelAnimationFrame)
        handle!.cleanup()
        handle!.cleanup()

        handle!.game.start()
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'd', bubbles: true })
        )
        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)

        expect(handle!.game.getState().strayPresses).toBe(0)
        expect(preventDefaultSpy).not.toHaveBeenCalled()
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(rendererDestroy).toHaveBeenCalledTimes(1)
        expect(gameDestroy).toHaveBeenCalledTimes(1)
    })
})
