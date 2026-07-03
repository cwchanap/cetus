// Memory Matrix renderer using the DOMRenderer framework
import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import type { DOMRendererConfig } from '@/lib/games/renderers/RendererFactory'
import type { Card } from './types'
import type { MemoryMatrixState } from './frameworkTypes'
import { formatTime } from './utils'

export class MemoryMatrixRenderer extends DOMRenderer {
    private boardElement: HTMLElement | null = null
    private onCardClick?: (row: number, col: number) => void

    async setup(): Promise<void> {
        await super.setup()
        // The container itself is the board grid where cards are rendered.
        this.boardElement = this.container
    }

    /**
     * Register the callback invoked when an interactive card is clicked.
     */
    setCardClickCallback(callback: (row: number, col: number) => void): void {
        this.onCardClick = callback
    }

    protected renderGame(state: unknown): void {
        if (!this.isMemoryMatrixState(state)) {
            return
        }
        this.renderBoard(state)
        this.updateUI(state)
    }

    private isMemoryMatrixState(state: unknown): state is MemoryMatrixState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as { board?: unknown; needsRedraw?: unknown }
        return Array.isArray(candidate.board) && 'needsRedraw' in candidate
    }

    private renderBoard(state: MemoryMatrixState): void {
        const boardElement = this.boardElement
        if (!boardElement) {
            return
        }
        while (boardElement.firstChild) {
            boardElement.removeChild(boardElement.firstChild)
        }
        state.board.forEach((row, rowIndex) => {
            row.forEach((card, colIndex) => {
                boardElement.appendChild(
                    this.createCardElement(card, rowIndex, colIndex)
                )
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

        if (card.isFlipped || card.isMatched) {
            cardDiv.textContent = card.shape
            cardDiv.style.backgroundColor = card.color
            cardDiv.style.borderColor = card.color
        } else {
            cardDiv.textContent = '?'
        }

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

    private updateUI(state: MemoryMatrixState): void {
        const setText = (id: string, value: string) => {
            const el = document.getElementById(id)
            if (el) {
                el.textContent = value
            }
        }

        setText('game-score', state.score.toString())
        setText('game-pairs', `${state.matchedPairs}/${state.totalPairs}`)
        setText('game-accuracy', `${state.accuracy}%`)
        setText('pairs-found', state.matchesFound.toString())
        setText('total-attempts', state.totalAttempts.toString())

        const timeElement = document.getElementById('game-time')
        if (timeElement) {
            timeElement.textContent = formatTime(state.timeRemaining)
            if (state.timeRemaining <= 10) {
                timeElement.className = 'text-red-400 font-bold'
            } else if (state.timeRemaining <= 30) {
                timeElement.className = 'text-yellow-400'
            } else {
                timeElement.className = 'text-white'
            }
        }

        const timeRemainingElement = document.getElementById('time-remaining')
        if (timeRemainingElement) {
            timeRemainingElement.textContent = `${state.timeRemaining}s`
        }
    }

    cleanup(): void {
        if (this.boardElement) {
            while (this.boardElement.firstChild) {
                this.boardElement.removeChild(this.boardElement.firstChild)
            }
        }
        super.cleanup()
    }
}

export function createMemoryMatrixRendererConfig(): DOMRendererConfig {
    return {
        type: 'dom',
        container: '#memory-board',
        cleanOnRender: false,
    }
}
