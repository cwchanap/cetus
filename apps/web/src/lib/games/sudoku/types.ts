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

export type GameDifficulty = 'easy' | 'medium' | 'hard'
