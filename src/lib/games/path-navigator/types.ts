import type { Application, Container, Graphics } from 'pixi.js'

export interface Point {
    x: number
    y: number
}

export interface PathSegment {
    start: Point
    end: Point
    width: number
    type: 'straight' | 'curve'
    controlPoint?: Point // For bezier curves
}

export interface GamePath {
    segments: PathSegment[]
    startPoint: Point
    endPoint: Point
    totalWidth: number
}

export interface GameLevel {
    id: number
    name: string
    difficulty: 'easy' | 'medium' | 'hard' | 'expert'
    path: GamePath
    timeBonus: number // Bonus points per second remaining
    basePoints: number // Base points for completion
}

export interface Cursor {
    x: number
    y: number
    radius: number
    isVisible: boolean
}

export interface GameState {
    currentLevel: number
    score: number
    timeRemaining: number
    isGameActive: boolean
    isGameOver: boolean
    isGameWon: boolean
    gameStartTime: number | null
    cursor: Cursor
    isOnPath: boolean
    hasReachedGoal: boolean
    totalLevels: number
    levelStartTime: number | null
    isBoundaryDetectionEnabled: boolean // Only enable after user reaches start position
}

export interface GameConfig {
    gameDuration: number // 60 seconds total
    gameWidth: number
    gameHeight: number
    cursorRadius: number
    pathColor: number
    cursorColor: number
    goalColor: number
    backgroundColor: number
    outOfBoundsColor: number
}

export interface GameCallbacks {
    onScoreUpdate: (score: number) => void
    onTimeUpdate: (timeRemaining: number) => void
    onLevelChange: (level: number) => void
    onPathViolation: () => void
    onGoalReached: () => void
    onGameOver: (finalScore: number, stats: GameStats) => void
    onGameStart: () => void
    onScoreUpload?: (success: boolean) => void
}

export interface GameStats {
    finalScore: number
    levelsCompleted: number
    totalTime: number
    averageTimePerLevel: number
    pathViolations: number
    perfectLevels: number // Levels completed without path violations
}

export interface RendererState {
    app: Application
    stage: Container
    gameContainer: Container
    pathGraphics: Graphics
    cursorGraphics: Graphics
    goalGraphics: Graphics
    backgroundGraphics: Graphics
}

export interface CollisionResult {
    isOnPath: boolean
    hasReachedGoal: boolean
    closestPoint?: Point
    distance?: number
}
