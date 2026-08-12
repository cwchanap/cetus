export interface IceSlideModeScoringConfig {
    objectiveStarBonus: number
    timeBudgetSeconds: number
    timeBonusPerSec: number
}

export const SCORING_CONFIG = {
    levelClearBase: 200,
    moveBonusPerUnderPar: 25,
    crystalBonus: 50,
    objectiveStarBonus: 0,
    timeBudgetSeconds: 360,
    timeBonusPerSec: 5,
} as const

export const DAILY_SCORING_CONFIG: IceSlideModeScoringConfig = {
    objectiveStarBonus: 100,
    timeBudgetSeconds: 300,
    timeBonusPerSec: 5,
}

export function levelClearPoints(levelNumber: number): number {
    return SCORING_CONFIG.levelClearBase * levelNumber
}

export function moveBonus(parMoves: number, movesUsed: number): number {
    // Award for at-or-under par. Authored parMoves is the BFS minimum, so
    // an exact-par clear still earns one step of bonus.
    if (movesUsed > parMoves) {
        return 0
    }
    return (parMoves - movesUsed + 1) * SCORING_CONFIG.moveBonusPerUnderPar
}

export function crystalBonus(crystalsCollected: number): number {
    return Math.max(0, crystalsCollected) * SCORING_CONFIG.crystalBonus
}

export function timeBonus(
    elapsedSeconds: number,
    config: IceSlideModeScoringConfig = SCORING_CONFIG
): number {
    return (
        Math.max(0, config.timeBudgetSeconds - elapsedSeconds) *
        config.timeBonusPerSec
    )
}

export function levelScore(
    params: {
        levelNumber: number
        parMoves: number
        movesUsed: number
        crystalsCollected: number
        optionalStarsEarned?: number
    },
    config: IceSlideModeScoringConfig = SCORING_CONFIG
): number {
    return (
        levelClearPoints(params.levelNumber) +
        moveBonus(params.parMoves, params.movesUsed) +
        crystalBonus(params.crystalsCollected) +
        (params.optionalStarsEarned ?? 0) * config.objectiveStarBonus
    )
}
