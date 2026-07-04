import { describe, it, expect } from 'vitest'
import { rollSpawnType } from './spawner'

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
