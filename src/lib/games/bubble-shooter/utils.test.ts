import { describe, it, expect, vi } from 'vitest'
import {
    pixiColorToHex,
    getBubbleX,
    getBubbleY,
    getNeighbors,
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

    describe('getBubbleX', () => {
        it('should calculate x position for even row (col=0)', () => {
            // Even row: offset = 0 * BUBBLE_RADIUS = 0
            // x = 0 + BUBBLE_RADIUS + 0 * (BUBBLE_RADIUS * 2) = 20
            expect(getBubbleX(0, 0, constants)).toBe(20)
        })

        it('should calculate x position for even row (col=1)', () => {
            // x = 0 + 20 + 1 * 40 = 60
            expect(getBubbleX(1, 0, constants)).toBe(60)
        })

        it('should calculate x position for odd row (offset applied)', () => {
            // Odd row: offset = 1 * BUBBLE_RADIUS = 20
            // x = 20 + 20 + 0 * 40 = 40
            expect(getBubbleX(0, 1, constants)).toBe(40)
        })

        it('should calculate x position for odd row col=1', () => {
            // x = 20 + 20 + 1 * 40 = 80
            expect(getBubbleX(1, 1, constants)).toBe(80)
        })
    })

    describe('getBubbleY', () => {
        it('should calculate y for row 0 with no offset', () => {
            // y = BUBBLE_RADIUS + 0 * (BUBBLE_RADIUS * sqrt(3)) + 0
            expect(getBubbleY(0, 0, constants)).toBe(20)
        })

        it('should calculate y for row 1 with no offset', () => {
            const expected = 20 + 1 * (20 * Math.sqrt(3))
            expect(getBubbleY(1, 0, constants)).toBeCloseTo(expected)
        })

        it('should include rowOffset in calculation', () => {
            const withoutOffset = getBubbleY(0, 0, constants)
            const withOffset = getBubbleY(0, 10, constants)
            expect(withOffset - withoutOffset).toBe(10)
        })
    })

    describe('getNeighbors', () => {
        it('should return neighbors for even row interior cell', () => {
            const neighbors = getNeighbors(2, 3, constants)
            // For even row: offsets are [-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]
            expect(neighbors).toContainEqual({ row: 1, col: 2 })
            expect(neighbors).toContainEqual({ row: 1, col: 3 })
            expect(neighbors).toContainEqual({ row: 2, col: 2 })
            expect(neighbors).toContainEqual({ row: 2, col: 4 })
            expect(neighbors).toContainEqual({ row: 3, col: 2 })
            expect(neighbors).toContainEqual({ row: 3, col: 3 })
        })

        it('should return neighbors for odd row interior cell', () => {
            const neighbors = getNeighbors(3, 3, constants)
            // For odd row: offsets are [-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]
            expect(neighbors).toContainEqual({ row: 2, col: 3 })
            expect(neighbors).toContainEqual({ row: 2, col: 4 })
            expect(neighbors).toContainEqual({ row: 3, col: 2 })
            expect(neighbors).toContainEqual({ row: 3, col: 4 })
            expect(neighbors).toContainEqual({ row: 4, col: 3 })
            expect(neighbors).toContainEqual({ row: 4, col: 4 })
        })

        it('should filter out out-of-bounds neighbors for top-left corner', () => {
            const neighbors = getNeighbors(0, 0, constants)
            // No negative rows or cols
            expect(neighbors.every(n => n.row >= 0 && n.col >= 0)).toBe(true)
        })

        it('should filter out neighbors beyond grid boundaries', () => {
            const neighbors = getNeighbors(0, 0, constants)
            expect(
                neighbors.every(
                    n =>
                        n.row < constants.GRID_HEIGHT &&
                        n.col < constants.GRID_WIDTH - (n.row % 2)
                )
            ).toBe(true)
        })

        it('should return fewer neighbors for edge cells', () => {
            const cornerNeighbors = getNeighbors(0, 0, constants)
            const interiorNeighbors = getNeighbors(5, 5, constants)
            expect(cornerNeighbors.length).toBeLessThan(
                interiorNeighbors.length
            )
        })
    })

    describe('drawBubbleOnCanvas', () => {
        it('should draw bubble using canvas context methods', () => {
            const ctx = {
                beginPath: vi.fn(),
                arc: vi.fn(),
                fill: vi.fn(),
                stroke: vi.fn(),
                fillStyle: '',
                strokeStyle: '',
                lineWidth: 0,
            } as unknown as CanvasRenderingContext2D

            drawBubbleOnCanvas(ctx, 100, 100, 20, '#ff0000')

            expect(ctx.beginPath).toHaveBeenCalledTimes(2)
            expect(ctx.arc).toHaveBeenCalledTimes(2)
            expect(ctx.fill).toHaveBeenCalledTimes(2)
            expect(ctx.stroke).toHaveBeenCalledTimes(1)
        })
    })
})
