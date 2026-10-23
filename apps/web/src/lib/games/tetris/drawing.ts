// Tetris canvas adapters — web host boundary (HPA-447 Stage 2).
// Canvas drawing needs DOM typings, so it stays in apps/web while the
// pure rules live in @cetus/games/tetris.

import type { Piece } from '@cetus/games/tetris/types'
import { pixiColorToHex } from '@cetus/games/shared/colors'

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
