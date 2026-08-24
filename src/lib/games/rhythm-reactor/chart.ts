import {
    RHYTHM_REACTOR_RULES,
    type RhythmReactorLane,
    type RhythmReactorNote,
} from './types'

type ChartStep = RhythmReactorLane | null

export const WARMUP_PATTERN: readonly ChartStep[] = [
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

export const CORE_PATTERN: readonly ChartStep[] = [
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

export const SURGE_PATTERN: readonly ChartStep[] = [
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

export const RHYTHM_REACTOR_SECTIONS = [
    { pattern: WARMUP_PATTERN, repeats: 2 },
    { pattern: CORE_PATTERN, repeats: 2 },
    { pattern: SURGE_PATTERN, repeats: 3 },
] as const

export function createRhythmReactorChart(): RhythmReactorNote[] {
    const notes: RhythmReactorNote[] = []
    let stepIndex = 0
    let noteIndex = 0

    for (const { pattern, repeats } of RHYTHM_REACTOR_SECTIONS) {
        for (let repeat = 0; repeat < repeats; repeat += 1) {
            for (const laneIndex of pattern) {
                if (laneIndex !== null) {
                    notes.push({
                        id: `note-${noteIndex++}`,
                        laneIndex,
                        hitTimeSeconds:
                            RHYTHM_REACTOR_RULES.firstHitTimeSeconds +
                            stepIndex * RHYTHM_REACTOR_RULES.beatStepSeconds,
                    })
                }
                stepIndex += 1
            }
        }
    }

    return notes
}
