// Sudoku renderer using the DOMRenderer framework
import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import type { DOMRendererConfig } from '@/lib/games/renderers/RendererFactory'
import type { SudokuState } from './frameworkTypes'

export class SudokuRenderer extends DOMRenderer {
    private onCellClick?: (row: number, col: number) => void

    async setup(): Promise<void> {
        await super.setup()
    }

    /**
     * Register the callback invoked when an interactive cell is clicked.
     */
    setCellClickCallback(callback: (row: number, col: number) => void): void {
        this.onCellClick = callback
    }

    protected renderGame(state: unknown): void {
        if (!this.isSudokuState(state)) {
            return
        }
        this.renderBoard(state)
    }

    private isSudokuState(state: unknown): state is SudokuState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as { grid?: unknown }
        return 'grid' in candidate
    }

    private renderBoard(state: SudokuState): void {
        const boardElement = this.container
        if (!boardElement) {
            return
        }

        while (boardElement.firstChild) {
            boardElement.removeChild(boardElement.firstChild)
        }

        const wrapper = document.createElement('div')
        wrapper.className =
            'sudoku-game relative w-full h-full flex items-center justify-center p-4'

        const board = document.createElement('div')
        board.className =
            'grid grid-cols-9 gap-1 p-3 bg-black/30 rounded-lg border border-cyan-400/30'
        board.style.width = '416px'
        board.style.height = '416px'

        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                board.appendChild(this.createCellElement(state, row, col))
            }
        }

        wrapper.appendChild(board)

        if (state.isPaused) {
            const pauseOverlay = document.createElement('div')
            pauseOverlay.className =
                'absolute inset-0 bg-black/80 rounded-lg flex items-center justify-center'
            pauseOverlay.innerHTML = `
                <div class="text-center">
                    <h3 class="text-3xl font-orbitron font-bold text-cyan-400 mb-4">PAUSED</h3>
                    <p class="text-gray-400">Press P to resume or click the Resume button</p>
                </div>
            `
            wrapper.appendChild(pauseOverlay)
        }

        boardElement.appendChild(wrapper)
    }

    private createCellElement(
        state: SudokuState,
        row: number,
        col: number
    ): HTMLElement {
        const cell = state.grid.cells[row][col]
        const cellElement = document.createElement('div')

        const cellClasses = [
            'sudoku-cell',
            'flex items-center justify-center',
            'text-lg font-bold font-orbitron',
            'border border-gray-600',
            'cursor-pointer',
            'relative',
            'transition-all duration-200',
            'w-10 h-10',
        ]

        if (cell.isGiven) {
            cellClasses.push('bg-gray-800/50', 'text-cyan-400')
        } else {
            cellClasses.push(
                'bg-black/50',
                'text-white',
                'hover:bg-cyan-900/20'
            )
        }

        if (
            state.grid.selectedCell?.row === row &&
            state.grid.selectedCell?.col === col
        ) {
            cellClasses.push('ring-2', 'ring-cyan-400', 'bg-cyan-900/30')
        } else if (cell.isHighlighted) {
            cellClasses.push('bg-purple-900/20')
        }

        if (cell.isConflicting) {
            cellClasses.push('bg-red-900/50', 'text-red-400', 'border-red-400')
        }

        if (col % 3 === 0 && col !== 0) {
            cellClasses.push('border-l-2', 'border-l-cyan-400/50')
        }
        if (row % 3 === 0 && row !== 0) {
            cellClasses.push('border-t-2', 'border-t-cyan-400/50')
        }

        cellElement.className = cellClasses.join(' ')
        cellElement.dataset.row = row.toString()
        cellElement.dataset.col = col.toString()

        if (cell.value) {
            cellElement.textContent = cell.value.toString()
        }

        cellElement.addEventListener('click', () => {
            this.onCellClick?.(row, col)
        })

        return cellElement
    }

    cleanup(): void {
        if (this.container) {
            while (this.container.firstChild) {
                this.container.removeChild(this.container.firstChild)
            }
        }
        super.cleanup()
    }
}

export function createSudokuRendererConfig(): DOMRendererConfig {
    return {
        type: 'dom',
        container: '#sudoku-container',
        cleanOnRender: false,
    }
}
