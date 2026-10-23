export const SCORING_CONFIG = {
    lockBase: 100,
    comboStep: 0.5,
    comboCap: 3,
    levelBonusBase: 250,
    timeBonusPerSec: 10,
    comboWindowMs: 2500,
    snapThresholdDeg: 8,
} as const

export function comboMultiplier(comboCount: number): number {
    if (comboCount <= 1) {
        return 1
    }
    return Math.min(
        SCORING_CONFIG.comboCap,
        1 + SCORING_CONFIG.comboStep * (comboCount - 1)
    )
}

export function lockPoints(comboCount: number): number {
    return Math.round(SCORING_CONFIG.lockBase * comboMultiplier(comboCount))
}

export function levelClearBonus(levelNumber: number): number {
    return SCORING_CONFIG.levelBonusBase * levelNumber
}

export function timeBonus(secondsRemaining: number): number {
    return Math.max(0, secondsRemaining) * SCORING_CONFIG.timeBonusPerSec
}
