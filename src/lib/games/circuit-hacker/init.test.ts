// src/lib/games/circuit-hacker/init.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'roundRect',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }
    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', boxShadow: '' },
            writable: true,
        })
        // getBoundingClientRect is used to translate pointer coords
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 240, height: 240 }) as DOMRect
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
        }
    }
    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(() => ({ addChild: vi.fn(), destroy: vi.fn() })),
        Graphics: vi.fn(makeGraphics),
    }
})

const saveGameScore = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: (...args: unknown[]) => saveGameScore(...args),
}))

import { initializeCircuitHackerGame } from './init'
import { GameID } from '@/lib/games'
import { solveGameForTest } from './test-utils'
import { screen } from '@testing-library/dom'

function setupDom(): HTMLElement {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
        <span id="final-score">0</span>
        <span id="final-time">0</span>
        <span id="final-rotations">0</span>
        <span id="game-over-title"></span>
        <div id="game-over-overlay" class="hidden" data-testid="game-over-overlay"></div>
        <button id="start-btn" data-testid="start-btn"></button>
        <button id="stop-btn" style="display:none" data-testid="stop-btn"></button>
    `
    return document.getElementById('game-canvas-container') as HTMLElement
}

describe('initializeCircuitHackerGame', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        saveGameScore.mockClear()
    })
    afterEach(() => vi.useRealTimers())

    it('starts a game of the chosen difficulty', async () => {
        const container = setupDom()
        const onStart = vi.fn()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart,
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        expect(onStart).toHaveBeenCalled()
        expect(handle.getGame()?.getState().rows).toBe(5)
        handle.cleanup()
    })

    it('submits the score with gameData when solved', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        // Force a solve via the game's test helper
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()
        expect(saveGameScore).toHaveBeenCalledTimes(1)
        const [gameId, score, , , gameData] = saveGameScore.mock.calls[0]
        expect(gameId).toBe(GameID.CIRCUIT_HACKER)
        expect(score).toBeGreaterThan(0)
        expect(gameData).toMatchObject({ difficulty: 'easy', solved: true })
        handle.cleanup()
    })

    it('passes an isStale option that flips to true after a new run starts', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()

        expect(saveGameScore).toHaveBeenCalledTimes(1)
        const opts = saveGameScore.mock.calls[0][5] as
            | { isStale: () => boolean }
            | undefined
        expect(opts?.isStale).toBeTypeOf('function')
        expect(opts!.isStale()).toBe(false)

        await handle.start('easy')
        expect(opts!.isStale()).toBe(true)
        handle.cleanup()
    })

    it('does not submit a score when the run fails', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        vi.advanceTimersByTime(121_000)
        await vi.runAllTimersAsync()
        expect(saveGameScore).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('shows "GAME OVER" overlay and does not submit on manual stop', async () => {
        const onEnd = vi.fn()
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd,
        })
        await handle.start('easy')
        handle.stop()
        await vi.runAllTimersAsync()
        expect(saveGameScore).not.toHaveBeenCalled()
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(screen.getByText('GAME OVER')).toBeInTheDocument()
        expect(screen.getByTestId('game-over-overlay')).not.toHaveClass(
            'hidden'
        )
        // Button state reset: start visible, stop hidden
        expect(screen.getByTestId('start-btn')).toBeVisible()
        expect(screen.getByTestId('stop-btn')).not.toBeVisible()
        handle.cleanup()
    })

    it('shows "TIME\'S UP!" overlay on timeout failure', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        vi.advanceTimersByTime(121_000)
        await vi.runAllTimersAsync()
        expect(screen.getByText("TIME'S UP!")).toBeInTheDocument()
        handle.cleanup()
    })

    it('surfaces score-save failure via onError instead of console.error', async () => {
        const container = setupDom()
        const onError = vi.fn()
        saveGameScore.mockRejectedValueOnce(new Error('network down'))
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
            onError,
        })
        await handle.start('easy')
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()
        expect(onError).toHaveBeenCalledTimes(1)
        const [title, message] = onError.mock.calls[0]
        expect(title).toBe('Score Not Saved')
        expect(message).toContain('network down')
        handle.cleanup()
    })

    it('surfaces score-save error-callback via onError', async () => {
        const container = setupDom()
        const onError = vi.fn()
        // saveGameScore resolves but invokes its error callback (e.g. 401).
        // The real onError callback receives a string, not an Error.
        saveGameScore.mockImplementationOnce(
            async (
                _gameId: unknown,
                _score: unknown,
                _onResult: unknown,
                onErrorCb: (e: string) => void
            ) => {
                onErrorCb('not logged in')
                return undefined
            }
        )
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
            onError,
        })
        await handle.start('easy')
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0]).toBe('Score Not Saved')
        expect(onError.mock.calls[0][1]).toContain('not logged in')
        handle.cleanup()
    })

    it('cleans up the previous game when start is called again', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        const firstGame = handle.getGame()
        expect(firstGame).not.toBeNull()
        // Restart with a different difficulty; the previous game must be
        // cleaned up and a fresh one created.
        await handle.start('medium')
        const secondGame = handle.getGame()
        expect(secondGame).not.toBe(firstGame)
        expect(secondGame?.getState().rows).toBe(7) // medium is 7x7
        handle.cleanup()
    })

    it('rotates a tile when the canvas receives a pointerdown', async () => {
        const container = setupDom()
        const onRotation = vi.fn()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation,
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        const game = handle.getGame()!
        const state = game.getState()
        // Find an unlocked tile to target
        let target: { row: number; col: number } | null = null
        outer: for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (!state.grid[r][c].locked) {
                    target = { row: r, col: c }
                    break outer
                }
            }
        }
        expect(target).not.toBeNull()
        const canvas = container.querySelector('canvas') as HTMLCanvasElement
        // Mock canvas getBoundingClientRect returns { left: 0, top: 0,
        // width: 240, height: 240 }. Easy is 5x5 at CELL_SIZE=48 => 240x240,
        // so scale = 1. Click at the cell's centre.
        const x = target!.col * 48 + 24
        const y = target!.row * 48 + 24
        const before = state.grid[target!.row][target!.col].orientation
        canvas.dispatchEvent(
            new MouseEvent('pointerdown', { clientX: x, clientY: y })
        )
        expect(game.getState().grid[target!.row][target!.col].orientation).toBe(
            (before + 1) % 4
        )
        expect(onRotation).toHaveBeenCalledWith(1)
        handle.cleanup()
    })

    it('dispatches achievementsEarned event when saveGameScore returns new achievements', async () => {
        const container = setupDom()
        const achievementSpy = vi.fn()
        window.addEventListener('achievementsEarned', achievementSpy)
        saveGameScore.mockImplementationOnce(
            async (
                _gameId: unknown,
                _score: unknown,
                onResult: (result: { newAchievements?: string[] }) => void
            ) => {
                onResult({ newAchievements: ['ach-1', 'ach-2'] })
                return undefined
            }
        )
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()
        expect(achievementSpy).toHaveBeenCalledTimes(1)
        const event = achievementSpy.mock.calls[0][0] as CustomEvent
        expect(event.detail.achievementIds).toEqual(['ach-1', 'ach-2'])
        window.removeEventListener('achievementsEarned', achievementSpy)
        handle.cleanup()
    })

    it('surfaces string errors from saveGameScore rejection via onError', async () => {
        const container = setupDom()
        const onError = vi.fn()
        saveGameScore.mockRejectedValueOnce('string error')
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
            onError,
        })
        await handle.start('easy')
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][1]).toContain('string error')
        handle.cleanup()
    })

    it('surfaces unknown error type from saveGameScore rejection via onError', async () => {
        const container = setupDom()
        const onError = vi.fn()
        // Neither Error nor string — triggers the "Unknown error" fallback
        saveGameScore.mockRejectedValueOnce(42)
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
            onError,
        })
        await handle.start('easy')
        solveGameForTest(handle.getGame()!)
        await vi.runAllTimersAsync()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][1]).toContain('Unknown error')
        handle.cleanup()
    })
})
