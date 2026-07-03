// Framework-integrated types for the 2048 game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'
import type { Board, Animation } from './types'

// Extended state for 2048 (extends BaseGameState)
export interface Game2048State extends BaseGameState {
    board: Board
    maxTile: number
    moveCount: number
    mergeCount: number
    won: boolean
    lastMoveAnimations: Animation[]
    tileIdCounter: number
    needsRedraw: boolean
}

// Extended config for 2048 (extends BaseGameConfig)
export interface Game2048Config extends BaseGameConfig {
    tileSize: number
    gap: number
    gameWidth: number
    gameHeight: number
    animationDuration: number
    swipeThreshold: number
    backgroundColor: number
    boardBgColor: number
    cellColor: number
}

// Extended stats for 2048 (extends BaseGameStats)
export interface Game2048Stats extends BaseGameStats {
    maxTile: number
    moveCount: number
    mergeCount: number
    won: boolean
}
