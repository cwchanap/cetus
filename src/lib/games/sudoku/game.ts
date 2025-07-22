import type { GameState, GameDifficulty } from './types'
import {
    createSolvedGrid,
    createPuzzle,
    isValidMove,
    isComplete,
    findConflicts,
} from './utils'

/**
 * Initializes a new Sudoku game state
 */
export function initializeGame(
    difficulty: GameDifficulty = 'medium'
): GameState {
    // Create a solved grid
    const solvedGrid = createSolvedGrid()

    // Create a puzzle based on difficulty
    const puzzleGrid = createPuzzle(solvedGrid, difficulty)

    // Convert to SudokuCell format
    const cells = puzzleGrid.map((row, rowIndex) =>
        row.map((value, colIndex) => ({
            value: value === 0 ? null : value,
            isGiven: value !== 0,
            isHighlighted: false,
            isConflicting: false,
        }))
    )

    return {
        grid: {
            cells,
            selectedCell: null,
        },
        difficulty,
        timer: 0,
        mistakes: 0,
        isComplete: false,
        isPaused: false,
        isGameOver: false,
    }
}

/**
 * Handles cell selection
 */
export function selectCell(state: GameState, row: number, col: number): void {
    // Don't allow selection if game is over or complete
    if (state.isGameOver || state.isComplete) {
        return
    }

    // Toggle off selection if clicking the same cell
    if (
        state.grid.selectedCell?.row === row &&
        state.grid.selectedCell?.col === col
    ) {
        state.grid.selectedCell = null
        return
    }

    // Update selected cell
    state.grid.selectedCell = { row, col }

    // Highlight related cells
    highlightRelatedCells(state, row, col)
}

/**
 * Highlights cells in the same row, column, and box
 */
function highlightRelatedCells(
    state: GameState,
    row: number,
    col: number
): void {
    // Reset all highlights
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            state.grid.cells[r][c].isHighlighted = false
        }
    }

    // Highlight row
    for (let c = 0; c < 9; c++) {
        state.grid.cells[row][c].isHighlighted = true
    }

    // Highlight column
    for (let r = 0; r < 9; r++) {
        state.grid.cells[r][col].isHighlighted = true
    }

    // Highlight 3x3 box
    const boxRow = Math.floor(row / 3) * 3
    const boxCol = Math.floor(col / 3) * 3
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            state.grid.cells[boxRow + r][boxCol + c].isHighlighted = true
        }
    }

    // The selected cell should not be highlighted
    state.grid.cells[row][col].isHighlighted = false
}

/**
 * Places a number in the selected cell
 */
export function placeNumber(state: GameState, num: number): void {
    // Don't allow input if no cell is selected or game is over/complete
    if (!state.grid.selectedCell || state.isGameOver || state.isComplete) {
        return
    }

    const { row, col } = state.grid.selectedCell
    const cell = state.grid.cells[row][col]

    // Don't allow changing given cells
    if (cell.isGiven) {
        return
    }

    // Get current grid as numbers for validation
    const currentGrid = state.grid.cells.map(r => r.map(c => c.value || 0))

    // Check if move is valid
    const isValid = isValidMove(currentGrid, row, col, num)

    // Set the value
    cell.value = num
    cell.isConflicting = !isValid

    // If invalid, increment mistakes
    if (!isValid) {
        state.mistakes++

        // Game over after 3 mistakes
        if (state.mistakes >= 3) {
            state.isGameOver = true
        }
    }

    // Clear selection
    state.grid.selectedCell = null

    // Check if puzzle is complete
    const completedGrid = state.grid.cells.map(r => r.map(c => c.value || 0))

    if (isComplete(completedGrid)) {
        state.isComplete = true
    }
}

/**
 * Clears the selected cell
 */
export function clearCell(state: GameState): void {
    // Don't allow clearing if no cell is selected or game is over/complete
    if (!state.grid.selectedCell || state.isGameOver || state.isComplete) {
        return
    }

    const { row, col } = state.grid.selectedCell
    const cell = state.grid.cells[row][col]

    // Don't allow clearing given cells
    if (cell.isGiven) {
        return
    }

    // Clear the value and conflicts
    cell.value = null
    cell.isConflicting = false

    // Clear selection
    state.grid.selectedCell = null
}

/**
 * Updates the game timer
 */
export function updateTimer(state: GameState): void {
    if (!state.isPaused && !state.isComplete && !state.isGameOver) {
        state.timer++
    }
}

/**
 * Toggles game pause state
 */
export function togglePause(state: GameState): void {
    if (state.isComplete || state.isGameOver) {
        return
    }
    state.isPaused = !state.isPaused
}
