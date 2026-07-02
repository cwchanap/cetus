import { describe, it, expect } from 'vitest'
import { rollSpawnType, weightedPick } from './spawner'

describe('rollSpawnType', () => {
    it('returns "coin" when the roll falls below the coin threshold', () => {
        expect(rollSpawnType(1, () => 0.49)).toBe('coin')
        expect(rollSpawnType(3, () => 0.7)).toBe('coin')
    })

    it('returns "bomb" when the roll meets or exceeds the threshold', () => {
        expect(rollSpawnType(1, () => 0.5)).toBe('bomb')
        expect(rollSpawnType(1, () => 0.9)).toBe('bomb')
        expect(rollSpawnType(3, () => 0.76)).toBe('bomb')
    })

    it('always returns "bomb" for a ratio of 0', () => {
        expect(rollSpawnType(0, () => 0)).toBe('bomb')
        expect(rollSpawnType(0, () => 0.99)).toBe('bomb')
    })

    it('favours coins as the ratio grows', () => {
        expect(rollSpawnType(99, () => 0.5)).toBe('coin')
        expect(rollSpawnType(999, () => 0.9)).toBe('coin')
    })

    it('uses Math.random by default', () => {
        const result = rollSpawnType(1)
        expect(['coin', 'bomb']).toContain(result)
    })
})

describe('weightedPick', () => {
    it('returns undefined for an empty list', () => {
        expect(weightedPick([])).toBeUndefined()
    })

    it('returns the only item when there is a single entry', () => {
        expect(weightedPick([{ item: 'a', weight: 5 }], () => 0.5)).toBe('a')
    })

    it('picks the first item at the low end of the roll', () => {
        const items = [
            { item: 'a', weight: 1 },
            { item: 'b', weight: 1 },
            { item: 'c', weight: 1 },
        ]
        expect(weightedPick(items, () => 0)).toBe('a')
    })

    it('picks subsequent items as the roll increases', () => {
        const items = [
            { item: 'a', weight: 1 },
            { item: 'b', weight: 1 },
            { item: 'c', weight: 1 },
        ]
        expect(weightedPick(items, () => 0.5)).toBe('b')
        expect(weightedPick(items, () => 0.9)).toBe('c')
    })

    it('falls back to the last item for the maximal roll', () => {
        const items = [
            { item: 'a', weight: 1 },
            { item: 'b', weight: 2 },
        ]
        expect(weightedPick(items, () => 0.999999)).toBe('b')
    })

    it('respects unequal weights', () => {
        const items = [
            { item: 'heavy', weight: 99 },
            { item: 'light', weight: 1 },
        ]
        expect(weightedPick(items, () => 0.5)).toBe('heavy')
        expect(weightedPick(items, () => 0.999)).toBe('light')
    })

    it('uses Math.random by default and returns a valid item', () => {
        const items = [
            { item: 'x', weight: 1 },
            { item: 'y', weight: 1 },
        ]
        expect(['x', 'y']).toContain(weightedPick(items))
    })

    it('supports object item types', () => {
        const a = { id: 1 }
        const b = { id: 2 }
        expect(weightedPick([{ item: a, weight: 1 }], () => 0)).toBe(a)
        expect(
            weightedPick(
                [
                    { item: a, weight: 1 },
                    { item: b, weight: 1 },
                ],
                () => 0.6
            )
        ).toBe(b)
    })
})
