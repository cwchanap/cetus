// 2048 Game Utility Functions

import {
    type Board,
    type GameState,
    type Position,
    GAME_CONSTANTS,
} from './types'
import { randomElement } from '../shared/utils'
import { createGrid, findCells, deepCloneGrid } from '../shared/grid'

/**
 * Generate a unique tile ID
 */
export function generateTileId(state: GameState): string {
    return `tile-${state.tileIdCounter}`
}

/**
 * Get all empty cells on the board
 */
export function getEmptyCells(board: Board): Position[] {
    return findCells(board, v => v === null).map(({ row, col }) => ({
        row,
        col,
    }))
}

/**
 * Check if any valid moves remain on the board
 */
export function canMove(board: Board): boolean {
    const size = GAME_CONSTANTS.BOARD_SIZE

    // Check for empty cells
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (board[row][col] === null) {
                return true
            }
        }
    }

    // Check for adjacent matching tiles (horizontal)
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size - 1; col++) {
            const current = board[row][col]
            const next = board[row][col + 1]
            if (current && next && current.value === next.value) {
                return true
            }
        }
    }

    // Check for adjacent matching tiles (vertical)
    for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size; col++) {
            const current = board[row][col]
            const next = board[row + 1][col]
            if (current && next && current.value === next.value) {
                return true
            }
        }
    }

    return false
}

/**
 * Get the maximum tile value on the board
 */
export function getMaxTile(board: Board): number {
    let maxValue = 0
    for (let row = 0; row < GAME_CONSTANTS.BOARD_SIZE; row++) {
        for (let col = 0; col < GAME_CONSTANTS.BOARD_SIZE; col++) {
            const tile = board[row][col]
            if (tile && tile.value > maxValue) {
                maxValue = tile.value
            }
        }
    }
    return maxValue
}

/**
 * Get tile color based on value (hex format for PixiJS)
 */
export function getTileColor(value: number): number {
    const colors: Record<number, number> = {
        2: 0x12222e,
        4: 0x16323e,
        8: 0x0f4c4c,
        16: 0x127063,
        32: 0x1aa88f,
        64: 0x22f5d0,
        128: 0x6fe3ff,
        256: 0xb8f1ff,
        512: 0xffc24a,
        1024: 0xff9a3d,
        2048: 0xff3d8a,
    }
    return colors[value] ?? 0xeaf6ff
}

/**
 * Get tile text color based on value (hex format for PixiJS)
 */
export function getTileTextColor(value: number): number {
    return value === 2 ? 0xa7b4bd : value < 32 ? 0xeaf6ff : 0x04060a
}

/**
 * Get font size based on tile value (for large numbers)
 */
export function getTileFontSize(
    value: number,
    size = GAME_CONSTANTS.TILE_SIZE
): number {
    return Math.round(
        size *
            (value < 100
                ? 0.46
                : value < 1000
                  ? 0.38
                  : value < 10000
                    ? 0.3
                    : 0.24)
    )
}

/**
 * Create a deep copy of the board
 */
export function cloneBoard(board: Board): Board {
    return deepCloneGrid(board)
}

/**
 * Create an empty board
 */
export function createEmptyBoard(): Board {
    return createGrid(
        GAME_CONSTANTS.BOARD_SIZE,
        GAME_CONSTANTS.BOARD_SIZE,
        null
    )
}

/**
 * Get a random empty position on the board
 */
export function getRandomEmptyPosition(board: Board): Position | null {
    const emptyCells = getEmptyCells(board)
    if (emptyCells.length === 0) {
        return null
    }
    return randomElement(emptyCells) ?? null
}

/**
 * Determine if a new tile should be a 2 or a 4
 * 90% chance of 2, 10% chance of 4
 */
export function getNewTileValue(): number {
    return Math.random() < GAME_CONSTANTS.SPAWN_2_PROBABILITY ? 2 : 4
}

/**
 * Get board cell position in pixels (for rendering)
 */
export function getCellPixelPosition(
    row: number,
    col: number
): { x: number; y: number } {
    const { TILE_SIZE, GAP } = GAME_CONSTANTS
    return {
        x: col * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2,
        y: row * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2,
    }
}
