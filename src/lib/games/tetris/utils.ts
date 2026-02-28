// Utility functions for Tetris game
import type { Piece, GameConstants } from './types'

export function hexToPixiColor(hex: string): number {
    return parseInt(hex.replace('#', ''), 16)
}

export function pixiColorToHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`
}

export function rotateMatrix(matrix: number[][]): number[][] {
    const rows = matrix.length
    const cols = matrix[0].length
    const rotated = Array(cols)
        .fill(null)
        .map(() => Array(rows).fill(0))

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            rotated[j][rows - 1 - i] = matrix[i][j]
        }
    }

    return rotated
}

export function checkCollision(
    x: number,
    y: number,
    shape: number[][],
    board: (number | null)[][],
    constants: GameConstants
): boolean {
    for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
            if (shape[row][col]) {
                const newX = x + col
                const newY = y + row

                // Check boundaries
                if (
                    newX < 0 ||
                    newX >= constants.BOARD_WIDTH ||
                    newY >= constants.BOARD_HEIGHT
                ) {
                    return true
                }

                // Check collision with placed pieces
                if (newY >= 0 && board[newY][newX]) {
                    return true
                }
            }
        }
    }
    return false
}

export function placePiece(
    piece: Piece,
    board: (number | null)[][],
    _constants: GameConstants
): void {
    for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
            if (piece.shape[row][col]) {
                const y = piece.y + row
                const x = piece.x + col
                if (y >= 0) {
                    board[y][x] = piece.color
                }
            }
        }
    }
}

export function clearLines(
    board: (number | null)[][],
    constants: GameConstants
): number {
    let linesCleared = 0

    for (let row = constants.BOARD_HEIGHT - 1; row >= 0; row--) {
        if (board[row].every(cell => cell !== null)) {
            board.splice(row, 1)
            board.unshift(Array(constants.BOARD_WIDTH).fill(null))
            linesCleared++
            row++ // Check same row again
        }
    }

    return linesCleared
}

export function drawNextPiece(
    piece: Piece | null,
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
): void {
    if (!piece) {
        return
    }

    // Clear canvas
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Calculate center position
    const blockSize = 20
    const pieceWidth = piece.shape[0].length * blockSize
    const pieceHeight = piece.shape.length * blockSize
    const offsetX = (canvas.width - pieceWidth) / 2
    const offsetY = (canvas.height - pieceHeight) / 2

    // Draw piece
    ctx.fillStyle = pixiColorToHex(piece.color)

    for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
            if (piece.shape[row][col]) {
                const x = offsetX + col * blockSize
                const y = offsetY + row * blockSize

                ctx.fillRect(x, y, blockSize, blockSize)

                // Add border
                ctx.strokeStyle = '#fff'
                ctx.lineWidth = 1
                ctx.strokeRect(x, y, blockSize, blockSize)
            }
        }
    }
}
