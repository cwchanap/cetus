import { describe, expect, it } from 'vitest'
import { calculateSignalSwitchPassPoints } from './scoring'

describe('calculateSignalSwitchPassPoints', () => {
    it.each([
        [1, 100],
        [2, 120],
        [5, 180],
        [9, 260],
        [20, 260],
        [0, 100],
        [-4, 100],
        [Number.NaN, 100],
    ])('scores combo %s as %i', (combo, expected) => {
        expect(calculateSignalSwitchPassPoints(combo)).toBe(expected)
    })
})
