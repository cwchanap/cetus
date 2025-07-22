export interface SudokuCell {
    value: number | null
    isGiven: boolean
    isHighlighted: boolean
    isConflicting: boolean
}

export interface SudokuGrid {
    cells: SudokuCell[][]
    selectedCell: { row: number; col: number } | null
}

export interface GameState {
    grid: SudokuGrid
    difficulty: 'easy' | 'medium' | 'hard'
    timer: number
    mistakes: number
    isComplete: boolean
    isPaused: boolean
    isGameOver: boolean
}

export type GameDifficulty = 'easy' | 'medium' | 'hard'
