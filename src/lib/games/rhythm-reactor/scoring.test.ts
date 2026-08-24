import { describe, expect, it } from 'vitest'
import {
    calculateRhythmReactorAccuracy,
    calculateRhythmReactorHitPoints,
} from './scoring'

describe('Rhythm Reactor scoring', () => {
    it('calculates hit points by judgment and combo', () => {
        expect(calculateRhythmReactorHitPoints('perfect', 1)).toBe(100)
        expect(calculateRhythmReactorHitPoints('good', 9)).toBe(60)
        expect(calculateRhythmReactorHitPoints('perfect', 10)).toBe(125)
        expect(calculateRhythmReactorHitPoints('perfect', 20)).toBe(150)
        expect(calculateRhythmReactorHitPoints('perfect', 30)).toBe(175)
        expect(calculateRhythmReactorHitPoints('perfect', 40)).toBe(200)
        expect(calculateRhythmReactorHitPoints('miss', 40)).toBe(0)
    })

    it('includes stray presses in weighted accuracy', () => {
        expect(calculateRhythmReactorAccuracy(0, 0, 0, 0)).toBe(0)
        expect(calculateRhythmReactorAccuracy(8, 4, 4, 0)).toBeCloseTo(62.5)
        expect(calculateRhythmReactorAccuracy(8, 4, 4, 2)).toBeCloseTo(
            55.555,
            2
        )
    })
})
