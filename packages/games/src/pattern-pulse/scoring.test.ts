import { describe, expect, it } from 'vitest'
import { calculatePatternPulseRoundScore } from './scoring'

describe('calculatePatternPulseRoundScore', () => {
    it('scores sequence length plus first-round speed', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 3,
                streak: 1,
                averageResponseMs: 500,
            })
        ).toBe(400)
    })

    it('adds streak bonus', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 4,
                streak: 2,
                averageResponseMs: 400,
            })
        ).toBe(570)
    })

    it('caps and floors speed bonus', () => {
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 3,
                streak: 1,
                averageResponseMs: 0,
            })
        ).toBe(500)
        expect(
            calculatePatternPulseRoundScore({
                sequenceLength: 8,
                streak: 1,
                averageResponseMs: 1200,
            })
        ).toBe(800)
    })
})
