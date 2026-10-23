import { describe, it, expect, beforeEach, vi } from 'vitest'
import { drawNextPiece } from './drawing'
import type { Piece } from '@cetus/games/tetris/types'

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
            fillText: vi.fn(),
        } as unknown as CanvasRenderingContext2D

        mockCanvas = {
            width: 120,
            height: 120,
        } as HTMLCanvasElement
    })

    it('should handle null piece', () => {
        drawNextPiece(null, mockContext, mockCanvas)

        expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 120, 120)
        expect(mockContext.fillText).toHaveBeenCalledWith('—', 60, 60)
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

    it('should use the piece color beneath the bevel', () => {
        const fills: string[] = []
        vi.mocked(mockContext.fillRect).mockImplementation(() => {
            fills.push(String(mockContext.fillStyle))
        })
        const piece: Piece = {
            type: 'O',
            x: 0,
            y: 0,
            shape: [[1]],
            color: 0xff0000,
        }

        drawNextPiece(piece, mockContext, mockCanvas)

        expect(fills).toContain('#ff0000')
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

        // The top-left block starts one pixel inside a centered 52px form.
        expect(mockContext.fillRect).toHaveBeenCalledWith(35, 35, 24, 24)
        expect(mockContext.strokeRect).toHaveBeenCalledTimes(4) // 4 borders
    })
})
