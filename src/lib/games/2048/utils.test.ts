/**
 * Edge-case tests for 2048 utility functions.
 *
 * Note: broad happy-path coverage for these utils already exists in game.test.ts
 * ("2048 Game Utils" describe block). Only unique cases not covered there are added here.
 */
import { describe, it, expect, vi } from 'vitest'
import {
    getTileTextColor,
    cloneBoard,
    createEmptyBoard,
    getRandomEmptyPosition,
    getNewTileValue,
    getCellPixelPosition,
} from './utils'
import { GAME_CONSTANTS, type Tile } from './types'

describe('getTileTextColor', () => {
    it('should return dark color for 512 (not covered in game.test.ts)', () => {
        expect(getTileTextColor(512)).toBe(0x1a1a2e)
    })
})

describe('cloneBoard', () => {
    it('should deep clone mergedFrom tiles', () => {
        const board = createEmptyBoard()
        const tile: Tile = {
            id: 'tile-1',
            value: 4,
            position: { row: 0, col: 0 },
            mergedFrom: [
                { id: 'a', value: 2, position: { row: 0, col: 0 } },
                { id: 'b', value: 2, position: { row: 0, col: 1 } },
            ],
        }
        board[0][0] = tile
        const clone = cloneBoard(board)
        expect(clone[0][0]?.mergedFrom).toHaveLength(2)
        expect(clone[0][0]?.mergedFrom?.[0]).not.toBe(tile.mergedFrom?.[0])
    })
})

describe('getRandomEmptyPosition', () => {
    it('should return the only remaining empty position', () => {
        const board = createEmptyBoard()
        for (let r = 0; r < GAME_CONSTANTS.BOARD_SIZE; r++) {
            for (let c = 0; c < GAME_CONSTANTS.BOARD_SIZE; c++) {
                board[r][c] = {
                    id: `t-${r}-${c}`,
                    value: 2,
                    position: { row: r, col: c },
                }
            }
        }
        board[2][3] = null
        expect(getRandomEmptyPosition(board)).toEqual({ row: 2, col: 3 })
    })
})

describe('getNewTileValue', () => {
    it('should return 2 when Math.random is below spawn threshold', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        expect(getNewTileValue()).toBe(2)
        vi.restoreAllMocks()
    })

    it('should return 4 when Math.random meets or exceeds spawn threshold', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.95)
        expect(getNewTileValue()).toBe(4)
        vi.restoreAllMocks()
    })
})

describe('getCellPixelPosition', () => {
    it('should compute correct pixel coordinates for non-origin position', () => {
        const { TILE_SIZE, GAP } = GAME_CONSTANTS
        const { x, y } = getCellPixelPosition(1, 2)
        expect(x).toBe(2 * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2)
        expect(y).toBe(1 * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2)
    })
})
