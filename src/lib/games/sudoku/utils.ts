/**
 * Creates a solved 9x9 Sudoku grid using backtracking algorithm
 */
export function createSolvedGrid(): number[][] {
    const grid: number[][] = Array(9)
        .fill(null)
        .map(() => Array(9).fill(0))

    function isValid(row: number, col: number, num: number): boolean {
        // Check row
        for (let x = 0; x < 9; x++) {
            if (grid[row][x] === num) {
                return false
            }
        }

        // Check column
        for (let y = 0; y < 9; y++) {
            if (grid[y][col] === num) {
                return false
            }
        }

        // Check 3x3 box
        const boxRow = Math.floor(row / 3) * 3
        const boxCol = Math.floor(col / 3) * 3
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                if (grid[boxRow + y][boxCol + x] === num) {
                    return false
                }
            }
        }

        return true
    }

    function solve(row = 0, col = 0): boolean {
        if (row === 9) {
            return true
        }
        if (col === 9) {
            return solve(row + 1, 0)
        }

        // Skip filled cells
        if (grid[row][col] !== 0) {
            return solve(row, col + 1)
        }

        // Try numbers 1-9
        const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        // Shuffle array for randomization
        for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[numbers[i], numbers[j]] = [numbers[j], numbers[i]]
        }

        for (const num of numbers) {
            if (isValid(row, col, num)) {
                grid[row][col] = num
                if (solve(row, col + 1)) {
                    return true
                }
                grid[row][col] = 0
            }
        }

        return false
    }

    solve()
    return grid
}

/**
 * Creates a puzzle by removing numbers from a solved grid
 * Based on difficulty level
 */
export function createPuzzle(
    solvedGrid: number[][],
    difficulty: 'easy' | 'medium' | 'hard'
): number[][] {
    const puzzle = solvedGrid.map(row => [...row])
    let cellsToRemove: number

    // Determine how many cells to remove based on difficulty
    // Higher difficulty = more cells removed
    switch (difficulty) {
        case 'easy':
            cellsToRemove = 40 // Leave ~41 clues
            break
        case 'medium':
            cellsToRemove = 50 // Leave ~31 clues
            break
        case 'hard':
            cellsToRemove = 60 // Leave ~21 clues
            break
    }

    // Build a shuffled list of all 81 cell positions so each cell is
    // considered exactly once.
    const positions: Array<{ row: number; col: number }> = []
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            positions.push({ row, col })
        }
    }
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[positions[i], positions[j]] = [positions[j], positions[i]]
    }

    // Remove cells while preserving a unique solution. If removing a cell
    // would create multiple solutions, restore it and try the next cell.
    let removed = 0
    for (const { row, col } of positions) {
        if (removed >= cellsToRemove) {
            break
        }

        const backup = puzzle[row][col]
        if (backup === 0) {
            continue
        }

        puzzle[row][col] = 0
        if (countSolutions(puzzle, 2) !== 1) {
            puzzle[row][col] = backup
        } else {
            removed++
        }
    }

    return puzzle
}

/**
 * Counts the number of solutions a grid has, up to `limit`.
 * Uses backtracking. Operates on a copy of the grid.
 */
export function countSolutions(grid: number[][], limit: number = 2): number {
    let count = 0

    function solve(g: number[][]): void {
        if (count >= limit) {
            return
        }

        let row = -1
        let col = -1
        for (let r = 0; r < 9 && row === -1; r++) {
            for (let c = 0; c < 9 && row === -1; c++) {
                if (g[r][c] === 0) {
                    row = r
                    col = c
                }
            }
        }

        if (row === -1) {
            count++
            return
        }

        for (let num = 1; num <= 9; num++) {
            if (isValidMove(g, row, col, num)) {
                g[row][col] = num
                solve(g)
                g[row][col] = 0
            }
        }
    }

    solve(grid.map(row => [...row]))
    return count
}

/**
 * Validates if a number can be placed in a specific cell
 */
export function isValidMove(
    grid: number[][],
    row: number,
    col: number,
    num: number
): boolean {
    // Check row
    for (let x = 0; x < 9; x++) {
        if (grid[row][x] === num) {
            return false
        }
    }

    // Check column
    for (let y = 0; y < 9; y++) {
        if (grid[y][col] === num) {
            return false
        }
    }

    // Check 3x3 box
    const boxRow = Math.floor(row / 3) * 3
    const boxCol = Math.floor(col / 3) * 3
    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
            if (grid[boxRow + y][boxCol + x] === num) {
                return false
            }
        }
    }

    return true
}

/**
 * Checks if the current grid is complete and valid
 */
export function isComplete(grid: number[][]): boolean {
    // Check if all cells are filled
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (grid[row][col] === 0) {
                return false
            }
        }
    }

    // Check if all rows, columns, and boxes are valid
    for (let i = 0; i < 9; i++) {
        // Check row
        const rowSet = new Set()
        // Check column
        const colSet = new Set()

        for (let j = 0; j < 9; j++) {
            // Check row
            if (rowSet.has(grid[i][j])) {
                return false
            }
            rowSet.add(grid[i][j])

            // Check column
            if (colSet.has(grid[j][i])) {
                return false
            }
            colSet.add(grid[j][i])
        }
    }

    // Check 3x3 boxes
    for (let boxRow = 0; boxRow < 3; boxRow++) {
        for (let boxCol = 0; boxCol < 3; boxCol++) {
            const boxSet = new Set()
            for (let y = 0; y < 3; y++) {
                for (let x = 0; x < 3; x++) {
                    const num = grid[boxRow * 3 + y][boxCol * 3 + x]
                    if (boxSet.has(num)) {
                        return false
                    }
                    boxSet.add(num)
                }
            }
        }
    }

    return true
}

/**
 * Finds conflicting cells for a given position
 */
export function findConflicts(
    grid: number[][],
    row: number,
    col: number,
    value: number
): Array<{ row: number; col: number }> {
    const conflicts: Array<{ row: number; col: number }> = []

    // Check row
    for (let x = 0; x < 9; x++) {
        if (x !== col && grid[row][x] === value) {
            conflicts.push({ row, col: x })
        }
    }

    // Check column
    for (let y = 0; y < 9; y++) {
        if (y !== row && grid[y][col] === value) {
            conflicts.push({ row: y, col })
        }
    }

    // Check 3x3 box
    const boxRow = Math.floor(row / 3) * 3
    const boxCol = Math.floor(col / 3) * 3
    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
            const currentRow = boxRow + y
            const currentCol = boxCol + x
            if (
                currentRow !== row &&
                currentCol !== col &&
                grid[currentRow][currentCol] === value
            ) {
                conflicts.push({ row: currentRow, col: currentCol })
            }
        }
    }

    return conflicts
}
