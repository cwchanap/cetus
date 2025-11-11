// Utility functions for Snake game
import type { Position, Direction, SnakeSegment, GameConstants } from './types'

/**
 * Convert hex color to Pixi color format
 */
export function hexToPixiColor(hex: string): number {
    return parseInt(hex.replace('#', '0x'))
}

/**
 * Check if position is out of bounds
 */
export function isOutOfBounds(
    pos: Position,
    constants: GameConstants
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
    constants: GameConstants
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
 * Get the next position based on current position and direction
 */
export function getNextPosition(pos: Position, direction: Direction): Position {
    const newPos = { ...pos }

    switch (direction) {
        case 'up':
            newPos.y -= 1
            break
        case 'down':
            newPos.y += 1
            break
        case 'left':
            newPos.x -= 1
            break
        case 'right':
            newPos.x += 1
            break
    }

    return newPos
}

/**
 * Check if direction change is valid (can't reverse)
 */
export function isValidDirectionChange(
    currentDirection: Direction,
    newDirection: Direction
): boolean {
    const opposites: Record<Direction, Direction> = {
        up: 'down',
        down: 'up',
        left: 'right',
        right: 'left',
    }

    return opposites[currentDirection] !== newDirection
}

/**
 * Generate unique ID
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
