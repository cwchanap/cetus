// Types for the Path Navigator game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'

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

// Extended state for Path Navigator game (extends BaseGameState)
export interface PathNavigatorState extends BaseGameState {
    currentLevel: number
    isGameWon: boolean
    gameStartTime: number | null
    cursor: Cursor
    isOnPath: boolean
    hasReachedGoal: boolean
    totalLevels: number
    levelStartTime: number | null
    isBoundaryDetectionEnabled: boolean // Only enable after user reaches start position
}

// Extended config for Path Navigator game (extends BaseGameConfig)
export interface PathNavigatorConfig extends BaseGameConfig {
    gameWidth: number
    gameHeight: number
    cursorRadius: number
    pathColor: number
    cursorColor: number
    goalColor: number
    backgroundColor: number
    outOfBoundsColor: number
}

// Extended stats for Path Navigator game (extends BaseGameStats)
export interface PathNavigatorStats extends BaseGameStats {
    levelsCompleted: number
    totalTime: number
    averageTimePerLevel: number
    pathViolations: number
    perfectLevels: number // Levels completed without path violations
}

export interface CollisionResult {
    isOnPath: boolean
    hasReachedGoal: boolean
    closestPoint?: Point
    distance?: number
}
