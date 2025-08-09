import { BaseGame } from '@/lib/games/core/BaseGame'
import type { GameID } from '@/lib/games'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import {
    JEWEL_TYPES,
    type BejeweledConfig,
    type BejeweledStats,
    type Position,
    type BejeweledAnimator,
    type BejeweledState,
} from './types'
import {
    generateInitialGrid,
    findMatches,
    removeMatches,
    dropJewels,
    refillGrid,
    isAdjacent,
    swap as swapCells,
    cloneGrid,
} from './utils'

export class BejeweledGame extends BaseGame<
    BejeweledState,
    BejeweledConfig,
    BejeweledStats
> {
    private maxCombo: number = 0
    private largestMatch: number = 0
    private totalMatches: number = 0
    private animator?: BejeweledAnimator
    private straightFiveAchieved: boolean = false

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
        this.straightFiveAchieved = false

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
        this.straightFiveAchieved = false
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

    // Renderer bridge
    public setAnimator(animator: BejeweledAnimator): void {
        this.animator = animator
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

        // Attempt swap (animated)
        void this.attemptSwap(a, b)
    }

    private async attemptSwap(a: Position, b: Position): Promise<void> {
        if (this.state.isAnimating) {
            return
        }

        const SWAP_MS = 500
        const CLEAR_MS = 1000

        // Predict if swap will create a match without mutating grid
        const temp = cloneGrid(this.state.grid)
        swapCells(temp, a, b)
        const wouldMatches = findMatches(temp, this.config.minMatch)

        // Block input and animate forward swap
        this.state.isAnimating = true
        this.emitStateChange()
        await this.animator?.animateSwap(a, b, this.getState(), SWAP_MS)

        if (wouldMatches.length === 0) {
            // Invalid move: animate back and restore selection to the second cell
            await this.animator?.animateSwapBack(a, b, this.getState(), SWAP_MS)
            this.state.isAnimating = false
            this.state.selected = b
            this.emitStateChange()
            return
        }

        // Valid move: commit the swap and render
        const grid = this.state.grid
        swapCells(grid, a, b)
        this.state.movesMade += 1
        this.state.selected = null
        this.emitStateChange()

        // Process cascades with clear animations
        let matches = findMatches(grid, this.config.minMatch)
        let currentCombo = 0
        while (matches.length > 0) {
            currentCombo += 1
            this.state.combo = currentCombo
            this.maxCombo = Math.max(this.maxCombo, currentCombo)
            this.totalMatches += matches.length

            // Detect if any match forms a straight line of 5 or more
            if (!this.straightFiveAchieved) {
                for (const m of matches) {
                    if (this.isStraightRunAtLeast(m.positions, 5)) {
                        this.straightFiveAchieved = true
                        break
                    }
                }
            }

            // Animate annihilation effect for all matched cells
            const allCells = matches.flatMap(m => m.positions)
            await this.animator?.animateClear(
                allCells,
                this.getState(),
                CLEAR_MS
            )

            const { removed, largest } = removeMatches(grid, matches)
            this.largestMatch = Math.max(this.largestMatch, largest)

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
            straightFive: this.straightFiveAchieved,
        }
    }

    private isStraightRunAtLeast(positions: Position[], n: number): boolean {
        if (positions.length < n) {
            return false
        }

        // Group by row and check contiguous columns
        const byRow = new Map<number, number[]>()
        for (const p of positions) {
            const arr = byRow.get(p.row) ?? []
            arr.push(p.col)
            byRow.set(p.row, arr)
        }
        for (const cols of byRow.values()) {
            cols.sort((a, b) => a - b)
            let run = 1
            for (let i = 1; i < cols.length; i++) {
                if (cols[i] === cols[i - 1] + 1) {
                    run++
                    if (run >= n) {
                        return true
                    }
                } else {
                    run = 1
                }
            }
        }

        // Group by column and check contiguous rows
        const byCol = new Map<number, number[]>()
        for (const p of positions) {
            const arr = byCol.get(p.col) ?? []
            arr.push(p.row)
            byCol.set(p.col, arr)
        }
        for (const rows of byCol.values()) {
            rows.sort((a, b) => a - b)
            let run = 1
            for (let i = 1; i < rows.length; i++) {
                if (rows[i] === rows[i - 1] + 1) {
                    run++
                    if (run >= n) {
                        return true
                    }
                } else {
                    run = 1
                }
            }
        }

        return false
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
