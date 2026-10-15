// Utility functions for Tetris game
import type { Piece, GameConstants } from './types'
import { hexToPixiColor, pixiColorToHex } from '@/lib/games/shared/types'

export { hexToPixiColor, pixiColorToHex }

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
    constants: Pick<GameConstants, 'BOARD_WIDTH' | 'BOARD_HEIGHT'>
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
    piece: Piece | Piece[] | null,
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    glyphs = false
): void {
    const pieces = Array.isArray(piece) ? piece : piece ? [piece] : []
    ctx.fillStyle = '#070b16'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (!pieces.length) {
        ctx.fillStyle = '#eaf6ff2e'
        ctx.font = '500 15px "Field Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('—', canvas.width / 2, canvas.height / 2)
        return
    }
    const slotHeight = canvas.height / pieces.length
    pieces.forEach((p, index) => {
        const size = index === 0 ? 26 : 20
        const ox = (canvas.width - p.shape[0].length * size) / 2
        const oy = index * slotHeight + (slotHeight - p.shape.length * size) / 2
        p.shape.forEach((row, r) =>
            row.forEach((cell, col) => {
                if (!cell) {
                    return
                }
                const x = ox + col * size + 1,
                    y = oy + r * size + 1
                ctx.fillStyle = pixiColorToHex(p.color)
                ctx.fillRect(x, y, size - 2, size - 2)
                ctx.fillStyle = 'rgba(255,255,255,0.28)'
                ctx.fillRect(x, y, size - 2, size * 0.14)
                ctx.fillStyle = 'rgba(4,6,10,0.3)'
                ctx.fillRect(
                    x,
                    y + size - 2 - size * 0.14,
                    size - 2,
                    size * 0.14
                )
                ctx.strokeStyle = 'rgba(4,6,10,0.55)'
                ctx.lineWidth = 1
                ctx.strokeRect(x + 0.5, y + 0.5, size - 3, size - 3)
                if (glyphs) {
                    ctx.fillStyle = '#04060acc'
                    ctx.font = `600 ${Math.round(size * 0.5)}px "Field Mono", monospace`
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(p.type, x + size / 2 - 1, y + size / 2)
                }
            })
        )
    })
}
