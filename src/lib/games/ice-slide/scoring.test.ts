import { describe, expect, it } from 'vitest'
import { DAILY_SCORING_CONFIG, levelScore, timeBonus } from './scoring'

describe('Ice Slide scoring configuration', () => {
    it('preserves Campaign scoring defaults', () => {
        expect(
            levelScore({
                levelNumber: 2,
                parMoves: 4,
                movesUsed: 4,
                crystalsCollected: 1,
            })
        ).toBe(400 + 25 + 50)
        expect(timeBonus(0)).toBe(1800)
        expect(timeBonus(360)).toBe(0)
    })

    it('locks the Daily scoring configuration', () => {
        expect(
            levelScore(
                {
                    levelNumber: 2,
                    parMoves: 4,
                    movesUsed: 4,
                    crystalsCollected: 1,
                    optionalStarsEarned: 2,
                },
                DAILY_SCORING_CONFIG
            )
        ).toBe(400 + 25 + 50 + 200)
        expect(timeBonus(0, DAILY_SCORING_CONFIG)).toBe(1500)
        expect(timeBonus(299, DAILY_SCORING_CONFIG)).toBe(5)
        expect(timeBonus(300, DAILY_SCORING_CONFIG)).toBe(0)
        expect(timeBonus(301, DAILY_SCORING_CONFIG)).toBe(0)
    })
})
