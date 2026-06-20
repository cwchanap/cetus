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

function setupDom(): HTMLElement {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
        <span id="final-score">0</span>
        <span id="final-time">0</span>
        <span id="final-rotations">0</span>
        <span id="game-over-title"></span>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn"></button>
        <button id="stop-btn" style="display:none"></button>
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
        ;(
            handle.getGame() as unknown as { solveForTest: () => void }
        ).solveForTest()
        await vi.runAllTimersAsync()
        expect(saveGameScore).toHaveBeenCalledTimes(1)
        const [gameId, score, , , gameData] = saveGameScore.mock.calls[0]
        expect(gameId).toBe(GameID.CIRCUIT_HACKER)
        expect(score).toBeGreaterThan(0)
        expect(gameData).toMatchObject({ difficulty: 'easy', solved: true })
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
})
