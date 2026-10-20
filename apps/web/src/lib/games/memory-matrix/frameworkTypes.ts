// Framework-integrated types for the Memory Matrix game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'
import type { Card } from './types'

// Extended state for Memory Matrix (extends BaseGameState)
export interface MemoryMatrixState extends BaseGameState {
    board: Card[][]
    flippedCards: Card[]
    matchedPairs: number
    totalPairs: number
    isProcessing: boolean
    gameWon: boolean
    needsRedraw: boolean
    totalAttempts: number
    matchesFound: number
    accuracy: number
}

// Extended config for Memory Matrix (extends BaseGameConfig)
export interface MemoryMatrixConfig extends BaseGameConfig {
    boardRows: number
    boardCols: number
    flipDelay: number
    pointsPerMatch: number
}

// Extended stats for Memory Matrix (extends BaseGameStats)
export interface MemoryMatrixStats extends BaseGameStats {
    matchesFound: number
    totalAttempts: number
    accuracy: number
    gameWon: boolean
}
