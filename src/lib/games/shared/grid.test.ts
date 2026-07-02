import { describe, it, expect, vi } from 'vitest'
import {
    createGrid,
    forEachCell,
    cloneGrid,
    deepCloneGrid,
    inBounds,
    findCells,
    swapCells,
    isAdjacent,
    findRandomFreeCell,
} from './grid'

describe('createGrid', () => {
    it('creates a grid filled with a scalar value', () => {
        const grid = createGrid(2, 3, 0)
        expect(grid).toHaveLength(2)
        expect(grid[0]).toHaveLength(3)
        expect(grid).toEqual([
            [0, 0, 0],
            [0, 0, 0],
        ])
    })

    it('uses a factory to create unique cells', () => {
        const grid = createGrid(2, 2, () => ({ v: 1 }))
        expect(grid[0][0]).not.toBe(grid[0][1])
        expect(grid[0][0]).not.toBe(grid[1][0])
        expect(grid[1][1]).toEqual({ v: 1 })
    })

    it('produces an empty grid for zero dimensions', () => {
        expect(createGrid(0, 3, 0)).toEqual([])
        expect(createGrid(2, 0, 0)).toEqual([[], []])
    })
})

describe('forEachCell', () => {
    it('visits every cell with correct coordinates', () => {
        const grid = createGrid(2, 2, 0)
        const seen: string[] = []
        forEachCell(grid, (v, r, c) => seen.push(`${r},${c}=${v}`))
        expect(seen).toEqual(['0,0=0', '0,1=0', '1,0=0', '1,1=0'])
    })

    it('visits in row-major order', () => {
        const grid: number[][] = [
            [1, 2],
            [3, 4],
        ]
        const collected: number[] = []
        forEachCell(grid, v => collected.push(v))
        expect(collected).toEqual([1, 2, 3, 4])
    })

    it('does nothing for an empty grid', () => {
        const cb = vi.fn()
        forEachCell([], cb)
        expect(cb).not.toHaveBeenCalled()
    })
})

describe('cloneGrid', () => {
    it('produces a shallow copy with equal contents', () => {
        const grid = [
            [1, 2],
            [3, 4],
        ]
        const clone = cloneGrid(grid)
        expect(clone).toEqual(grid)
        expect(clone).not.toBe(grid)
    })

    it('does not share row arrays', () => {
        const grid = [[1, 2]]
        const clone = cloneGrid(grid)
        clone[0][0] = 99
        expect(grid[0][0]).toBe(1)
    })
})

describe('deepCloneGrid', () => {
    it('deep-clones nested object values', () => {
        const grid = [[{ a: 1 }, { a: 2 }]]
        const clone = deepCloneGrid(grid)
        expect(clone).toEqual(grid)
        clone[0][0].a = 99
        expect(grid[0][0].a).toBe(1)
    })
})

describe('inBounds', () => {
    const grid = createGrid(3, 4, 0)

    it('returns true inside bounds', () => {
        expect(inBounds(grid, 0, 0)).toBe(true)
        expect(inBounds(grid, 2, 3)).toBe(true)
    })

    it('returns false outside bounds', () => {
        expect(inBounds(grid, -1, 0)).toBe(false)
        expect(inBounds(grid, 0, -1)).toBe(false)
        expect(inBounds(grid, 3, 0)).toBe(false)
        expect(inBounds(grid, 0, 4)).toBe(false)
    })

    it('handles ragged rows', () => {
        const ragged: number[][] = [[0, 0], [0]]
        expect(inBounds(ragged, 1, 1)).toBe(false)
        expect(inBounds(ragged, 0, 1)).toBe(true)
    })
})

describe('findCells', () => {
    it('returns matching cells', () => {
        const grid = [
            [1, 2],
            [3, 2],
        ]
        const matches = findCells(grid, v => v === 2)
        expect(matches).toEqual([
            { row: 0, col: 1, value: 2 },
            { row: 1, col: 1, value: 2 },
        ])
    })

    it('returns empty array when nothing matches', () => {
        const grid = [[1, 2]]
        expect(findCells(grid, v => v === 9)).toEqual([])
    })

    it('can use coordinates in the predicate', () => {
        const grid = [
            [0, 0],
            [0, 0],
        ]
        const matches = findCells(grid, (_v, r) => r === 1)
        expect(matches).toHaveLength(2)
        expect(matches.every(m => m.row === 1)).toBe(true)
    })
})

describe('swapCells', () => {
    it('swaps two cells in place', () => {
        const grid = [['a', 'b']]
        swapCells(grid, { row: 0, col: 0 }, { row: 0, col: 1 })
        expect(grid).toEqual([['b', 'a']])
    })

    it('swaps across rows', () => {
        const grid = [[1], [2]]
        swapCells(grid, { row: 0, col: 0 }, { row: 1, col: 0 })
        expect(grid).toEqual([[2], [1]])
    })

    it('swaps object references correctly', () => {
        const a = { x: 1 }
        const b = { x: 2 }
        const grid = [[a, b]]
        swapCells(grid, { row: 0, col: 0 }, { row: 0, col: 1 })
        expect(grid[0][0]).toBe(b)
        expect(grid[0][1]).toBe(a)
    })
})

describe('isAdjacent', () => {
    it('returns true for horizontal adjacency', () => {
        expect(isAdjacent({ row: 0, col: 0 }, { row: 0, col: 1 })).toBe(true)
    })

    it('returns true for vertical adjacency', () => {
        expect(isAdjacent({ row: 0, col: 0 }, { row: 1, col: 0 })).toBe(true)
    })

    it('returns false for the same cell', () => {
        expect(isAdjacent({ row: 1, col: 1 }, { row: 1, col: 1 })).toBe(false)
    })

    it('returns false for diagonal cells', () => {
        expect(isAdjacent({ row: 0, col: 0 }, { row: 1, col: 1 })).toBe(false)
    })

    it('returns false for distant cells', () => {
        expect(isAdjacent({ row: 0, col: 0 }, { row: 0, col: 2 })).toBe(false)
    })
})

describe('findRandomFreeCell', () => {
    it('returns null when every cell is in the occupied set', () => {
        const grid: (number | null)[][] = [
            [1, 2],
            [3, 4],
        ]
        const occupied = [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
        ]
        expect(findRandomFreeCell(grid, 2, 2, occupied)).toBeNull()
    })

    it('returns a free cell when available', () => {
        const grid: (number | null)[][] = [
            [1, null],
            [null, 4],
        ]
        const cell = findRandomFreeCell(grid, 2, 2)
        expect(cell).not.toBeNull()
        const free = [
            { row: 0, col: 1 },
            { row: 1, col: 0 },
        ]
        expect(free).toContainEqual(cell)
    })

    it('excludes explicitly occupied cells', () => {
        const grid: (number | null)[][] = [[null, null]]
        const occupied = [{ row: 0, col: 0 }]
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const cell = findRandomFreeCell(grid, 2, 1, occupied)
        expect(cell).toEqual({ row: 0, col: 1 })
        vi.restoreAllMocks()
    })

    it('returns null when all cells are occupied via occupied list', () => {
        const grid: (number | null)[][] = [[null, null]]
        const occupied = [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
        ]
        expect(findRandomFreeCell(grid, 2, 1, occupied)).toBeNull()
    })
})
