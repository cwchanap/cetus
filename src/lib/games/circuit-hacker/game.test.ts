// src/lib/games/circuit-hacker/game.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitHackerGame } from './game'
import type { CircuitHackerCallbacks, CircuitHackerConfig } from './types'

function seededRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0xffffffff
    }
}

const config: CircuitHackerConfig = { difficulty: 'easy', cellSize: 48 }

function makeCallbacks(): CircuitHackerCallbacks {
    return {
        onTimeUpdate: vi.fn(),
        onRotation: vi.fn(),
        onSolved: vi.fn(),
        onFail: vi.fn(),
        onGameStart: vi.fn(),
    }
}

describe('CircuitHackerGame', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('starts a game and builds a grid', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        const state = game.getState()
        expect(state.isGameActive).toBe(true)
        expect(state.grid).toHaveLength(5)
        expect(cb.onGameStart).toHaveBeenCalled()
        game.cleanup()
    })

    it('rotates an unlocked tile and counts the rotation', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        // find first unlocked tile
        const state = game.getState()
        let target = { row: 0, col: 0 }
        outer: for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (!state.grid[r][c].locked) {
                    target = { row: r, col: c }
                    break outer
                }
            }
        }
        const before = game.getState().grid[target.row][target.col].orientation
        game.rotateTile(target.row, target.col)
        const after = game.getState().grid[target.row][target.col].orientation
        expect(after).toBe((before + 1) % 4)
        expect(game.getState().rotationsUsed).toBe(1)
        expect(cb.onRotation).toHaveBeenCalledWith(1)
        game.cleanup()
    })

    it('does not rotate a locked tile', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        const { sourcePos } = game.getState()
        const before =
            game.getState().grid[sourcePos.row][sourcePos.col].orientation
        game.rotateTile(sourcePos.row, sourcePos.col)
        const after =
            game.getState().grid[sourcePos.row][sourcePos.col].orientation
        expect(after).toBe(before)
        expect(game.getState().rotationsUsed).toBe(0)
        game.cleanup()
    })

    it('solves when the board is rotated into the solution', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        game.solveForTest() // test helper applies solution orientations
        expect(cb.onSolved).toHaveBeenCalledTimes(1)
        const [score, stats] = (cb.onSolved as ReturnType<typeof vi.fn>).mock
            .calls[0]
        expect(score).toBeGreaterThan(0)
        expect(stats.solved).toBe(true)
        expect(game.getState().isGameActive).toBe(false)
        game.cleanup()
    })

    it('fails when the timer runs out', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        vi.advanceTimersByTime(121_000) // past the 120s easy timer
        expect(cb.onFail).toHaveBeenCalledTimes(1)
        expect(game.getState().isGameOver).toBe(true)
        game.cleanup()
    })
})
