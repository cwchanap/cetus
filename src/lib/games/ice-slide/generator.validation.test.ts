import { it, expect } from 'vitest'
import { runIceSlideExpeditionValidation } from '../../../../scripts/validate-ice-slide-expedition'
import {
    getIceSlideObjectiveFeasibility,
    ICE_SLIDE_OBJECTIVE_IDS,
} from './objectives'
import {
    ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
    type IceSlideGeneratedStage,
} from './generator'
import { solveIceSlideBoard } from './solver'

// 100 seeds x 3 tiers x 2 stages of generation + independent solving; give CI
// machines explicit headroom instead of relying on the default timeout.
it('validates 100 deterministic seeds per tier', () => {
    const summaries = runIceSlideExpeditionValidation({ seedsPerTier: 100 })

    expect(
        summaries.map(item => [item.difficulty, item.seeds, item.stageCount])
    ).toEqual([
        ['easy', 100, 200],
        ['medium', 100, 200],
        ['hard', 100, 200],
    ])

    for (const summary of summaries) {
        expect(summary.worstAttempts).toBeGreaterThanOrEqual(1)
        expect(summary.worstAttempts).toBeLessThanOrEqual(64)
        expect(summary.worstExploredStates).toBeLessThanOrEqual(
            ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES
        )
        expect(summary.fallbacks).toBeLessThanOrEqual(summary.stageCount)
    }
}, 120_000)

it('keeps every validated stage 3 and 5 Risk-capable', () => {
    const riskStages: IceSlideGeneratedStage[] = []
    runIceSlideExpeditionValidation({
        seedsPerTier: 5,
        onStage: stage => {
            const stageNumber = Number(
                stage.stage.id.slice('expedition:'.length)
            )
            if (stageNumber === 3 || stageNumber === 5) {
                riskStages.push(stage)
            }
        },
    })

    expect(riskStages).toHaveLength(10)
    for (const stage of riskStages) {
        const solve = solveIceSlideBoard(stage.stage, {
            maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
        })
        const feasibility = getIceSlideObjectiveFeasibility(
            stage.stage.rows,
            solve
        )
        expect(
            ICE_SLIDE_OBJECTIVE_IDS.filter(id => feasibility[id]).length
        ).toBeGreaterThanOrEqual(2)
    }
}, 120_000)
