import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/dom'
import {
    createMineGridRendererConfig,
    MineGridRenderer,
} from './MineGridRenderer'
import type { MineGridState } from './types'

function makeState(): MineGridState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        difficulty: 'easy',
        board: [
            [
                {
                    hasMine: false,
                    adjacentMines: 0,
                    revealed: false,
                    flagged: false,
                },
                {
                    hasMine: false,
                    adjacentMines: 0,
                    revealed: false,
                    flagged: true,
                },
            ],
            [
                {
                    hasMine: false,
                    adjacentMines: 2,
                    revealed: true,
                    flagged: false,
                },
                {
                    hasMine: true,
                    adjacentMines: 0,
                    revealed: true,
                    flagged: false,
                },
            ],
        ],
        minesPlaced: true,
        revealedSafeCells: 1,
        flagsPlaced: 1,
        incorrectFlagActions: 0,
        result: 'playing',
    }
}

describe('MineGridRenderer', () => {
    let board: HTMLElement
    let renderer: MineGridRenderer | undefined

    beforeEach(() => {
        board = document.createElement('div')
        board.id = 'mine-grid-board'
        document.body.appendChild(board)
    })

    afterEach(() => {
        renderer?.destroy()
        board.remove()
        vi.restoreAllMocks()
    })

    async function initializeRenderer(): Promise<MineGridRenderer> {
        renderer = new MineGridRenderer(createMineGridRendererConfig())
        await renderer.initialize()
        return renderer
    }

    it('renders one native button per cell with data-row/data-col/data-state', async () => {
        const instance = await initializeRenderer()

        instance.render(makeState())

        const cells = board.querySelectorAll<HTMLButtonElement>(
            'button.mine-grid-cell'
        )
        expect(cells).toHaveLength(4)
        expect(
            Array.from(cells).map(cell => [
                cell.getAttribute('data-row'),
                cell.getAttribute('data-col'),
                cell.getAttribute('data-state'),
                cell.type,
            ])
        ).toEqual([
            ['0', '0', 'hidden', 'button'],
            ['0', '1', 'flagged', 'button'],
            ['1', '0', 'revealed', 'button'],
            ['1', '1', 'mine', 'button'],
        ])
    })

    it('sets grid-template-columns from the board width', async () => {
        const instance = await initializeRenderer()

        instance.render(makeState())

        expect(board.style.gridTemplateColumns).toBe('repeat(2, 1fr)')
    })

    it('renders flagged, numbered, and mine labels/classes', async () => {
        const instance = await initializeRenderer()

        instance.render(makeState())

        const flagged = board.querySelector<HTMLButtonElement>(
            '[data-row="0"][data-col="1"]'
        )
        const numbered = board.querySelector<HTMLButtonElement>(
            '[data-row="1"][data-col="0"]'
        )
        const mine = board.querySelector<HTMLButtonElement>(
            '[data-row="1"][data-col="1"]'
        )

        expect(flagged).toHaveClass('mine-grid-cell')
        expect(flagged).toHaveAttribute(
            'aria-label',
            'Row 1, column 2, flagged'
        )
        expect(numbered).toHaveAttribute(
            'aria-label',
            'Row 2, column 1, 2 adjacent mines'
        )
        expect(numbered).toHaveTextContent('2')
        expect(mine).toHaveAttribute('aria-label', 'Row 2, column 2, mine')
    })

    it('keeps hidden cells keyboard-focusable', async () => {
        const instance = await initializeRenderer()

        instance.render(makeState())

        const hidden = board.querySelector<HTMLButtonElement>(
            '[data-row="0"][data-col="0"]'
        )
        expect(hidden).not.toHaveAttribute('disabled')
        expect(hidden?.disabled).toBe(false)
        expect(hidden?.tabIndex).toBe(0)
    })

    it('restores focused row/column after a re-render', async () => {
        const instance = await initializeRenderer()
        const state = makeState()

        instance.render(state)
        const oldFocusedCell = board.querySelector<HTMLButtonElement>(
            '[data-row="1"][data-col="0"]'
        )
        oldFocusedCell?.focus()
        expect(document.activeElement).toBe(oldFocusedCell)

        instance.render(state)

        const newFocusedCell = board.querySelector<HTMLButtonElement>(
            '[data-row="1"][data-col="0"]'
        )
        expect(newFocusedCell).not.toBe(oldFocusedCell)
        expect(document.activeElement).toBe(newFocusedCell)
    })

    it('delegates primary click through one container listener', async () => {
        const addEventListener = vi.spyOn(board, 'addEventListener')
        const instance = await initializeRenderer()
        const callback = vi.fn()
        instance.setCellActionCallback(callback)

        const buttonAddEventListener = vi.spyOn(
            HTMLButtonElement.prototype,
            'addEventListener'
        )
        instance.render(makeState())
        const cell = board.querySelector<HTMLButtonElement>(
            '[data-row="0"][data-col="0"]'
        )
        fireEvent.click(cell as HTMLButtonElement)

        expect(callback).toHaveBeenCalledWith(0, 0, 'primary')
        expect(
            addEventListener.mock.calls.filter(([type]) => type === 'click')
        ).toHaveLength(1)
        expect(
            addEventListener.mock.calls.filter(
                ([type]) => type === 'contextmenu'
            )
        ).toHaveLength(1)
        expect(buttonAddEventListener).not.toHaveBeenCalled()
    })

    it('delegates contextmenu as flag and prevents the browser menu', async () => {
        const instance = await initializeRenderer()
        const callback = vi.fn()
        instance.setCellActionCallback(callback)
        instance.render(makeState())

        const cell = board.querySelector<HTMLButtonElement>(
            '[data-row="0"][data-col="1"]'
        ) as HTMLButtonElement
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })

        cell.dispatchEvent(event)

        expect(event.defaultPrevented).toBe(true)
        expect(callback).toHaveBeenCalledWith(0, 1, 'flag')
    })

    it('does not dispatch actions for events outside a cell button', async () => {
        const instance = await initializeRenderer()
        const callback = vi.fn()
        instance.setCellActionCallback(callback)
        const outside = document.createElement('span')
        board.appendChild(outside)

        fireEvent.click(outside)
        const contextMenu = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })
        outside.dispatchEvent(contextMenu)

        expect(callback).not.toHaveBeenCalled()
        expect(contextMenu.defaultPrevented).toBe(true)
    })

    it('removes delegated listeners during cleanup', async () => {
        const removeEventListener = vi.spyOn(board, 'removeEventListener')
        const instance = await initializeRenderer()
        const callback = vi.fn()
        instance.setCellActionCallback(callback)

        instance.cleanup()

        expect(
            removeEventListener.mock.calls.filter(([type]) => type === 'click')
        ).toHaveLength(1)
        expect(
            removeEventListener.mock.calls.filter(
                ([type]) => type === 'contextmenu'
            )
        ).toHaveLength(1)

        const cell = document.createElement('button')
        cell.dataset.row = '0'
        cell.dataset.col = '0'
        board.appendChild(cell)
        cell.click()
        expect(callback).not.toHaveBeenCalled()
    })
})
