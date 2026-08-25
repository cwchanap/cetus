import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsteroidDriftRenderer } from './AsteroidDriftRenderer'
import { initAsteroidDriftGameFramework } from './initFramework'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'
import type { AsteroidDriftState } from './types'

vi.mock('./AsteroidDriftRenderer', () => {
    class MockAsteroidDriftRenderer {
        readonly canvas = document.createElement('canvas')

        initialize = vi.fn(async () => {
            document
                .getElementById('asteroid-drift-canvas')
                ?.appendChild(this.canvas)
        })

        render = vi.fn()

        destroy = vi.fn(() => {
            this.canvas.remove()
        })

        getApp = vi.fn(() => ({ canvas: this.canvas }))
    }

    return {
        AsteroidDriftRenderer: vi
            .fn()
            .mockImplementation(() => new MockAsteroidDriftRenderer()),
        createAsteroidDriftRendererConfig: vi.fn(() => ({
            type: 'canvas',
            container: '#asteroid-drift-canvas',
            width: 800,
            height: 480,
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
        <div id="asteroid-drift-container">
            <div id="asteroid-drift-canvas"></div>
            <p id="asteroid-drift-status" aria-live="polite"></p>
        </div>
        <span id="score">0</span>
        <span id="time-remaining">90</span>
        <span id="orbs-collected">0</span>
        <span id="ship-speed">0</span>
        <button id="start-btn" type="button">Start</button>
        <button id="reset-btn" type="button">Reset</button>
        <div id="asteroid-drift-dpad">
            <button type="button" data-direction="up" aria-label="Thrust up" tabindex="-1">↑</button>
            <button type="button" data-direction="left" aria-label="Thrust left" tabindex="-1">←</button>
            <button type="button" data-direction="right" aria-label="Thrust right" tabindex="-1">→</button>
            <button type="button" data-direction="down" aria-label="Thrust down" tabindex="-1">↓</button>
        </div>
        <div id="game-over-overlay" class="hidden">
            <h3 id="game-over-title">SHIP LOST</h3>
            <span id="final-score">0</span>
            <span id="final-outcome">—</span>
            <span id="final-survival">0</span>
            <span id="final-orbs">0</span>
            <button id="play-again-btn" type="button">Play Again</button>
        </div>
    `
}

function canvas(): HTMLCanvasElement {
    return document.querySelector<HTMLCanvasElement>(
        '#asteroid-drift-canvas canvas'
    )!
}

function dpadButton(direction: string): HTMLButtonElement {
    return document.querySelector<HTMLButtonElement>(
        `#asteroid-drift-dpad button[data-direction="${direction}"]`
    )!
}

/** Drop every active asteroid so an idle player can never collide. */
function clearAsteroids(game: { getState: () => AsteroidDriftState }): void {
    game.getState().asteroids.length = 0
}

describe('initAsteroidDriftGameFramework', () => {
    let handle: Awaited<ReturnType<typeof initAsteroidDriftGameFramework>>
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
        document.getElementById('asteroid-drift-container')?.remove()

        expect(await initAsteroidDriftGameFramework()).toBeUndefined()
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(DOMElementNotFoundError),
            'AsteroidDrift'
        )
    })

    it('cleans renderer and returns undefined when renderer setup fails', async () => {
        const failedRenderer = {
            initialize: vi.fn().mockRejectedValue(new Error('renderer failed')),
            destroy: vi.fn(),
            render: vi.fn(),
            getApp: vi.fn(() => ({ canvas: document.createElement('canvas') })),
        }
        vi.mocked(AsteroidDriftRenderer).mockImplementationOnce(
            () => failedRenderer as unknown as AsteroidDriftRenderer
        )

        expect(await initAsteroidDriftGameFramework()).toBeUndefined()
        expect(failedRenderer.destroy).toHaveBeenCalledTimes(1)
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(Error),
            'AsteroidDrift'
        )
    })

    it('returns getGame() and getState()', async () => {
        handle = await initAsteroidDriftGameFramework()

        expect(handle).toBeDefined()
        expect(handle!.getGame()).toBe(handle!.game)
        expect(handle!.getState()).toEqual(handle!.game.getState())
    })

    it('renders the idle state and syncs the idle HUD', async () => {
        handle = await initAsteroidDriftGameFramework()

        // The mock renderer records every render call; the initializer must
        // have painted the idle state exactly once before any rAF tick.
        expect(vi.mocked(handle!.renderer.render).mock.calls).toHaveLength(1)
        expect(handle!.game.getState().isActive).toBe(false)
        expect(document.getElementById('orbs-collected')).toHaveTextContent('0')
        expect(document.getElementById('ship-speed')).toHaveTextContent('0')
        expect(document.getElementById('score')).toHaveTextContent('0')
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '90'
        )
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
        expect(
            (document.getElementById('start-btn') as HTMLButtonElement).style
                .display
        ).toBe('inline-flex')
    })

    it('overrides Pixi inline canvas dimensions to preserve aspect ratio', async () => {
        // PixiJSRenderer(autoDensity: true) writes inline width/height in CSS
        // px. The initializer must override them so a narrow viewport shrinks
        // the canvas uniformly instead of stretching it vertically.
        handle = await initAsteroidDriftGameFramework()
        const el = canvas()

        expect(el.style.width).toBe('100%')
        expect(el.style.height).toBe('auto')
    })

    it('starts exactly one rAF update/render loop with monotonic clamped deltas', async () => {
        handle = await initAsteroidDriftGameFramework()
        const updateSpy = vi.spyOn(handle!.game, 'update')
        const renderSpy = vi.spyOn(handle!.renderer, 'render')
        const initialRenderCount = renderSpy.mock.calls.length

        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
        handle!.game.start()
        rafCallbacks[0](0)

        // First frame has no previous sample: step zero, still render.
        expect(updateSpy).toHaveBeenCalledTimes(1)
        expect(updateSpy).toHaveBeenLastCalledWith(0)
        expect(renderSpy).toHaveBeenCalledTimes(initialRenderCount + 1)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

        rafCallbacks[1](16)

        expect(updateSpy).toHaveBeenLastCalledWith(0.016)
        expect(renderSpy).toHaveBeenCalledTimes(initialRenderCount + 2)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(3)

        // A huge gap is outer-clamped to maxUpdateDelta (0.1).
        rafCallbacks[2](1_000_000)

        expect(updateSpy).toHaveBeenLastCalledWith(0.1)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(4)
    })

    it('renders but does not update while the game is inactive', async () => {
        handle = await initAsteroidDriftGameFramework()
        const updateSpy = vi.spyOn(handle!.game, 'update')
        const renderSpy = vi.spyOn(handle!.renderer, 'render')
        const initialRenderCount = renderSpy.mock.calls.length

        rafCallbacks[0](0)
        rafCallbacks[1](100)

        expect(updateSpy).not.toHaveBeenCalled()
        expect(renderSpy).toHaveBeenCalledTimes(initialRenderCount + 2)
    })

    it('Start hides the overlay and the start button', async () => {
        handle = await initAsteroidDriftGameFramework()
        const overlay = document.getElementById('game-over-overlay')!
        overlay.classList.remove('hidden')

        document.getElementById('start-btn')!.click()
        expect(handle!.game.getState().isActive).toBe(true)
        expect(overlay).toHaveClass('hidden')
        expect(
            (document.getElementById('start-btn') as HTMLButtonElement).style
                .display
        ).toBe('none')
    })

    it('announces the run start and nothing else during plain updates', async () => {
        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()

        expect(
            document.getElementById('asteroid-drift-status')
        ).toHaveTextContent('Drift started.')

        // Spawn traffic passes by (asteroids cleared) without events that
        // qualify for announcements: the live region stays untouched.
        for (let i = 0; i < 60; i++) {
            clearAsteroids(handle!.game)
            handle!.game.update(0.1)
        }

        expect(
            document.getElementById('asteroid-drift-status')
        ).toHaveTextContent('Drift started.')
    })

    it('state callbacks sync orbs, speed, score, and time', async () => {
        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()
        handle!.game.pressDirection('right')
        handle!.game.update(0.1)

        expect(document.getElementById('ship-speed')).not.toHaveTextContent('0')

        vi.advanceTimersByTime(1_000)
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '89'
        )

        // Force an orb onto the ship so one update collects it.
        const player = handle!.game.getState().player
        ;(
            handle!.game as unknown as { state: AsteroidDriftState }
        ).state.energyOrb = {
            id: 'orb-test',
            x: player.x,
            y: player.y,
            radius: 12,
            ageSeconds: 0,
        }
        clearAsteroids(handle!.game)
        handle!.game.update(0.05)

        expect(handle!.game.getState().orbsCollected).toBe(1)
        expect(document.getElementById('orbs-collected')).toHaveTextContent('1')
        expect(document.getElementById('score')).toHaveTextContent('100')
        expect(
            document.getElementById('asteroid-drift-status')
        ).toHaveTextContent('Energy orb collected.')
    })

    it('collision shows SHIP LOST / Collision', async () => {
        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()

        // The deterministic intro asteroid reaches the centered idle player
        // in about three seconds; drive the public update loop until it does.
        for (let i = 0; i < 100 && handle!.game.getState().isActive; i++) {
            handle!.game.update(0.1)
        }

        await vi.waitFor(() =>
            expect(document.getElementById('final-outcome')).toHaveTextContent(
                'Collision'
            )
        )
        // The static markup ships the collision title already; assert the
        // synced outcome first, then the title the initializer rewrote.
        expect(document.getElementById('game-over-title')).toHaveTextContent(
            'SHIP LOST'
        )
        expect(
            document.getElementById('asteroid-drift-status')
        ).toHaveTextContent('Collision. Ship lost.')
    })

    it('full simulation shows DRIFT COMPLETE / Survived', async () => {
        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()

        for (let i = 0; i < 900; i++) {
            clearAsteroids(handle!.game)
            handle!.game.update(0.1)
        }
        vi.advanceTimersByTime(90_000)

        await vi.waitFor(() =>
            expect(
                document.getElementById('game-over-title')
            ).toHaveTextContent('DRIFT COMPLETE')
        )
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            'Survived'
        )
        expect(
            document.getElementById('asteroid-drift-status')
        ).toHaveTextContent('Drift complete. You survived the full run.')
    })

    it('early wall expiry shows DRIFT ENDED / Expired with partial survival', async () => {
        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()

        for (let i = 0; i < 40; i++) {
            clearAsteroids(handle!.game)
            handle!.game.update(0.1)
        }
        vi.advanceTimersByTime(90_000)

        await vi.waitFor(() =>
            expect(
                document.getElementById('game-over-title')
            ).toHaveTextContent('DRIFT ENDED')
        )
        expect(document.getElementById('final-outcome')).toHaveTextContent(
            'Expired'
        )
        // Partial credit only: some simulated survival, far short of 90.
        const finalSurvival = document.getElementById('final-survival')!
        expect(finalSurvival).toHaveTextContent('3')
        expect(handle!.game.getGameStats().survivalSeconds).toBe(
            Number(finalSurvival.textContent)
        )
        expect(
            document.getElementById('asteroid-drift-status')
        ).toHaveTextContent(
            'Drift ended. The run expired before full simulation.'
        )
    })

    it('Play Again immediately starts a fresh active run', async () => {
        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()
        await handle!.game.end()
        document.getElementById('play-again-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: true,
            isGameOver: false,
            gameStarted: true,
            outcome: 'playing',
            score: 0,
            orbsCollected: 0,
        })
        expect(handle!.game.getState().asteroids).toHaveLength(1)
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
    })

    it('Reset restores the centered zero-score idle HUD', async () => {
        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()
        handle!.game.pressDirection('left')
        handle!.game.update(0.1)
        document.getElementById('reset-btn')!.click()

        expect(handle!.game.getState()).toMatchObject({
            isActive: false,
            gameStarted: false,
            score: 0,
            orbsCollected: 0,
        })
        expect(handle!.game.getState().asteroids).toEqual([])
        expect(handle!.game.getState().player).toMatchObject({
            x: 400,
            y: 240,
            velocityX: 0,
            velocityY: 0,
        })
        expect(document.getElementById('orbs-collected')).toHaveTextContent('0')
        expect(document.getElementById('ship-speed')).toHaveTextContent('0')
        expect(document.getElementById('score')).toHaveTextContent('0')
        expect(document.getElementById('time-remaining')).toHaveTextContent(
            '90'
        )
        expect(document.getElementById('game-over-overlay')).toHaveClass(
            'hidden'
        )
    })

    it('active run beforeunload prevents navigation and sets returnValue', async () => {
        handle = await initAsteroidDriftGameFramework()
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
        handle = await initAsteroidDriftGameFramework()
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

    describe('keyboard controls', () => {
        it('maps arrows and WASD to the four directions while active', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowUp',
                    bubbles: true,
                })
            )
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'a', bubbles: true })
            )
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'S', bubbles: true })
            )

            expect(handle!.game.pressedDirections).toEqual(
                new Set(['up', 'left', 'right', 'down'])
            )
        })

        it('ignores repeat, modifier combos, editable targets, and unrelated keys', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()
            const input = document.createElement('input')
            const textarea = document.createElement('textarea')
            const select = document.createElement('select')
            const editable = document.createElement('div')
            editable.contentEditable = 'true'
            Object.defineProperty(editable, 'isContentEditable', {
                value: true,
            })
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
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'x', bubbles: true })
            )

            expect(handle!.game.pressedDirections).toEqual(new Set())
        })

        it('does not press directions before the game starts', async () => {
            handle = await initAsteroidDriftGameFramework()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowUp',
                    bubbles: true,
                })
            )

            expect(handle!.game.pressedDirections).toEqual(new Set())
        })

        it('keyup releases the mapped direction even after game end', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()
            await handle!.game.end()

            expect(() => {
                document.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'w',
                        bubbles: true,
                    })
                )
            }).not.toThrow()
            expect(handle!.game.pressedDirections).toEqual(new Set())
        })
    })

    describe('D-pad pointer controls', () => {
        it('simultaneous pointerdown creates touch diagonals', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()

            fireEvent.pointerDown(dpadButton('up'))
            fireEvent.pointerDown(dpadButton('left'))

            expect(handle!.game.pressedDirections).toEqual(
                new Set(['up', 'left'])
            )

            fireEvent.pointerUp(dpadButton('up'))
            fireEvent.pointerUp(dpadButton('left'))
            expect(handle!.game.pressedDirections).toEqual(new Set())
        })

        it('keeps keyboard ownership when the touch copy is released', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowLeft',
                    bubbles: true,
                })
            )
            fireEvent.pointerDown(dpadButton('left'))
            fireEvent.pointerUp(dpadButton('left'))

            expect(handle!.game.pressedDirections).toEqual(new Set(['left']))

            document.dispatchEvent(
                new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true })
            )
            expect(handle!.game.pressedDirections).toEqual(new Set())
        })

        it('pointerleave and pointercancel release the touch direction', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()

            fireEvent.pointerDown(dpadButton('right'))
            fireEvent.pointerLeave(dpadButton('right'))
            expect(handle!.game.pressedDirections).toEqual(new Set())

            fireEvent.pointerDown(dpadButton('down'))
            fireEvent.pointerCancel(dpadButton('down'))
            expect(handle!.game.pressedDirections).toEqual(new Set())
        })

        it('does not leave latent input when pressed before start', async () => {
            handle = await initAsteroidDriftGameFramework()

            fireEvent.pointerDown(dpadButton('left'))
            expect(handle!.game.pressedDirections).toEqual(new Set())

            handle!.game.start()
            expect(handle!.game.pressedDirections).toEqual(new Set())
        })

        it('defensively releases implicit pointer capture with the pointer id', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()
            const button = dpadButton('up')
            const releaseSpy = vi.fn()
            button.releasePointerCapture = releaseSpy

            // Custom event needed so pointerId can be configured explicitly.
            const event = new MouseEvent('pointerdown', { bubbles: true })
            Object.defineProperty(event, 'pointerId', { value: 7 })
            button.dispatchEvent(event)

            expect(releaseSpy).toHaveBeenCalledWith(7)
        })

        it('survives a failing releasePointerCapture call', async () => {
            handle = await initAsteroidDriftGameFramework()
            handle!.game.start()
            const button = dpadButton('down')
            button.releasePointerCapture = () => {
                throw new Error('pointer not captured')
            }

            expect(() => fireEvent.pointerDown(button)).not.toThrow()
            expect(handle!.game.pressedDirections).toEqual(new Set(['down']))
        })
    })

    it('cleanup removes listeners, cancels rAF once, and is idempotent', async () => {
        handle = await initAsteroidDriftGameFramework()
        const rendererDestroySpy = vi.spyOn(handle!.renderer, 'destroy')
        const gameDestroySpy = vi.spyOn(handle!.game, 'destroy')
        const cancelAnimationFrameSpy = vi.mocked(cancelAnimationFrame)

        handle!.cleanup()
        handle!.cleanup()
        handle!.game.start()
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
        )
        fireEvent.pointerDown(dpadButton('up'))
        const event = new Event('beforeunload', { cancelable: true })
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
        window.dispatchEvent(event)

        expect(handle!.game.pressedDirections).toEqual(new Set())
        expect(preventDefaultSpy).not.toHaveBeenCalled()
        expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1)
        expect(rendererDestroySpy).toHaveBeenCalledTimes(1)
        expect(gameDestroySpy).toHaveBeenCalledTimes(1)
    })

    it('forwards achievement/challenge completion payloads', async () => {
        const achievements = [{ id: 'first-charge' }]
        const challengeUpdates = {
            completedChallenges: [{ id: 'orbs' }],
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

        handle = await initAsteroidDriftGameFramework()
        handle!.game.start()
        await handle!.game.end()

        expect(showAchievementAward).toHaveBeenCalledWith(achievements)
        expect(showChallengeComplete).toHaveBeenCalledWith(challengeUpdates)
    })
})
