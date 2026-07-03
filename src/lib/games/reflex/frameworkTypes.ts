// Framework-integrated types for the Reflex game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'
import type { GameObject, Cell, GameHistoryEntry } from './types'

// Extended state for Reflex (extends BaseGameState)
export interface ReflexState extends BaseGameState {
    objects: GameObject[]
    grid: Cell[][]
    totalClicks: number
    correctClicks: number
    incorrectClicks: number
    coinsCollected: number
    bombsHit: number
    missedCoins: number
    gameHistory: GameHistoryEntry[]
    needsRedraw: boolean
}

// Extended config for Reflex (extends BaseGameConfig)
export interface ReflexConfig extends BaseGameConfig {
    gridSize: number
    cellSize: number
    objectLifetime: number
    spawnInterval: number
    coinToBombRatio: number
    pointsForCoin: number
    pointsForBomb: number
    pointsForMissedCoin: number
    backgroundColor: number
    gridLineColor: number
}

// Extended stats for Reflex (extends BaseGameStats)
export interface ReflexStats extends BaseGameStats {
    totalClicks: number
    correctClicks: number
    incorrectClicks: number
    accuracy: number
    coinsCollected: number
    bombsHit: number
    missedCoins: number
    averageReactionTime: number
    objectsSpawned: number
    gameHistory: GameHistoryEntry[]
}
