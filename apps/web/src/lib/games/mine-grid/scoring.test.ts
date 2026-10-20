import { describe, expect, it } from 'vitest'
import { calculateMineGridScore } from './scoring'
import { MINE_GRID_PRESETS } from './types'

describe('calculateMineGridScore', () => {
    it('returns zero for failed runs', () => {
        expect(
            calculateMineGridScore(MINE_GRID_PRESETS.easy, 180, 8, 0, false)
        ).toBe(0)
    })

    it('keeps the documented perfect maximum scores', () => {
        expect(
            calculateMineGridScore(MINE_GRID_PRESETS.easy, 180, 8, 0, true)
        ).toBe(1860)
        expect(
            calculateMineGridScore(MINE_GRID_PRESETS.medium, 300, 15, 0, true)
        ).toBe(3100)
        expect(
            calculateMineGridScore(MINE_GRID_PRESETS.hard, 600, 24, 0, true)
        ).toBe(5400)
    })

    it('awards 50 points for each correctly flagged mine', () => {
        const noFlags = calculateMineGridScore(
            MINE_GRID_PRESETS.easy,
            0,
            0,
            0,
            true
        )
        const twoFlags = calculateMineGridScore(
            MINE_GRID_PRESETS.easy,
            0,
            2,
            0,
            true
        )
        expect(twoFlags - noFlags).toBe(100)
    })

    it('subtracts 100 points per incorrect flag action', () => {
        expect(
            calculateMineGridScore(MINE_GRID_PRESETS.easy, 0, 8, 2, true)
        ).toBe(760)
    })

    it('keeps a completed run worth at least one point', () => {
        expect(
            calculateMineGridScore(MINE_GRID_PRESETS.easy, 0, 0, 999, true)
        ).toBe(1)
    })
})
