import { describe, it, expect } from 'vitest'
import { SATELLITE_SYNC_LEVELS, hasStaticMatching } from './levels'

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

describe('hasStaticMatching', () => {
    it('marks every shipped level solvable', () => {
        for (const level of SATELLITE_SYNC_LEVELS) {
            expect(hasStaticMatching(level)).toBe(true)
        }
    })

    it('rejects an unsolvable level (missing color)', () => {
        expect(
            hasStaticMatching({
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
            hasStaticMatching({
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

    it('solves a level that requires reassigning an earlier match', () => {
        // sat0 (angle 0) can reach both targets; sat1 (angle 120) can
        // reach target0 only — the obstacle at angle 75 blocks sat1's
        // path to target1 (angle 60) but not the other three paths.
        // Greedy first-fit would assign sat0 to target0, leaving
        // target1 unmatched. Bipartite matching reassigns target0 to
        // sat1, freeing sat0 for target1.
        expect(
            hasStaticMatching({
                id: 99,
                name: 'non-greedy regression',
                timeBudget: 30,
                rings: 2,
                satellites: [
                    { ring: 0, angle: 0, color: 'cyan' },
                    { ring: 0, angle: 120, color: 'cyan' },
                ],
                targets: [
                    { ring: 1, angle: 300, color: 'cyan' },
                    { ring: 1, angle: 60, color: 'cyan' },
                ],
                obstacles: [{ ring: 0, angle: 75, radius: 0.2 }],
            })
        ).toBe(true)
    })
})
