export const SIGNAL_SWITCH_BASE_PASS_POINTS = 100
export const SIGNAL_SWITCH_COMBO_STEP_POINTS = 20
export const SIGNAL_SWITCH_COMBO_BONUS_CAP = 8

export function calculateSignalSwitchPassPoints(
    comboAfterPass: number
): number {
    const safeCombo = Number.isFinite(comboAfterPass)
        ? Math.max(1, Math.floor(comboAfterPass))
        : 1
    const bonusSteps = Math.min(safeCombo - 1, SIGNAL_SWITCH_COMBO_BONUS_CAP)
    return (
        SIGNAL_SWITCH_BASE_PASS_POINTS +
        bonusSteps * SIGNAL_SWITCH_COMBO_STEP_POINTS
    )
}
