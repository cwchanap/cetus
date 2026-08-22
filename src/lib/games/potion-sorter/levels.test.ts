import { describe, expect, it } from 'vitest'
import { POTION_SORTER_PRESETS } from './levels'
import {
    POTION_TUBE_CAPACITY,
    type PotionSorterDifficulty,
    type PotionTube,
} from './types'
import { hasLegalMove, isPotionSorterSolved, pourPotion } from './puzzle'

const SOLUTIONS = {
    easy: [
        [0, 3],
        [2, 0],
        [1, 2],
        [1, 3],
        [0, 1],
        [2, 0],
        [2, 3],
        [1, 2],
        [0, 1],
        [0, 3],
    ],
    medium: [
        [4, 6],
        [6, 5],
        [2, 6],
        [5, 2],
        [6, 5],
        [0, 6],
        [2, 0],
        [5, 6],
        [0, 2],
        [6, 5],
        [2, 0],
        [3, 6],
        [6, 4],
        [1, 5],
        [3, 5],
        [1, 3],
        [2, 1],
        [4, 2],
        [0, 1],
        [4, 0],
    ],
    hard: [
        [0, 7],
        [7, 8],
        [0, 7],
        [8, 0],
        [7, 8],
        [0, 7],
        [0, 8],
        [8, 0],
        [7, 8],
        [0, 7],
        [8, 0],
        [7, 8],
        [5, 7],
        [8, 7],
        [0, 8],
        [7, 0],
        [8, 7],
        [3, 0],
        [6, 3],
        [2, 7],
        [5, 7],
        [4, 5],
        [2, 4],
        [3, 2],
        [5, 3],
        [1, 5],
        [6, 1],
        [6, 5],
    ],
} satisfies Record<PotionSorterDifficulty, Array<[number, number]>>

const DEAD_END_PATHS = {
    medium: [
        [3, 5],
        [1, 3],
        [4, 6],
        [4, 5],
    ],
    hard: [
        [1, 7],
        [4, 8],
    ],
} satisfies Record<'medium' | 'hard', Array<[number, number]>>

function replay(
    difficulty: PotionSorterDifficulty,
    path: Array<[number, number]>
): PotionTube[] {
    let tubes: PotionTube[] = POTION_SORTER_PRESETS[
        difficulty
    ].initialTubes.map(tube => [...tube])

    for (const [source, destination] of path) {
        const result = pourPotion(tubes, source, destination)
        expect(result).not.toBeNull()
        if (result === null) {
            throw new Error('Reference path contains an invalid pour')
        }
        tubes = result.tubes
    }

    return tubes
}

describe('Potion Sorter authored presets', () => {
    it('contains complete, capacity-safe color sets', () => {
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
            const preset = POTION_SORTER_PRESETS[difficulty]
            expect(
                preset.initialTubes.filter(tube => tube.length === 0)
            ).toHaveLength(2)
            expect(
                preset.initialTubes.every(
                    tube => tube.length <= POTION_TUBE_CAPACITY
                )
            ).toBe(true)
            expect(SOLUTIONS[difficulty]).toHaveLength(preset.moveTarget)

            const liquids = preset.initialTubes.flat()
            for (const color of new Set(liquids)) {
                expect(liquids.filter(liquid => liquid === color)).toHaveLength(
                    4
                )
            }

            if (difficulty !== 'easy') {
                expect(
                    preset.initialTubes
                        .filter(tube => tube.length > 0)
                        .every(tube => new Set(tube).size > 1)
                ).toBe(true)
            }
        }
    })

    it('solves every authored reference path', () => {
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
            const solved = replay(difficulty, SOLUTIONS[difficulty])
            expect(isPotionSorterSolved(solved)).toBe(true)
        }
    })

    it('reaches the authored Medium and Hard dead ends', () => {
        for (const difficulty of ['medium', 'hard'] as const) {
            const dead = replay(difficulty, DEAD_END_PATHS[difficulty])
            expect(isPotionSorterSolved(dead)).toBe(false)
            expect(hasLegalMove(dead)).toBe(false)
        }
    })

    it('keeps every reachable unsolved Easy state playable', () => {
        const start = POTION_SORTER_PRESETS.easy.initialTubes.map(tube => [
            ...tube,
        ])
        const queue: PotionTube[][] = [start]
        const seen = new Set([JSON.stringify(start)])

        while (queue.length > 0) {
            const tubes = queue.shift()
            if (!tubes) {
                continue
            }
            if (isPotionSorterSolved(tubes)) {
                continue // gameplay ends here; do not explore moves after solve
            }

            expect(hasLegalMove(tubes)).toBe(true)

            for (let source = 0; source < tubes.length; source++) {
                for (
                    let destination = 0;
                    destination < tubes.length;
                    destination++
                ) {
                    const result = pourPotion(tubes, source, destination)
                    if (!result) {
                        continue
                    }
                    const key = JSON.stringify(result.tubes)
                    if (seen.has(key)) {
                        continue
                    }
                    seen.add(key)
                    queue.push(result.tubes)
                }
            }
        }
    })
})
