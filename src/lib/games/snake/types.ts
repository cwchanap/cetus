// Types for Snake game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'

export interface Position {
    x: number
    y: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface SnakeSegment extends Position {
    id: string
}

export interface Food extends Position {
    id: string
    spawnTime: number
}

// Extended state for Snake game (extends BaseGameState)
export interface SnakeState extends BaseGameState {
    snake: SnakeSegment[]
    food: Food | null
    direction: Direction
    nextDirection: Direction
    lastFoodSpawnTime: number
    lastMoveTime: number
    foodsEaten: number
    maxLength: number
    needsRedraw: boolean
}

// Extended config for Snake game (extends BaseGameConfig)
export interface SnakeConfig extends BaseGameConfig {
    gridWidth: number
    gridHeight: number
    cellSize: number
    gameWidth: number
    gameHeight: number
    moveInterval: number // milliseconds between moves
    foodSpawnInterval: number // milliseconds
    snakeColor: number
    foodColor: number
    gridColor: number
    backgroundColor: number
}

// Extended stats for Snake game (extends BaseGameStats)
export interface SnakeStats extends BaseGameStats {
    foodsEaten: number
    maxLength: number
}

// Legacy types for backwards compatibility during migration
export interface GameState {
    snake: SnakeSegment[]
    food: Food | null
    direction: Direction
    nextDirection: Direction
    score: number
    timeRemaining: number
    gameOver: boolean
    gameStarted: boolean
    paused: boolean
    pauseStartedAt: number | null
    lastFoodSpawnTime: number
    lastMoveTime: number
    gameStartTime: number | null
    foodsEaten: number
    maxLength: number
    needsRedraw: boolean
    onGameOver?: (finalScore: number, stats: GameStats) => void | Promise<void>
}

export interface GameConstants {
    GRID_WIDTH: number
    GRID_HEIGHT: number
    CELL_SIZE: number
    GAME_WIDTH: number
    GAME_HEIGHT: number
    GAME_DURATION: number // 60 seconds
    MOVE_INTERVAL: number // milliseconds between moves
    FOOD_SPAWN_INTERVAL: number // 1 second
    SNAKE_COLOR: number
    FOOD_COLOR: number
    GRID_COLOR: number
    BACKGROUND_COLOR: number
}

export interface GameStats {
    finalScore: number
    foodsEaten: number
    maxLength: number
    gameTime: number
}
