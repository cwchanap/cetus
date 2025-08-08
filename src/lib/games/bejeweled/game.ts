import { BaseGame } from '@/lib/games/core/BaseGame'
import type { GameID } from '@/lib/games'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import {
    JEWEL_TYPES,
    type BejeweledConfig,
    type BejeweledState,
    type BejeweledStats,
    type Position,
} from './types'
import {
    generateInitialGrid,
    findMatches,
    removeMatches,
    dropJewels,
    refillGrid,
    isAdjacent,
    swap as swapCells,
} from './utils'

export class BejeweledGame extends BaseGame<
    BejeweledState,
    BejeweledConfig,
    BejeweledStats
> {
    private maxCombo: number = 0
    private largestMatch: number = 0
    private totalMatches: number = 0

    constructor(
        gameId: GameID,
        config: BejeweledConfig,
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        super(
            gameId,
            config,
            callbacks,
            scoringConfig ?? {
                basePoints: config.pointsPerJewel,
                timeBonus: true,
            }
        )
    }

    createInitialState(): BejeweledState {
        const rows = this.config.rows
        const cols = this.config.cols
        const grid = generateInitialGrid(
            rows,
            cols,
            this.config.jewelTypes ?? JEWEL_TYPES,
            this.config.minMatch
        )

        // Reset stats trackers
        this.maxCombo = 0
        this.largestMatch = 0
        this.totalMatches = 0

        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            grid,
            rows,
            cols,
            selected: null,
            combo: 0,
            movesMade: 0,
            isAnimating: false,
        }
    }

    protected onGameStart(): void {
        // Ensure no immediate cascades at start (optional)
        // If there are, it's okay — it creates a fun opening
        this.emitStateChange()
    }

    protected onGameReset(): void {
        // Recreate grid and reset local stat trackers
        const rows = this.config.rows
        const cols = this.config.cols
        this.state.grid = generateInitialGrid(
            rows,
            cols,
            this.config.jewelTypes ?? JEWEL_TYPES,
            this.config.minMatch
        )
        this.state.rows = rows
        this.state.cols = cols
        this.state.selected = null
        this.state.combo = 0
        this.state.movesMade = 0
        this.state.isAnimating = false
        this.maxCombo = 0
        this.largestMatch = 0
        this.totalMatches = 0
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        // No continuous updates required for the basic logic
    }

    render(): void {
        // Rendering handled by the PIXI renderer
    }

    cleanup(): void {
        // Nothing special to cleanup in game logic
    }

    // Public API used by renderer/init
    public clickCell(row: number, col: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isAnimating
        ) {
            return
        }

        const pos: Position = { row, col }

        // First selection
        if (!this.state.selected) {
            this.state.selected = pos
            this.emitStateChange()
            return
        }

        // Clicking same cell deselects
        if (
            this.state.selected.row === row &&
            this.state.selected.col === col
        ) {
            this.state.selected = null
            this.emitStateChange()
            return
        }

        // Second click: attempt swap if adjacent
        const a = this.state.selected
        const b = pos
        if (!isAdjacent(a, b)) {
            // Not adjacent — change selection to the new cell
            this.state.selected = b
            this.emitStateChange()
            return
        }

        // Attempt swap
        this.attemptSwap(a, b)
    }

    private attemptSwap(a: Position, b: Position): void {
        if (this.state.isAnimating) {
            return
        }

        const grid = this.state.grid
        swapCells(grid, a, b)

        let matches = findMatches(grid, this.config.minMatch)

        if (matches.length === 0) {
            // Invalid move, swap back
            swapCells(grid, a, b)
            // Keep selection on the second clicked cell for UX
            this.state.selected = b
            this.emitStateChange()
            return
        }

        // Valid move
        this.state.movesMade += 1
        this.state.isAnimating = true
        this.state.selected = null

        // Process cascades synchronously (no animation yet)
        let currentCombo = 0
        while (matches.length > 0) {
            currentCombo += 1
            this.state.combo = currentCombo
            this.maxCombo = Math.max(this.maxCombo, currentCombo)
            this.totalMatches += matches.length

            const { removed, largest } = removeMatches(grid, matches)
            this.largestMatch = Math.max(this.largestMatch, largest)

            // Scoring: jewels removed * pointsPerJewel * combo multiplier (1x, 2x, 3x...)
            const comboMultiplier = currentCombo
            const points =
                removed * this.config.pointsPerJewel * comboMultiplier
            if (points > 0) {
                this.addScore(points, 'match_clear')
            }

            // Gravity + refill
            dropJewels(grid)
            refillGrid(grid, this.config.jewelTypes ?? JEWEL_TYPES)

            // Find new matches for cascades
            matches = findMatches(grid, this.config.minMatch)
            this.emitStateChange()
        }

        // End of cascade
        this.state.combo = 0
        this.state.isAnimating = false
        this.emitStateChange()
    }

    public getGameStats(): BejeweledStats {
        const timer = this.getTimerStatus()
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timer.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
            movesMade: this.state.movesMade,
            maxCombo: this.maxCombo,
            largestMatch: this.largestMatch,
            totalMatches: this.totalMatches,
        }
    }

    protected getGameData(): Record<string, unknown> {
        const s = this.getGameStats()
        return {
            movesMade: s.movesMade,
            maxCombo: s.maxCombo,
            largestMatch: s.largestMatch,
            totalMatches: s.totalMatches,
        }
    }

    private emitStateChange(): void {
        // Callback for consumers
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        // Event for subscribers
        this.emit('state-change', { state: this.getState() })
    }
}

export default BejeweledGame
