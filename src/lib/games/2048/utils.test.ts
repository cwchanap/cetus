import { describe, it, expect, vi } from 'vitest'
import {
    generateTileId,
    getEmptyCells,
    canMove,
    getMaxTile,
    getTileColor,
    getTileTextColor,
    getTileFontSize,
    cloneBoard,
    createEmptyBoard,
    getRandomEmptyPosition,
    getNewTileValue,
    getCellPixelPosition,
} from './utils'
import { GAME_CONSTANTS, type Board, type GameState, type Tile } from './types'

// Helper to create a tile
function makeTile(value: number, row: number, col: number): Tile {
    return { id: `tile-${row}-${col}`, value, position: { row, col } }
}

// Helper to create an empty board
function emptyBoard(): Board {
    return Array.from({ length: GAME_CONSTANTS.BOARD_SIZE }, () =>
        new Array(GAME_CONSTANTS.BOARD_SIZE).fill(null)
    )
}

describe('generateTileId', () => {
    it('should return tile id with counter', () => {
        const state = { tileIdCounter: 5 } as GameState
        expect(generateTileId(state)).toBe('tile-5')
    })
})

describe('getEmptyCells', () => {
    it('should return all cells for an empty board', () => {
        const board = emptyBoard()
        const empty = getEmptyCells(board)
        expect(empty).toHaveLength(16)
    })

    it('should return no cells for a full board', () => {
        const board = emptyBoard()
        for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
            for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                board[r][c] = makeTile(2, r, c)
            }
        }
        expect(getEmptyCells(board)).toHaveLength(0)
    })

    it('should return only empty cells', () => {
        const board = emptyBoard()
        board[0][0] = makeTile(2, 0, 0)
        board[1][1] = makeTile(4, 1, 1)
        const empty = getEmptyCells(board)
        expect(empty).toHaveLength(14)
        // Check none of the empty positions are the occupied ones
        const occupied = empty.find(
            p => (p.row === 0 && p.col === 0) || (p.row === 1 && p.col === 1)
        )
        expect(occupied).toBeUndefined()
    })
})

describe('canMove', () => {
    it('should return true for an empty board', () => {
        expect(canMove(emptyBoard())).toBe(true)
    })

    it('should return false for a full board with no matching adjacent tiles', () => {
        // Build a checkerboard-like board where no adjacent values match
        const values = [
            [2, 4, 2, 4],
            [4, 2, 4, 2],
            [2, 4, 2, 4],
            [4, 2, 4, 2],
        ]
        const board = emptyBoard()
        for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
            for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                board[r][c] = makeTile(values[r][c], r, c)
            }
        }
        expect(canMove(board)).toBe(false)
    })

    it('should return true when there is a horizontal match', () => {
        const board = emptyBoard()
        // Fill all cells with distinct values
        let val = 2
        for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
            for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                board[r][c] = makeTile(val, r, c)
                val *= 2
            }
        }
        // Create a horizontal match in row 0
        board[0][0] = makeTile(16, 0, 0)
        board[0][1] = makeTile(16, 0, 1)
        expect(canMove(board)).toBe(true)
    })

    it('should return true when there is a vertical match', () => {
        const board = emptyBoard()
        let val = 2
        for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
            for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                board[r][c] = makeTile(val, r, c)
                val *= 2
            }
        }
        // Create a vertical match in column 0
        board[0][0] = makeTile(32, 0, 0)
        board[1][0] = makeTile(32, 1, 0)
        expect(canMove(board)).toBe(true)
    })
})

describe('getMaxTile', () => {
    it('should return 0 for empty board', () => {
        expect(getMaxTile(emptyBoard())).toBe(0)
    })

    it('should return the highest tile value', () => {
        const board = emptyBoard()
        board[0][0] = makeTile(128, 0, 0)
        board[1][2] = makeTile(2048, 1, 2)
        board[3][3] = makeTile(512, 3, 3)
        expect(getMaxTile(board)).toBe(2048)
    })
})

describe('getTileColor', () => {
    it('should return known colors for defined tile values', () => {
        expect(getTileColor(2)).toBe(0x1a1a2e)
        expect(getTileColor(4)).toBe(0x16213e)
        expect(getTileColor(2048)).toBe(0x00ffff)
    })

    it('should return magenta for unknown/large values', () => {
        expect(getTileColor(4096)).toBe(0xff00ff)
        expect(getTileColor(99999)).toBe(0xff00ff)
    })
})

describe('getTileTextColor', () => {
    it('should return dark color for values 128, 256, 512, 2048', () => {
        for (const v of [128, 256, 512, 2048]) {
            expect(getTileTextColor(v)).toBe(0x1a1a2e)
        }
    })

    it('should return cyan for values <= 4', () => {
        expect(getTileTextColor(2)).toBe(0x00ffff)
        expect(getTileTextColor(4)).toBe(0x00ffff)
    })

    it('should return white for other values', () => {
        expect(getTileTextColor(8)).toBe(0xffffff)
        expect(getTileTextColor(64)).toBe(0xffffff)
        expect(getTileTextColor(1024)).toBe(0xffffff)
    })
})

describe('getTileFontSize', () => {
    it('should return 36 for values < 100', () => {
        expect(getTileFontSize(2)).toBe(36)
        expect(getTileFontSize(64)).toBe(36)
    })

    it('should return 30 for values 100-999', () => {
        expect(getTileFontSize(128)).toBe(30)
        expect(getTileFontSize(512)).toBe(30)
    })

    it('should return 24 for values 1000-9999', () => {
        expect(getTileFontSize(1024)).toBe(24)
        expect(getTileFontSize(2048)).toBe(24)
    })

    it('should return 20 for values >= 10000', () => {
        expect(getTileFontSize(16384)).toBe(20)
    })
})

describe('cloneBoard', () => {
    it('should return a deep copy of the board', () => {
        const board = emptyBoard()
        board[0][0] = makeTile(2, 0, 0)
        const clone = cloneBoard(board)
        expect(clone[0][0]).toEqual(board[0][0])
        expect(clone[0][0]).not.toBe(board[0][0])
    })

    it('should preserve null cells', () => {
        const board = emptyBoard()
        const clone = cloneBoard(board)
        expect(clone[0][0]).toBeNull()
    })

    it('should deep clone mergedFrom tiles', () => {
        const board = emptyBoard()
        const tile: Tile = {
            id: 'tile-1',
            value: 4,
            position: { row: 0, col: 0 },
            mergedFrom: [makeTile(2, 0, 0), makeTile(2, 0, 1)],
        }
        board[0][0] = tile
        const clone = cloneBoard(board)
        expect(clone[0][0]?.mergedFrom).toHaveLength(2)
        expect(clone[0][0]?.mergedFrom?.[0]).not.toBe(tile.mergedFrom?.[0])
    })
})

describe('createEmptyBoard', () => {
    it('should create a 4x4 board of nulls', () => {
        const board = createEmptyBoard()
        expect(board).toHaveLength(GAME_CONSTANTS.BOARD_SIZE)
        for (const row of board) {
            expect(row).toHaveLength(GAME_CONSTANTS.BOARD_SIZE)
            for (const cell of row) {
                expect(cell).toBeNull()
            }
        }
    })
})

describe('getRandomEmptyPosition', () => {
    it('should return null for a full board', () => {
        const board = emptyBoard()
        for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
            for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                board[r][c] = makeTile(2, r, c)
            }
        }
        expect(getRandomEmptyPosition(board)).toBeNull()
    })

    it('should return a position for a board with empty cells', () => {
        const board = emptyBoard()
        const pos = getRandomEmptyPosition(board)
        expect(pos).not.toBeNull()
        expect(pos?.row).toBeGreaterThanOrEqual(0)
        expect(pos?.col).toBeGreaterThanOrEqual(0)
    })

    it('should return the only empty position when only one is left', () => {
        const board = emptyBoard()
        for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
            for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                board[r][c] = makeTile(2, r, c)
            }
        }
        board[2][3] = null
        const pos = getRandomEmptyPosition(board)
        expect(pos).toEqual({ row: 2, col: 3 })
    })
})

describe('getNewTileValue', () => {
    it('should return 2 or 4', () => {
        for (let i = 0; i < 20; i++) {
            const val = getNewTileValue()
            expect([2, 4]).toContain(val)
        }
    })

    it('should return 2 approximately 90% of the time', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5) // < 0.9 → returns 2
        expect(getNewTileValue()).toBe(2)
        vi.spyOn(Math, 'random').mockReturnValue(0.95) // >= 0.9 → returns 4
        expect(getNewTileValue()).toBe(4)
        vi.restoreAllMocks()
    })
})

describe('getCellPixelPosition', () => {
    it('should calculate correct pixel position for (0, 0)', () => {
        const { x, y } = getCellPixelPosition(0, 0)
        const { TILE_SIZE, GAP } = GAME_CONSTANTS
        expect(x).toBe(GAP + TILE_SIZE / 2)
        expect(y).toBe(GAP + TILE_SIZE / 2)
    })

    it('should calculate correct pixel position for (1, 2)', () => {
        const { x, y } = getCellPixelPosition(1, 2)
        const { TILE_SIZE, GAP } = GAME_CONSTANTS
        expect(x).toBe(2 * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2)
        expect(y).toBe(1 * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2)
    })
})
