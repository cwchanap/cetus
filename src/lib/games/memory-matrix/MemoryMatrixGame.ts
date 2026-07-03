// Memory Matrix game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type { Position, Card } from './types'
import type {
    MemoryMatrixState,
    MemoryMatrixConfig,
    MemoryMatrixStats,
} from './frameworkTypes'
import {
    generateCardPairs,
    createGameBoard,
    cardsMatch,
    isGameWon,
    calculateAccuracy,
    CONSTANTS,
} from './utils'

// Default configuration for the Memory Matrix game
export const DEFAULT_MEMORY_MATRIX_CONFIG: MemoryMatrixConfig = {
    // BaseGameConfig
    duration: CONSTANTS.GAME_DURATION,
    achievementIntegration: true,
    pausable: false,
    resettable: true,
    // MemoryMatrixConfig
    boardRows: CONSTANTS.BOARD_ROWS,
    boardCols: CONSTANTS.BOARD_COLS,
    flipDelay: CONSTANTS.FLIP_DELAY,
    pointsPerMatch: CONSTANTS.POINTS_PER_MATCH,
}

export class MemoryMatrixGame extends BaseGame<
    MemoryMatrixState,
    MemoryMatrixConfig,
    MemoryMatrixStats
> {
    private matchTimeoutId: number | null = null

    constructor(
        config: Partial<MemoryMatrixConfig> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: MemoryMatrixConfig = {
            ...DEFAULT_MEMORY_MATRIX_CONFIG,
            ...config,
        }
        super(
            GameID.MEMORY_MATRIX,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                // Time bonus is applied manually on win (see checkForMatch) to
                // preserve legacy scoring, which only awards it on victory.
                timeBonus: false,
            }
        )
    }

    createInitialState(): MemoryMatrixState {
        const cards = generateCardPairs(
            this.config.boardRows,
            this.config.boardCols
        )
        const board = createGameBoard(
            cards,
            this.config.boardRows,
            this.config.boardCols
        )
        const totalPairs = (this.config.boardRows * this.config.boardCols) / 2

        return {
            // BaseGameState fields
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            // MemoryMatrixState fields
            board,
            flippedCards: [],
            matchedPairs: 0,
            totalPairs,
            isProcessing: false,
            gameWon: false,
            needsRedraw: true,
            totalAttempts: 0,
            matchesFound: 0,
            accuracy: 0,
        }
    }

    protected onGameStart(): void {
        this.state.needsRedraw = true
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        // Game logic is event-driven (card clicks + timer)
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        if (this.matchTimeoutId !== null) {
            clearTimeout(this.matchTimeoutId)
            this.matchTimeoutId = null
        }
    }

    getGameStats(): MemoryMatrixStats {
        const timerStatus = this.getTimerStatus()
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
            matchesFound: this.state.matchesFound,
            totalAttempts: this.state.totalAttempts,
            accuracy: this.state.accuracy,
            gameWon: this.state.gameWon,
        }
    }

    protected getGameData(): Record<string, unknown> {
        // GameData contract established in Task 3.2:
        // { matchesFound, moves, perfectGame }
        return {
            matchesFound: this.state.matchesFound,
            moves: this.state.totalAttempts,
            perfectGame: this.state.accuracy === 100,
        }
    }

    // --- Memory Matrix-specific public API ---

    /**
     * Attempt to flip a card at the given position.
     * Returns true if the flip was accepted.
     */
    flipCard(position: Position): boolean {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.isProcessing ||
            this.state.flippedCards.length >= 2
        ) {
            return false
        }

        const card = this.state.board[position.row]?.[position.col]
        if (!card || card.isFlipped || card.isMatched) {
            return false
        }

        card.isFlipped = true
        this.state.flippedCards.push(card)

        if (this.state.flippedCards.length === 2) {
            this.state.isProcessing = true
            this.state.totalAttempts++
            this.matchTimeoutId = window.setTimeout(() => {
                this.checkForMatch()
            }, this.config.flipDelay)
        }

        this.state.needsRedraw = true
        this.emitStateChange()
        return true
    }

    getConfig(): MemoryMatrixConfig {
        return { ...this.config }
    }

    getBoard(): Card[][] {
        return this.state.board
    }

    markRendered(): void {
        this.state.needsRedraw = false
    }

    // --- Private game logic ---

    private checkForMatch(): void {
        this.matchTimeoutId = null
        const [card1, card2] = this.state.flippedCards

        if (cardsMatch(card1, card2)) {
            card1.isMatched = true
            card2.isMatched = true
            this.state.matchedPairs++
            this.state.matchesFound++
            this.addScore(this.config.pointsPerMatch, 'match')
        } else {
            card1.isFlipped = false
            card2.isFlipped = false
        }

        this.state.flippedCards = []
        this.state.isProcessing = false
        this.state.accuracy = calculateAccuracy(
            this.state.matchesFound,
            this.state.totalAttempts
        )
        this.state.needsRedraw = true

        if (isGameWon(this.state.board)) {
            this.state.gameWon = true
            // Apply time bonus only on a win (legacy behavior)
            this.addScore(
                this.state.timeRemaining * CONSTANTS.TIME_BONUS_MULTIPLIER,
                'time_bonus'
            )
            void this.end()
        } else {
            this.emitStateChange()
        }
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}

export default MemoryMatrixGame
