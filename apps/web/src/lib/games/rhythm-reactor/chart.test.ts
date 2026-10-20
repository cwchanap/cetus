import { describe, expect, it } from 'vitest'
import {
    CORE_PATTERN,
    RHYTHM_REACTOR_SECTIONS,
    SURGE_PATTERN,
    WARMUP_PATTERN,
    createRhythmReactorChart,
} from './chart'
import { RHYTHM_REACTOR_RULES, type RhythmReactorLane } from './types'

type Step = RhythmReactorLane | null

const expectedWarmup: readonly Step[] = [
    0,
    null,
    1,
    null,
    2,
    null,
    3,
    null,
    0,
    1,
    null,
    2,
    null,
    3,
    1,
    2,
]
const expectedCore: readonly Step[] = [
    0,
    1,
    null,
    2,
    3,
    null,
    1,
    2,
    0,
    null,
    3,
    2,
    1,
    null,
    0,
    3,
]
const expectedSurge: readonly Step[] = [
    0,
    1,
    2,
    null,
    3,
    2,
    1,
    0,
    1,
    3,
    null,
    2,
    0,
    3,
    1,
    2,
]

function repeat(pattern: readonly Step[], count: number): Step[] {
    return Array.from({ length: count }, () => [...pattern]).flat()
}

describe('createRhythmReactorChart', () => {
    it('pins current authored data by value', () => {
        expect(WARMUP_PATTERN).toEqual(expectedWarmup)
        expect(CORE_PATTERN).toEqual(expectedCore)
        expect(SURGE_PATTERN).toEqual(expectedSurge)
        expect(RHYTHM_REACTOR_SECTIONS.map(section => section.repeats)).toEqual(
            [2, 2, 3]
        )

        const expectedSteps = [
            ...repeat(expectedWarmup, 2),
            ...repeat(expectedCore, 2),
            ...repeat(expectedSurge, 3),
        ]
        const expectedLanes = expectedSteps.filter(
            (step): step is RhythmReactorLane => step !== null
        )
        const chart = createRhythmReactorChart()

        expect(chart.map(note => note.laneIndex)).toEqual(expectedLanes)
        expect(chart).toHaveLength(expectedLanes.length)
        expect(chart.map((note, index) => note.id)).toEqual(
            chart.map((_, index) => `note-${index}`)
        )
    })

    it('protects invariants independent of authored tuning', () => {
        const chart = createRhythmReactorChart()
        expect(chart[0].laneIndex).toBe(0)
        expect(RHYTHM_REACTOR_RULES.firstHitTimeSeconds).toBe(
            RHYTHM_REACTOR_RULES.approachSeconds
        )
        expect(
            chart.at(-1)!.hitTimeSeconds +
                RHYTHM_REACTOR_RULES.missWindowSeconds
        ).toBeLessThan(RHYTHM_REACTOR_RULES.duration)

        for (const note of chart) {
            expect(note.laneIndex).toBeGreaterThanOrEqual(0)
            expect(note.laneIndex).toBeLessThanOrEqual(3)
        }
        for (let index = 1; index < chart.length; index += 1) {
            const gap =
                chart[index].hitTimeSeconds - chart[index - 1].hitTimeSeconds
            expect(gap).toBeGreaterThan(0)
            const steps = gap / RHYTHM_REACTOR_RULES.beatStepSeconds
            expect(steps).toBeCloseTo(Math.round(steps), 10)
        }
    })
})
