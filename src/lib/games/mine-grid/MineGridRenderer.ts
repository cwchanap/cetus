import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import type { MineGridCell, MineGridState } from './types'

export type MineGridCellAction = 'primary' | 'flag'
type MineGridCellState = 'hidden' | 'flagged' | 'revealed' | 'mine'

export class MineGridRenderer extends DOMRenderer {
    private onCellAction?: (
        row: number,
        col: number,
        action: MineGridCellAction
    ) => void

    private readonly clickHandler = (event: Event): void => {
        this.dispatchCellEvent(event, 'primary')
    }

    private readonly contextMenuHandler = (event: Event): void => {
        event.preventDefault()
        this.dispatchCellEvent(event, 'flag')
    }

    async setup(): Promise<void> {
        await super.setup()
        this.addEventListener('click', this.clickHandler)
        this.addEventListener('contextmenu', this.contextMenuHandler)
    }

    setCellActionCallback(
        callback: (row: number, col: number, action: MineGridCellAction) => void
    ): void {
        this.onCellAction = callback
    }

    protected override renderGame(state: unknown): void {
        if (!this.isMineGridState(state) || !this.container) {
            return
        }

        const boardElement = this.container
        const activeElement = document.activeElement
        let focusRow: number | null = null
        let focusCol: number | null = null

        if (
            activeElement instanceof Element &&
            boardElement.contains(activeElement)
        ) {
            const focusedButton = activeElement.closest<HTMLButtonElement>(
                'button[data-row][data-col]'
            )
            if (focusedButton) {
                const row = Number(focusedButton.dataset.row)
                const col = Number(focusedButton.dataset.col)
                if (Number.isInteger(row) && Number.isInteger(col)) {
                    focusRow = row
                    focusCol = col
                }
            }
        }

        boardElement.style.gridTemplateColumns = `repeat(${state.board[0]?.length ?? 0}, 1fr)`
        boardElement.style.gridTemplateRows = `repeat(${state.board.length}, 1fr)`
        while (boardElement.firstChild) {
            boardElement.removeChild(boardElement.firstChild)
        }

        state.board.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                boardElement.appendChild(
                    this.createCellButton(cell, rowIndex, colIndex)
                )
            })
        })

        if (focusRow !== null && focusCol !== null) {
            const cellToFocus = boardElement.querySelector<HTMLButtonElement>(
                `button[data-row="${focusRow}"][data-col="${focusCol}"]`
            )
            cellToFocus?.focus()
        }
    }

    private isMineGridState(state: unknown): state is MineGridState {
        return Boolean(
            state &&
                typeof state === 'object' &&
                Array.isArray((state as MineGridState).board)
        )
    }

    private createCellButton(
        cell: MineGridCell,
        row: number,
        col: number
    ): HTMLButtonElement {
        const stateName = this.getCellState(cell)
        const button = document.createElement('button')
        button.type = 'button'
        button.classList.add('mine-grid-cell')
        button.dataset.row = String(row)
        button.dataset.col = String(col)
        button.dataset.state = stateName
        button.setAttribute(
            'aria-label',
            this.getCellLabel(stateName, cell, row, col)
        )
        button.textContent = this.getCellText(stateName, cell)
        return button
    }

    private getCellState(cell: MineGridCell): MineGridCellState {
        if (cell.hasMine && cell.revealed) {
            return 'mine'
        }
        if (cell.flagged) {
            return 'flagged'
        }
        if (cell.revealed) {
            return 'revealed'
        }
        return 'hidden'
    }

    private getCellLabel(
        stateName: MineGridCellState,
        cell: MineGridCell,
        row: number,
        col: number
    ): string {
        const position = `Row ${row + 1}, column ${col + 1}`
        switch (stateName) {
            case 'flagged':
                return `${position}, flagged`
            case 'revealed':
                return `${position}, ${cell.adjacentMines} adjacent mines`
            case 'mine':
                return `${position}, mine`
            default:
                return `${position}, hidden`
        }
    }

    private getCellText(
        stateName: MineGridCellState,
        cell: MineGridCell
    ): string {
        switch (stateName) {
            case 'flagged':
                return '⚑'
            case 'revealed':
                return String(cell.adjacentMines)
            case 'mine':
                return '💣'
            default:
                return ''
        }
    }

    private dispatchCellEvent(event: Event, action: MineGridCellAction): void {
        const target = event.target
        if (!(target instanceof Element) || !this.container) {
            return
        }

        const button = target.closest<HTMLButtonElement>(
            'button[data-row][data-col]'
        )
        if (!button || !this.container.contains(button)) {
            return
        }

        const row = Number(button.dataset.row)
        const col = Number(button.dataset.col)
        if (!Number.isInteger(row) || !Number.isInteger(col)) {
            return
        }

        this.onCellAction?.(row, col, action)
    }

    cleanup(): void {
        this.removeEventListener('click', this.clickHandler)
        this.removeEventListener('contextmenu', this.contextMenuHandler)
        super.cleanup()
    }
}

export function createMineGridRendererConfig() {
    return {
        type: 'dom' as const,
        container: '#mine-grid-board',
        cleanOnRender: false,
    }
}
