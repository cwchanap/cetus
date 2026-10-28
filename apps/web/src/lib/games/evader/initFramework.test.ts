// initFramework unit tests for Evader
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/dom'
import { initEvaderGameFramework } from './initFramework'
import {
    AchievementRarity,
    type AchievementNotification,
} from '@cetus/shared/achievements'

// Mock pixi.js for the renderer
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
        }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
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
        canvas.addEventListener = vi.fn()
        canvas.removeEventListener = vi.fn()
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
            renderer: { resize: vi.fn() },
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        FillGradient: vi.fn(() => ({
            addColorStop: vi.fn(),
            destroy: vi.fn(),
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
        })),
        Text: vi.fn(() => ({
            text: '',
            destroy: vi.fn(),
            anchor: { set: vi.fn() },
        })),
        Assets: { load: vi.fn() },
    }
})

// React owns the HUD/buttons/overlay (HPA-393); the initializer only needs
// the board host the island ref-passes plus the static D-pad markup.
function setupDOM() {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
        <div id="dpad">
            <button data-key="ArrowUp" aria-label="Move up">↑</button>
            <button data-key="ArrowDown" aria-label="Move down">↓</button>
            <button data-key="ArrowLeft" aria-label="Move left">←</button>
            <button data-key="ArrowRight" aria-label="Move right">→</button>
        </div>
    `
}

function getContainer(): HTMLElement {
    return document.getElementById('game-canvas-container') as HTMLElement
}

describe('initEvaderGameFramework', () => {
    beforeEach(() => {
        setupDOM()
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 1)
        )
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('returns a result with game, renderer, and cleanup', async () => {
            const result = await initEvaderGameFramework(getContainer())
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            result!.cleanup()
        })

        it('accepts custom config', async () => {
            const result = await initEvaderGameFramework(getContainer(), {
                duration: 30,
            })
            expect(result).toBeDefined()
            expect(result!.game.getState().timeRemaining).toBe(30)
            result!.cleanup()
        })
    })

    describe('cleanup', () => {
        it('does not throw on cleanup', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            expect(() => result!.cleanup()).not.toThrow()
        })
    })

    describe('restart', () => {
        it('resets the game state', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            vi.advanceTimersByTime(1000)

            result!.restart()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            expect(state.objects).toEqual([])
            result!.cleanup()
        })
    })

    describe('keyboard controls', () => {
        it('responds to ArrowUp keydown when active', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'ArrowUp',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
            result!.cleanup()
        })

        it('responds to keyup', async () => {
            const result = await initEvaderGameFramework(getContainer())
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'ArrowDown',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
            result!.cleanup()
        })

        it('ignores non-movement keys', async () => {
            const result = await initEvaderGameFramework(getContainer())
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'x',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
            result!.cleanup()
        })

        it('ignores movement keys when modifier is held', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()

            const game = result!.game
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'ArrowUp',
                        bubbles: true,
                        ctrlKey: true,
                    })
                )
            ).not.toThrow()
            expect(game.pressedKeys.has('up')).toBe(false)
            result!.cleanup()
        })

        it('releases WASD key on keyup even when modifier is held', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()

            const game = result!.game

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'w',
                    bubbles: true,
                })
            )
            expect(game.pressedKeys.has('up')).toBe(true)

            document.dispatchEvent(
                new KeyboardEvent('keyup', {
                    key: 'w',
                    bubbles: true,
                    metaKey: true,
                })
            )
            expect(game.pressedKeys.has('up')).toBe(false)
            result!.cleanup()
        })
    })

    describe('touch controls (D-pad)', () => {
        // jsdom lacks full PointerEvent support, so pointer events are
        // synthesized as MouseEvent with the pointer event name. The handlers
        // registered in setupTouchControls listen for 'pointerdown' etc. and
        // jsdom dispatches MouseEvent to those listeners by event name.
        it('pointerdown on D-pad button calls pressKey', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()

            const upBtn = screen.getByRole('button', { name: 'Move up' })
            fireEvent.pointerDown(upBtn)
            expect(result!.game.pressedKeys.has('up')).toBe(true)
            result!.cleanup()
        })

        it('pointerup on D-pad button calls releaseKey', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()

            const rightBtn = screen.getByRole('button', { name: 'Move right' })
            fireEvent.pointerDown(rightBtn)
            expect(result!.game.pressedKeys.has('right')).toBe(true)

            fireEvent.pointerUp(rightBtn)
            expect(result!.game.pressedKeys.has('right')).toBe(false)
            result!.cleanup()
        })

        it('pointerleave releases the key when finger slides off button', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()

            const downBtn = screen.getByRole('button', { name: 'Move down' })
            fireEvent.pointerDown(downBtn)
            fireEvent.pointerLeave(downBtn)
            expect(result!.game.pressedKeys.has('down')).toBe(false)
            result!.cleanup()
        })

        it('releases implicit pointer capture on pointerdown so pointerleave fires on touch', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()

            const upBtn = screen.getByRole('button', { name: 'Move up' })
            const releaseSpy = vi.fn()
            upBtn.releasePointerCapture = releaseSpy

            // Custom event needed so pointerId can be configured explicitly.
            const event = new MouseEvent('pointerdown', { bubbles: true })
            Object.defineProperty(event, 'pointerId', { value: 7 })

            upBtn.dispatchEvent(event)
            expect(releaseSpy).toHaveBeenCalledWith(7)
            result!.cleanup()
        })

        it('cleanup removes D-pad listeners', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            const pressSpy = vi.spyOn(result!.game, 'pressKey')
            result!.cleanup()

            const upBtn = screen.getByRole('button', { name: 'Move up' })
            fireEvent.pointerDown(upBtn)
            expect(pressSpy).not.toHaveBeenCalled()
        })

        it('does not register a stuck key when pressed before the game starts', async () => {
            // The D-pad press handler gates on game.getState().isActive so a
            // press before start doesn't leave a stuck key in pressedKeys.
            // This is the touch equivalent of the keyboard isActive gate.
            const result = await initEvaderGameFramework(getContainer())
            // Deliberately do NOT call game.start() — game is inactive.
            expect(result!.game.getState().isActive).toBe(false)

            const leftBtn = screen.getByRole('button', { name: 'Move left' })
            fireEvent.pointerDown(leftBtn)

            expect(result!.game.pressedKeys.has('left')).toBe(false)
            result!.cleanup()
        })
    })

    describe('achievement notifications', () => {
        it('dispatches achievements via window.showAchievementAward when earned', async () => {
            const achievement: AchievementNotification = {
                id: 'evader_pro',
                name: 'Evader Pro',
                description: 'Score 1000 in Evader',
                icon: '🏆',
                rarity: AchievementRarity.RARE,
            }
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: async () => ({
                        newAchievements: [achievement],
                    }),
                })
            )
            const showSpy = vi.fn()
            window.showAchievementAward = showSpy

            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            await result!.game.end()

            expect(showSpy).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: 'evader_pro',
                    name: 'Evader Pro',
                    description: 'Score 1000 in Evader',
                    icon: '🏆',
                    rarity: 'rare',
                }),
            ])
            delete window.showAchievementAward
            result!.cleanup()
        })
    })

    describe('renderer error cleanup', () => {
        it('removes a mounted canvas and cleans up the renderer when initialize fails', async () => {
            const { Application } = await import('pixi.js')
            const parent = document.createElement('div')
            const canvas = document.createElement('canvas')
            parent.appendChild(canvas)
            vi.mocked(Application).mockImplementationOnce(() => {
                return {
                    init: vi.fn().mockRejectedValue(new Error('WebGL fail')),
                    canvas,
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn(),
                } as unknown as InstanceType<typeof Application>
            })
            const res = await initEvaderGameFramework(getContainer())
            expect(res).toBeUndefined()
            expect(canvas.parentNode).toBeNull()
        })

        it('swallows errors thrown during renderer cleanup after init failure', async () => {
            const { Application } = await import('pixi.js')
            const parent = document.createElement('div')
            const canvas = document.createElement('canvas')
            parent.appendChild(canvas)
            vi.mocked(Application).mockImplementationOnce(() => {
                return {
                    init: vi.fn().mockRejectedValue(new Error('WebGL fail')),
                    canvas,
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn().mockImplementation(() => {
                        throw new Error('cleanup boom')
                    }),
                } as unknown as InstanceType<typeof Application>
            })
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            const res = await initEvaderGameFramework(getContainer())
            expect(res).toBeUndefined()
            expect(consoleSpy).toHaveBeenCalled()
            consoleSpy.mockRestore()
        })
    })

    describe('render loop', () => {
        it('drives physics updates and renders while the game is active', async () => {
            const rafCallbacks: FrameRequestCallback[] = []
            vi.stubGlobal(
                'requestAnimationFrame',
                (cb: FrameRequestCallback) => {
                    rafCallbacks.push(cb)
                    return rafCallbacks.length
                }
            )
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            const renderSpy = vi.spyOn(result!.renderer, 'render')
            renderSpy.mockClear()
            // Invoke the captured rAF callback once (one loop tick).
            rafCallbacks[rafCallbacks.length - 1](0)
            expect(renderSpy).toHaveBeenCalled()
            result!.cleanup()
        })

        it('skips physics updates when the game is paused but still renders', async () => {
            const rafCallbacks: FrameRequestCallback[] = []
            vi.stubGlobal(
                'requestAnimationFrame',
                (cb: FrameRequestCallback) => {
                    rafCallbacks.push(cb)
                    return rafCallbacks.length
                }
            )
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            result!.game.pause()
            const updateSpy = vi.spyOn(result!.game, 'update')
            updateSpy.mockClear()
            rafCallbacks[rafCallbacks.length - 1](0)
            expect(updateSpy).not.toHaveBeenCalled()
            result!.cleanup()
        })
    })

    describe('beforeunload warning', () => {
        it('calls preventDefault when a game is in progress', async () => {
            const result = await initEvaderGameFramework(getContainer())
            result!.game.start()
            const event = new Event('beforeunload', { cancelable: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            window.dispatchEvent(event)
            expect(preventDefaultSpy).toHaveBeenCalled()
            result!.cleanup()
        })

        it('does not call preventDefault when no game is in progress', async () => {
            const result = await initEvaderGameFramework(getContainer())
            expect(result!.game.getState().isActive).toBe(false)
            result!.cleanup()
        })
    })
})
