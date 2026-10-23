import { describe, it, expect } from 'vitest'
import {
    nextPosition,
    isValidTurn,
    opposite,
    type Direction,
} from './direction'

describe('nextPosition', () => {
    const origin = { row: 5, col: 5 }

    it('moves up (decrements row)', () => {
        expect(nextPosition(origin, 'up')).toEqual({ row: 4, col: 5 })
    })
    it('moves down (increments row)', () => {
        expect(nextPosition(origin, 'down')).toEqual({ row: 6, col: 5 })
    })
    it('moves left (decrements col)', () => {
        expect(nextPosition(origin, 'left')).toEqual({ row: 5, col: 4 })
    })
    it('moves right (increments col)', () => {
        expect(nextPosition(origin, 'right')).toEqual({ row: 5, col: 6 })
    })
    it('does not mutate the input position', () => {
        const pos = { row: 1, col: 1 }
        nextPosition(pos, 'up')
        expect(pos).toEqual({ row: 1, col: 1 })
    })
    it('handles origin coordinates', () => {
        expect(nextPosition({ row: 0, col: 0 }, 'up')).toEqual({
            row: -1,
            col: 0,
        })
    })
})

describe('isValidTurn', () => {
    it('allows a 90° turn', () => {
        expect(isValidTurn('up', 'left')).toBe(true)
        expect(isValidTurn('up', 'right')).toBe(true)
        expect(isValidTurn('left', 'down')).toBe(true)
    })
    it('allows continuing in the same direction', () => {
        expect(isValidTurn('up', 'up')).toBe(true)
        expect(isValidTurn('right', 'right')).toBe(true)
    })
    it('rejects a 180° reversal', () => {
        expect(isValidTurn('up', 'down')).toBe(false)
        expect(isValidTurn('down', 'up')).toBe(false)
        expect(isValidTurn('left', 'right')).toBe(false)
        expect(isValidTurn('right', 'left')).toBe(false)
    })
})

describe('opposite', () => {
    const cases: Array<[Direction, Direction]> = [
        ['up', 'down'],
        ['down', 'up'],
        ['left', 'right'],
        ['right', 'left'],
    ]
    it.each(cases)('opposite(%s) === %s', (dir, expected) => {
        expect(opposite(dir)).toBe(expected)
    })

    it('is an involution (opposite of opposite is identity)', () => {
        const dirs: Direction[] = ['up', 'down', 'left', 'right']
        for (const d of dirs) {
            expect(opposite(opposite(d))).toBe(d)
        }
    })
})
