// Framework-integrated types for the Evader game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'
import type { GameObject, Player, GameHistoryEntry } from './types'

// Extended state for Evader (extends BaseGameState)
export interface EvaderState extends BaseGameState {
    objects: GameObject[]
    player: Player
    coinsCollected: number
    bombsHit: number
    gameHistory: GameHistoryEntry[]
}

// Extended config for Evader (extends BaseGameConfig)
export interface EvaderConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    playerSize: number
    playerSpeed: number
    objectSize: number
    spawnInterval: number // seconds
    objectSpeed: number
    coinToBombRatio: number
    pointsForCoin: number
    pointsForBomb: number
    backgroundColor: number
}

// Extended stats for Evader (extends BaseGameStats)
export interface EvaderStats extends BaseGameStats {
    coinsCollected: number
    bombsHit: number
    gameHistory: GameHistoryEntry[]
}
