import { describe, it, expect } from 'vitest'
import { SATELLITE_SYNC_LEVELS, isLevelSolvable } from './levels'

describe('SATELLITE_SYNC_LEVELS', () => {
    it('has exactly 8 levels with sequential ids', () => {
        expect(SATELLITE_SYNC_LEVELS).toHaveLength(8)
        SATELLITE_SYNC_LEVELS.forEach((level, i) => {
            expect(level.id).toBe(i + 1)
            expect(level.name.length).toBeGreaterThan(0)
            expect(level.timeBudget).toBeGreaterThan(0)
        })
    })
})

describe('isLevelSolvable', () => {
    it('marks every shipped level solvable', () => {
        for (const level of SATELLITE_SYNC_LEVELS) {
            expect(isLevelSolvable(level)).toBe(true)
        }
    })

    it('rejects an unsolvable level (missing color)', () => {
        expect(
            isLevelSolvable({
                id: 99,
                name: 'bad',
                timeBudget: 30,
                rings: 1,
                satellites: [{ ring: 0, angle: 0, color: 'cyan' }],
                targets: [{ ring: 1, angle: 0, color: 'magenta' }],
                obstacles: [],
            })
        ).toBe(false)
    })

    it('rejects a level with fewer satellites than targets', () => {
        expect(
            isLevelSolvable({
                id: 99,
                name: 'too few sats',
                timeBudget: 30,
                rings: 1,
                satellites: [{ ring: 0, angle: 0, color: 'cyan' }],
                targets: [
                    { ring: 1, angle: 0, color: 'cyan' },
                    { ring: 1, angle: 180, color: 'cyan' },
                ],
                obstacles: [],
            })
        ).toBe(false)
    })
})
