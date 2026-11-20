import type { HandleSessionHandlers } from '@cetus/app-core'
import type { BaseGameStats } from '@cetus/games'
import { CircuitHackerGame } from '@cetus/games/circuit-hacker/game'
import type {
    CircuitHackerState,
    Difficulty,
    Orientation,
    TileType,
} from '@cetus/games/circuit-hacker/types'
import { DIFFICULTY_CONFIGS } from '@cetus/games/circuit-hacker/utils'

import type { HandleResultHelper } from '../handleResult'
import type { NativeGameProjection } from '../registry'

/** Logical pixels per tile; the canvas letterboxes to the screen. */
export const CIRCUIT_HACKER_CELL_SIZE = 48

/** Default difficulty matches the web select's initial value. */
export const CIRCUIT_HACKER_DEFAULT_DIFFICULTY: Difficulty = 'medium'

export interface CircuitHackerCellSnapshot {
    type: TileType
    orientation: Orientation
    locked: boolean
    powered: boolean
}

export interface CircuitHackerProjection extends NativeGameProjection {
    rows: number
    cols: number
    cells: CircuitHackerCellSnapshot[][]
    difficulty: Difficulty
    phase: 'idle' | 'running' | 'finished'
    canRotate: boolean
    canSelectDifficulty: boolean
    rotationsUsed: number
    cores: number
    poweredCores: number
    /** Honest, recoverable Start failure (e.g. puzzle generation); null
     *  while idle/running/finished normally. */
    startError: string | null
}

/** Serializable visible snapshot: copied cell values, never grid refs. */
export const projectCircuitHackerState = (
    difficulty: Difficulty,
    state: CircuitHackerState | null,
    startError: string | null = null
): CircuitHackerProjection => {
    const tier = DIFFICULTY_CONFIGS[difficulty]
    const rows = state?.rows ?? tier.rows
    const cols = state?.cols ?? tier.cols
    const grid = state?.grid ?? []
    const phase = state?.isGameOver
        ? 'finished'
        : state?.isGameActive
          ? 'running'
          : 'idle'
    const cells: CircuitHackerCellSnapshot[][] = []
    for (let row = 0; row < grid.length; row++) {
        const cellsRow: CircuitHackerCellSnapshot[] = []
        for (let col = 0; col < grid[row].length; col++) {
            const tile = grid[row][col]
            cellsRow.push({
                type: tile.type,
                orientation: tile.orientation,
                locked: tile.locked,
                powered: tile.powered,
            })
        }
        cells.push(cellsRow)
    }
    const cores = state?.corePositions.length ?? 0
    return {
        rows,
        cols,
        // No grid before the lazy start: render an empty board, not a wall of
        // placeholder cells.
        cells,
        difficulty,
        phase,
        canRotate: phase === 'running',
        canSelectDifficulty: phase !== 'running',
        rotationsUsed: state?.rotationsUsed ?? 0,
        cores,
        poweredCores: state
            ? state.corePositions.filter(
                  pos => state.grid[pos.row][pos.col].powered
              ).length
            : 0,
        startError,
    }
}

/**
 * Per-host Circuit Hacker controller. `CircuitHackerGame` takes its
 * difficulty only in the constructor (there is no `setDifficulty()`), so
 * this thin owner stores the pre-run selection, constructs/replaces the
 * model with it before the zero-argument chrome Start — cleaning up the
 * previous instance — and then calls `startGame()` (which lazily builds
 * the grid). Replay reuses the currently selected difficulty. The
 * controller is the board binding and maps the model callbacks onto the
 * shared handle session/result path; timeout and manual stop never POST.
 */
export class CircuitHackerController {
    private game: CircuitHackerGame | null = null
    private difficulty: Difficulty
    private startError: string | null = null

    constructor(
        private readonly deps: {
            handlers: HandleSessionHandlers<NativeGameProjection>
            results: HandleResultHelper
        },
        initialDifficulty: Difficulty = CIRCUIT_HACKER_DEFAULT_DIFFICULTY
    ) {
        this.difficulty = initialDifficulty
    }

    getDifficulty(): Difficulty {
        return this.difficulty
    }

    /** Debug/test seam (web parity: the page's `circuitHackerGame.getGame()`). */
    getGame(): CircuitHackerGame | null {
        return this.game
    }

    getProjection(): CircuitHackerProjection {
        return projectCircuitHackerState(
            this.difficulty,
            this.game?.getState() ?? null,
            this.startError
        )
    }

    /** Pre-run only: a live run keeps the difficulty it was built with. */
    selectDifficulty(difficulty: Difficulty): void {
        const phase = this.getProjection().phase
        if (phase === 'running') {
            return
        }
        this.difficulty = difficulty
        // The chrome HUD shows the selected tier's duration whenever no run is
        // live (both before Start and after a finished run).
        this.deps.handlers.onTime?.(DIFFICULTY_CONFIGS[difficulty].duration)
        this.publish()
    }

    start(): void {
        this.game?.cleanup()
        this.game = null
        this.startError = null
        const difficulty = this.difficulty
        const duration = DIFFICULTY_CONFIGS[difficulty].duration
        const game = new CircuitHackerGame(
            { difficulty, cellSize: CIRCUIT_HACKER_CELL_SIZE },
            {
                onGameStart: () => {
                    // Runs synchronously inside startGame(), before its timer.
                    this.deps.results.beginRun(duration)
                    this.publish()
                },
                onTimeUpdate: timeRemaining =>
                    this.deps.handlers.onTime?.(timeRemaining),
                onRotation: () => this.publish(),
                onSolved: (score, stats) => {
                    this.publish()
                    this.deps.results.finishAndSave({
                        score,
                        stats: stats as unknown as BaseGameStats,
                        gameData: {
                            difficulty: stats.difficulty,
                            secondsRemaining: stats.secondsRemaining,
                            rotationsUsed: stats.rotationsUsed,
                            solved: stats.solved,
                        },
                    })
                },
                onFail: stats => {
                    this.publish()
                    // Timeout/manual failure: honest local result, no score POST.
                    this.deps.results.finishLocal({
                        score: stats.finalScore,
                        stats: stats as unknown as BaseGameStats,
                    })
                },
            }
        )
        this.game = game
        try {
            game.startGame()
        } catch (error) {
            // Generation exhausted its retries (or the model failed to
            // start): drop the failed instance and return an HONEST,
            // recoverable idle error — no score, no pending save, and no
            // stale finished result left over from a Replay.
            game.cleanup()
            this.game = null
            this.startError = `Unable to start the circuit board: ${
                error instanceof Error ? error.message : String(error)
            }`
            this.deps.handlers.onScore?.(0)
            this.deps.handlers.onTime?.(duration)
            // Shared idle transition also invalidates the run token, so a
            // save still in flight from the previous finished run can never
            // settle its result over this recovery UI (rewards still land).
            this.deps.results.idle()
            this.publish()
        }
    }

    rotateTile(row: number, col: number): void {
        this.game?.rotateTile(row, col)
    }

    /** Manual stop: the model reports a `manual` failure (no score POST). */
    stop(): void {
        this.game?.stopGame()
    }

    cleanup(): void {
        this.game?.cleanup()
        this.game = null
    }

    private publish(): void {
        this.deps.handlers.setProjected(
            this.getProjection() as unknown as NativeGameProjection
        )
    }
}
