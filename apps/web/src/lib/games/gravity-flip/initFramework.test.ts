import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GravityFlipRenderer } from './GravityFlipRenderer'
import { initGravityFlipGameFramework } from './initFramework'
import { handleGameError } from '@cetus/games/core/errors'

vi.mock('./GravityFlipRenderer', () => {
    class MockGravityFlipRenderer {
        readonly canvas = document.createElement('canvas')

        initialize = vi.fn(async () => {
            document
                .getElementById('gravity-flip-canvas')
                ?.appendChild(this.canvas)
        })

        render = vi.fn()

        destroy = vi.fn(() => {
            this.canvas.remove()
        })

        getApp = vi.fn(() => ({ canvas: this.canvas }))
    }

    return {
        GravityFlipRenderer: vi
            .fn()
            .mockImplementation(() => new MockGravityFlipRenderer()),
        createGravityFlipRendererConfig: vi.fn(() => ({
            type: 'canvas',
            container: '#gravity-flip-canvas',
            width: 800,
            height: 320,
            responsive: false,
        })),
    }
})

vi.mock('@cetus/games/core/errors', async importOriginal => {
    const actual =
        await importOriginal<typeof import('@cetus/games/core/errors')>()
    return { ...actual, handleGameError: vi.fn() }
})

// React owns the HUD badges/buttons/overlay (HPA-393); the initializer
// needs the board host the island ref-passes plus the bespoke flip button
// (looked up by its frozen id, outside the board host).
function setupDOM(): void {
    document.body.innerHTML = `
        <div id="gravity-flip-container">
            <div id="gravity-flip-canvas"></div>
            <p id="gravity-flip-status" aria-live="polite"></p>
        </div>
        <button id="flip-btn" type="button">FLIP GRAVITY</button>
    `
}

function getContainer(): HTMLElement {
    return document.getElementById('gravity-flip-container') as HTMLElement
}

function canvas(): HTMLCanvasElement {
    return document.querySelector<HTMLCanvasElement>(
        '#gravity-flip-canvas canvas'
    )!
}

function statusText(): string {
    return document.getElementById('gravity-flip-status')!.textContent ?? ''
}

describe('initGravityFlipGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initGravityFlipGameFramework>>
    let rafCallbacks: FrameRequestCallback[]
    let eventReturnValueSpy: { mockRestore: () => void } | undefined

    beforeEach(() => {
        setupDOM()
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

    it('cleans renderer and returns undefined when renderer setup fails', async () => {
        const failedRenderer = {
            initialize: vi.fn().mockRejectedValue(new Error('renderer failed')),
            destroy: vi.fn(),
            render: vi.fn(),
            getApp: vi.fn(() => ({ canvas: document.createElement('canvas') })),
        }
        vi.mocked(GravityFlipRenderer).mockImplementationOnce(
            () => failedRenderer as unknown as GravityFlipRenderer
        )

        expect(
            await initGravityFlipGameFramework(getContainer())
        ).toBeUndefined()
        expect(failedRenderer.destroy).toHaveBeenCalledTimes(1)
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(Error),
            'GravityFlip'
        )
    })

    it('returns getGame() and getState()', async () => {
        handle = await initGravityFlipGameFramework(getContainer())

        expect(handle).toBeDefined()
        expect(handle!.getGame()).toBe(handle!.game)
        expect(handle!.getState()).toEqual(handle!.game.getState())
    })

    it('starts exactly one rAF update/render loop without state-change rendering', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        const updateSpy = vi.spyOn(handle!.game, 'update')
        const renderSpy = vi.spyOn(handle!.renderer, 'render')
        const initialRenderCount = renderSpy.mock.calls.length

        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
        handle!.game.start()
        expect(renderSpy).toHaveBeenCalledTimes(initialRenderCount)
        rafCallbacks[0](0)

        expect(updateSpy).toHaveBeenCalledTimes(1)
        expect(updateSpy).toHaveBeenLastCalledWith(0)
        expect(renderSpy).toHaveBeenCalledTimes(initialRenderCount + 1)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

        rafCallbacks[1](16)

        expect(updateSpy).toHaveBeenLastCalledWith(0.016)
        expect(handle!.game.getState().distance).toBeGreaterThan(0)
        expect(renderSpy).toHaveBeenCalledTimes(initialRenderCount + 2)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(3)
    })

    it('Space/ArrowUp/ArrowDown flip while active', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()

        for (const key of [' ', 'ArrowUp', 'ArrowDown']) {
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    bubbles: true,
                    cancelable: true,
                })
            )
        }

        expect(handle!.game.getState()).toMatchObject({
            gravity: 'up',
            flips: 3,
        })
    })

    it('ignores repeat/modifier/editable keyboard targets', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
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
                key: 'ArrowUp',
                repeat: true,
                bubbles: true,
            })
        )
        for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowUp',
                    [modifier]: true,
                    bubbles: true,
                })
            )
        }
        for (const target of [input, textarea, select, editable]) {
            target.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowUp',
                    bubbles: true,
                })
            )
        }

        expect(handle!.game.getState().flips).toBe(0)
    })

    it('ignores document shortcuts when event.target is a button', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()
        const button = document.getElementById('flip-btn')!

        button.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowUp',
                bubbles: true,
            })
        )

        expect(handle!.game.getState().flips).toBe(0)
    })

    it('focused flip button Space plus native click flips exactly once', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()
        const flipButton = document.getElementById('flip-btn')!
        flipButton.focus()

        flipButton.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: ' ',
                bubbles: true,
            })
        )
        flipButton.click()

        expect(handle!.game.getState().flips).toBe(1)
    })

    it('canvas pointerdown and #flip-btn click use flipGravity', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()

        fireEvent.pointerDown(canvas())
        fireEvent.click(document.getElementById('flip-btn')!)

        expect(handle!.game.getState().flips).toBe(2)
    })

    it('overrides Pixi inline canvas dimensions to preserve aspect ratio', async () => {
        // PixiJSRenderer(autoDensity: true) writes inline width/height in CSS
        // px. The initializer must override them so a narrow viewport shrinks
        // the canvas uniformly instead of stretching it vertically.
        handle = await initGravityFlipGameFramework(getContainer())
        const el = canvas()

        expect(el.style.width).toBe('100%')
        expect(el.style.height).toBe('auto')
    })

    it('announces gravity flips but stays silent on the run-start baseline', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()

        // BaseGame.start() emits the fresh (gravity: 'down') state; the live
        // region must stay silent for it (baseline, not an actual flip).
        expect(statusText()).toBe('')

        handle!.game.flipGravity()
        expect(statusText()).toBe('Gravity pulling to the ceiling')
    })

    it('announces the collision outcome through the live region', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()

        // The authored opening floor-spike reaches the floor-resting idle
        // player deterministically; drive the public update loop until it does.
        for (let i = 0; i < 100 && handle!.game.getState().isActive; i++) {
            handle!.game.update(0.1)
        }

        await vi.waitFor(() =>
            expect(statusText()).toBe('Collision. Run ended.')
        )
    })

    it('timeout announces the survived outcome through the live region', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()

        vi.advanceTimersByTime(60_000)
        await vi.waitFor(() =>
            expect(statusText()).toBe(
                'Run complete. You survived the full minute.'
            )
        )
    })

    it('does not announce gravity baseline on replay after an upward run', async () => {
        // Regression: lastAnnouncedGravity survived reset/replay. If the
        // previous run ended while gravity was 'up', the new run's onGameStart
        // emitted gravity 'down', which differed from the stale 'up' baseline
        // and spuriously announced "Gravity pulling to the floor". The React
        // overlay Play Again routes through game.start(), so drive it directly.
        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()
        handle!.game.flipGravity() // gravity -> 'up', lastAnnouncedGravity = 'up'
        await handle!.game.end() // onEnd announces "Collision. Run ended."
        const statusAfterEnd = statusText()
        handle!.game.start()

        expect(handle!.game.getState().gravity).toBe('down')
        expect(statusText()).toBe(statusAfterEnd)
    })

    it('active run beforeunload prevents navigation and sets returnValue', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
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
        handle = await initGravityFlipGameFramework(getContainer())
        const idleEvent = new Event('beforeunload', { cancelable: true })
        const idlePreventDefaultSpy = vi.spyOn(idleEvent, 'preventDefault')
        window.dispatchEvent(idleEvent)
        expect(idlePreventDefaultSpy).not.toHaveBeenCalled()

        handle!.game.start()
        await handle!.game.end()
        const endedEvent = new Event('beforeunload', { cancelable: true })
        const endedPreventDefaultSpy = vi.spyOn(endedEvent, 'preventDefault')
        window.dispatchEvent(endedEvent)
        expect(endedPreventDefaultSpy).not.toHaveBeenCalled()
    })

    it('cleanup removes beforeunload/input listeners, cancels rAF, and is idempotent', async () => {
        handle = await initGravityFlipGameFramework(getContainer())
        const rendererDestroySpy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroySpy = vi.spyOn(handle!.game, 'destroy')
        const cancelAnimationFrameSpy = vi.mocked(cancelAnimationFrame)

        handle!.cleanup()
        handle!.cleanup()
        handle!.game.start()
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
        )
        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)

        expect(handle!.game.getState().flips).toBe(0)
        expect(preventDefaultSpy).not.toHaveBeenCalled()
        expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1)
        expect(rendererDestroySpy).toHaveBeenCalledTimes(1)
        expect(gameDestroySpy).toHaveBeenCalledTimes(1)
    })

    it('forwards achievement/challenge completion payloads', async () => {
        const achievements = [{ id: 'first-flip' }]
        const challengeUpdates = {
            completedChallenges: [{ id: 'distance' }],
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

        handle = await initGravityFlipGameFramework(getContainer())
        handle!.game.start()
        await handle!.game.end()

        expect(showAchievementAward).toHaveBeenCalledWith(achievements)
        expect(showChallengeComplete).toHaveBeenCalledWith(challengeUpdates)
    })
})
