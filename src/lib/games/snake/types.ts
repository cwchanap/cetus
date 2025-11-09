// Types for Snake game
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
    lastFoodSpawnTime: number
    lastMoveTime: number
    gameStartTime: number | null
    foodsEaten: number
    maxLength: number
    needsRedraw: boolean
    onGameOver?: (finalScore: number, stats: GameStats) => void
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
    averageLength: number
}

export interface GameCallbacks {
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (timeRemaining: number) => void
    onFoodEaten: (food: Food) => void
    onGameOver: (finalScore: number, stats: GameStats) => void
    onGameStart: () => void
}
