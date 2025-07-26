import type { GameState, Card, GameStats } from './types'
import { formatTime } from './utils'

export class MemoryMatrixRenderer {
    private container: HTMLElement
    private boardElement: HTMLElement | null = null
    private scoreElement: HTMLElement | null = null
    private timeElement: HTMLElement | null = null
    private statusElement: HTMLElement | null = null
    private onCardClick?: (row: number, col: number) => void

    constructor(containerId: string) {
        const container = document.getElementById(containerId)
        if (!container) {
            throw new Error(`Container with id '${containerId}' not found`)
        }
        this.container = container
        this.setupDOM()
    }

    private setupDOM(): void {
        this.container.innerHTML = `
            <div class="memory-matrix-game">
                <div class="game-board-container relative">
                    <div id="memory-board" class="game-board grid grid-cols-8 gap-2 p-4 bg-black/50 rounded-lg border-2 border-cyan-400/50">
                        <!-- Cards will be rendered here -->
                    </div>
                </div>
            </div>
        `

        this.boardElement = document.getElementById('memory-board')
        this.scoreElement = document.getElementById('score')
        this.timeElement = document.getElementById('time')
        this.statusElement = document.getElementById('status')

        // Setup play again button
        const playAgainBtn = document.getElementById('play-again-btn')
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => {
                this.hideGameOverOverlay()
                // This will be handled by the init function
                window.dispatchEvent(new CustomEvent('memory-matrix-restart'))
            })
        }
    }

    public setCardClickCallback(
        callback: (row: number, col: number) => void
    ): void {
        this.onCardClick = callback
    }

    public render(gameState: GameState, gameStats: GameStats): void {
        this.renderBoard(gameState)
        this.updateUI(gameState, gameStats)
    }

    private renderBoard(gameState: GameState): void {
        if (!this.boardElement) {
            return
        }

        this.boardElement.innerHTML = ''

        gameState.board.forEach((row, rowIndex) => {
            row.forEach((card, colIndex) => {
                const cardElement = this.createCardElement(
                    card,
                    rowIndex,
                    colIndex
                )
                this.boardElement!.appendChild(cardElement)
            })
        })
    }

    private createCardElement(
        card: Card,
        row: number,
        col: number
    ): HTMLElement {
        const cardDiv = document.createElement('div')
        cardDiv.className = `
            memory-card aspect-square flex items-center justify-center text-2xl font-bold rounded-lg cursor-pointer
            transition-all duration-300 border-2 select-none
            ${this.getCardClasses(card)}
        `

        // Set card content
        if (card.isFlipped || card.isMatched) {
            cardDiv.textContent = card.shape
            cardDiv.style.backgroundColor = card.color
            cardDiv.style.borderColor = card.color
        } else {
            cardDiv.textContent = '?'
        }

        // Add click handler
        if (!card.isMatched && !card.isFlipped) {
            cardDiv.addEventListener('click', () => {
                this.onCardClick?.(row, col)
            })
        }

        return cardDiv
    }

    private getCardClasses(card: Card): string {
        if (card.isMatched) {
            return 'bg-green-600 border-green-400 text-white opacity-75 animate-pulse'
        } else if (card.isFlipped) {
            return 'text-white border-cyan-400 shadow-glow-cyan bg-slate-600'
        } else {
            return 'bg-slate-700 border-slate-500 hover:border-cyan-400 hover:shadow-glow-cyan text-slate-400 hover:bg-slate-600'
        }
    }

    private updateUI(gameState: GameState, gameStats: GameStats): void {
        // Update external UI elements if they exist
        if (this.scoreElement) {
            this.scoreElement.textContent = gameState.score.toString()
        }

        if (this.timeElement) {
            this.timeElement.textContent = formatTime(gameState.timeLeft)
        }

        if (this.statusElement) {
            const pairsLeft = gameState.totalPairs - gameState.matchedPairs
            this.statusElement.textContent = `${pairsLeft} pairs remaining`
        }

        // Update other UI elements
        this.updateScoreDisplay(gameState.score)
        this.updateTimeDisplay(gameState.timeLeft)
        this.updatePairsDisplay(gameState.matchedPairs, gameState.totalPairs)
        this.updateAccuracyDisplay(gameStats.accuracy)
        this.updateStatistics(gameStats)

        // Show game over overlay if needed
        if (gameState.gameOver) {
            this.showGameOverOverlay(gameState, gameStats)
        }
    }

    private updateScoreDisplay(score: number): void {
        const scoreElement = document.getElementById('game-score')
        if (scoreElement) {
            scoreElement.textContent = score.toString()
        }
    }

    private updateTimeDisplay(timeLeft: number): void {
        const timeElement = document.getElementById('game-time')
        if (timeElement) {
            timeElement.textContent = formatTime(timeLeft)
            // Change color when time is running low
            if (timeLeft <= 10) {
                timeElement.className = 'text-red-400 font-bold'
            } else if (timeLeft <= 30) {
                timeElement.className = 'text-yellow-400'
            } else {
                timeElement.className = 'text-white'
            }
        }
    }

    private updatePairsDisplay(matched: number, total: number): void {
        const pairsElement = document.getElementById('game-pairs')
        if (pairsElement) {
            pairsElement.textContent = `${matched}/${total}`
        }
    }

    private updateAccuracyDisplay(accuracy: number): void {
        const accuracyElement = document.getElementById('game-accuracy')
        if (accuracyElement) {
            accuracyElement.textContent = `${accuracy}%`
        }
    }

    private updateStatistics(gameStats: GameStats): void {
        // Update pairs found
        const pairsFoundElement = document.getElementById('pairs-found')
        if (pairsFoundElement) {
            pairsFoundElement.textContent = gameStats.matchesFound.toString()
        }

        // Update total attempts
        const totalAttemptsElement = document.getElementById('total-attempts')
        if (totalAttemptsElement) {
            totalAttemptsElement.textContent =
                gameStats.totalAttempts.toString()
        }
    }

    private showGameOverOverlay(
        _gameState: GameState,
        _gameStats: GameStats
    ): void {
        // The overlay is now handled by the page's GameOverlay component
        // This method is kept for compatibility but doesn't need to do anything
        // as the game end logic in the page will handle showing the overlay
    }

    private hideGameOverOverlay(): void {
        // The overlay is now handled by the page's GameOverlay component
        // This method is kept for compatibility
    }

    public destroy(): void {
        // Clean up event listeners and DOM
        this.container.innerHTML = ''
    }
}
