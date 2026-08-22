import type { PotionSorterPreset } from './types'

export function calculatePotionSorterScore(
    preset: PotionSorterPreset,
    remainingSeconds: number,
    movesMade: number,
    solved: boolean
): number {
    if (!solved) {
        return 0
    }
    const remaining = Math.max(0, Math.floor(remainingSeconds))
    const moves = Math.max(0, Math.floor(movesMade))
    const moveBonus = Math.max(0, preset.moveTarget * 2 - moves) * 40
    return preset.completionBase + moveBonus + remaining * 5
}
