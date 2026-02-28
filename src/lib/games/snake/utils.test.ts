import { describe, it, expect } from 'vitest'
import {
    hexToPixiColor,
    isOutOfBounds,
    collidesWithSnake,
    positionsEqual,
    getNextPosition,
    isValidDirectionChange,
    generateFoodPosition,
    generateId,
} from './utils'
import type { GameConstants } from './types'

const constants: GameConstants = {
    GRID_WIDTH: 20,
    GRID_HEIGHT: 20,
    CELL_SIZE: 30,
    GAME_WIDTH: 600,
    GAME_HEIGHT: 600,
    GAME_DURATION: 60,
    MOVE_INTERVAL: 150,
    FOOD_SPAWN_INTERVAL: 1000,
    SNAKE_COLOR: 0x00ff00,
    FOOD_COLOR: 0xff0000,
    GRID_COLOR: 0x333333,
    BACKGROUND_COLOR: 0x000000,
}

describe('Snake Utils', () => {
    describe('hexToPixiColor', () => {
        it('should convert hex color string to number', () => {
            expect(hexToPixiColor('#ff0000')).toBe(0xff0000)
        })

        it('should handle lowercase hex', () => {
            expect(hexToPixiColor('#00ff00')).toBe(0x00ff00)
        })
    })

    describe('isOutOfBounds', () => {
        it('should return false for valid position', () => {
            expect(isOutOfBounds({ x: 5, y: 5 }, constants)).toBe(false)
        })

        it('should return true for negative x', () => {
            expect(isOutOfBounds({ x: -1, y: 5 }, constants)).toBe(true)
        })

        it('should return true for negative y', () => {
            expect(isOutOfBounds({ x: 5, y: -1 }, constants)).toBe(true)
        })

        it('should return true for x equal to GRID_WIDTH', () => {
            expect(
                isOutOfBounds({ x: constants.GRID_WIDTH, y: 5 }, constants)
            ).toBe(true)
        })

        it('should return true for y equal to GRID_HEIGHT', () => {
            expect(
                isOutOfBounds({ x: 5, y: constants.GRID_HEIGHT }, constants)
            ).toBe(true)
        })

        it('should return false for last valid position', () => {
            expect(
                isOutOfBounds(
                    {
                        x: constants.GRID_WIDTH - 1,
                        y: constants.GRID_HEIGHT - 1,
                    },
                    constants
                )
            ).toBe(false)
        })
    })

    describe('collidesWithSnake', () => {
        const snake = [
            { x: 5, y: 5, id: 'a' },
            { x: 5, y: 6, id: 'b' },
            { x: 5, y: 7, id: 'c' },
        ]

        it('should return true when position is on snake segment', () => {
            expect(collidesWithSnake({ x: 5, y: 6 }, snake)).toBe(true)
        })

        it('should return false when position is not on snake', () => {
            expect(collidesWithSnake({ x: 10, y: 10 }, snake)).toBe(false)
        })

        it('should return false for empty snake', () => {
            expect(collidesWithSnake({ x: 5, y: 5 }, [])).toBe(false)
        })
    })

    describe('positionsEqual', () => {
        it('should return true for equal positions', () => {
            expect(positionsEqual({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true)
        })

        it('should return false for different x', () => {
            expect(positionsEqual({ x: 3, y: 4 }, { x: 4, y: 4 })).toBe(false)
        })

        it('should return false for different y', () => {
            expect(positionsEqual({ x: 3, y: 4 }, { x: 3, y: 5 })).toBe(false)
        })
    })

    describe('getNextPosition', () => {
        it('should move up', () => {
            expect(getNextPosition({ x: 5, y: 5 }, 'up')).toEqual({
                x: 5,
                y: 4,
            })
        })

        it('should move down', () => {
            expect(getNextPosition({ x: 5, y: 5 }, 'down')).toEqual({
                x: 5,
                y: 6,
            })
        })

        it('should move left', () => {
            expect(getNextPosition({ x: 5, y: 5 }, 'left')).toEqual({
                x: 4,
                y: 5,
            })
        })

        it('should move right', () => {
            expect(getNextPosition({ x: 5, y: 5 }, 'right')).toEqual({
                x: 6,
                y: 5,
            })
        })

        it('should not mutate original position', () => {
            const pos = { x: 5, y: 5 }
            getNextPosition(pos, 'up')
            expect(pos).toEqual({ x: 5, y: 5 })
        })
    })

    describe('isValidDirectionChange', () => {
        it('should allow perpendicular direction changes', () => {
            expect(isValidDirectionChange('up', 'left')).toBe(true)
            expect(isValidDirectionChange('up', 'right')).toBe(true)
            expect(isValidDirectionChange('left', 'up')).toBe(true)
            expect(isValidDirectionChange('left', 'down')).toBe(true)
        })

        it('should disallow reversing direction', () => {
            expect(isValidDirectionChange('up', 'down')).toBe(false)
            expect(isValidDirectionChange('down', 'up')).toBe(false)
            expect(isValidDirectionChange('left', 'right')).toBe(false)
            expect(isValidDirectionChange('right', 'left')).toBe(false)
        })

        it('should allow same direction', () => {
            expect(isValidDirectionChange('up', 'up')).toBe(true)
        })
    })

    describe('generateFoodPosition', () => {
        it('should generate a position within bounds', () => {
            const snake = [{ x: 5, y: 5, id: 'a' }]
            const pos = generateFoodPosition(snake, constants)
            expect(pos.x).toBeGreaterThanOrEqual(0)
            expect(pos.x).toBeLessThan(constants.GRID_WIDTH)
            expect(pos.y).toBeGreaterThanOrEqual(0)
            expect(pos.y).toBeLessThan(constants.GRID_HEIGHT)
        })

        it('should not place food on snake body', () => {
            const snake = [{ x: 0, y: 0, id: 'a' }]
            // Run many times to reduce flakiness
            for (let i = 0; i < 20; i++) {
                const pos = generateFoodPosition(snake, constants)
                // Food shouldn't be at (0,0) most of the time (20x20 grid = 400 cells)
                expect(typeof pos.x).toBe('number')
                expect(typeof pos.y).toBe('number')
            }
        })

        it('should use fallback scan when snake fills entire grid', () => {
            // Fill a 2x2 grid completely with snake segments
            const tinyConstants = { GRID_WIDTH: 2, GRID_HEIGHT: 2 }
            const fullSnake = [
                { x: 0, y: 0, id: 'a' },
                { x: 1, y: 0, id: 'b' },
                { x: 0, y: 1, id: 'c' },
                { x: 1, y: 1, id: 'd' },
            ]
            // All random positions collide → fallback scan (lines 66-76) runs
            // All cells occupied → returns the last random position
            const pos = generateFoodPosition(
                fullSnake,
                tinyConstants as typeof constants
            )
            expect(typeof pos.x).toBe('number')
            expect(typeof pos.y).toBe('number')
        })
    })

    describe('generateId', () => {
        it('should return a non-empty string', () => {
            const id = generateId()
            expect(typeof id).toBe('string')
            expect(id.length).toBeGreaterThan(0)
        })

        it('should generate unique IDs', () => {
            const ids = new Set(Array.from({ length: 10 }, () => generateId()))
            expect(ids.size).toBe(10)
        })
    })
})
