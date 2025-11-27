// 2048 Game Utility Functions

import {
    type Board,
    type GameState,
    type Position,
    GAME_CONSTANTS,
} from './types'

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
    const emptyCells: Position[] = []
    for (let row = 0; row < GAME_CONSTANTS.BOARD_SIZE; row++) {
        for (let col = 0; col < GAME_CONSTANTS.BOARD_SIZE; col++) {
            if (board[row][col] === null) {
                emptyCells.push({ row, col })
            }
        }
    }
    return emptyCells
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
        2: 0x1a1a2e,
        4: 0x16213e,
        8: 0x0f3460,
        16: 0x533483,
        32: 0x7b2cbf,
        64: 0xe94560,
        128: 0xff6b6b,
        256: 0xffd93d,
        512: 0x6bcb77,
        1024: 0x4d96ff,
        2048: 0x00ffff,
    }
    // For values > 2048, use magenta (legendary)
    return colors[value] ?? 0xff00ff
}

/**
 * Get tile text color based on value (hex format for PixiJS)
 */
export function getTileTextColor(value: number): number {
    // Dark text for light backgrounds (128, 256, 512, 2048)
    const darkTextValues = [128, 256, 512, 2048]
    if (darkTextValues.includes(value)) {
        return 0x1a1a2e
    }
    // Cyan text for dark backgrounds (2, 4)
    if (value <= 4) {
        return 0x00ffff
    }
    // White text for everything else
    return 0xffffff
}

/**
 * Get font size based on tile value (for large numbers)
 */
export function getTileFontSize(value: number): number {
    if (value < 100) {
        return 36
    }
    if (value < 1000) {
        return 30
    }
    if (value < 10000) {
        return 24
    }
    return 20
}

/**
 * Create a deep copy of the board
 */
export function cloneBoard(board: Board): Board {
    return board.map(row =>
        row.map(tile =>
            tile
                ? {
                      ...tile,
                      position: { ...tile.position },
                      mergedFrom: tile.mergedFrom
                          ? tile.mergedFrom.map(t => ({
                                ...t,
                                position: { ...t.position },
                            }))
                          : undefined,
                  }
                : null
        )
    )
}

/**
 * Create an empty board
 */
export function createEmptyBoard(): Board {
    const board: Board = []
    for (let row = 0; row < GAME_CONSTANTS.BOARD_SIZE; row++) {
        board.push(new Array(GAME_CONSTANTS.BOARD_SIZE).fill(null))
    }
    return board
}

/**
 * Get a random empty position on the board
 */
export function getRandomEmptyPosition(board: Board): Position | null {
    const emptyCells = getEmptyCells(board)
    if (emptyCells.length === 0) {
        return null
    }
    return emptyCells[Math.floor(Math.random() * emptyCells.length)]
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
