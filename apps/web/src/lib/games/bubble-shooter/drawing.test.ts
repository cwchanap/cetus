import { describe, it, expect, vi } from 'vitest'
import { drawBubbleOnCanvas } from './drawing'

describe('drawBubbleOnCanvas', () => {
    it('should draw bubble using canvas context methods', () => {
        const fillStyleSpy = vi.fn()
        const ctx = {
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            set fillStyle(value: string) {
                fillStyleSpy(value)
            },
            get fillStyle() {
                return (
                    fillStyleSpy.mock.calls[
                        fillStyleSpy.mock.calls.length - 1
                    ]?.[0] ?? ''
                )
            },
            strokeStyle: '',
            lineWidth: 0,
        } as unknown as CanvasRenderingContext2D

        drawBubbleOnCanvas(ctx, 100, 100, 20, '#ff0000')

        expect(ctx.beginPath).toHaveBeenCalledTimes(2)
        expect(ctx.arc).toHaveBeenCalledTimes(2)
        // Verify arc was called with correct coordinates and radius
        expect(ctx.arc).toHaveBeenCalledWith(100, 100, 20, 0, 2 * Math.PI)
        // Verify fillStyle was set to the bubble color and highlight color
        expect(fillStyleSpy).toHaveBeenCalledWith('#ff0000')
        expect(fillStyleSpy).toHaveBeenCalledWith('rgba(255, 255, 255, 0.4)')
        expect(ctx.fill).toHaveBeenCalledTimes(2)
        expect(ctx.stroke).toHaveBeenCalledTimes(1)
    })
})
