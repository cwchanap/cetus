export interface Cell {
    id: string
    row: number
    col: number
    x: number
    y: number
}

export interface GameObject {
    id: string
    type: 'coin' | 'bomb'
    cell: Cell
    spawnTime: number
    expirationTime: number
    isActive: boolean
    clicked: boolean
}

export interface GameState {
    score: number
    timeRemaining: number
    isGameActive: boolean
    isGameOver: boolean
    gameStartTime: number | null
    objects: GameObject[]
    totalClicks: number
    correctClicks: number
    incorrectClicks: number
    coinsCollected: number
    bombsHit: number
    missedCoins: number
    gameHistory: Array<{
        objectId: string
        type: 'coin' | 'bomb'
        clicked: boolean
        timeToClick?: number
        pointsAwarded: number
    }>
}

export interface GameConfig {
    gameDuration: number // 60 seconds
    gridSize: number // 12x12
    cellSize: number
    objectLifetime: number // 2 seconds
    spawnInterval: number // 1 second
    coinToBombRatio: number // 8:1 (coins:bombs)
    pointsForCoin: number
    pointsForBomb: number // negative points
    pointsForMissedCoin: number // negative points
}

export interface GameCallbacks {
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (timeRemaining: number) => void
    onObjectSpawn: (object: GameObject) => void
    onObjectClick: (object: GameObject, points: number) => void
    onObjectExpire: (object: GameObject) => void
    onGameOver: (finalScore: number, stats: GameStats) => void
    onGameStart: () => void
    onScoreUpload?: (success: boolean) => void
}

export interface GameStats {
    finalScore: number
    totalClicks: number
    correctClicks: number
    incorrectClicks: number
    accuracy: number
    coinsCollected: number
    bombsHit: number
    missedCoins: number
    averageReactionTime: number
    objectsSpawned: number
    gameHistory: Array<{
        objectId: string
        type: 'coin' | 'bomb'
        clicked: boolean
        timeToClick?: number
        pointsAwarded: number
    }>
}

export interface GridPosition {
    row: number
    col: number
}

export interface SpawnResult {
    success: boolean
    object?: GameObject
    reason?: string
}
