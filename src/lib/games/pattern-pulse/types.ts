import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export type PatternPad = 0 | 1 | 2 | 3
export type PatternPulsePhase =
    | 'idle'
    | 'watch'
    | 'input'
    | 'feedback'
    | 'ended'
export type PatternPulseOutcome = 'playing' | 'timeout' | 'mistakes'
export type PatternPulseFeedback = 'correct' | 'wrong' | null

export const PATTERN_PULSE_TIMING = {
    initialPulseMs: 600,
    pulseStepMs: 40,
    minPulseMs: 320,
    pulseGapMs: 140,
    prePlaybackDelayMs: 400,
    feedbackMs: 500,
} as const

export interface PatternPulseConfig extends BaseGameConfig {
    initialSequenceLength: number
    mistakeLimit: number
    rng: () => number
}

export function createPatternPulseConfig(
    overrides: Partial<PatternPulseConfig> = {}
): PatternPulseConfig {
    return {
        duration: 60,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        initialSequenceLength: 3,
        mistakeLimit: 3,
        rng: Math.random,
        ...overrides,
    }
}

export interface PatternPulseState extends BaseGameState {
    phase: PatternPulsePhase
    outcome: PatternPulseOutcome
    sequence: PatternPad[]
    inputIndex: number
    activePad: PatternPad | null
    feedback: PatternPulseFeedback
    completedRounds: number
    mistakes: number
    streak: number
    maxStreak: number
    longestSequence: number
}

export interface PatternPulseStats extends BaseGameStats {
    outcome: PatternPulseOutcome
    completedRounds: number
    longestSequence: number
    mistakes: number
    maxStreak: number
}

export interface PatternPulseGameData {
    completedRounds: number
    longestSequence: number
    mistakes: number
    maxStreak: number
}
