import type { Application, Container, Graphics } from 'pixi.js'
export interface GameObject {
    id: string
    type: 'coin' | 'bomb'
    x: number
    y: number
    speed: number
    spawnTime: number
}

export interface Player {
    y: number
    size: number
    speed: number
}

export interface GameState {
    score: number
    timeRemaining: number
    isGameActive: boolean
    isGameOver: boolean
    gameStartTime: number | null
    objects: GameObject[]
    player: Player
    coinsCollected: number
    bombsHit: number
    gameHistory: Array<{
        type: 'coin' | 'bomb'
        points: number
    }>
}

export interface GameConfig {
    gameDuration: number // 60 seconds
    canvasWidth: number
    canvasHeight: number
    playerSize: number
    playerSpeed: number
    objectSize: number
    spawnInterval: number // seconds
    objectSpeed: number
    coinToBombRatio: number // e.g., 2:1
    pointsForCoin: number
    pointsForBomb: number
}

export interface GameCallbacks {
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (timeRemaining: number) => void
    onObjectSpawn: (object: GameObject) => void
    onCollision: (object: GameObject, points: number) => void
    onGameOver: (finalScore: number, stats: any) => void
    onGameStart: () => void
}

export interface GameStats {
    finalScore: number
    coinsCollected: number
    bombsHit: number
    gameHistory: Array<{
        type: 'coin' | 'bomb'
        points: number
    }>
}

export interface RendererState {
    app: Application
    stage: Container
    objectContainer: Container
    playerGraphic: Graphics
    objectGraphics: Map<string, Graphics>
}
