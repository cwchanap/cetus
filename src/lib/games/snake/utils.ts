// Utility functions for Snake game
import type { Position, Direction, SnakeSegment, GameConstants } from './types'
import {
    nextPosition as sharedNextPosition,
    isValidTurn,
} from '@/lib/games/shared/direction'
import { generateId } from '@/lib/games/shared/utils'

export { generateId }

// Only the grid dimensions are needed by the bound/food helpers; accepting
// this narrower shape lets callers pass a partial constants object while full
// GameConstants remains assignable.
type GridDimensions = Pick<GameConstants, 'GRID_WIDTH' | 'GRID_HEIGHT'>

/**
 * Check if position is out of bounds
 */
export function isOutOfBounds(
    pos: Position,
    constants: GridDimensions
): boolean {
    return (
        pos.x < 0 ||
        pos.x >= constants.GRID_WIDTH ||
        pos.y < 0 ||
        pos.y >= constants.GRID_HEIGHT
    )
}

/**
 * Check if position collides with snake body
 */
export function collidesWithSnake(
    pos: Position,
    snake: SnakeSegment[]
): boolean {
    return snake.some(segment => segment.x === pos.x && segment.y === pos.y)
}

/**
 * Check if two positions are equal
 */
export function positionsEqual(pos1: Position, pos2: Position): boolean {
    return pos1.x === pos2.x && pos1.y === pos2.y
}

/**
 * Generate random position for food that doesn't collide with snake
 */
export function generateFoodPosition(
    snake: SnakeSegment[],
    constants: GridDimensions
): Position {
    let position: Position
    let attempts = 0
    const maxAttempts = 1000

    do {
        position = {
            x: Math.floor(Math.random() * constants.GRID_WIDTH),
            y: Math.floor(Math.random() * constants.GRID_HEIGHT),
        }
        attempts++
    } while (collidesWithSnake(position, snake) && attempts < maxAttempts)

    // Edge case: if we couldn't find a valid position after max attempts,
    // find any free cell (this can happen when the snake is very long)
    if (collidesWithSnake(position, snake)) {
        // Scan grid for any free cell
        for (let y = 0; y < constants.GRID_HEIGHT; y++) {
            for (let x = 0; x < constants.GRID_WIDTH; x++) {
                const candidate = { x, y }
                if (!collidesWithSnake(candidate, snake)) {
                    return candidate
                }
            }
        }
        // If grid is completely full (game should end), return position anyway
        // The game will handle this as game over in the next move
    }

    return position
}

/**
 * Get the next position based on current position and direction.
 * Delegates to shared direction module (snake uses x/y, shared uses row/col).
 */
export function getNextPosition(pos: Position, direction: Direction): Position {
    const next = sharedNextPosition({ row: pos.y, col: pos.x }, direction)
    return { x: next.col, y: next.row }
}

/**
 * Check if direction change is valid (can't reverse).
 * Delegates to shared direction module.
 */
export const isValidDirectionChange = isValidTurn
