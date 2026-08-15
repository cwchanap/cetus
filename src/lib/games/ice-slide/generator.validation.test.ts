import { it, expect } from 'vitest'
import { runIceSlideExpeditionValidation } from '../../../../scripts/validate-ice-slide-expedition'

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
    }
})
