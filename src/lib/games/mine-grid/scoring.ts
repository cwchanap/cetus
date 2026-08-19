import type { MineGridPreset } from './types'

export function calculateMineGridScore(
    preset: MineGridPreset,
    remainingSeconds: number,
    correctlyFlaggedMines: number,
    incorrectFlagActions: number,
    cleared: boolean
): number {
    if (!cleared) {
        return 0
    }

    const safeCells = preset.rows * preset.cols - preset.mines
    const safeCellPoints = safeCells * 10
    const flagPoints =
        Math.min(preset.mines, Math.max(0, correctlyFlaggedMines)) * 50
    const timeBonus = Math.max(0, Math.floor(remainingSeconds)) * 5
    const flagPenalty = Math.max(0, incorrectFlagActions) * 100

    return Math.max(1, safeCellPoints + flagPoints + timeBonus - flagPenalty)
}
