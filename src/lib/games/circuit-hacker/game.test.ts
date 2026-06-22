// src/lib/games/circuit-hacker/game.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitHackerGame } from './game'
import type { CircuitHackerCallbacks, CircuitHackerConfig } from './types'
import {
    seededRng,
    solveGameForTest,
    getSolutionOrientationsForTest,
} from './test-utils'

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
        solveGameForTest(game) // test helper applies solution orientations
        expect(cb.onSolved).toHaveBeenCalledTimes(1)
        const [score, stats] = (cb.onSolved as ReturnType<typeof vi.fn>).mock
            .calls[0]
        expect(score).toBeGreaterThan(0)
        expect(stats.solved).toBe(true)
        expect(game.getState().isGameActive).toBe(false)
        game.cleanup()
    })

    it('solves via the real rotateTile() path (C1)', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        const solution = getSolutionOrientationsForTest(game)
        expect(solution).not.toBeNull()
        const state = game.getState()
        // Drive the production win path: rotate each tile until it matches
        // the recorded solution orientation. Exercises rotateTile -> applyPower
        // -> allCoresPowered -> solve, the same path a player takes.
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const tile = state.grid[r][c]
                if (tile.locked) {
                    continue
                }
                const target = solution![r][c]
                while (tile.orientation !== target) {
                    game.rotateTile(r, c)
                }
            }
        }
        expect(cb.onSolved).toHaveBeenCalledTimes(1)
        const [score, stats] = (cb.onSolved as ReturnType<typeof vi.fn>).mock
            .calls[0]
        expect(score).toBeGreaterThan(0)
        expect(stats.solved).toBe(true)
        expect(game.getState().solved).toBe(true)
        expect(game.getState().isGameActive).toBe(false)
        game.cleanup()
    })

    it('does not solve on a partial board (C2, hard 2-core)', () => {
        const hardConfig: CircuitHackerConfig = {
            difficulty: 'hard',
            cellSize: 48,
        }
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(hardConfig, cb, seededRng(7))
        game.startGame()
        const state = game.getState()
        expect(state.corePositions.length).toBe(2)
        // Rotate exactly one rotatable tile once. A single rotation cannot
        // complete a 2-core hard board, so the game must remain unsolved
        // and active.
        let rotated = false
        for (let r = 0; r < state.rows && !rotated; r++) {
            for (let c = 0; c < state.cols && !rotated; c++) {
                if (!state.grid[r][c].locked) {
                    game.rotateTile(r, c)
                    rotated = true
                }
            }
        }
        expect(rotated).toBe(true)
        expect(cb.onSolved).not.toHaveBeenCalled()
        expect(game.getState().solved).toBe(false)
        expect(game.getState().isGameActive).toBe(true)
        game.cleanup()
    })

    it('fails with reason "timeout" when the timer runs out', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        vi.advanceTimersByTime(121_000) // past the 120s easy timer
        expect(cb.onFail).toHaveBeenCalledTimes(1)
        const [stats, reason] = (cb.onFail as ReturnType<typeof vi.fn>).mock
            .calls[0]
        expect(reason).toBe('timeout')
        expect(stats.solved).toBe(false)
        expect(game.getState().isGameOver).toBe(true)
        game.cleanup()
    })

    it('fails with reason "manual" when stopGame is called', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        game.stopGame()
        expect(cb.onFail).toHaveBeenCalledTimes(1)
        const [stats, reason] = (cb.onFail as ReturnType<typeof vi.fn>).mock
            .calls[0]
        expect(reason).toBe('manual')
        expect(stats.solved).toBe(false)
        expect(game.getState().isGameActive).toBe(false)
        expect(game.getState().isGameOver).toBe(true)
        game.cleanup()
    })

    it('stopGame is a no-op when no game is active', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.stopGame()
        expect(cb.onFail).not.toHaveBeenCalled()
        game.cleanup()
    })

    it('startGame is a no-op when a game is already active', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        const firstGrid = game.getState().grid
        // Second call should return early without rebuilding the puzzle
        game.startGame()
        expect(cb.onGameStart).toHaveBeenCalledTimes(1)
        // Grid reference is unchanged (no rebuild)
        expect(game.getState().grid).toBe(firstGrid)
        game.cleanup()
    })

    it('timer callback is a no-op when game is no longer active', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        // onTimeUpdate is called once during startGame (initial time)
        expect(cb.onTimeUpdate).toHaveBeenCalledTimes(1)
        // Simulate a race: deactivate without clearing the timer, then
        // let the interval fire. The callback should return early.
        const internals = game as unknown as {
            state: { isGameActive: boolean }
        }
        internals.state.isGameActive = false
        vi.advanceTimersByTime(1000)
        // onTimeUpdate should NOT have been called again from the timer
        expect(cb.onTimeUpdate).toHaveBeenCalledTimes(1)
        expect(cb.onFail).not.toHaveBeenCalled()
        game.cleanup()
    })

    it('rotateTile is a no-op when the game is not active', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        game.stopGame() // sets isGameActive = false
        const before = game.getState().rotationsUsed
        // Find any rotatable tile and try to rotate it post-game
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
        game.rotateTile(target.row, target.col)
        expect(game.getState().rotationsUsed).toBe(before)
        expect(cb.onRotation).not.toHaveBeenCalled()
        game.cleanup()
    })

    it('rotateTile ignores out-of-bounds coordinates', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        const before = game.getState().rotationsUsed
        game.rotateTile(-1, 0) // negative row
        game.rotateTile(0, -1) // negative col
        game.rotateTile(99, 0) // row out of bounds
        game.rotateTile(0, 99) // col out of bounds
        expect(game.getState().rotationsUsed).toBe(before)
        expect(cb.onRotation).not.toHaveBeenCalled()
        game.cleanup()
    })

    it('logs to console.error when onSolved rejects', async () => {
        const consoleSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        const cb = makeCallbacks()
        cb.onSolved = vi.fn().mockRejectedValue(new Error('submit failed'))
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        solveGameForTest(game)
        // Flush the microtask queue so the rejected promise's .catch() runs
        await vi.advanceTimersByTimeAsync(0)
        expect(consoleSpy).toHaveBeenCalledWith(
            'onSolved callback rejected:',
            expect.any(Error)
        )
        consoleSpy.mockRestore()
        game.cleanup()
    })
})

describe('test-utils', () => {
    it('solveGameForTest is a no-op when no puzzle exists (game not started)', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        // Game has not been started, so puzzle is null. The helper should
        // return early without calling solve() or throwing.
        expect(() => solveGameForTest(game)).not.toThrow()
        expect(cb.onSolved).not.toHaveBeenCalled()
        game.cleanup()
    })

    it('getSolutionOrientationsForTest returns null when no puzzle exists', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        // Game has not been started, so puzzle is null
        expect(getSolutionOrientationsForTest(game)).toBeNull()
        game.cleanup()
    })
})
