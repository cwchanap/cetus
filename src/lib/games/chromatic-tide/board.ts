import { createGrid, inBounds } from '@/lib/games/shared/grid'
import {
    CHROMATIC_TIDE_PALETTE,
    CHROMATIC_TIDE_RULES,
    type ChromaticTideBoard,
    type ChromaticTideColor,
} from './types'

const ORTHOGONAL_DELTAS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
] as const

function normalizeUnitSample(value: number): number {
    if (!Number.isFinite(value)) {
        return 0
    }
    return Math.min(1 - Number.EPSILON, Math.max(0, value))
}

// JSON deepCloneGrid() is unnecessary in the flood hot path, while cloneGrid()
// would leave mutable cell objects aliased.
function cloneBoard(board: ChromaticTideBoard): ChromaticTideBoard {
    return board.map(row => row.map(cell => ({ ...cell })))
}

function floodOrthogonalTerritory(
    board: ChromaticTideBoard,
    queue: Array<{ row: number; col: number }>,
    territoryColor: ChromaticTideColor
): void {
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
        const { row, col } = queue[queueIndex]
        for (const [rowDelta, colDelta] of ORTHOGONAL_DELTAS) {
            const nextRow = row + rowDelta
            const nextCol = col + colDelta
            if (!inBounds(board, nextRow, nextCol)) {
                continue
            }

            const neighbor = board[nextRow][nextCol]
            if (neighbor.captured || neighbor.color !== territoryColor) {
                continue
            }

            neighbor.captured = true
            queue.push({ row: nextRow, col: nextCol })
        }
    }
}

export function createChromaticTideBoard(
    rng: () => number
): ChromaticTideBoard {
    const board = createGrid(
        CHROMATIC_TIDE_RULES.rows,
        CHROMATIC_TIDE_RULES.cols,
        () => {
            const paletteIndex = Math.floor(
                normalizeUnitSample(rng()) * CHROMATIC_TIDE_PALETTE.length
            )
            return {
                color: CHROMATIC_TIDE_PALETTE[paletteIndex],
                captured: false,
            }
        }
    )

    const topLeftColor = board[0][0].color
    if (board.every(row => row.every(cell => cell.color === topLeftColor))) {
        const currentIndex = CHROMATIC_TIDE_PALETTE.indexOf(topLeftColor)
        board[CHROMATIC_TIDE_RULES.rows - 1][
            CHROMATIC_TIDE_RULES.cols - 1
        ].color =
            CHROMATIC_TIDE_PALETTE[
                (currentIndex + 1) % CHROMATIC_TIDE_PALETTE.length
            ]
    }

    return markInitialTerritory(board)
}

export function markInitialTerritory(
    board: ChromaticTideBoard
): ChromaticTideBoard {
    const result = cloneBoard(board)
    const territoryColor = result[0][0].color
    const queue: Array<{ row: number; col: number }> = [{ row: 0, col: 0 }]
    result[0][0].captured = true
    floodOrthogonalTerritory(result, queue, territoryColor)

    return result
}

export function floodChromaticTideBoard(
    board: ChromaticTideBoard,
    targetColor: ChromaticTideColor
): ChromaticTideBoard {
    const result = cloneBoard(board)
    const queue: Array<{ row: number; col: number }> = []

    for (let row = 0; row < result.length; row++) {
        for (let col = 0; col < result[row].length; col++) {
            if (!result[row][col].captured) {
                continue
            }

            result[row][col].color = targetColor
            queue.push({ row, col })
        }
    }

    floodOrthogonalTerritory(result, queue, targetColor)

    return result
}

export function countCapturedCells(board: ChromaticTideBoard): number {
    let count = 0
    for (const row of board) {
        for (const cell of row) {
            if (cell.captured) {
                count++
            }
        }
    }
    return count
}
