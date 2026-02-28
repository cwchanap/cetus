import type { GameState, Position, GameStats } from './types'
import {
    generateCardPairs,
    createGameBoard,
    cardsMatch,
    calculateFinalScore,
    isGameWon,
    calculateAccuracy,
    CONSTANTS,
} from './utils'

export class MemoryMatrixGame {
    private gameState: GameState
    private gameStats: GameStats
    private timerInterval: number | null = null
    private onStateChange?: (state: GameState, stats: GameStats) => void
    private onGameEnd?: (finalScore: number, stats: GameStats) => void

    constructor() {
        this.gameState = this.createInitialState()
        this.gameStats = this.createInitialStats()
    }

    private createInitialState(): GameState {
        const cards = generateCardPairs()
        const board = createGameBoard(cards)
        const totalPairs = (CONSTANTS.BOARD_ROWS * CONSTANTS.BOARD_COLS) / 2

        return {
            board,
            flippedCards: [],
            matchedPairs: 0,
            totalPairs,
            score: 0,
            timeLeft: CONSTANTS.GAME_DURATION,
            gameOver: false,
            gameWon: false,
            gameStarted: false,
            isProcessing: false,
        }
    }

    private createInitialStats(): GameStats {
        return {
            matchesFound: 0,
            totalAttempts: 0,
            timeElapsed: 0,
            accuracy: 0,
        }
    }

    public setStateChangeCallback(
        callback: (state: GameState, stats: GameStats) => void
    ): void {
        this.onStateChange = callback
    }

    public setGameEndCallback(
        callback: (finalScore: number, stats: GameStats) => void
    ): void {
        this.onGameEnd = callback
    }

    private notifyStateChange(): void {
        this.onStateChange?.(this.gameState, this.gameStats)
    }

    public startGame(): void {
        this.gameState.gameStarted = true
        this.startTimer()
        this.notifyStateChange()
    }

    public resetGame(): void {
        this.stopTimer()
        this.gameState = this.createInitialState()
        this.gameStats = this.createInitialStats()
        this.notifyStateChange()
    }

    private startTimer(): void {
        this.stopTimer()
        this.timerInterval = window.setInterval(() => {
            this.gameState.timeLeft--
            this.gameStats.timeElapsed++

            if (this.gameState.timeLeft <= 0) {
                this.endGame(false)
            } else {
                this.notifyStateChange()
            }
        }, 1000)
    }

    private stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval)
            this.timerInterval = null
        }
    }

    public flipCard(position: Position): boolean {
        if (
            !this.gameState.gameStarted ||
            this.gameState.gameOver ||
            this.gameState.isProcessing ||
            this.gameState.flippedCards.length >= 2
        ) {
            return false
        }

        const card = this.gameState.board[position.row][position.col]

        if (card.isFlipped || card.isMatched) {
            return false
        }

        // Flip the card
        card.isFlipped = true
        this.gameState.flippedCards.push(card)

        // Check if we have two flipped cards
        if (this.gameState.flippedCards.length === 2) {
            this.gameState.isProcessing = true
            this.gameStats.totalAttempts++

            setTimeout(() => {
                this.checkForMatch()
            }, CONSTANTS.FLIP_DELAY)
        }

        this.notifyStateChange()
        return true
    }

    private checkForMatch(): void {
        const [card1, card2] = this.gameState.flippedCards

        if (cardsMatch(card1, card2)) {
            // Cards match!
            card1.isMatched = true
            card2.isMatched = true
            this.gameState.matchedPairs++
            this.gameState.score += CONSTANTS.POINTS_PER_MATCH
            this.gameStats.matchesFound++
        } else {
            // Cards don't match, flip them back
            card1.isFlipped = false
            card2.isFlipped = false
        }

        // Reset flipped cards array
        this.gameState.flippedCards = []
        this.gameState.isProcessing = false

        // Update accuracy
        this.gameStats.accuracy = calculateAccuracy(
            this.gameStats.matchesFound,
            this.gameStats.totalAttempts
        )

        // Check if game is won
        if (isGameWon(this.gameState.board)) {
            this.endGame(true)
        } else {
            this.notifyStateChange()
        }
    }

    private endGame(won: boolean): void {
        this.stopTimer()
        this.gameState.gameOver = true
        this.gameState.gameWon = won

        if (won) {
            const finalScore = calculateFinalScore(
                this.gameState.score,
                this.gameState.timeLeft
            )
            this.gameState.score = finalScore
        }

        this.notifyStateChange()
        this.onGameEnd?.(this.gameState.score, {
            ...this.gameStats,
            gameWon: this.gameState.gameWon,
        })
    }

    public getGameState(): GameState {
        return { ...this.gameState }
    }

    public getGameStats(): GameStats {
        return { ...this.gameStats }
    }

    public endGameEarly(): void {
        this.endGame(false)
    }

    public destroy(): void {
        this.stopTimer()
    }
}
