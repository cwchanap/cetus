import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import {
    CHROMATIC_TIDE_PALETTE,
    type ChromaticTideCell,
    type ChromaticTideState,
} from './types'

export class ChromaticTideRenderer extends DOMRenderer {
    protected override renderGame(state: unknown): void {
        if (!this.isChromaticTideState(state) || !this.container) {
            return
        }

        this.container.style.gridTemplateColumns = `repeat(${state.board[0]?.length ?? 0}, 1fr)`
        this.container.style.gridTemplateRows = `repeat(${state.board.length}, 1fr)`
        this.clearContainer()

        state.board.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                this.container?.appendChild(
                    this.createCell(cell, rowIndex, colIndex)
                )
            })
        })
    }

    private isChromaticTideState(state: unknown): state is ChromaticTideState {
        return Boolean(
            state &&
                typeof state === 'object' &&
                Array.isArray((state as ChromaticTideState).board)
        )
    }

    private createCell(
        cell: ChromaticTideCell,
        row: number,
        col: number
    ): HTMLDivElement {
        const element = document.createElement('div')
        element.classList.add('chromatic-tide-cell')
        element.dataset.row = String(row)
        element.dataset.col = String(col)
        element.dataset.color = cell.color
        element.dataset.captured = String(cell.captured)
        element.textContent = String(
            CHROMATIC_TIDE_PALETTE.indexOf(cell.color) + 1
        )
        return element
    }
}

export function createChromaticTideRendererConfig() {
    return {
        type: 'dom' as const,
        container: '#chromatic-tide-board',
        cleanOnRender: false,
    }
}
