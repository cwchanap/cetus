import { CHROMATIC_TIDE_RULES } from './types'

export interface ChromaticTideScoreInput {
    cleared: boolean
    capturedCells: number
    initialCapturedCells: number
    movesUsed: number
    secondsRemaining: number
}

function normalizeCount(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

export function calculateChromaticTideScore({
    cleared,
    capturedCells,
    initialCapturedCells,
    movesUsed,
    secondsRemaining,
}: ChromaticTideScoreInput): number {
    const totalCells = CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols
    const safeCapturedCells = Math.min(
        totalCells,
        normalizeCount(capturedCells)
    )
    const safeInitialCapturedCells = Math.min(
        safeCapturedCells,
        normalizeCount(initialCapturedCells)
    )
    const safeMovesUsed = normalizeCount(movesUsed)
    const safeSecondsRemaining = Math.floor(
        Math.min(
            CHROMATIC_TIDE_RULES.duration,
            Number.isFinite(secondsRemaining)
                ? Math.max(0, secondsRemaining)
                : 0
        )
    )

    if (!cleared) {
        return (
            (safeCapturedCells - safeInitialCapturedCells) *
            CHROMATIC_TIDE_RULES.progressPointsPerCell
        )
    }

    const efficiencyBonus =
        Math.max(
            0,
            CHROMATIC_TIDE_RULES.efficiencyReferenceMoves - safeMovesUsed
        ) * CHROMATIC_TIDE_RULES.efficiencyPointsPerMove

    return (
        totalCells * CHROMATIC_TIDE_RULES.progressPointsPerCell +
        CHROMATIC_TIDE_RULES.completionBonus +
        efficiencyBonus +
        safeSecondsRemaining * CHROMATIC_TIDE_RULES.timePointsPerSecond
    )
}
