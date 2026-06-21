// src/lib/games/circuit-hacker/game.ts
import type {
    CircuitHackerCallbacks,
    CircuitHackerConfig,
    CircuitHackerState,
    CircuitHackerStats,
    RunEndReason,
} from './types'
import {
    DIFFICULTY_CONFIGS,
    computePoweredCells,
    countRotatableTiles,
    computeFinalScore,
} from './utils'
import { generatePuzzle, type GeneratedPuzzle } from './generator'

export class CircuitHackerGame {
    private config: CircuitHackerConfig
    private callbacks: CircuitHackerCallbacks
    private rng: () => number
    private state: CircuitHackerState
    private puzzle: GeneratedPuzzle | null = null
    private timer: number | null = null

    constructor(
        config: CircuitHackerConfig,
        callbacks: CircuitHackerCallbacks,
        rng: () => number = Math.random
    ) {
        this.config = config
        this.callbacks = callbacks
        this.rng = rng
        // The puzzle is built lazily in startGame(); the constructor only
        // sets up an empty placeholder state so getState() is safe to call
        // before a run begins.
        this.state = this.buildEmptyState()
    }

    private buildPuzzle(): GeneratedPuzzle {
        return generatePuzzle(
            DIFFICULTY_CONFIGS[this.config.difficulty],
            this.rng
        )
    }

    private buildEmptyState(): CircuitHackerState {
        const tier = DIFFICULTY_CONFIGS[this.config.difficulty]
        return {
            grid: [],
            sourcePos: { row: 0, col: 0 },
            corePositions: [],
            rows: tier.rows,
            cols: tier.cols,
            score: 0,
            timeRemaining: tier.duration,
            rotationsUsed: 0,
            isGameActive: false,
            isGameOver: false,
            solved: false,
        }
    }

    private buildInitialState(puzzle: GeneratedPuzzle): CircuitHackerState {
        const tier = DIFFICULTY_CONFIGS[this.config.difficulty]
        const state: CircuitHackerState = {
            grid: puzzle.grid,
            sourcePos: puzzle.sourcePos,
            corePositions: puzzle.corePositions,
            rows: tier.rows,
            cols: tier.cols,
            score: 0,
            timeRemaining: tier.duration,
            rotationsUsed: 0,
            isGameActive: false,
            isGameOver: false,
            solved: false,
        }
        this.applyPower(state)
        return state
    }

    private applyPower(state: CircuitHackerState): void {
        const powered = computePoweredCells(state.grid, state.sourcePos)
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                state.grid[r][c].powered = powered[r][c]
            }
        }
    }

    // After applyPower() has stamped the .powered flags, cores are solved iff
    // every core cell is powered. Avoids a second flood-fill per rotation.
    private allCoresPowered(state: CircuitHackerState): boolean {
        return state.corePositions.every(c => state.grid[c.row][c.col].powered)
    }

    startGame(): void {
        if (this.state.isGameActive) {
            return
        }
        // Fresh puzzle each run at the configured difficulty.
        this.puzzle = this.buildPuzzle()
        this.state = this.buildInitialState(this.puzzle)
        this.state.isGameActive = true

        this.callbacks.onGameStart()
        this.callbacks.onTimeUpdate(this.state.timeRemaining)

        this.timer = window.setInterval(() => {
            if (!this.state.isGameActive) {
                return
            }
            this.state.timeRemaining--
            this.callbacks.onTimeUpdate(this.state.timeRemaining)
            if (this.state.timeRemaining <= 0) {
                this.fail('timeout')
            }
        }, 1000)
    }

    rotateTile(row: number, col: number): void {
        if (!this.state.isGameActive) {
            return
        }
        if (
            row < 0 ||
            row >= this.state.rows ||
            col < 0 ||
            col >= this.state.cols
        ) {
            return
        }
        const tile = this.state.grid[row][col]
        if (tile.locked) {
            return
        }

        tile.orientation = (tile.orientation + 1) % 4
        this.state.rotationsUsed++
        this.applyPower(this.state)
        this.callbacks.onRotation(this.state.rotationsUsed)

        if (this.allCoresPowered(this.state)) {
            this.solve()
        }
    }

    private solve(): void {
        this.clearTimer()
        this.state.isGameActive = false
        this.state.isGameOver = true
        this.state.solved = true
        this.state.score = computeFinalScore({
            secondsRemaining: this.state.timeRemaining,
            rotationsUsed: this.state.rotationsUsed,
            rotatableTileCount: countRotatableTiles(this.state.grid),
            multiplier: DIFFICULTY_CONFIGS[this.config.difficulty].multiplier,
        })
        this.callbacks.onSolved(this.state.score, this.getStats())
    }

    private fail(reason: RunEndReason): void {
        this.clearTimer()
        this.state.isGameActive = false
        this.state.isGameOver = true
        this.state.solved = false
        this.state.timeRemaining = Math.max(0, this.state.timeRemaining)
        this.callbacks.onFail(this.getStats(), reason)
    }

    stopGame(): void {
        if (!this.state.isGameActive) {
            return
        }
        this.fail('manual')
    }

    getState(): CircuitHackerState {
        return this.state
    }

    getStats(): CircuitHackerStats {
        return {
            finalScore: this.state.score,
            difficulty: this.config.difficulty,
            secondsRemaining: this.state.timeRemaining,
            rotationsUsed: this.state.rotationsUsed,
            solved: this.state.solved,
        }
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    cleanup(): void {
        this.clearTimer()
    }

    /** Test-only helper: rotate every tile into the known solution. */
    solveForTest(): void {
        if (!this.puzzle) {
            return
        }
        for (let r = 0; r < this.state.rows; r++) {
            for (let c = 0; c < this.state.cols; c++) {
                this.state.grid[r][c].orientation =
                    this.puzzle.solutionOrientations[r][c]
            }
        }
        this.applyPower(this.state)
        if (this.allCoresPowered(this.state)) {
            this.solve()
        }
    }
}
