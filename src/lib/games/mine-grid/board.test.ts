import { describe, expect, it } from 'vitest'
import { createGrid, findCells } from '@/lib/games/shared/grid'
import type { MineGridCell } from './types'
import {
    getAdjacentPositions,
    getFloodRevealPositions,
    placeMines,
} from './board'

const zeroRng = () => 0
const makeBoard = (rows: number, cols: number): MineGridCell[][] =>
    createGrid(rows, cols, () => ({
        hasMine: false,
        adjacentMines: 0,
        revealed: false,
        flagged: false,
    }))

describe('Mine Grid board', () => {
    it('places the exact mine count and protects only the first reveal', () => {
        const board = makeBoard(4, 4)
        placeMines(board, 4, { row: 0, col: 0 }, zeroRng)

        expect(findCells(board, cell => cell.hasMine)).toHaveLength(4)
        expect(board[0][0].hasMine).toBe(false)
    })

    it('locks the actual zeroRng Fisher-Yates result and adjacent counts', () => {
        const board = makeBoard(3, 3)
        placeMines(board, 1, { row: 2, col: 2 }, zeroRng)

        expect(board[0][1].hasMine).toBe(true)
        expect(board[2][2].hasMine).toBe(false)
        expect(board[0][0].adjacentMines).toBe(1)
        expect(board[1][1].adjacentMines).toBe(1)
    })

    it('returns all eight in-bounds neighbors around a center cell', () => {
        const board = makeBoard(3, 3)
        expect(getAdjacentPositions(board, 1, 1)).toHaveLength(8)
        expect(getAdjacentPositions(board, 0, 0)).toEqual(
            expect.arrayContaining([
                { row: 0, col: 1 },
                { row: 1, col: 0 },
                { row: 1, col: 1 },
            ])
        )
    })

    it('flood reveals connected zero cells and numbered boundary cells', () => {
        const board = makeBoard(4, 4)
        placeMines(board, 1, { row: 3, col: 3 }, zeroRng)

        const positions = getFloodRevealPositions(board, 3, 3)
        expect(positions).toContainEqual({ row: 3, col: 3 })
        expect(positions.length).toBeGreaterThan(1)
        expect(
            positions.every(({ row, col }) => !board[row][col].hasMine)
        ).toBe(true)
    })

    it('does not flood through a flagged cell', () => {
        const board = makeBoard(3, 3)
        board[1][1].flagged = true

        const positions = getFloodRevealPositions(board, 2, 2)
        expect(positions).not.toContainEqual({ row: 1, col: 1 })
    })
})
