// Sudoku game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type { SudokuCell } from './types'
import type { SudokuState, SudokuConfig, SudokuStats } from './frameworkTypes'
import {
    createSolvedGrid,
    createPuzzle,
    isValidMove,
    isComplete,
} from './utils'

const DIFFICULTY_POINTS: Record<'easy' | 'medium' | 'hard', number> = {
    easy: 150,
    medium: 250,
    hard: 500,
}

// Default configuration for the Sudoku game.
// Sudoku has no countdown deadline — the timer counts elapsed time, so the
// duration is set to an effectively infinite value (the countdown never
// completes). Elapsed time is read via getTimerStatus().elapsedTime.
export const DEFAULT_SUDOKU_CONFIG: SudokuConfig = {
    duration: Number.MAX_SAFE_INTEGER,
    achievementIntegration: true,
    pausable: true,
    resettable: true,
    difficulty: 'medium',
}

export class SudokuGame extends BaseGame<
    SudokuState,
    SudokuConfig,
    SudokuStats
> {
    constructor(
        config: Partial<SudokuConfig> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: SudokuConfig = {
            ...DEFAULT_SUDOKU_CONFIG,
            ...config,
        }
        super(
            GameID.SUDOKU,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                timeBonus: false,
            }
        )
    }

    createInitialState(): SudokuState {
        const solvedGrid = createSolvedGrid()
        const puzzleGrid = createPuzzle(solvedGrid, this.config.difficulty)
        const cells: SudokuCell[][] = puzzleGrid.map(row =>
            row.map(value => ({
                value: value === 0 ? null : value,
                isGiven: value !== 0,
                isHighlighted: false,
                isConflicting: false,
            }))
        )

        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            grid: {
                cells,
                selectedCell: null,
            },
            difficulty: this.config.difficulty,
            mistakes: 0,
            isComplete: false,
            needsRedraw: true,
        }
    }

    protected onGameStart(): void {
        // Legacy behavior: the difficulty bonus is only awarded once the
        // player places a number (recalculateScore runs in placeNumber).
        // Do NOT call recalculateScore here — that would grant the full
        // difficulty bonus (+150/250/500) at game start.
        this.emitStateChange()
    }

    protected onGamePause(): void {
        this.emitStateChange()
    }

    protected onGameResume(): void {
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        // Game logic is event-driven (cell clicks + keyboard)
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        // No external resources to clean up
    }

    getGameStats(): SudokuStats {
        const timerStatus = this.getTimerStatus()
        const cellsFilled = this.state.grid.cells
            .flat()
            .filter(c => c.value !== null).length
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isComplete,
            difficulty: this.state.difficulty,
            mistakes: this.state.mistakes,
            isComplete: this.state.isComplete,
            cellsFilled,
        }
    }

    protected getGameData(): Record<string, unknown> {
        // GameData contract established in Task 3.7:
        // { difficulty, cellsFilled, hintsUsed }
        return {
            difficulty: this.state.difficulty,
            cellsFilled: this.state.grid.cells
                .flat()
                .filter(c => c.value !== null).length,
            hintsUsed: 0,
        }
    }

    // --- Sudoku-specific public API ---

    /**
     * Select a cell at the given position, highlighting related cells.
     */
    selectCell(row: number, col: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.isComplete
        ) {
            return
        }

        if (
            this.state.grid.selectedCell?.row === row &&
            this.state.grid.selectedCell?.col === col
        ) {
            this.state.grid.selectedCell = null
            this.clearHighlights()
            this.state.needsRedraw = true
            this.emitStateChange()
            return
        }

        this.state.grid.selectedCell = { row, col }
        this.highlightRelatedCells(row, col)
        this.state.needsRedraw = true
        this.emitStateChange()
    }

    /**
     * Place a number in the currently selected cell.
     */
    placeNumber(num: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.isComplete ||
            !this.state.grid.selectedCell
        ) {
            return
        }

        const { row, col } = this.state.grid.selectedCell
        const cell = this.state.grid.cells[row][col]

        if (cell.isGiven) {
            return
        }

        const currentGrid = this.state.grid.cells.map(r =>
            r.map(c => c.value || 0)
        )
        const valid = isValidMove(currentGrid, row, col, num)

        cell.value = num
        cell.isConflicting = !valid

        if (!valid) {
            this.state.mistakes++
        }

        this.recalculateScore()
        this.state.grid.selectedCell = null
        this.clearHighlights()

        const completedGrid = this.state.grid.cells.map(r =>
            r.map(c => c.value || 0)
        )

        if (isComplete(completedGrid)) {
            this.state.isComplete = true
            this.state.needsRedraw = true
            this.emitStateChange()
            this.end().catch(err => console.error('Sudoku end failed', err))
            return
        }

        this.state.needsRedraw = true
        this.emitStateChange()
    }

    /**
     * Clear the value of the currently selected cell.
     */
    clearSelectedCell(): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.isComplete ||
            !this.state.grid.selectedCell
        ) {
            return
        }

        const { row, col } = this.state.grid.selectedCell
        const cell = this.state.grid.cells[row][col]

        if (cell.isGiven) {
            return
        }

        cell.value = null
        cell.isConflicting = false
        this.state.grid.selectedCell = null
        this.state.needsRedraw = true
        this.emitStateChange()
    }

    /**
     * Get elapsed game time in seconds (for display).
     */
    getElapsedTime(): number {
        return Math.floor(this.getTimerStatus().elapsedTime || 0)
    }

    getConfig(): SudokuConfig {
        return { ...this.config }
    }

    /**
     * Start a new puzzle, optionally with a different difficulty.
     */
    newGame(difficulty?: 'easy' | 'medium' | 'hard'): void {
        if (difficulty) {
            this.config = { ...this.config, difficulty }
        }
        this.reset()
    }

    // --- Private game logic ---

    private highlightRelatedCells(row: number, col: number): void {
        this.clearHighlights()

        for (let c = 0; c < 9; c++) {
            this.state.grid.cells[row][c].isHighlighted = true
        }
        for (let r = 0; r < 9; r++) {
            this.state.grid.cells[r][col].isHighlighted = true
        }

        const boxRow = Math.floor(row / 3) * 3
        const boxCol = Math.floor(col / 3) * 3
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                this.state.grid.cells[boxRow + r][boxCol + c].isHighlighted =
                    true
            }
        }

        this.state.grid.cells[row][col].isHighlighted = false
    }

    private clearHighlights(): void {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                this.state.grid.cells[r][c].isHighlighted = false
            }
        }
    }

    /**
     * Sync the ScoreManager with the absolute score computed from the board.
     * Sudoku scores are holistic (solvedRows^2 * 10 + difficulty bonus), so we
     * apply the delta to keep the ScoreManager and state.score in sync.
     */
    private recalculateScore(): void {
        const newScore = this.computeAbsoluteScore()
        const current = this.scoreManager.getScore()
        const delta = newScore - current
        if (delta > 0) {
            this.addScore(delta, 'progress')
        } else if (delta < 0) {
            this.subtractScore(-delta, 'progress')
        }
    }

    private computeAbsoluteScore(): number {
        let solvedRows = 0
        for (let i = 0; i < 9; i++) {
            const row = this.state.grid.cells[i]
            if (row.every(cell => cell.value !== null && !cell.isConflicting)) {
                solvedRows++
            }
        }
        return (
            solvedRows * solvedRows * 10 +
            DIFFICULTY_POINTS[this.state.difficulty]
        )
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}

export default SudokuGame
