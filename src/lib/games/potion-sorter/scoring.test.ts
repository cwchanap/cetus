import { describe, expect, it } from 'vitest'
import { POTION_SORTER_PRESETS } from './levels'
import { calculatePotionSorterScore } from './scoring'

describe('calculatePotionSorterScore', () => {
    it('scores solved puzzles with move and time bonuses', () => {
        expect(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.easy,
                180,
                10,
                true
            )
        ).toBe(2300)
        expect(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.medium,
                300,
                20,
                true
            )
        ).toBe(4300)
        expect(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.hard,
                480,
                28,
                true
            )
        ).toBe(6520)
    })

    it('clamps move and time bonuses at their floors', () => {
        expect(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.easy,
                100,
                20,
                true
            )
        ).toBe(1500)
        expect(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.easy,
                100,
                30,
                true
            )
        ).toBe(1500)
        expect(
            calculatePotionSorterScore(POTION_SORTER_PRESETS.easy, -5, 10, true)
        ).toBe(1400)
    })

    it('returns zero for unsolved puzzles', () => {
        expect(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.easy,
                180,
                10,
                false
            )
        ).toBe(0)
    })

    it('reaches the Medium arithmetic maximum with zero moves', () => {
        expect(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.medium,
                300,
                0,
                true
            )
        ).toBe(5100)
    })
})
