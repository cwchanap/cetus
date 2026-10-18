// Core types for the unified game framework

import type {
    ScoreSubmissionResult,
    ScoreSubmitter,
} from '@/lib/services/scoreService'

export interface BaseGameState {
    score: number
    timeRemaining: number
    isActive: boolean
    isPaused: boolean
    isGameOver: boolean
    gameStarted: boolean
}

export interface BaseGameConfig {
    duration: number // in seconds
    pausable: boolean
    resettable: boolean
    /** Transport override for the end-of-run score save; defaults to scoreService. */
    submitScore?: ScoreSubmitter
}

export interface ScoringConfig {
    basePoints: number
    bonusMultiplier?: number
    penaltyPoints?: number
    timeBonus?: boolean
}

export interface BaseGameCallbacks {
    onStart?: () => void
    onPause?: () => void
    onResume?: () => void
    onEnd?: (finalScore: number, stats: BaseGameStats) => void
    onScoreUpdate?: (score: number) => void
    onTimeUpdate?: (timeRemaining: number) => void
    onStateChange?: (state: BaseGameState) => void
}

export interface BaseGameStats {
    finalScore: number
    timeElapsed: number
    gameCompleted: boolean
}

export type ChallengeUpdates = NonNullable<
    ScoreSubmissionResult['challengeUpdates']
>

// Event system types
export type GameEventType =
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'score-update'
    | 'time-update'
    | 'time-complete'
    | 'state-change'

export interface GameEvent {
    type: GameEventType
    data?: Record<string, unknown>
    timestamp: number
}

// Renderer types
export type RendererType = 'canvas' | 'dom'

export interface RendererConfig {
    type: RendererType
    container: string // DOM selector
    width?: number
    height?: number
    responsive?: boolean
}
