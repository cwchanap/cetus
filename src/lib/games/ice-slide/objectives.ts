import type { IceSlideObjectiveId } from './types'

export interface IceSlideObjectiveFacts {
    crystalsCollected: number
    totalCrystals: number
    stageFalls: number
    stageResets: number
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
