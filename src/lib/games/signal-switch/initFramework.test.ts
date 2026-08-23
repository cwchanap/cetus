import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSignalSwitchGameFramework } from './initFramework'
import { SIGNAL_SWITCH_RULES, createSignalSwitchConfig } from './types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'

interface MockRendererInstance {
    canvas: HTMLCanvasElement
    initialize: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    getApp: ReturnType<typeof vi.fn>
}

const h = vi.hoisted(() => ({
    rendererInstances: [] as Array<{
        canvas: HTMLCanvasElement
        initialize: ReturnType<typeof vi.fn>
        render: ReturnType<typeof vi.fn>
        destroy: ReturnType<typeof vi.fn>
        getApp: ReturnType<typeof vi.fn>
    }>,
}))

vi.mock('./SignalSwitchRenderer', () => {
    class MockSignalSwitchRenderer {
        readonly canvas = document.createElement('canvas')

        initialize = vi.fn(async () => {
            document
                .getElementById('signal-switch-canvas')
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
        SignalSwitchRenderer: vi
            .fn()
            .mockImplementation(() => new MockSignalSwitchRenderer()),
        createSignalSwitchRendererConfig: vi.fn(() => ({
            type: 'canvas',
            container: '#signal-switch-canvas',
            width: SIGNAL_SWITCH_RULES.canvasWidth,
            height: SIGNAL_SWITCH_RULES.canvasHeight,
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
        <div id="signal-switch-container">
            <div id="signal-switch-canvas"></div>
            <p id="signal-switch-status" aria-live="polite"></p>
        </div>
        <span id="score">0</span>
        <span id="time-remaining">90</span>
        <span id="signal-switch-integrity">—</span>
        <span id="signal-switch-combo">—</span>
        <span id="signal-switch-safe-passes">—</span>
        <span id="signal-switch-lanes">—</span>
        <span id="signal-switch-speed">—</span>
        <button id="start-btn" type="button">Start</button>
        <button id="reset-btn" type="button">Reset</button>
        <div id="gate-controls" role="group" aria-label="Lane gates">
            <button type="button" data-signal-lane="0"></button>
            <button type="button" data-signal-lane="1"></button>
            <button type="button" data-signal-lane="2"></button>
            <button type="button" data-signal-lane="3"></button>
        </div>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">SIGNAL LOST</h3>
            <span id="final-score">0</span>
            <span id="final-outcome">—</span>
            <span id="final-safe-passes">0</span>
            <span id="final-crashes">0</span>
            <span id="final-max-combo">0</span>
            <span id="final-integrity">3</span>
            <button id="play-again-btn" type="button">Play Again</button>
        </div>
    `
}

function laneButtons(): HTMLButtonElement[] {
    return Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-signal-lane]')
    )
}

function statusText(): string {
    return document.getElementById('signal-switch-status')!.textContent ?? ''
}

function stubFinalSave(
    handle: NonNullable<
        Awaited<ReturnType<typeof initSignalSwitchGameFramework>>
    >
): void {
    vi.spyOn(handle.game.getScoreManager(), 'saveFinalScore').mockResolvedValue(
        {
            success: true,
        }
    )
}

describe('initSignalSwitchGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initSignalSwitchGameFramework>>
    let rafCallbacks: FrameRequestCallback[]
    let eventReturnValueSpy: { mockRestore: () => void } | undefined
    const originalRandom = Math.random

    beforeEach(() => {
        setupDOM()
        h.rendererInstances.length = 0
        rafCallbacks = []
        eventReturnValueSpy = undefined
        Math.random = originalRandom
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
        Math.random = originalRandom
        handle?.cleanup()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.replaceChildren()
    })

    it('reports missing root with DOMElementNotFoundError/handleGameError', async () => {
        document.getElementById('signal-switch-container')?.remove()

        expect(await initSignalSwitchGameFramework()).toBeUndefined()
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(DOMElementNotFoundError),
            'SignalSwitch'
        )
    })

    it('cleans renderer and returns undefined when renderer setup fails', async () => {
        const failedRenderer = {
            initialize: vi.fn().mockRejectedValue(new Error('renderer failed')),
            destroy: vi.fn(),
            render: vi.fn(),
            getApp: vi.fn(() => ({ canvas: document.createElement('canvas') })),
        }
        const { SignalSwitchRenderer } = await import('./SignalSwitchRenderer')
        vi.mocked(SignalSwitchRenderer).mockImplementationOnce(
            () => failedRenderer as never
        )

        expect(await initSignalSwitchGameFramework()).toBeUndefined()
        expect(failedRenderer.destroy).toHaveBeenCalledTimes(1)
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(Error),
            'SignalSwitch'
        )
    })

    it('valid init renders exactly once and returns one handle', async () => {
        handle = await initSignalSwitchGameFramework()

        expect(handle).toBeDefined()
        expect(handle!.getGame()).toBe(handle!.game)
        expect(handle!.getState()).toEqual(handle!.game.getState())
        expect(h.rendererInstances).toHaveLength(1)
        expect(h.rendererInstances[0].render).toHaveBeenCalledTimes(1)
    })

    it('derives idle HUD text from createSignalSwitchConfig values', async () => {
        handle = await initSignalSwitchGameFramework()
        const config = createSignalSwitchConfig()
        const totalLanes = config.laneUnlockSeconds.length
        const startingLanes = config.laneUnlockSeconds.filter(
            unlockAt => unlockAt <= 0
        ).length

        expect(document.getElementById('score')).toHaveTextContent('0')
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            String(config.duration)
        )
        expect(
            document.getElementById('signal-switch-integrity')
        ).toHaveTextContent(String(config.startingIntegrity))
        expect(
            document.getElementById('signal-switch-combo')
        ).toHaveTextContent('0')
        expect(
            document.getElementById('signal-switch-safe-passes')
        ).toHaveTextContent('0')
        expect(
            document.getElementById('signal-switch-lanes')
        ).toHaveTextContent(`${startingLanes} / ${totalLanes}`)
        expect(
            document.getElementById('signal-switch-speed')
        ).toHaveTextContent(String(config.initialDroneSpeed))
    })

    it('labels every lane button from catalog metadata and keeps them disabled until Start', async () => {
        handle = await initSignalSwitchGameFramework()
        const buttons = laneButtons()

        expect(buttons).toHaveLength(
            SIGNAL_SWITCH_RULES.laneUnlockSeconds.length
        )
        // Catalog-derived copy: glyphs and labels come from SIGNAL_SWITCH_SIGNALS.
        expect(buttons.map(button => button.textContent)).toEqual([
            'Lane 1: ● Cyan',
            'Lane 2: ● Cyan',
            'Lane 3: ● Cyan',
            'Lane 4: ● Cyan',
        ])
        for (const [index, button] of buttons.entries()) {
            expect(button.disabled).toBe(true)
            expect(button.getAttribute('aria-label')).toBe(
                `Lane ${index + 1} gate, Cyan ${
                    ['Circle', 'Circle', 'Circle', 'Circle'][index]
                }`
            )
        }
    })

    it('starts exactly one rAF update/render loop without state-change rendering', async () => {
        handle = await initSignalSwitchGameFramework()
        const renderMock = h.rendererInstances[0].render
        const updateSpy = vi.spyOn(handle!.game, 'update')
        const initialRenderCount = renderMock.mock.calls.length

        expect(initialRenderCount).toBe(1)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

        handle!.game.start()
        expect(renderMock).toHaveBeenCalledTimes(initialRenderCount)

        rafCallbacks[0](0)
        expect(updateSpy).toHaveBeenCalledTimes(1)
        expect(updateSpy).toHaveBeenLastCalledWith(0)
        expect(renderMock).toHaveBeenCalledTimes(initialRenderCount + 1)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

        rafCallbacks[1](16)
        expect(updateSpy).toHaveBeenLastCalledWith(0.016)
        expect(handle!.game.getState().drones[0]?.x).toBeGreaterThan(
            SIGNAL_SWITCH_RULES.droneSpawnX
        )
        expect(renderMock).toHaveBeenCalledTimes(initialRenderCount + 2)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(3)
    })

    it('rejects locked-lane clicks before unlock and accepts them after', async () => {
        handle = await initSignalSwitchGameFramework()
        // Keep drones airborne so no crash ends the run mid-test.
        ;(
            handle!.game as unknown as { config: { gateX: number } }
        ).config.gateX = 1_000_000
        handle!.game.start()

        // Locked lane (index 2 unlocks at 30s): disabled and rejected.
        expect(laneButtons()[2].disabled).toBe(true)
        laneButtons()[2].dispatchEvent(
            new MouseEvent('click', { bubbles: true })
        )
        expect(handle!.game.getState().gateSignals[2]).toBe('cyan')

        for (let i = 0; i < 300; i += 1) {
            handle!.game.update(0.1)
        }

        expect(handle!.game.getState().activeLaneCount).toBe(3)
        expect(laneButtons()[3].disabled).toBe(true)
        expect(laneButtons()[2].disabled).toBe(false)
        fireEvent.click(laneButtons()[2])
        expect(handle!.game.getState().gateSignals[2]).toBe('magenta')
        expect(laneButtons()[2].textContent).toBe('Lane 3: ▲ Magenta')
    })

    it('delegated gate-controls clicks cycle the matching lane', async () => {
        handle = await initSignalSwitchGameFramework()
        handle!.game.start()

        fireEvent.click(laneButtons()[0])
        fireEvent.click(laneButtons()[1])
        // Clicking the group itself (not a lane) must be a no-op.
        fireEvent.click(document.getElementById('gate-controls')!)

        const gateSignals = handle!.game.getState().gateSignals
        expect(gateSignals[0]).toBe('magenta')
        expect(gateSignals[1]).toBe('magenta')
        expect(gateSignals[2]).toBe('cyan')
        expect(gateSignals[3]).toBe('cyan')
    })

    it('keyboard 1-4 cycles the matching lane', async () => {
        handle = await initSignalSwitchGameFramework()
        handle!.game.start()

        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: '2', bubbles: true })
        )
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: '9', bubbles: true })
        )

        const gateSignals = handle!.game.getState().gateSignals
        expect(gateSignals[1]).toBe('magenta')
        expect(gateSignals[0]).toBe('cyan')
    })

    it('ignores repeat/modifier/editable keyboard targets', async () => {
        handle = await initSignalSwitchGameFramework()
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
                key: '1',
                repeat: true,
                bubbles: true,
            })
        )
        for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: '1',
                    [modifier]: true,
                    bubbles: true,
                })
            )
        }
        for (const target of [input, textarea, select, editable]) {
            target.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: '1',
                    bubbles: true,
                })
            )
        }

        expect(handle!.game.getState().gateSignals[0]).toBe('cyan')
    })

    it('focused lane button does not double activate via key plus click', async () => {
        handle = await initSignalSwitchGameFramework()
        handle!.game.start()
        const laneButton = laneButtons()[0]
        laneButton.focus()

        laneButton.dispatchEvent(
            new KeyboardEvent('keydown', { key: '1', bubbles: true })
        )
        laneButton.click()

        expect(handle!.game.getState().gateSignals[0]).toBe('magenta')
    })

    it('prevents default only on a successful key cycle', async () => {
        handle = await initSignalSwitchGameFramework()

        const idleEvent = new KeyboardEvent('keydown', {
            key: '1',
            bubbles: true,
            cancelable: true,
        })
        document.dispatchEvent(idleEvent)
        expect(idleEvent.defaultPrevented).toBe(false)

        handle!.game.start()
        const activeEvent = new KeyboardEvent('keydown', {
            key: '1',
            bubbles: true,
            cancelable: true,
        })
        document.dispatchEvent(activeEvent)
        expect(activeEvent.defaultPrevented).toBe(true)
    })

    it('overrides Pixi inline canvas dimensions to preserve aspect ratio', async () => {
        handle = await initSignalSwitchGameFramework()
        const el = document.querySelector<HTMLCanvasElement>(
            '#signal-switch-canvas canvas'
        )!

        expect(el.style.width).toBe('100%')
        expect(el.style.height).toBe('auto')
    })

    it('announces lane unlocks but not ordinary gate changes', async () => {
        handle = await initSignalSwitchGameFramework()
        ;(
            handle!.game as unknown as { config: { gateX: number } }
        ).config.gateX = 1_000_000
        handle!.game.start()

        for (let i = 0; i < 300; i += 1) {
            handle!.game.update(0.1)
        }

        expect(statusText()).toBe('Lane 3 online.')

        fireEvent.click(laneButtons()[0])
        expect(statusText()).toBe('Lane 3 online.')
    })

    it('announces remaining integrity after a crash', async () => {
        handle = await initSignalSwitchGameFramework()
        handle!.game.start()

        // The authored teaching drone (magenta) hits the untouched cyan gate
        // deterministically; drive updates until integrity drops.
        for (
            let i = 0;
            i < 200 &&
            handle!.game.getState().integrity ===
                SIGNAL_SWITCH_RULES.startingIntegrity;
            i += 1
        ) {
            handle!.game.update(0.1)
        }

        expect(handle!.game.getState().integrity).toBe(
            SIGNAL_SWITCH_RULES.startingIntegrity - 1
        )
        expect(statusText()).toContain(
            String(SIGNAL_SWITCH_RULES.startingIntegrity - 1)
        )
    })

    it('Reset restores idle HUD and controls', async () => {
        handle = await initSignalSwitchGameFramework()
        ;(
            handle!.game as unknown as { config: { gateX: number } }
        ).config.gateX = 1_000_000
        handle!.game.start()
        fireEvent.click(laneButtons()[0])
        document.getElementById('reset-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: false,
            gameStarted: false,
            isGameOver: false,
            integrity: SIGNAL_SWITCH_RULES.startingIntegrity,
            safePasses: 0,
            combo: 0,
        })
        expect(
            handle!.game.getState().gateSignals.every(s => s === 'cyan')
        ).toBe(true)
        expect(document.getElementById('score')).toHaveTextContent('0')
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            String(SIGNAL_SWITCH_RULES.duration)
        )
        expect(
            document.getElementById('signal-switch-integrity')
        ).toHaveTextContent(String(SIGNAL_SWITCH_RULES.startingIntegrity))
        expect(
            document.getElementById('signal-switch-lanes')
        ).toHaveTextContent('2 / 4')
        for (const button of laneButtons()) {
            expect(button.disabled).toBe(true)
        }
        expect(document.getElementById('start-btn')!.style.display).toBe(
            'inline-flex'
        )
    })

    it('systems failure shows SIGNAL LOST / Systems failed', async () => {
        Math.random = () => 0
        handle = await initSignalSwitchGameFramework()
        stubFinalSave(handle!)
        handle!.game.start()

        for (let i = 0; i < 400 && handle!.game.getState().isActive; i += 1) {
            handle!.game.update(0.1)
        }

        await vi.waitFor(() =>
            expect(
                document.getElementById('game-over-title')
            ).toHaveTextContent('SIGNAL LOST')
        )
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            'Systems failed'
        )
        expect(document.getElementById('final-crashes')).toHaveTextContent(
            String(SIGNAL_SWITCH_RULES.startingIntegrity)
        )
    })

    it('timeout shows SHIFT COMPLETE / Survived', async () => {
        handle = await initSignalSwitchGameFramework()
        ;(
            handle!.game as unknown as { config: { gateX: number } }
        ).config.gateX = 1_000_000
        stubFinalSave(handle!)
        handle!.game.start()

        vi.advanceTimersByTime(90_000)
        await vi.waitFor(() =>
            expect(
                document.getElementById('game-over-title')
            ).toHaveTextContent('SHIFT COMPLETE')
        )
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            'Survived'
        )
    })

    it('Play Again immediately starts a fresh run', async () => {
        handle = await initSignalSwitchGameFramework()
        stubFinalSave(handle!)
        handle!.game.start()
        await handle!.game.end()
        document.getElementById('play-again-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: true,
            isGameOver: false,
            gameStarted: true,
            integrity: SIGNAL_SWITCH_RULES.startingIntegrity,
            safePasses: 0,
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
    })

    it('active run beforeunload prevents navigation and sets returnValue', async () => {
        handle = await initSignalSwitchGameFramework()
        handle!.game.start()
        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        eventReturnValueSpy = vi.spyOn(Event.prototype, 'returnValue', 'set')

        window.dispatchEvent(event)

        expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
        expect(eventReturnValueSpy).toHaveBeenCalledWith(
            'You have a game in progress. Are you sure you want to leave?'
        )
    })

    it('idle/ended run beforeunload does not block', async () => {
        handle = await initSignalSwitchGameFramework()
        const idleEvent = new Event('beforeunload', { cancelable: true })
        const idlePreventDefaultSpy = vi.spyOn(idleEvent, 'preventDefault')
        window.dispatchEvent(idleEvent)
        expect(idlePreventDefaultSpy).not.toHaveBeenCalled()

        stubFinalSave(handle!)
        handle!.game.start()
        await handle!.game.end()
        const endedEvent = new Event('beforeunload', { cancelable: true })
        const endedPreventDefaultSpy = vi.spyOn(endedEvent, 'preventDefault')
        window.dispatchEvent(endedEvent)
        expect(endedPreventDefaultSpy).not.toHaveBeenCalled()
    })

    it('cleanup removes listeners, cancels rAF, destroys once, and is idempotent', async () => {
        handle = await initSignalSwitchGameFramework()
        const rendererDestroySpy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroySpy = vi.spyOn(handle!.game, 'destroy')
        const cancelAnimationFrameSpy = vi.mocked(cancelAnimationFrame)

        handle!.cleanup()
        handle!.cleanup()
        handle!.game.start()
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: '1', bubbles: true })
        )
        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)

        expect(handle!.game.getState().gateSignals[0]).toBe('cyan')
        expect(preventDefaultSpy).not.toHaveBeenCalled()
        expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1)
        expect(rendererDestroySpy).toHaveBeenCalledTimes(1)
        expect(gameDestroySpy).toHaveBeenCalledTimes(1)
    })

    it('forwards achievement/challenge completion payloads', async () => {
        const achievements = [{ id: 'first-shift' }]
        const challengeUpdates = {
            completedChallenges: [{ id: 'safe-passes' }],
            xpEarned: 10,
            levelUp: false,
        }
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                newAchievements: achievements,
                challengeUpdates,
            }),
        } as Response)
        const showAchievementAward = vi.fn()
        const showChallengeComplete = vi.fn()
        vi.stubGlobal('showAchievementAward', showAchievementAward)
        vi.stubGlobal('showChallengeComplete', showChallengeComplete)

        handle = await initSignalSwitchGameFramework()
        handle!.game.start()
        await handle!.game.end()

        expect(showAchievementAward).toHaveBeenCalledWith(achievements)
        expect(showChallengeComplete).toHaveBeenCalledWith(challengeUpdates)
    })
})
