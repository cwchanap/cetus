import { describe, it, expect, vi } from 'vitest'
import {
    pixiColorToHex,
    getBubbleX,
    getBubbleY,
    getNeighbors,
    getRowParity,
    getRowColumnCount,
    drawBubbleOnCanvas,
} from './utils'
import type { GameConstants } from './types'

const constants: GameConstants = {
    BUBBLE_RADIUS: 20,
    GRID_WIDTH: 14,
    GRID_HEIGHT: 20,
    COLORS: [0xff0000, 0x00ff00, 0x0000ff],
    GAME_WIDTH: 600,
    GAME_HEIGHT: 800,
    SHOOTER_Y: 740,
}

describe('Bubble Shooter Utils', () => {
    describe('pixiColorToHex', () => {
        it('should convert a pixi color number to hex string', () => {
            expect(pixiColorToHex(0xff0000)).toBe('#ff0000')
        })

        it('should pad short hex values', () => {
            expect(pixiColorToHex(0x00ff00)).toBe('#00ff00')
        })

        it('should handle black (0)', () => {
            expect(pixiColorToHex(0x000000)).toBe('#000000')
        })

        it('should handle white', () => {
            expect(pixiColorToHex(0xffffff)).toBe('#ffffff')
        })
    })

    describe('phase-aware hex geometry', () => {
        it('derives row parity and row width', () => {
            expect(getRowParity(0, 0)).toBe(0)
            expect(getRowParity(1, 0)).toBe(1)
            expect(getRowParity(0, 1)).toBe(1)
            expect(getRowColumnCount(0, 0, constants)).toBe(14)
            expect(getRowColumnCount(0, 1, constants)).toBe(13)
        })

        it('centers the full row exactly inside wall bounds', () => {
            expect(getBubbleX(0, 0, 0, constants)).toBe(40)
            expect(getBubbleX(13, 0, 0, constants)).toBe(560)
            expect(getBubbleX(0, 0, 0, constants) - 20).toBe(20)
            expect(getBubbleX(13, 0, 0, constants) + 20).toBe(580)
        })

        it('uses row-only vertical spacing', () => {
            expect(getBubbleY(0, constants)).toBe(20)
            expect(getBubbleY(1, constants)).toBeCloseTo(20 + 20 * Math.sqrt(3))
        })

        it('keeps each interior neighbor one bubble diameter away', () => {
            const origin = { row: 5, col: 5 }
            const originX = getBubbleX(5, 5, 1, constants)
            const originY = getBubbleY(5, constants)

            for (const neighbor of getNeighbors(5, 5, 1, constants)) {
                const x = getBubbleX(neighbor.col, neighbor.row, 1, constants)
                const y = getBubbleY(neighbor.row, constants)
                expect(Math.hypot(x - originX, y - originY)).toBeCloseTo(40)
            }
        })
    })

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
            expect(fillStyleSpy).toHaveBeenCalledWith(
                'rgba(255, 255, 255, 0.4)'
            )
            expect(ctx.fill).toHaveBeenCalledTimes(2)
            expect(ctx.stroke).toHaveBeenCalledTimes(1)
        })
    })
})
