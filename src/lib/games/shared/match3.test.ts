import { describe, it, expect } from 'vitest'
import {
    findMatches,
    removeMatches,
    applyGravity,
    refill,
    swap,
    type Match,
} from './match3'

type Cell = 'a' | 'b' | 'c'

describe('findMatches', () => {
    it('finds a horizontal match of 3', () => {
        const grid: (Cell | null)[][] = [
            ['a', 'a', 'a', 'b'],
            ['b', 'c', 'b', 'c'],
        ]
        const matches = findMatches(grid)
        expect(matches.length).toBeGreaterThanOrEqual(1)
        expect(matches.some(m => m.type === 'a')).toBe(true)
    })

    it('finds a vertical match of 3', () => {
        const grid: (Cell | null)[][] = [
            ['a', 'b'],
            ['a', 'c'],
            ['a', 'b'],
        ]
        const matches = findMatches(grid)
        expect(matches.some(m => m.type === 'a')).toBe(true)
    })

    it('returns an empty array when there are no matches', () => {
        const grid: (Cell | null)[][] = [
            ['a', 'b', 'a'],
            ['b', 'a', 'b'],
        ]
        expect(findMatches(grid)).toHaveLength(0)
    })

    it('does not match runs shorter than minMatch', () => {
        const grid: (Cell | null)[][] = [
            ['a', 'a', 'b'],
            ['b', 'c', 'a'],
        ]
        expect(findMatches(grid)).toHaveLength(0)
    })

    it('respects a custom minMatch threshold', () => {
        const grid: (Cell | null)[][] = [['a', 'a', 'a', 'a']]
        expect(findMatches(grid, 4)).toHaveLength(1)
        expect(findMatches(grid, 5)).toHaveLength(0)
    })

    it('a null cell breaks an otherwise-3 run', () => {
        // Without the null this row would be a 5-run of 'a'. The null
        // splits it into two sub-minMatch runs (length 2 each), and the
        // trailing 'b' is alone, so no match should be found.
        const grid: (Cell | null)[][] = [['a', 'a', null, 'a', 'a', 'b']]
        expect(findMatches(grid)).toHaveLength(0)
    })

    it('merges overlapping matches into one (L-shape)', () => {
        const grid: (Cell | null)[][] = [
            ['a', 'a', 'a', 'b'],
            ['a', 'c', 'b', 'c'],
            ['a', 'b', 'c', 'b'],
        ]
        const matches = findMatches(grid)
        const match = matches.find(m => m.type === 'a')
        expect(match).toBeDefined()
        expect(match?.positions.length).toBeGreaterThanOrEqual(5)
    })

    it('keeps separate non-overlapping matches of different types', () => {
        const grid: (Cell | null)[][] = [['a', 'a', 'a', 'b', 'b', 'b']]
        const matches = findMatches(grid)
        expect(matches).toHaveLength(2)
        expect(matches.some(m => m.type === 'a')).toBe(true)
        expect(matches.some(m => m.type === 'b')).toBe(true)
    })

    it('handles empty grids without throwing', () => {
        expect(findMatches([])).toEqual([])
    })

    it('works with numeric cell types', () => {
        const grid: (number | null)[][] = [
            [1, 1, 1],
            [2, 3, 4],
        ]
        const matches = findMatches(grid)
        expect(matches).toHaveLength(1)
        expect(matches[0].type).toBe(1)
    })
})

describe('removeMatches', () => {
    it('removes matched positions from the grid', () => {
        const grid: (Cell | null)[][] = [
            ['a', 'a', 'a'],
            ['b', 'c', 'b'],
        ]
        const matches = findMatches(grid)
        const { removed } = removeMatches(grid, matches)
        expect(removed).toBe(3)
        expect(grid[0][0]).toBeNull()
        expect(grid[0][1]).toBeNull()
        expect(grid[0][2]).toBeNull()
    })

    it('returns the largest match size', () => {
        const grid: (Cell | null)[][] = [
            ['a', 'a', 'a', 'a'],
            ['b', 'c', 'b', 'c'],
        ]
        const matches = findMatches(grid)
        const { largest } = removeMatches(grid, matches)
        expect(largest).toBe(4)
    })

    it('returns 0 for an empty match list', () => {
        const grid: (Cell | null)[][] = [['a', 'b']]
        const { removed, largest } = removeMatches(grid, [])
        expect(removed).toBe(0)
        expect(largest).toBe(0)
    })

    it('does not double-count already-null cells', () => {
        const grid: (Cell | null)[][] = [[null, null, null]]
        const matches: Match<Cell>[] = [
            { type: 'a', positions: [{ row: 0, col: 0 }] },
        ]
        const { removed } = removeMatches(grid, matches)
        expect(removed).toBe(0)
    })
})

describe('applyGravity', () => {
    it('drops cells downward to fill empty cells below', () => {
        const grid: (Cell | null)[][] = [
            ['a', null],
            [null, 'b'],
            ['c', 'a'],
        ]
        applyGravity(grid)
        expect(grid[2][0]).not.toBeNull()
        expect(grid[2][1]).not.toBeNull()
    })

    it('leaves nulls at the top after dropping', () => {
        const grid: (Cell | null)[][] = [['a'], [null], [null]]
        applyGravity(grid)
        expect(grid[0][0]).toBeNull()
        expect(grid[1][0]).toBeNull()
        expect(grid[2][0]).toBe('a')
    })

    it('preserves the relative order of non-null cells', () => {
        const grid: (Cell | null)[][] = [['a'], [null], ['b']]
        applyGravity(grid)
        expect(grid[1][0]).toBe('a')
        expect(grid[2][0]).toBe('b')
    })

    it('handles an empty grid without throwing', () => {
        expect(() => applyGravity([])).not.toThrow()
    })

    it('leaves a fully-filled column unchanged', () => {
        const grid: (Cell | null)[][] = [['a'], ['b'], ['c']]
        applyGravity(grid)
        expect(grid).toEqual([['a'], ['b'], ['c']])
    })
})

describe('refill', () => {
    it('fills null cells using the provided factory', () => {
        const grid: (Cell | null)[][] = [
            [null, 'b'],
            [null, null],
        ]
        refill(grid, () => 'a')
        expect(grid).toEqual([
            ['a', 'b'],
            ['a', 'a'],
        ])
    })

    it('does not overwrite existing cells', () => {
        const grid: (Cell | null)[][] = [['a', 'b']]
        refill(grid, () => 'c')
        expect(grid).toEqual([['a', 'b']])
    })

    it('invokes the factory once per empty cell', () => {
        const grid: (Cell | null)[][] = [[null, null, null]]
        let calls = 0
        refill(grid, () => {
            calls++
            return 'a'
        })
        expect(calls).toBe(3)
    })

    it('handles an empty grid without throwing', () => {
        expect(() => refill([], () => 'a')).not.toThrow()
    })
})

describe('swap', () => {
    it('swaps two adjacent cells', () => {
        const grid: (Cell | null)[][] = [['a', 'b']]
        swap(grid, { row: 0, col: 0 }, { row: 0, col: 1 })
        expect(grid[0][0]).toBe('b')
        expect(grid[0][1]).toBe('a')
    })

    it('swaps a null with a value', () => {
        const grid: (Cell | null)[][] = [[null, 'b']]
        swap(grid, { row: 0, col: 0 }, { row: 0, col: 1 })
        expect(grid[0][0]).toBe('b')
        expect(grid[0][1]).toBeNull()
    })

    it('swaps cells across rows', () => {
        const grid: (Cell | null)[][] = [['a'], ['b']]
        swap(grid, { row: 0, col: 0 }, { row: 1, col: 0 })
        expect(grid[0][0]).toBe('b')
        expect(grid[1][0]).toBe('a')
    })
})
