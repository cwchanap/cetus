// 2048 Game Type Definitions

/**
 * Represents a coordinate on the game board
 */
export interface Position {
    row: number // 0-3 (top to bottom)
    col: number // 0-3 (left to right)
}

/**
 * Represents a numbered tile on the board
 */
export interface Tile {
    id: string // Unique identifier for animation tracking (e.g., "tile-1", "tile-2")
    value: number // Power of 2: 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096...
    position: Position // Current position on the board
    mergedFrom?: Tile[] // If this tile was created from a merge, references source tiles (for animation)
    isNew?: boolean // True if tile was just spawned (for spawn animation)
}

/**
 * Represents the 4x4 game grid
 * null = empty cell
 */
export type Board = (Tile | null)[][]

/**
 * Represents the four possible move directions
 */
export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Represents the outcome of a move operation
 */
export interface MoveResult {
    board: Board // New board state after move
    moved: boolean // True if any tiles moved
    scoreGained: number // Points earned from merges in this move
    mergeCount: number // Number of merges that occurred
    animations: Animation[] // Animation data for renderer
}

/**
 * Data for rendering tile animations
 */
export interface Animation {
    type: 'move' | 'merge' | 'spawn'
    tileId: string
    from?: Position // For move: starting position
    to: Position // Target position
    value?: number // For merge/spawn: tile value
}

/**
 * Complete game state for the 2048 game
 */
export interface GameState {
    board: Board
    score: number
    gameStarted: boolean
    gameOver: boolean
    won: boolean // True when 2048 tile created (can continue playing)
    moveCount: number // Total moves made
    maxTile: number // Highest tile value achieved
    lastMoveAnimations: Animation[] // Animations from last move
    tileIdCounter: number // For generating unique tile IDs
}

/**
 * Statistics for achievement tracking and score submission
 */
export interface GameStats {
    finalScore: number
    maxTile: number
    moveCount: number
    mergeCount: number // Total merges during game
    gameWon: boolean // Did player reach 2048?
}

/**
 * Callback interfaces for game lifecycle events
 */
export interface GameCallbacks {
    onScoreChange?: (score: number) => void
    onGameOver?: (finalScore: number, stats: GameStats) => void
    onWin?: () => void
    onMove?: (result: MoveResult) => void
}

/**
 * Game constants configuration
 */
export interface GameConstants {
    BOARD_SIZE: number
    TILE_SIZE: number
    GAP: number
    INITIAL_TILES: number
    WIN_TILE: number
    SPAWN_2_PROBABILITY: number
    ANIMATION_DURATION: number
    SWIPE_THRESHOLD: number
}

/**
 * Default game constants
 */
export const GAME_CONSTANTS: GameConstants = {
    BOARD_SIZE: 4,
    TILE_SIZE: 90,
    GAP: 10,
    INITIAL_TILES: 2,
    WIN_TILE: 2048,
    SPAWN_2_PROBABILITY: 0.9, // 90% for value 2, 10% for value 4
    ANIMATION_DURATION: 150, // milliseconds
    SWIPE_THRESHOLD: 30, // minimum pixels for swipe detection
}
