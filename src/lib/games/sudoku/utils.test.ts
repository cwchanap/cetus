import { describe, it, expect, beforeEach } from 'vitest'
import {
    createSolvedGrid,
    createPuzzle,
    isValidMove,
    isComplete,
    findConflicts,
} from './utils'

// Build a valid, complete 9x9 Sudoku grid for testing
function validCompleteGrid(): number[][] {
    return [
        [5, 3, 4, 6, 7, 8, 9, 1, 2],
        [6, 7, 2, 1, 9, 5, 3, 4, 8],
        [1, 9, 8, 3, 4, 2, 5, 6, 7],
        [8, 5, 9, 7, 6, 1, 4, 2, 3],
        [4, 2, 6, 8, 5, 3, 7, 9, 1],
        [7, 1, 3, 9, 2, 4, 8, 5, 6],
        [9, 6, 1, 5, 3, 7, 2, 8, 4],
        [2, 8, 7, 4, 1, 9, 6, 3, 5],
        [3, 4, 5, 2, 8, 6, 1, 7, 9],
    ]
}

describe('Sudoku Utils', () => {
    describe('createSolvedGrid', () => {
        it('should produce a 9x9 grid', () => {
            const grid = createSolvedGrid()
            expect(grid.length).toBe(9)
            for (const row of grid) {
                expect(row.length).toBe(9)
            }
        })

        it('should have no zeros in the grid', () => {
            const grid = createSolvedGrid()
            for (const row of grid) {
                for (const val of row) {
                    expect(val).toBeGreaterThanOrEqual(1)
                    expect(val).toBeLessThanOrEqual(9)
                }
            }
        })

        it('should produce a valid solved grid', () => {
            const grid = createSolvedGrid()
            // Each row should contain 1-9 exactly once
            for (let row = 0; row < 9; row++) {
                const rowSet = new Set(grid[row])
                expect(rowSet.size).toBe(9)
            }
            // Each col should contain 1-9 exactly once
            for (let col = 0; col < 9; col++) {
                const colSet = new Set(grid.map(r => r[col]))
                expect(colSet.size).toBe(9)
            }
            // Each 3x3 box should contain 1-9 exactly once
            for (let boxRow = 0; boxRow < 3; boxRow++) {
                for (let boxCol = 0; boxCol < 3; boxCol++) {
                    const boxSet = new Set<number>()
                    for (let y = 0; y < 3; y++) {
                        for (let x = 0; x < 3; x++) {
                            boxSet.add(grid[boxRow * 3 + y][boxCol * 3 + x])
                        }
                    }
                    expect(boxSet.size).toBe(9)
                }
            }
        })
    })

    describe('createPuzzle', () => {
        it('should produce a grid based on solved grid with some zeroes for easy', () => {
            const solved = createSolvedGrid()
            const puzzle = createPuzzle(solved, 'easy')
            expect(puzzle.length).toBe(9)
            const zeros = puzzle.flat().filter(v => v === 0).length
            expect(zeros).toBeGreaterThan(0)
        })

        it('should remove more cells for harder difficulties', () => {
            const solved = createSolvedGrid()
            const easy = createPuzzle(solved, 'easy')
            const hard = createPuzzle(solved, 'hard')
            const easyZeros = easy.flat().filter(v => v === 0).length
            const hardZeros = hard.flat().filter(v => v === 0).length
            expect(hardZeros).toBeGreaterThanOrEqual(easyZeros)
        })

        it('should produce correct number of removed cells for medium', () => {
            const solved = createSolvedGrid()
            const medium = createPuzzle(solved, 'medium')
            const zeros = medium.flat().filter(v => v === 0).length
            expect(zeros).toBe(50)
        })

        it('should not modify the original solved grid', () => {
            const solved = createSolvedGrid()
            const solvedCopy = solved.map(r => [...r])
            createPuzzle(solved, 'hard')
            expect(solved).toEqual(solvedCopy)
        })
    })

    describe('isValidMove', () => {
        let grid: number[][]

        beforeEach(() => {
            grid = Array(9)
                .fill(null)
                .map(() => Array(9).fill(0))
        })

        it('should return true for a valid placement in an empty grid', () => {
            expect(isValidMove(grid, 0, 0, 5)).toBe(true)
        })

        it('should return false if number already in row', () => {
            grid[0][3] = 7
            expect(isValidMove(grid, 0, 0, 7)).toBe(false)
        })

        it('should return false if number already in column', () => {
            grid[3][0] = 4
            expect(isValidMove(grid, 0, 0, 4)).toBe(false)
        })

        it('should return false if number already in 3x3 box', () => {
            grid[1][1] = 9
            expect(isValidMove(grid, 0, 2, 9)).toBe(false)
        })

        it('should return true when the conflict is in a different box', () => {
            grid[4][4] = 5
            expect(isValidMove(grid, 0, 0, 5)).toBe(true)
        })
    })

    describe('isComplete', () => {
        it('should return true for a valid complete grid', () => {
            expect(isComplete(validCompleteGrid())).toBe(true)
        })

        it('should return false when a cell is zero', () => {
            const grid = validCompleteGrid()
            grid[4][4] = 0
            expect(isComplete(grid)).toBe(false)
        })

        it('should return false when a row has duplicates', () => {
            const grid = validCompleteGrid()
            // Put duplicate in row 0 (col 0 and col 1 both = 5)
            grid[0][1] = 5
            expect(isComplete(grid)).toBe(false)
        })

        it('should return false when a column has duplicates', () => {
            const grid = validCompleteGrid()
            // Row 0 col 0 is 5; set row 1 col 0 also to 5
            grid[1][0] = 5
            expect(isComplete(grid)).toBe(false)
        })

        it('should return false when a 3x3 box has duplicates', () => {
            const grid = validCompleteGrid()
            // Top-left box: rows 0-2, cols 0-2; put duplicate
            grid[2][2] = grid[0][0] // duplicate 5 in top-left box
            expect(isComplete(grid)).toBe(false)
        })

        it('should return false when box has duplicates but rows and columns are unique', () => {
            // Cyclic shift by 1 per row: each row/col has 1-9 once, but boxes have duplicates
            const grid = [
                [1, 2, 3, 4, 5, 6, 7, 8, 9],
                [2, 3, 4, 5, 6, 7, 8, 9, 1],
                [3, 4, 5, 6, 7, 8, 9, 1, 2],
                [4, 5, 6, 7, 8, 9, 1, 2, 3],
                [5, 6, 7, 8, 9, 1, 2, 3, 4],
                [6, 7, 8, 9, 1, 2, 3, 4, 5],
                [7, 8, 9, 1, 2, 3, 4, 5, 6],
                [8, 9, 1, 2, 3, 4, 5, 6, 7],
                [9, 1, 2, 3, 4, 5, 6, 7, 8],
            ]
            // Top-left box: 1,2,3; 2,3,4; 3,4,5 — has duplicates → hits lines 195-196
            expect(isComplete(grid)).toBe(false)
        })
    })

    describe('findConflicts', () => {
        it('should return empty array when no conflicts', () => {
            const grid = Array(9)
                .fill(null)
                .map(() => Array(9).fill(0))
            const conflicts = findConflicts(grid, 0, 0, 5)
            expect(conflicts).toEqual([])
        })

        it('should find row conflict', () => {
            const grid = Array(9)
                .fill(null)
                .map(() => Array(9).fill(0))
            grid[0][5] = 7
            const conflicts = findConflicts(grid, 0, 0, 7)
            expect(conflicts).toContainEqual({ row: 0, col: 5 })
        })

        it('should find column conflict', () => {
            const grid = Array(9)
                .fill(null)
                .map(() => Array(9).fill(0))
            grid[5][0] = 3
            const conflicts = findConflicts(grid, 0, 0, 3)
            expect(conflicts).toContainEqual({ row: 5, col: 0 })
        })

        it('should find box conflict', () => {
            const grid = Array(9)
                .fill(null)
                .map(() => Array(9).fill(0))
            grid[1][1] = 8
            const conflicts = findConflicts(grid, 0, 0, 8)
            expect(conflicts).toContainEqual({ row: 1, col: 1 })
        })

        it('should find multiple conflicts', () => {
            const grid = Array(9)
                .fill(null)
                .map(() => Array(9).fill(0))
            grid[0][8] = 6 // row conflict
            grid[7][0] = 6 // column conflict
            const conflicts = findConflicts(grid, 0, 0, 6)
            expect(conflicts).toHaveLength(2)
        })

        it('should not count the cell itself as a conflict', () => {
            const grid = Array(9)
                .fill(null)
                .map(() => Array(9).fill(0))
            grid[0][0] = 5
            const conflicts = findConflicts(grid, 0, 0, 5)
            expect(conflicts).not.toContainEqual({ row: 0, col: 0 })
        })
    })
})
