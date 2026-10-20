import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export const RHYTHM_REACTOR_RULES = {
    duration: 60,
    canvasWidth: 800,
    canvasHeight: 420,
    laneCount: 4,
    beatStepSeconds: 0.5,
    firstHitTimeSeconds: 2,
    approachSeconds: 2,
    perfectWindowSeconds: 0.08,
    goodWindowSeconds: 0.16,
    missWindowSeconds: 0.4,
    maxUpdateDelta: 0.1,
    noteSpawnY: 40,
    hitLineY: 340,
    initialStability: 60,
    perfectStabilityGain: 4,
    goodStabilityGain: 2,
    missStabilityLoss: 6,
    strayStabilityLoss: 6,
    comboStabilityInterval: 10,
    comboStabilityBonus: 5,
} as const

export type RhythmReactorLane = 0 | 1 | 2 | 3
export type RhythmReactorJudgment = 'perfect' | 'good' | 'miss'

export interface RhythmReactorNote {
    id: string
    laneIndex: RhythmReactorLane
    hitTimeSeconds: number
}

export interface RhythmReactorConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    laneCount: number
    beatStepSeconds: number
    firstHitTimeSeconds: number
    approachSeconds: number
    perfectWindowSeconds: number
    goodWindowSeconds: number
    missWindowSeconds: number
    maxUpdateDelta: number
    noteSpawnY: number
    hitLineY: number
    initialStability: number
    perfectStabilityGain: number
    goodStabilityGain: number
    missStabilityLoss: number
    strayStabilityLoss: number
    comboStabilityInterval: number
    comboStabilityBonus: number
    chart: readonly RhythmReactorNote[]
}

export interface RhythmReactorState extends BaseGameState {
    elapsedSeconds: number
    pendingNotes: RhythmReactorNote[]
    perfectHits: number
    goodHits: number
    misses: number
    strayPresses: number
    combo: number
    maxCombo: number
    stability: number
    lastJudgment: RhythmReactorJudgment | null
}

export interface RhythmReactorStats extends BaseGameStats {
    hits: number
    perfectHits: number
    goodHits: number
    misses: number
    strayPresses: number
    maxCombo: number
    accuracy: number
    finalStability: number
}

export interface RhythmReactorGameData {
    hits: number
    perfectHits: number
    goodHits: number
    misses: number
    strayPresses: number
    maxCombo: number
    accuracy: number
    finalStability: number
}

export interface RhythmReactorHitResult {
    accepted: boolean
    judgment: RhythmReactorJudgment | null
    points: number
}
