export const SCORING_CONFIG = {
    levelClearBase: 200,
    moveBonusPerUnderPar: 25,
    crystalBonus: 50,
    timeBudgetSeconds: 360,
    timeBonusPerSec: 5,
} as const

export function levelClearPoints(levelNumber: number): number {
    return SCORING_CONFIG.levelClearBase * levelNumber
}

export function moveBonus(parMoves: number, movesUsed: number): number {
    return Math.max(
        0,
        (parMoves - movesUsed) * SCORING_CONFIG.moveBonusPerUnderPar
    )
}

export function crystalBonus(crystalsCollected: number): number {
    return Math.max(0, crystalsCollected) * SCORING_CONFIG.crystalBonus
}

export function timeBonus(elapsedSeconds: number): number {
    return (
        Math.max(0, SCORING_CONFIG.timeBudgetSeconds - elapsedSeconds) *
        SCORING_CONFIG.timeBonusPerSec
    )
}

export function levelScore(params: {
    levelNumber: number
    parMoves: number
    movesUsed: number
    crystalsCollected: number
}): number {
    return (
        levelClearPoints(params.levelNumber) +
        moveBonus(params.parMoves, params.movesUsed) +
        crystalBonus(params.crystalsCollected)
    )
}
