import type { BaseGameState, BaseGameStats } from '@/lib/games/core/types'

export type MineGridDifficulty = 'easy' | 'medium' | 'hard'
export type MineGridResult = 'playing' | 'cleared' | 'mine' | 'timeout'

export interface MineGridCell {
    hasMine: boolean
    adjacentMines: number
    revealed: boolean
    flagged: boolean
}

export interface MineGridPreset {
    difficulty: MineGridDifficulty
    rows: number
    cols: number
    mines: number
    duration: number
}

export const MINE_GRID_PRESETS: Record<MineGridDifficulty, MineGridPreset> = {
    easy: { difficulty: 'easy', rows: 8, cols: 8, mines: 8, duration: 180 },
    medium: {
        difficulty: 'medium',
        rows: 10,
        cols: 10,
        mines: 15,
        duration: 300,
    },
    hard: {
        difficulty: 'hard',
        rows: 12,
        cols: 12,
        mines: 24,
        duration: 600,
    },
}

export interface MineGridConfig {
    duration: number
    achievementIntegration: boolean
    pausable: boolean
    resettable: boolean
    preset: MineGridPreset
    rng?: () => number
}

export interface MineGridState extends BaseGameState {
    difficulty: MineGridDifficulty
    board: MineGridCell[][]
    minesPlaced: boolean
    revealedSafeCells: number
    flagsPlaced: number
    incorrectFlagActions: number
    result: MineGridResult
}

export interface MineGridStats extends BaseGameStats {
    difficulty: MineGridDifficulty
    cleared: boolean
    result: MineGridResult
    revealedSafeCells: number
    totalSafeCells: number
    flagsPlaced: number
    incorrectFlagActions: number
}

export interface MineGridGameData {
    difficulty: MineGridDifficulty
    cleared: boolean
    revealedSafeCells: number
    incorrectFlagActions: number
    elapsedSeconds: number
}

export interface GridPosition {
    row: number
    col: number
}
