import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GravityFlipRenderer } from './GravityFlipRenderer'
import { initGravityFlipGameFramework } from './initFramework'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'

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

vi.mock('@/lib/games/core/errors', async importOriginal => {
    const actual =
        await importOriginal<typeof import('@/lib/games/core/errors')>()
    return { ...actual, handleGameError: vi.fn() }
})

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="gravity-flip-container">
            <div id="gravity-flip-canvas"></div>
            <p id="gravity-flip-status" aria-live="polite"></p>
        </div>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <span id="gravity-direction">FLOOR ↓</span>
        <span id="distance-traveled">0</span>
        <span id="stars-collected">0</span>
        <span id="flip-count">0</span>
        <span id="world-speed">—</span>
        <button id="start-btn" type="button">Start</button>
        <button id="reset-btn" type="button">Reset</button>
        <button id="flip-btn" type="button">Flip</button>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">GRAVITY LOST</h3>
            <span id="final-score">0</span>
            <span id="final-outcome">—</span>
            <span id="final-distance">0</span>
            <span id="final-stars">0</span>
            <span id="final-flips">0</span>
            <button id="play-again-btn" type="button">Play Again</button>
        </div>
    `
}

function canvas(): HTMLCanvasElement {
    return document.querySelector<HTMLCanvasElement>(
        '#gravity-flip-canvas canvas'
    )!
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

    it('reports missing root with DOMElementNotFoundError/handleGameError', async () => {
        document.getElementById('gravity-flip-container')?.remove()

        expect(await initGravityFlipGameFramework()).toBeUndefined()
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(DOMElementNotFoundError),
            'GravityFlip'
        )
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

        expect(await initGravityFlipGameFramework()).toBeUndefined()
        expect(failedRenderer.destroy).toHaveBeenCalledTimes(1)
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(Error),
            'GravityFlip'
        )
    })

    it('returns getGame() and getState()', async () => {
        handle = await initGravityFlipGameFramework()

        expect(handle).toBeDefined()
        expect(handle!.getGame()).toBe(handle!.game)
        expect(handle!.getState()).toEqual(handle!.game.getState())
    })

    it('starts exactly one rAF update/render loop without state-change rendering', async () => {
        handle = await initGravityFlipGameFramework()
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
        handle = await initGravityFlipGameFramework()
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
        handle = await initGravityFlipGameFramework()
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
        handle = await initGravityFlipGameFramework()
        handle!.game.start()
        const button = document.getElementById('start-btn')!

        button.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowUp',
                bubbles: true,
            })
        )

        expect(handle!.game.getState().flips).toBe(0)
    })

    it('focused flip button Space plus native click flips exactly once', async () => {
        handle = await initGravityFlipGameFramework()
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
        handle = await initGravityFlipGameFramework()
        handle!.game.start()

        fireEvent.pointerDown(canvas())
        fireEvent.click(document.getElementById('flip-btn')!)

        expect(handle!.game.getState().flips).toBe(2)
    })

    it('overrides Pixi inline canvas dimensions to preserve aspect ratio', async () => {
        // PixiJSRenderer(autoDensity: true) writes inline width/height in CSS
        // px. The initializer must override them so a narrow viewport shrinks
        // the canvas uniformly instead of stretching it vertically.
        handle = await initGravityFlipGameFramework()
        const el = canvas()

        expect(el.style.width).toBe('100%')
        expect(el.style.height).toBe('auto')
    })

    it('Reset restores floor/zero idle HUD', async () => {
        handle = await initGravityFlipGameFramework()
        handle!.game.start()
        handle!.game.flipGravity()
        document.getElementById('reset-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            gravity: 'down',
            distance: 0,
            starsCollected: 0,
            flips: 0,
            isActive: false,
            gameStarted: false,
        })
        expect(document.getElementById('gravity-direction')).toHaveTextContent(
            'FLOOR ↓'
        )
        expect(document.getElementById('distance-traveled')).toHaveTextContent(
            '0'
        )
        expect(document.getElementById('stars-collected')).toHaveTextContent(
            '0'
        )
        expect(document.getElementById('flip-count')).toHaveTextContent('0')
    })

    it('collision shows GRAVITY LOST / Collision', async () => {
        handle = await initGravityFlipGameFramework()
        handle!.game.start()

        // The authored opening floor-spike reaches the floor-resting idle
        // player deterministically; drive the public update loop until it does.
        for (let i = 0; i < 100 && handle!.game.getState().isActive; i++) {
            handle!.game.update(0.1)
        }

        await vi.waitFor(() =>
            expect(document.getElementById('final-outcome')).toHaveTextContent(
                'Collision'
            )
        )
        expect(document.getElementById('game-over-title')).toHaveTextContent(
            'GRAVITY LOST'
        )
    })

    it('timeout shows RUN COMPLETE / Survived', async () => {
        handle = await initGravityFlipGameFramework()
        handle!.game.start()

        vi.advanceTimersByTime(60_000)
        await vi.waitFor(() =>
            expect(
                document.getElementById('game-over-title')
            ).toHaveTextContent('RUN COMPLETE')
        )
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            'Survived'
        )
    })

    it('Play Again immediately starts a fresh run', async () => {
        handle = await initGravityFlipGameFramework()
        handle!.game.start()
        await handle!.game.end()
        document.getElementById('play-again-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: true,
            isGameOver: false,
            gameStarted: true,
            gravity: 'down',
            flips: 0,
            distance: 0,
        })
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
    })

    it('does not announce gravity baseline on replay after an upward run', async () => {
        // Regression: lastAnnouncedGravity survived reset/replay. If the
        // previous run ended while gravity was 'up', the new run's onGameStart
        // emitted gravity 'down', which differed from the stale 'up' baseline
        // and spuriously announced "Gravity pulling to the floor".
        handle = await initGravityFlipGameFramework()
        handle!.game.start()
        handle!.game.flipGravity() // gravity -> 'up', lastAnnouncedGravity = 'up'
        await handle!.game.end() // onEnd announces "Collision. Run ended."
        const statusAfterEnd = document.getElementById(
            'gravity-flip-status'
        )!.textContent
        document.getElementById('play-again-btn')!.click()

        expect(handle!.game.getState().gravity).toBe('down')
        expect(
            document.getElementById('gravity-flip-status')!.textContent
        ).toBe(statusAfterEnd)
    })

    it('active run beforeunload prevents navigation and sets returnValue', async () => {
        handle = await initGravityFlipGameFramework()
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
        handle = await initGravityFlipGameFramework()
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
        handle = await initGravityFlipGameFramework()
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

        handle = await initGravityFlipGameFramework()
        handle!.game.start()
        await handle!.game.end()

        expect(showAchievementAward).toHaveBeenCalledWith(achievements)
        expect(showChallengeComplete).toHaveBeenCalledWith(challengeUpdates)
    })
})
