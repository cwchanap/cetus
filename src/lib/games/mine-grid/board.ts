import { findCells, inBounds } from '@/lib/games/shared/grid'
import type { GridPosition, MineGridCell } from './types'

export function getAdjacentPositions(
    board: MineGridCell[][],
    row: number,
    col: number
): GridPosition[] {
    const positions: GridPosition[] = []
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) {
                continue
            }
            const nextRow = row + dr
            const nextCol = col + dc
            if (inBounds(board, nextRow, nextCol)) {
                positions.push({ row: nextRow, col: nextCol })
            }
        }
    }
    return positions
}

export function placeMines(
    board: MineGridCell[][],
    mineCount: number,
    safeCell: GridPosition,
    rng: () => number = Math.random
): void {
    const candidates = findCells(
        board,
        (_cell, row, col) => row !== safeCell.row || col !== safeCell.col
    ).map(({ row, col }) => ({ row, col }))

    if (mineCount < 0 || mineCount > candidates.length) {
        throw new RangeError('Invalid Mine Grid mine count')
    }

    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }

    for (const { row, col } of candidates.slice(0, mineCount)) {
        board[row][col].hasMine = true
    }

    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
            if (board[row][col].hasMine) {
                continue
            }
            board[row][col].adjacentMines = getAdjacentPositions(
                board,
                row,
                col
            ).filter(({ row: r, col: c }) => board[r][c].hasMine).length
        }
    }
}

export function getFloodRevealPositions(
    board: MineGridCell[][],
    row: number,
    col: number
): GridPosition[] {
    const start = board[row]?.[col]
    if (!start || start.hasMine || start.flagged) {
        return []
    }

    const queue: GridPosition[] = [{ row, col }]
    const seen = new Set<string>()
    const result: GridPosition[] = []
    let cursor = 0

    while (cursor < queue.length) {
        const current = queue[cursor++]
        const key = `${current.row},${current.col}`
        if (seen.has(key)) {
            continue
        }
        seen.add(key)

        const cell = board[current.row][current.col]
        if (cell.hasMine || cell.flagged) {
            continue
        }
        result.push(current)

        if (cell.adjacentMines === 0) {
            queue.push(...getAdjacentPositions(board, current.row, current.col))
        }
    }

    return result
}
