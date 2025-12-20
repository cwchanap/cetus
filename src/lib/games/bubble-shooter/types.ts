// Types for the Bubble Shooter game

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

export interface GameState {
    grid: (Bubble | null)[][]
    shooter: Position
    currentBubble: Bubble | null
    nextBubble: { color: number } | null
    aimAngle: number
    projectile: Projectile | null
    score: number
    bubblesRemaining: number
    gameStarted: boolean
    gameOver: boolean
    paused: boolean
    rowOffset: number
    shotCount: number
    needsRedraw: boolean
    onGameOver?: (finalScore: number, stats: BubbleShooterEndGameStats) => void
    bubblesPopped?: number
    shotsFired?: number
    largestCombo?: number
}

export interface GameConstants {
    BUBBLE_RADIUS: number
    GRID_WIDTH: number
    GRID_HEIGHT: number
    COLORS: number[]
    GAME_WIDTH: number
    GAME_HEIGHT: number
    SHOOTER_Y: number
}
