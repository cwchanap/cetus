// Utility functions for the Bubble Shooter game
import type { GameConstants, GridPosition } from './types'

export function pixiColorToHex(pixiColor: number): string {
    return '#' + pixiColor.toString(16).padStart(6, '0')
}

export function getBubbleX(
    col: number,
    row: number,
    constants: GameConstants
): number {
    const offset = (row % 2) * constants.BUBBLE_RADIUS
    return (
        offset + constants.BUBBLE_RADIUS + col * (constants.BUBBLE_RADIUS * 2)
    )
}

export function getBubbleY(
    row: number,
    rowOffset: number,
    constants: GameConstants
): number {
    return (
        constants.BUBBLE_RADIUS +
        row * (constants.BUBBLE_RADIUS * Math.sqrt(3)) +
        rowOffset
    )
}

export function getNeighbors(
    row: number,
    col: number,
    constants: GameConstants
): GridPosition[] {
    const neighbors: GridPosition[] = []
    const isEvenRow = row % 2 === 0

    // Standard hexagonal grid neighbors
    const offsets = isEvenRow
        ? [
              [-1, -1],
              [-1, 0],
              [0, -1],
              [0, 1],
              [1, -1],
              [1, 0],
          ]
        : [
              [-1, 0],
              [-1, 1],
              [0, -1],
              [0, 1],
              [1, 0],
              [1, 1],
          ]

    offsets.forEach(([dRow, dCol]) => {
        const newRow = row + dRow
        const newCol = col + dCol
        if (
            newRow >= 0 &&
            newRow < constants.GRID_HEIGHT &&
            newCol >= 0 &&
            newCol < constants.GRID_WIDTH - (newRow % 2)
        ) {
            neighbors.push({ row: newRow, col: newCol })
        }
    })

    return neighbors
}

export function drawBubbleOnCanvas(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string
): void {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fill()
}
