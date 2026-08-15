import { it, expect } from 'vitest'
import { runIceSlideExpeditionValidation } from '../../../../scripts/validate-ice-slide-expedition'
import { ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES } from './generator'

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
