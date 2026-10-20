import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    ChromaticTideRenderer,
    createChromaticTideRendererConfig,
} from './ChromaticTideRenderer'
import type { ChromaticTideState } from './types'

function makeState(): ChromaticTideState {
    return {
        score: 0,
        timeRemaining: 90,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        outcome: 'playing',
        territoryColor: 'teal',
        movesUsed: 0,
        capturedCells: 2,
        initialCapturedCells: 2,
        board: [
            [
                { color: 'teal', captured: true },
                { color: 'amber', captured: false },
                { color: 'magenta', captured: false },
            ],
            [
                { color: 'ice', captured: true },
                { color: 'green', captured: false },
            ],
        ],
    }
}

describe('ChromaticTideRenderer', () => {
    let board: HTMLElement
    let renderer: ChromaticTideRenderer | undefined

    beforeEach(() => {
        board = document.createElement('div')
        board.id = 'chromatic-tide-board'
        document.body.appendChild(board)
    })

    afterEach(() => {
        renderer?.destroy()
        board.remove()
    })

    async function initializeRenderer(): Promise<ChromaticTideRenderer> {
        renderer = new ChromaticTideRenderer(
            createChromaticTideRendererConfig()
        )
        await renderer.initialize()
        return renderer
    }

    it('renders one plain numbered cell per board cell with state data attributes', async () => {
        const instance = await initializeRenderer()

        instance.render(makeState())

        const cells = board.querySelectorAll<HTMLElement>(
            '.chromatic-tide-cell'
        )
        expect(cells).toHaveLength(5)
        expect(
            Array.from(cells).map(cell => [
                cell.tagName,
                cell.dataset.row,
                cell.dataset.col,
                cell.dataset.color,
                cell.dataset.captured,
                cell.textContent,
            ])
        ).toEqual([
            ['DIV', '0', '0', 'teal', 'true', '1'],
            ['DIV', '0', '1', 'amber', 'false', '2'],
            ['DIV', '0', '2', 'magenta', 'false', '3'],
            ['DIV', '1', '0', 'ice', 'true', '4'],
            ['DIV', '1', '1', 'green', 'false', '5'],
        ])
        expect(board.style.gridTemplateColumns).toBe('repeat(3, 1fr)')
        expect(board.style.gridTemplateRows).toBe('repeat(2, 1fr)')
    })

    it('does not expose fake gridcell semantics or verbose labels', async () => {
        const instance = await initializeRenderer()

        instance.render(makeState())

        for (const cell of board.querySelectorAll('.chromatic-tide-cell')) {
            expect(cell).not.toHaveAttribute('role')
            expect(cell).not.toHaveAttribute('aria-label')
        }
        expect(board.querySelector('[role="gridcell"]')).toBeNull()
    })

    it('replaces children and reflects changed state on rerender', async () => {
        const instance = await initializeRenderer()
        const state = makeState()
        instance.render(state)
        const firstCell = board.firstElementChild

        state.board = [[{ color: 'green', captured: true }]]
        state.territoryColor = 'green'
        state.capturedCells = 1
        instance.render(state)

        expect(board.children).toHaveLength(1)
        expect(board.firstElementChild).not.toBe(firstCell)
        expect(board.firstElementChild).toHaveAttribute('data-color', 'green')
        expect(board.firstElementChild).toHaveAttribute('data-captured', 'true')
        expect(board.firstElementChild).toHaveTextContent('5')
        expect(board.style.gridTemplateColumns).toBe('repeat(1, 1fr)')
        expect(board.style.gridTemplateRows).toBe('repeat(1, 1fr)')
    })

    it('empties the board during cleanup', async () => {
        const instance = await initializeRenderer()
        instance.render(makeState())

        instance.cleanup()

        expect(board).toBeEmptyDOMElement()
    })
})
