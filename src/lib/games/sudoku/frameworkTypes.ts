// Framework-integrated types for the Sudoku game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'
import type { SudokuGrid } from './types'

export type { GameDifficulty } from './types'

// Extended state for Sudoku (extends BaseGameState)
export interface SudokuState extends BaseGameState {
    grid: SudokuGrid
    difficulty: 'easy' | 'medium' | 'hard'
    mistakes: number
    isComplete: boolean
    needsRedraw: boolean
}

// Extended config for Sudoku (extends BaseGameConfig)
export interface SudokuConfig extends BaseGameConfig {
    difficulty: 'easy' | 'medium' | 'hard'
}

// Extended stats for Sudoku (extends BaseGameStats)
export interface SudokuStats extends BaseGameStats {
    difficulty: 'easy' | 'medium' | 'hard'
    mistakes: number
    isComplete: boolean
    cellsFilled: number
}
