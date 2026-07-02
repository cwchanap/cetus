/**
 * Shared 4-directional movement logic for grid-based games (e.g. Snake).
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

const DELTAS: Record<Direction, { dr: number; dc: number }> = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
}

const OPPOSITES: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
}

/** Compute the next position when moving one step in the given direction. */
export function nextPosition(
    pos: { row: number; col: number },
    dir: Direction
): { row: number; col: number } {
    const d = DELTAS[dir]
    return { row: pos.row + d.dr, col: pos.col + d.dc }
}

/** Return true if turning from one direction to another is allowed (not a 180° reversal). */
export function isValidTurn(from: Direction, to: Direction): boolean {
    return OPPOSITES[from] !== to
}

/** Return the opposite direction. */
export function opposite(dir: Direction): Direction {
    return OPPOSITES[dir]
}
