import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    hexToPixiColor,
    pixiColorToHex,
    rotateMatrix,
    checkCollision,
    placePiece,
    clearLines,
    drawNextPiece,
} from './utils'
import { GAME_CONSTANTS } from './game'
import type { Piece } from './types'

describe('Tetris Utils', () => {
    describe('hexToPixiColor', () => {
        it('should convert hex color to PIXI color number', () => {
            expect(hexToPixiColor('#ffffff')).toBe(0xffffff)
            expect(hexToPixiColor('#000000')).toBe(0x000000)
            expect(hexToPixiColor('#ff0000')).toBe(0xff0000)
            expect(hexToPixiColor('#00ff00')).toBe(0x00ff00)
            expect(hexToPixiColor('#0000ff')).toBe(0x0000ff)
        })

        it('should handle lowercase hex colors', () => {
            expect(hexToPixiColor('#abcdef')).toBe(0xabcdef)
        })

        it('should handle uppercase hex colors', () => {
            expect(hexToPixiColor('#ABCDEF')).toBe(0xabcdef)
        })
    })

    describe('pixiColorToHex', () => {
        it('should convert PIXI color number to hex string', () => {
            expect(pixiColorToHex(0xffffff)).toBe('#ffffff')
            expect(pixiColorToHex(0x000000)).toBe('#000000')
            expect(pixiColorToHex(0xff0000)).toBe('#ff0000')
            expect(pixiColorToHex(0x00ff00)).toBe('#00ff00')
            expect(pixiColorToHex(0x0000ff)).toBe('#0000ff')
        })

        it('should pad short hex values with zeros', () => {
            expect(pixiColorToHex(0x1)).toBe('#000001')
            expect(pixiColorToHex(0xff)).toBe('#0000ff')
        })
    })

    describe('rotateMatrix', () => {
        it('should rotate 2x2 matrix clockwise', () => {
            const matrix = [
                [1, 2],
                [3, 4],
            ]
            const expected = [
                [3, 1],
                [4, 2],
            ]

            expect(rotateMatrix(matrix)).toEqual(expected)
        })

        it('should rotate 3x3 matrix clockwise', () => {
            const matrix = [
                [1, 2, 3],
                [4, 5, 6],
                [7, 8, 9],
            ]
            const expected = [
                [7, 4, 1],
                [8, 5, 2],
                [9, 6, 3],
            ]

            expect(rotateMatrix(matrix)).toEqual(expected)
        })

        it('should rotate rectangular matrix', () => {
            const matrix = [[1, 2, 3, 4]]
            const expected = [[1], [2], [3], [4]]

            expect(rotateMatrix(matrix)).toEqual(expected)
        })

        it('should handle L-piece rotation', () => {
            const lPiece = [
                [0, 0, 1],
                [1, 1, 1],
            ]
            const rotated = [
                [1, 0],
                [1, 0],
                [1, 1],
            ]

            expect(rotateMatrix(lPiece)).toEqual(rotated)
        })
    })

    describe('checkCollision', () => {
        let board: (number | null)[][]

        beforeEach(() => {
            // Create empty board
            board = Array(GAME_CONSTANTS.BOARD_HEIGHT)
                .fill(null)
                .map(() => Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null))
        })

        it('should detect collision with left boundary', () => {
            const shape = [[1]]
            const result = checkCollision(-1, 0, shape, board, GAME_CONSTANTS)
            expect(result).toBe(true)
        })

        it('should detect collision with right boundary', () => {
            const shape = [[1]]
            const result = checkCollision(
                GAME_CONSTANTS.BOARD_WIDTH,
                0,
                shape,
                board,
                GAME_CONSTANTS
            )
            expect(result).toBe(true)
        })

        it('should detect collision with bottom boundary', () => {
            const shape = [[1]]
            const result = checkCollision(
                0,
                GAME_CONSTANTS.BOARD_HEIGHT,
                shape,
                board,
                GAME_CONSTANTS
            )
            expect(result).toBe(true)
        })

        it('should allow piece above top boundary', () => {
            const shape = [[1]]
            const result = checkCollision(0, -1, shape, board, GAME_CONSTANTS)
            expect(result).toBe(false)
        })

        it('should detect collision with placed pieces', () => {
            const shape = [[1]]
            board[1][1] = 0xff0000 // Place a piece

            const result = checkCollision(1, 1, shape, board, GAME_CONSTANTS)
            expect(result).toBe(true)
        })

        it('should allow placement in empty space', () => {
            const shape = [[1]]
            const result = checkCollision(1, 1, shape, board, GAME_CONSTANTS)
            expect(result).toBe(false)
        })

        it('should handle multi-block pieces', () => {
            const shape = [
                [1, 1],
                [1, 1],
            ]

            // Should fit in empty board
            expect(checkCollision(0, 0, shape, board, GAME_CONSTANTS)).toBe(
                false
            )

            // Should not fit if it would go out of bounds
            expect(
                checkCollision(
                    GAME_CONSTANTS.BOARD_WIDTH - 1,
                    0,
                    shape,
                    board,
                    GAME_CONSTANTS
                )
            ).toBe(true)
        })

        it('should ignore empty cells in piece shape', () => {
            const shape = [
                [0, 1, 0],
                [1, 1, 1],
            ]

            const result = checkCollision(0, 0, shape, board, GAME_CONSTANTS)
            expect(result).toBe(false)
        })
    })

    describe('placePiece', () => {
        let board: (number | null)[][]

        beforeEach(() => {
            board = Array(GAME_CONSTANTS.BOARD_HEIGHT)
                .fill(null)
                .map(() => Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null))
        })

        it('should place piece on board', () => {
            const piece: Piece = {
                type: 'O',
                x: 1,
                y: 1,
                shape: [[1]],
                color: 0xff0000,
            }

            placePiece(piece, board, GAME_CONSTANTS)

            expect(board[1][1]).toBe(0xff0000)
        })

        it('should place multi-block piece', () => {
            const piece: Piece = {
                type: 'O',
                x: 0,
                y: 0,
                shape: [
                    [1, 1],
                    [1, 1],
                ],
                color: 0x00ff00,
            }

            placePiece(piece, board, GAME_CONSTANTS)

            expect(board[0][0]).toBe(0x00ff00)
            expect(board[0][1]).toBe(0x00ff00)
            expect(board[1][0]).toBe(0x00ff00)
            expect(board[1][1]).toBe(0x00ff00)
        })

        it('should ignore empty cells in piece shape', () => {
            const piece: Piece = {
                type: 'T',
                x: 0,
                y: 0,
                shape: [
                    [0, 1, 0],
                    [1, 1, 1],
                ],
                color: 0x0000ff,
            }

            placePiece(piece, board, GAME_CONSTANTS)

            expect(board[0][0]).toBeNull()
            expect(board[0][1]).toBe(0x0000ff)
            expect(board[0][2]).toBeNull()
            expect(board[1][0]).toBe(0x0000ff)
            expect(board[1][1]).toBe(0x0000ff)
            expect(board[1][2]).toBe(0x0000ff)
        })

        it('should not place piece above board boundary', () => {
            const piece: Piece = {
                type: 'O',
                x: 0,
                y: -1,
                shape: [[1]],
                color: 0xff0000,
            }

            placePiece(piece, board, GAME_CONSTANTS)

            // Should not crash and should not place anything
            expect(board[0][0]).toBeNull()
        })
    })

    describe('clearLines', () => {
        let board: (number | null)[][]

        beforeEach(() => {
            board = Array(GAME_CONSTANTS.BOARD_HEIGHT)
                .fill(null)
                .map(() => Array(GAME_CONSTANTS.BOARD_WIDTH).fill(null))
        })

        it('should clear single complete line', () => {
            // Fill bottom row
            for (let col = 0; col < GAME_CONSTANTS.BOARD_WIDTH; col++) {
                board[GAME_CONSTANTS.BOARD_HEIGHT - 1][col] = 0xff0000
            }

            const linesCleared = clearLines(board, GAME_CONSTANTS)

            expect(linesCleared).toBe(1)
            // Bottom row should be empty after clearing
            for (let col = 0; col < GAME_CONSTANTS.BOARD_WIDTH; col++) {
                expect(board[GAME_CONSTANTS.BOARD_HEIGHT - 1][col]).toBeNull()
            }
        })

        it('should clear multiple complete lines', () => {
            // Fill bottom two rows
            for (
                let row = GAME_CONSTANTS.BOARD_HEIGHT - 2;
                row < GAME_CONSTANTS.BOARD_HEIGHT;
                row++
            ) {
                for (let col = 0; col < GAME_CONSTANTS.BOARD_WIDTH; col++) {
                    board[row][col] = 0xff0000
                }
            }

            const linesCleared = clearLines(board, GAME_CONSTANTS)

            expect(linesCleared).toBe(2)
        })

        it('should not clear incomplete lines', () => {
            // Fill bottom row except one cell
            for (let col = 0; col < GAME_CONSTANTS.BOARD_WIDTH - 1; col++) {
                board[GAME_CONSTANTS.BOARD_HEIGHT - 1][col] = 0xff0000
            }

            const linesCleared = clearLines(board, GAME_CONSTANTS)

            expect(linesCleared).toBe(0)
            // Row should still have pieces
            expect(board[GAME_CONSTANTS.BOARD_HEIGHT - 1][0]).toBe(0xff0000)
        })

        it('should preserve pieces above cleared lines', () => {
            // Place piece in middle of board
            board[5][0] = 0x00ff00

            // Fill bottom row
            for (let col = 0; col < GAME_CONSTANTS.BOARD_WIDTH; col++) {
                board[GAME_CONSTANTS.BOARD_HEIGHT - 1][col] = 0xff0000
            }

            clearLines(board, GAME_CONSTANTS)

            // Piece should have moved down
            expect(board[6][0]).toBe(0x00ff00)
            expect(board[5][0]).toBeNull()
        })

        it('should return zero for empty board', () => {
            const linesCleared = clearLines(board, GAME_CONSTANTS)
            expect(linesCleared).toBe(0)
        })
    })

    describe('drawNextPiece', () => {
        let mockCanvas: HTMLCanvasElement
        let mockContext: CanvasRenderingContext2D

        beforeEach(() => {
            mockContext = {
                fillStyle: '',
                strokeStyle: '',
                lineWidth: 0,
                fillRect: vi.fn(),
                strokeRect: vi.fn(),
            } as unknown as CanvasRenderingContext2D

            mockCanvas = {
                width: 120,
                height: 120,
            } as HTMLCanvasElement
        })

        it('should handle null piece', () => {
            drawNextPiece(null, mockContext, mockCanvas)

            // Should not call any drawing methods when piece is null
            expect(mockContext.fillRect).not.toHaveBeenCalled()
        })

        it('should draw piece on canvas', () => {
            const piece: Piece = {
                type: 'O',
                x: 0,
                y: 0,
                shape: [[1]],
                color: 0xff0000,
            }

            drawNextPiece(piece, mockContext, mockCanvas)

            expect(mockContext.fillRect).toHaveBeenCalled()
            expect(mockContext.strokeRect).toHaveBeenCalled()
        })

        it('should set correct fill style for piece color', () => {
            const piece: Piece = {
                type: 'O',
                x: 0,
                y: 0,
                shape: [[1]],
                color: 0xff0000,
            }

            drawNextPiece(piece, mockContext, mockCanvas)

            expect(mockContext.fillStyle).toBe('#ff0000')
        })

        it('should center piece on canvas', () => {
            const piece: Piece = {
                type: 'O',
                x: 0,
                y: 0,
                shape: [
                    [1, 1],
                    [1, 1],
                ],
                color: 0xff0000,
            }

            drawNextPiece(piece, mockContext, mockCanvas)

            // Should call fillRect for each block and strokeRect for borders
            expect(mockContext.fillRect).toHaveBeenCalledTimes(5) // 1 clear + 4 blocks
            expect(mockContext.strokeRect).toHaveBeenCalledTimes(4) // 4 borders
        })
    })
})
