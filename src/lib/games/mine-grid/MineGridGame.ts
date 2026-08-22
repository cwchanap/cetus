import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import { createGrid, findCells } from '@/lib/games/shared/grid'
import { getFloodRevealPositions, placeMines } from './board'
import { calculateMineGridScore } from './scoring'
import {
    MINE_GRID_PRESETS,
    type MineGridConfig,
    type MineGridDifficulty,
    type MineGridState,
    type MineGridStats,
} from './types'

export function createMineGridConfig(
    difficulty: MineGridDifficulty = 'medium',
    rng?: () => number
): MineGridConfig {
    const preset = MINE_GRID_PRESETS[difficulty]
    return {
        duration: preset.duration,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        preset,
        rng,
    }
}

export class MineGridGame extends BaseGame<
    MineGridState,
    MineGridConfig,
    MineGridStats
> {
    constructor(
        config: MineGridConfig = createMineGridConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.MINE_GRID, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): MineGridState {
        const { rows, cols } = this.config.preset
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            difficulty: this.config.preset.difficulty,
            board: createGrid(rows, cols, () => ({
                hasMine: false,
                adjacentMines: 0,
                revealed: false,
                flagged: false,
            })),
            minesPlaced: false,
            revealedSafeCells: 0,
            flagsPlaced: 0,
            incorrectFlagActions: 0,
            result: 'playing',
        }
    }

    newGame(difficulty: MineGridDifficulty = this.state.difficulty): boolean {
        if (this.state.isActive) {
            return false
        }

        const preset = MINE_GRID_PRESETS[difficulty]
        if (!this.setDuration(preset.duration)) {
            return false
        }

        this.config.preset = preset
        this.reset()
        return true
    }

    toggleFlag(row: number, col: number): boolean {
        const cell = this.getCell(row, col)
        if (
            !cell ||
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.result !== 'playing' ||
            cell.revealed
        ) {
            return false
        }

        cell.flagged = !cell.flagged
        if (cell.flagged && this.state.minesPlaced && !cell.hasMine) {
            this.state.incorrectFlagActions++
        }
        this.state.flagsPlaced = findCells(
            this.state.board,
            candidate => candidate.flagged
        ).length
        this.emitStateChange()
        return true
    }

    revealCell(row: number, col: number): boolean {
        const cell = this.getCell(row, col)
        if (
            !cell ||
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.result !== 'playing' ||
            cell.revealed ||
            cell.flagged
        ) {
            return false
        }

        if (!this.state.minesPlaced) {
            placeMines(
                this.state.board,
                this.config.preset.mines,
                { row, col },
                this.config.rng
            )
            this.state.minesPlaced = true
            this.state.incorrectFlagActions += findCells(
                this.state.board,
                candidate => candidate.flagged && !candidate.hasMine
            ).length
        }

        if (cell.hasMine) {
            for (const { value } of findCells(
                this.state.board,
                candidate => candidate.hasMine
            )) {
                value.revealed = true
            }
            this.state.result = 'mine'
            this.emitStateChange()
            void this.end().catch((err: unknown) =>
                console.error('MineGridGame end failed (mine)', err)
            )
            return true
        }

        for (const {
            row: revealRow,
            col: revealCol,
        } of getFloodRevealPositions(this.state.board, row, col)) {
            const revealCell = this.state.board[revealRow][revealCol]
            if (!revealCell.revealed && !revealCell.hasMine) {
                revealCell.revealed = true
                this.state.revealedSafeCells++
            }
        }

        const totalSafeCells = findCells(
            this.state.board,
            candidate => !candidate.hasMine
        ).length
        if (this.state.revealedSafeCells === totalSafeCells) {
            const correctlyFlaggedMines = findCells(
                this.state.board,
                candidate => candidate.flagged && candidate.hasMine
            ).length
            const score = calculateMineGridScore(
                this.config.preset,
                this.state.timeRemaining,
                correctlyFlaggedMines,
                this.state.incorrectFlagActions,
                true
            )
            this.state.result = 'cleared'
            this.addScore(score, 'grid_clear')
            this.emitStateChange()
            void this.end().catch((err: unknown) =>
                console.error('MineGridGame end failed (cleared)', err)
            )
            return true
        }

        this.emitStateChange()
        return true
    }

    update(_deltaTime: number): void {
        // Mine Grid is event-driven.
    }

    render(): void {
        // Rendering is handled by the page.
    }

    cleanup(): void {
        // No external resources to clean up.
    }

    getGameStats(): MineGridStats {
        const timerStatus = this.getTimerStatus()
        const totalSafeCells =
            this.config.preset.rows * this.config.preset.cols -
            this.config.preset.mines
        const cleared = this.state.result === 'cleared'

        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime),
            gameCompleted: cleared,
            difficulty: this.state.difficulty,
            cleared,
            result: this.state.result,
            revealedSafeCells: this.state.revealedSafeCells,
            totalSafeCells,
            flagsPlaced: this.state.flagsPlaced,
            incorrectFlagActions: this.state.incorrectFlagActions,
        }
    }

    protected handleTimeUp(): void {
        this.state.result = 'timeout'
        // If the player never revealed, mines were never placed lazily.
        // Materialize a valid layout first so "all mines are shown" holds
        // (design spec §Gameplay Flow step 8). The safe cell is nominal —
        // no cell is revealed as a first click, we only need mines to exist.
        if (!this.state.minesPlaced) {
            placeMines(
                this.state.board,
                this.config.preset.mines,
                { row: 0, col: 0 },
                this.config.rng
            )
            this.state.minesPlaced = true
            // Mirror the first-reveal path: any cell flagged before mines
            // were materialized that did not become a mine is an incorrect
            // flag (design spec: every pre-flagged safe cell is evaluated
            // immediately after mine placement).
            this.state.incorrectFlagActions += findCells(
                this.state.board,
                candidate => candidate.flagged && !candidate.hasMine
            ).length
        }
        for (const { value } of findCells(
            this.state.board,
            cell => cell.hasMine
        )) {
            value.revealed = true
        }
        this.emitStateChange()
        super.handleTimeUp()
    }

    protected getGameData(): Record<string, unknown> {
        return {
            difficulty: this.state.difficulty,
            cleared: this.state.result === 'cleared',
            revealedSafeCells: this.state.revealedSafeCells,
            incorrectFlagActions: this.state.incorrectFlagActions,
            elapsedSeconds: Math.floor(this.getTimerStatus().elapsedTime),
        }
    }

    protected onGameStart(): void {
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.emitStateChange()
    }

    private getCell(row: number, col: number) {
        if (
            !Number.isInteger(row) ||
            !Number.isInteger(col) ||
            row < 0 ||
            col < 0 ||
            row >= this.state.board.length ||
            col >= this.state.board[row].length
        ) {
            return undefined
        }
        return this.state.board[row][col]
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
