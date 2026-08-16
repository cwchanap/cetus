import type { IceSlideSolveResult } from './solver'
import type { IceSlideObjectiveId } from './types'

export interface IceSlideObjectiveFacts {
    crystalsCollected: number
    totalCrystals: number
    stageFalls: number
    stageResets: number
}

export const ICE_SLIDE_OBJECTIVE_IDS = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const satisfies readonly IceSlideObjectiveId[]

function countGlyph(rows: readonly string[], glyph: string): number {
    let count = 0
    for (const row of rows) {
        for (const cell of row) {
            if (cell === glyph) {
                count += 1
            }
        }
    }
    return count
}

export function getIceSlideObjectiveFeasibility(
    rows: readonly string[],
    solveResult: IceSlideSolveResult
): Record<IceSlideObjectiveId, boolean> {
    const crystalCount = countGlyph(rows, 'C')
    const hasHazard = countGlyph(rows, 'H') > 0
    return {
        collect_all_crystals:
            crystalCount > 0 && solveResult.reachedGoalWithAllCrystals,
        no_falls: hasHazard && solveResult.solvable,
        no_reset: solveResult.solvable,
    }
}

export const ICE_SLIDE_OBJECTIVE_LABELS: Record<IceSlideObjectiveId, string> = {
    collect_all_crystals: 'Collect all crystals',
    no_falls: 'No falls',
    no_reset: 'No resets',
}

export function isIceSlideObjectiveComplete(
    objectiveId: IceSlideObjectiveId,
    facts: IceSlideObjectiveFacts
): boolean {
    switch (objectiveId) {
        case 'collect_all_crystals':
            return (
                facts.totalCrystals > 0 &&
                facts.crystalsCollected === facts.totalCrystals
            )
        case 'no_falls':
            return facts.stageFalls === 0
        case 'no_reset':
            return facts.stageResets === 0
    }
}
