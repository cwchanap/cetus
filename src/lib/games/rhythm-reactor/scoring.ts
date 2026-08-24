import type { RhythmReactorJudgment } from './types'

const PERFECT_POINTS = 100
const GOOD_POINTS = 60
const MAX_COMBO_MULTIPLIER_STEPS = 4
const COMBO_MULTIPLIER_STEP = 0.25

export function calculateRhythmReactorHitPoints(
    judgment: RhythmReactorJudgment,
    combo: number
): number {
    const basePoints =
        judgment === 'perfect'
            ? PERFECT_POINTS
            : judgment === 'good'
              ? GOOD_POINTS
              : 0
    const multiplierSteps = Math.min(
        Math.floor(combo / 10),
        MAX_COMBO_MULTIPLIER_STEPS
    )
    const multiplier = 1 + multiplierSteps * COMBO_MULTIPLIER_STEP
    return basePoints * multiplier
}

export function calculateRhythmReactorAccuracy(
    perfectHits: number,
    goodHits: number,
    misses: number,
    strayPresses: number
): number {
    const judgments = perfectHits + goodHits + misses + strayPresses
    return judgments <= 0
        ? 0
        : ((perfectHits + goodHits * 0.5) / judgments) * 100
}
