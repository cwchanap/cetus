// Utility functions for the Bubble Shooter game
import type { GameConstants, GridPosition } from './types'
import { pixiColorToHex } from '@/lib/games/shared/types'

export { pixiColorToHex }

/**
 * Board-wide row parity phase. Flipped every time a row is inserted at the
 * top, because insertion shifts every row down by one and therefore flips
 * the parity of every row simultaneously.
 */
export type RowPhase = 0 | 1

/** Parity of an individual row given the board-wide phase. 0 = wide, 1 = narrow. */
export function getRowParity(row: number, rowPhase: RowPhase): RowPhase {
    return ((row + rowPhase) % 2) as RowPhase
}

/** Number of columns (dense width) in a row for the current board phase. */
export function getRowColumnCount(
    row: number,
    rowPhase: RowPhase,
    constants: GameConstants
): number {
    return constants.GRID_WIDTH - getRowParity(row, rowPhase)
}

/**
 * X coordinate of a bubble center. Full (parity-0) rows are centered exactly
 * inside the projectile wall bounds; narrow (parity-1) rows are shifted right
 * by one radius.
 */
export function getBubbleX(
    col: number,
    row: number,
    rowPhase: RowPhase,
    constants: GameConstants
): number {
    const diameter = constants.BUBBLE_RADIUS * 2
    const boardLeft =
        (constants.GAME_WIDTH - constants.GRID_WIDTH * diameter) / 2
    return (
        boardLeft +
        constants.BUBBLE_RADIUS +
        getRowParity(row, rowPhase) * constants.BUBBLE_RADIUS +
        col * diameter
    )
}

/** Y coordinate of a bubble center — depends only on the row. */
export function getBubbleY(row: number, constants: GameConstants): number {
    return (
        constants.BUBBLE_RADIUS + row * constants.BUBBLE_RADIUS * Math.sqrt(3)
    )
}

/**
 * All valid hex neighbors of a cell. Parity is derived from the board-wide
 * phase (not the row index alone) so the neighbor graph stays consistent
 * after rows are inserted, and bounds respect the dense row width.
 */
export function getNeighbors(
    row: number,
    col: number,
    rowPhase: RowPhase,
    constants: GameConstants
): GridPosition[] {
    const neighbors: GridPosition[] = []
    const parity = getRowParity(row, rowPhase)

    // Standard hexagonal grid neighbor offsets, indexed by row parity.
    const offsets =
        parity === 0
            ? ([
                  [-1, -1],
                  [-1, 0],
                  [0, -1],
                  [0, 1],
                  [1, -1],
                  [1, 0],
              ] as const)
            : ([
                  [-1, 0],
                  [-1, 1],
                  [0, -1],
                  [0, 1],
                  [1, 0],
                  [1, 1],
              ] as const)

    offsets.forEach(([dRow, dCol]) => {
        const newRow = row + dRow
        const newCol = col + dCol
        if (
            newRow >= 0 &&
            newRow < constants.GRID_HEIGHT &&
            newCol >= 0 &&
            newCol < getRowColumnCount(newRow, rowPhase, constants)
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
