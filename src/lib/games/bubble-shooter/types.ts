// Types for the Bubble Shooter game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'

export interface Bubble {
    color: number
    x: number
    y: number
}

export interface Projectile {
    x: number
    y: number
    vx: number
    vy: number
    color: number
}

export interface Position {
    x: number
    y: number
}

export interface GridPosition {
    row: number
    col: number
}

// Stats passed to onGameOver callback
export interface BubbleShooterEndGameStats {
    bubblesPopped: number
    shotsFired: number
    accuracy: number
    largestCombo: number
}

// Static game constants shape consumed by the shared grid/physics helpers
export interface GameConstants {
    BUBBLE_RADIUS: number
    GRID_WIDTH: number
    GRID_HEIGHT: number
    COLORS: number[]
    GAME_WIDTH: number
    GAME_HEIGHT: number
    SHOOTER_Y: number
}

// Extended state for Bubble Shooter game (extends BaseGameState)
export interface BubbleShooterState extends BaseGameState {
    grid: (Bubble | null)[][]
    shooter: Position
    currentBubble: Bubble | null
    nextBubble: { color: number } | null
    aimAngle: number
    projectile: Projectile | null
    bubblesRemaining: number
    rowOffset: number
    shotCount: number
    shotsFired: number
    bubblesPopped: number
    largestCombo: number
    needsRedraw: boolean
}

// Extended config for Bubble Shooter game (extends BaseGameConfig)
export interface BubbleShooterConfig extends BaseGameConfig {
    bubbleRadius: number
    gridWidth: number
    gridHeight: number
    colors: number[]
    gameWidth: number
    gameHeight: number
    shooterY: number
    projectileSpeed: number
    initialRows: number
    rowAddInterval: number // shots before a new row is added
    bubbleFillChance: number // probability a cell is filled during init
    newRowFillChance: number // probability a cell is filled when adding a row
    backgroundColor: number
}

// Extended stats for Bubble Shooter game (extends BaseGameStats)
export interface BubbleShooterStats extends BaseGameStats {
    bubblesPopped: number
    shotsFired: number
    accuracy: number
    largestCombo: number
}
