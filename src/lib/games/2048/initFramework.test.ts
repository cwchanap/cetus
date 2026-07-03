// init2048GameFramework integration tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock pixi.js so the real Game2048Renderer can initialize under jsdom
vi.mock('pixi.js', () => {
    const makePosition = () => ({ set: vi.fn(), x: 0, y: 0 })
    const makeScale = () => ({ set: vi.fn(), x: 1, y: 1 })

    const makeContainer = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        position: makePosition(),
        pivot: makePosition(),
        scale: makeScale(),
        alpha: 1,
    })

    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1 }
        for (const m of ['roundRect', 'fill', 'stroke', 'rect', 'clear']) {
            g[m] = vi.fn(() => g)
        }
        return g
    }

    const makeText = () => ({
        anchor: { set: vi.fn() },
        position: makePosition(),
        destroy: vi.fn(),
    })

    const makeStage = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
    })

    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', display: '' },
            writable: true,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: makeStage(),
            destroy: vi.fn(),
            renderer: { resize: vi.fn() },
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        Text: vi.fn(makeText),
        TextStyle: vi.fn(() => ({})),
        Assets: { load: vi.fn() },
    }
})

import { init2048GameFramework } from './initFramework'
import type { Direction } from './types'
import { Application } from 'pixi.js'

const NO_MOVE_RESULT = {
    board: [],
    moved: false,
    scoreGained: 0,
    mergeCount: 0,
    animations: [],
}

function setupDOM(): void {
    document.body.innerHTML = `
        <div id="game-2048-container"></div>
        <span id="score-display">0</span>
        <span id="max-tile-display">0</span>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <span id="final-max-tile">0</span>
        <span id="final-moves">0</span>
        <h2 id="game-over-title">Game Over</h2>
        <div id="win-notification" class="hidden"></div>
        <button id="start-btn" style="display:inline-flex">Start</button>
        <button id="end-btn" style="display:none">End</button>
        <button id="reset-btn">Reset</button>
        <button id="restart-btn">Restart</button>
    `
}

describe('init2048GameFramework', () => {
    let result: Awaited<ReturnType<typeof init2048GameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
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
    })

    afterEach(() => {
        if (result) {
            try {
                result.cleanup()
            } catch {
                // ignore
            }
        }
        result = undefined
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('returns undefined when the container is missing', async () => {
            document.getElementById('game-2048-container')!.remove()
            expect(await init2048GameFramework()).toBeUndefined()
        })

        it('returns undefined when the renderer fails to initialize', async () => {
            vi.mocked(Application).mockImplementationOnce(() => {
                const canvas = document.createElement('canvas')
                return {
                    init: vi.fn().mockRejectedValue(new Error('WebGL fail')),
                    canvas,
                    stage: { addChild: vi.fn() },
                    destroy: vi.fn(),
                } as unknown as InstanceType<typeof Application>
            })

            expect(await init2048GameFramework()).toBeUndefined()
        })

        it('returns a game instance with the expected API', async () => {
            result = await init2048GameFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
        })
    })

    describe('start wiring', () => {
        it('starts the game and swaps buttons via the start button', async () => {
            result = await init2048GameFramework()
            const startBtn = document.getElementById('start-btn')!
            const endBtn = document.getElementById('end-btn')!

            startBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(result!.game.getState().gameStarted).toBe(true)
            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })

        it('hides the game-over overlay on start', async () => {
            result = await init2048GameFramework()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            document
                .getElementById('start-btn')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(overlay.classList.contains('hidden')).toBe(true)
        })
    })

    describe('keyboard controls', () => {
        const keys: Array<[string, Direction]> = [
            ['ArrowUp', 'up'],
            ['ArrowDown', 'down'],
            ['ArrowLeft', 'left'],
            ['ArrowRight', 'right'],
            ['w', 'up'],
            ['a', 'left'],
            ['s', 'down'],
            ['d', 'right'],
            ['W', 'up'],
            ['A', 'left'],
        ]

        beforeEach(async () => {
            result = await init2048GameFramework()
            result!.game.start()
        })

        it.each(keys)('dispatches %s -> move(%s)', async (key, direction) => {
            const moveSpy = vi
                .spyOn(result!.game, 'move')
                .mockReturnValue(NO_MOVE_RESULT)

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true })
            )

            expect(moveSpy).toHaveBeenCalledWith(direction)
        })

        it('ignores non-directional keys', async () => {
            const moveSpy = vi
                .spyOn(result!.game, 'move')
                .mockReturnValue(NO_MOVE_RESULT)

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            )

            expect(moveSpy).not.toHaveBeenCalled()
        })

        it('does not move before the game starts', async () => {
            const fresh = await init2048GameFramework()
            const moveSpy = vi
                .spyOn(fresh!.game, 'move')
                .mockReturnValue(NO_MOVE_RESULT)

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowUp',
                    bubbles: true,
                })
            )

            expect(moveSpy).not.toHaveBeenCalled()
            fresh!.cleanup()
        })
    })

    describe('touch controls', () => {
        beforeEach(async () => {
            result = await init2048GameFramework()
            result!.game.start()
        })

        it('triggers a move on a right swipe', async () => {
            const moveSpy = vi
                .spyOn(result!.game, 'move')
                .mockReturnValue(NO_MOVE_RESULT)
            const container = document.getElementById('game-2048-container')!

            container.dispatchEvent(
                new TouchEvent('touchstart', {
                    touches: [{ clientX: 100, clientY: 100 } as Touch],
                })
            )
            container.dispatchEvent(
                new TouchEvent('touchend', {
                    changedTouches: [{ clientX: 250, clientY: 105 } as Touch],
                })
            )

            expect(moveSpy).toHaveBeenCalledWith('right')
        })

        it('ignores swipes below the threshold', async () => {
            const moveSpy = vi
                .spyOn(result!.game, 'move')
                .mockReturnValue(NO_MOVE_RESULT)
            const container = document.getElementById('game-2048-container')!

            container.dispatchEvent(
                new TouchEvent('touchstart', {
                    touches: [{ clientX: 100, clientY: 100 } as Touch],
                })
            )
            container.dispatchEvent(
                new TouchEvent('touchend', {
                    changedTouches: [{ clientX: 105, clientY: 103 } as Touch],
                })
            )

            expect(moveSpy).not.toHaveBeenCalled()
        })
    })

    describe('end game', () => {
        it('shows the overlay and submits the score', async () => {
            result = await init2048GameFramework()
            result!.game.start()

            await result!.endGame()
            // Allow async score save to flush
            await Promise.resolve()
            await Promise.resolve()

            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(fetch).toHaveBeenCalledWith(
                '/api/scores',
                expect.objectContaining({ method: 'POST' })
            )
        })
    })

    describe('win notification', () => {
        it('shows the win notification when a move creates the 2048 tile', async () => {
            result = await init2048GameFramework()
            result!.game.start()

            // Set up a deterministic board where moving left merges to 2048
            const internals = (
                result!.game as unknown as { state: { board: unknown[][] } }
            ).state
            internals.board = [
                [
                    { id: 'a', value: 1024, position: { row: 0, col: 0 } },
                    { id: 'b', value: 1024, position: { row: 0, col: 1 } },
                    null,
                    null,
                ],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
            ]
            result!.game.move('left')

            const notification = document.getElementById('win-notification')!
            expect(notification.classList.contains('hidden')).toBe(false)
        })
    })

    describe('restart', () => {
        it('resets the game and hides the overlay', async () => {
            result = await init2048GameFramework()
            result!.game.start()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            result!.restart()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            expect(overlay.classList.contains('hidden')).toBe(true)
        })
    })
})
