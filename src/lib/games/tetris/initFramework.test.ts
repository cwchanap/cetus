import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initTetrisGameFramework } from './initFramework'
import type { BaseGameCallbacks } from '@/lib/games/core/types'

// The real TetrisRenderer drives PixiJS; mock the module so the framework
// wiring (canvas setup, previews, handlers) can run in jsdom.
vi.mock('./TetrisRenderer', () => ({
    TetrisRenderer: vi.fn().mockImplementation(() => {
        // Stable canvas object so assertions can read what init set on it.
        const canvas = {
            tabIndex: -1,
            style: {},
            setAttribute: vi.fn(),
            parentNode: null,
        }
        return {
            initialize: vi.fn().mockResolvedValue(undefined),
            render: vi.fn(),
            cleanup: vi.fn(),
            setPreferences: vi.fn(),
            getApp: vi.fn(() => ({ canvas })),
        }
    }),
    createTetrisRendererConfig: vi.fn(() => ({
        type: 'canvas',
        container: '#tetris-container',
    })),
}))

// Mock TetrisGame so tests can flip state and capture the framework's
// enhanced callbacks.
vi.mock('./TetrisGame', () => {
    const TetrisGame = vi.fn().mockImplementation((_config, callbacks) => {
        const instance = {
            state: makeState(),
            callbacksRef: { callbacks },
            start: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            end: vi.fn().mockResolvedValue(undefined),
            reset: vi.fn(),
            destroy: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
            update: vi.fn(),
            markRendered: vi.fn(),
            moveLeft: vi.fn(),
            moveRight: vi.fn(),
            softDrop: vi.fn(),
            rotate: vi.fn(),
            hardDrop: vi.fn(),
            holdPiece: vi.fn(),
            getState: vi.fn(),
        }
        instance.getState.mockImplementation(() => instance.state)
        return instance
    })
    return {
        TetrisGame,
        DEFAULT_TETRIS_CONFIG: {
            duration: Number.MAX_SAFE_INTEGER,
            achievementIntegration: true,
            pausable: true,
            resettable: true,
        },
    }
})

vi.mock('./utils', () => ({
    drawNextPiece: vi.fn(),
}))

vi.mock('@/lib/games/core/errors', () => ({
    DOMElementNotFoundError: class DOMElementNotFoundError extends Error {
        constructor(id: string) {
            super(`DOM element not found: ${id}`)
        }
    },
    handleGameError: vi.fn(),
}))

import { TetrisGame } from './TetrisGame'
import { TetrisRenderer } from './TetrisRenderer'
import { drawNextPiece } from './utils'
import { handleGameError } from '@/lib/games/core/errors'

// The mock instance carries its own state and the framework callbacks.
function makeState(overrides: Record<string, unknown> = {}) {
    return {
        score: 0,
        level: 1,
        lines: 0,
        board: [],
        currentPiece: null,
        nextPiece: null,
        queue: [],
        heldPiece: null,
        holdUsed: false,
        clearedRows: [],
        startLevel: 1,
        dropTime: 0,
        dropInterval: 1000,
        stats: {
            pieces: 0,
            singles: 0,
            doubles: 0,
            triples: 0,
            tetrises: 0,
        },
        needsRedraw: false,
        gameStarted: false,
        isPaused: false,
        isGameOver: false,
        isActive: false,
        ...overrides,
    }
}

const lastInstance = () =>
    vi.mocked(TetrisGame).mock.results.at(-1)!.value as unknown as {
        state: Record<string, unknown>
        callbacksRef: { callbacks: BaseGameCallbacks }
    }

function setupDOM(): HTMLCanvasElement {
    const container = document.createElement('div')
    container.id = 'tetris-container'
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)

    const nextCanvas = document.createElement('canvas')
    nextCanvas.id = 'next-canvas'
    const holdCanvas = document.createElement('canvas')
    holdCanvas.id = 'hold-canvas'
    for (const preview of [nextCanvas, holdCanvas]) {
        Object.defineProperty(preview, 'getContext', {
            value: vi.fn(() => ({ clearRect: vi.fn(), fillRect: vi.fn() })),
            writable: true,
        })
    }

    const ids = [
        'score',
        'level',
        'lines',
        'pieces-count',
        'singles-count',
        'doubles-count',
        'triples-count',
        'tetrises-count',
        'final-score',
        'final-level',
        'final-lines',
        'final-pieces',
        'final-tetrises',
    ]
    const elements: HTMLElement[] = [container, nextCanvas, holdCanvas]
    for (const id of ids) {
        const el = document.createElement('span')
        el.id = id
        el.textContent = '0'
        elements.push(el)
    }
    const overlay = document.createElement('div')
    overlay.id = 'game-over-overlay'
    overlay.className = 'hidden'
    elements.push(overlay)
    for (const id of [
        'start-btn',
        'end-btn',
        'pause-btn',
        'reset-btn',
        'restart-btn',
        'play-again-btn',
    ]) {
        const btn = document.createElement('button')
        btn.id = id
        elements.push(btn)
    }
    document.body.replaceChildren(...elements)
    return canvas
}

describe('initTetrisGameFramework', () => {
    let result: Awaited<ReturnType<typeof initTetrisGameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 1)
        )
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        result = undefined
    })

    afterEach(() => {
        if (result) {
            try {
                result.cleanup()
            } catch {
                // ignore
            }
        }
        vi.unstubAllGlobals()
        document.body.replaceChildren()
    })

    it('returns undefined when tetris-container is missing', async () => {
        document.body.replaceChildren()
        result = await initTetrisGameFramework()
        expect(result).toBeUndefined()
        expect(handleGameError).toHaveBeenCalled()
    })

    it('returns undefined when renderer initialization fails', async () => {
        vi.mocked(TetrisRenderer).mockImplementationOnce(
            () =>
                ({
                    initialize: vi.fn().mockRejectedValue(new Error('boom')),
                    cleanup: vi.fn(),
                    getApp: vi.fn(() => ({ canvas: null })),
                }) as never
        )
        result = await initTetrisGameFramework()
        expect(result).toBeUndefined()
        expect(handleGameError).toHaveBeenCalledWith(
            expect.any(Error),
            'TetrisGame'
        )
    })

    it('labels the board canvas for screen readers and draws previews', async () => {
        result = await initTetrisGameFramework()
        expect(result).toBeDefined()
        const app = vi.mocked(TetrisRenderer).mock.results[0].value.getApp()
        expect(app.canvas.setAttribute).toHaveBeenCalledWith(
            'aria-label',
            expect.stringContaining('Tetris board')
        )
        // Initial preview pass draws both next queue and empty hold slot.
        expect(drawNextPiece).toHaveBeenCalledTimes(2)
    })

    it('exposes the game, renderer, and run controls', async () => {
        result = await initTetrisGameFramework()
        const game = lastInstance()
        expect(result.game).toBeDefined()
        expect(result.renderer).toBeDefined()
        expect(result.getState()).toBe(game.state)

        await result.endGame()
        expect(game.state).toBeDefined()

        result.restart()
        expect(
            vi.mocked(TetrisGame).mock.results.at(-1)!.value.reset
        ).toHaveBeenCalled()

        result.setPreferences(false, true)
        expect(
            vi.mocked(TetrisRenderer).mock.results[0].value.setPreferences
        ).toHaveBeenCalledWith(false, true)
    })

    it('cleans up game, renderer, and listeners', async () => {
        result = await initTetrisGameFramework()
        const game = vi.mocked(TetrisGame).mock.results[0].value
        result.cleanup()
        expect(game.off).toHaveBeenCalledWith('end', expect.any(Function))
        expect(game.destroy).toHaveBeenCalled()
        expect(
            vi.mocked(TetrisRenderer).mock.results[0].value.cleanup
        ).toHaveBeenCalled()
        result = undefined
    })

    it('forwards onEnd to the game-over overlay', async () => {
        result = await initTetrisGameFramework()
        const { callbacks } = lastInstance().callbacksRef
        callbacks.onEnd(4200, {
            level: 7,
            lines: 42,
            pieces: 100,
            tetrises: 4,
        } as never)
        const overlay = document.getElementById('game-over-overlay')
        expect(overlay.classList.contains('hidden')).toBe(false)
        expect(document.getElementById('final-score').textContent).toBe('4200')
        expect(document.getElementById('final-tetrises').textContent).toBe('4')
        expect(document.getElementById('start-btn').style.display).toBe(
            'inline-flex'
        )
    })

    it('wires start, end, pause toggle, and reset buttons', async () => {
        result = await initTetrisGameFramework()
        const game = vi.mocked(TetrisGame).mock.results[0].value
        const instance = lastInstance()

        document.getElementById('start-btn').click()
        expect(game.start).toHaveBeenCalled()

        document.getElementById('end-btn').click()
        expect(game.end).toHaveBeenCalled()

        instance.state.gameStarted = true
        document.getElementById('pause-btn').click()
        expect(game.pause).toHaveBeenCalled()

        instance.state.isPaused = true
        document.getElementById('pause-btn').click()
        expect(game.resume).toHaveBeenCalled()

        document.getElementById('reset-btn').click()
        expect(game.reset).toHaveBeenCalled()
        expect(game.start).toHaveBeenCalledTimes(2)

        document.getElementById('play-again-btn').click()
        expect(game.reset).toHaveBeenCalledTimes(2)
    })

    it('toggles pause with the p key while a run is live', async () => {
        result = await initTetrisGameFramework()
        const game = vi.mocked(TetrisGame).mock.results[0].value
        const instance = lastInstance()
        instance.state.gameStarted = true

        const event = new KeyboardEvent('keydown', {
            key: 'p',
            bubbles: true,
            cancelable: true,
        })
        document.body.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
        expect(game.pause).toHaveBeenCalled()
    })

    it('drives piece controls from board canvas keydown', async () => {
        result = await initTetrisGameFramework()
        const game = vi.mocked(TetrisGame).mock.results[0].value
        const instance = lastInstance()
        instance.state.gameStarted = true

        const canvas = document.querySelector('#tetris-container canvas')
        for (const [key, spy] of [
            ['ArrowLeft', game.moveLeft],
            ['ArrowRight', game.moveRight],
            ['ArrowDown', game.softDrop],
            ['ArrowUp', game.rotate],
            [' ', game.hardDrop],
            ['c', game.holdPiece],
        ] as const) {
            canvas.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    bubbles: true,
                    cancelable: true,
                })
            )
            expect(spy).toHaveBeenCalledTimes(1)
        }
    })

    it('ignores keys while a dialog is open or the game has not started', async () => {
        result = await initTetrisGameFramework()
        const game = vi.mocked(TetrisGame).mock.results[0].value
        const instance = lastInstance()
        instance.state.gameStarted = true

        const dialog = document.createElement('dialog')
        dialog.open = true
        document.body.appendChild(dialog)
        document.body.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
        )
        expect(game.moveLeft).not.toHaveBeenCalled()
        dialog.remove()

        // Movement keys work page-wide; no board focus required.
        document.body.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowLeft',
                bubbles: true,
                cancelable: true,
            })
        )
        expect(game.moveLeft).toHaveBeenCalledTimes(1)

        // Not started: even the pause key is ignored.
        instance.state.gameStarted = false
        document.body.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'p', bubbles: true })
        )
        expect(game.pause).not.toHaveBeenCalled()
    })
})
