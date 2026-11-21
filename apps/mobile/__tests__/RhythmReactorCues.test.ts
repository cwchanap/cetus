import { createRhythmReactorChart } from '@cetus/games/rhythm-reactor/chart'
import type { RhythmReactorNote } from '@cetus/games/rhythm-reactor/types'

import { planRhythmReactorCue } from '../src/games/rhythm-reactor/cues'

const FRAME_MS = 16

const note = (id: string, hitTimeSeconds: number): RhythmReactorNote => ({
    id,
    laneIndex: 0,
    hitTimeSeconds,
})

/** Drive the planner at a fixed frame cadence and record when each note id
 *  was first spoken. `pendingNotes` keeps the whole chart: notes that pass
 *  unannounced stay visible like the model's miss window does, which only
 *  adds candidates — announced ones can never be picked twice anyway. */
const runChart = (
    chart: RhythmReactorNote[],
    frameMs = FRAME_MS
): Map<string, number> => {
    const announced = new Set<string>()
    const spokenAt = new Map<string, number>()
    let lastCueAtMs: number | null = null
    let lastHoldMs = 0
    const lastHit = Math.max(...chart.map(n => n.hitTimeSeconds))
    for (let ms = 0; ms <= (lastHit + 1) * 1000; ms += frameMs) {
        const elapsedSeconds = ms / 1000
        const plan = planRhythmReactorCue(
            { pendingNotes: chart, elapsedSeconds },
            announced,
            ms,
            lastCueAtMs,
            lastHoldMs
        )
        if (plan === null) {
            continue
        }
        for (const n of plan.notes) {
            announced.add(n.id)
            spokenAt.set(n.id, elapsedSeconds)
        }
        lastCueAtMs = ms
        lastHoldMs = plan.holdMs
    }
    return spokenAt
}

describe('Rhythm Reactor cue scheduling', () => {
    test('every default-chart note is spoken before its hit time at 60fps', () => {
        const chart = createRhythmReactorChart()
        const spokenAt = runChart(chart)
        const missed = chart.filter(n => {
            const at = spokenAt.get(n.id)
            return at === undefined || at >= n.hitTimeSeconds
        })
        expect(missed.map(n => n.id)).toEqual([])
        expect(spokenAt.size).toBe(chart.length)
    })

    test('a fifth note inside the batch window still gets its own cue', () => {
        // A 4-note batch holds the channel for 2.5 s; without the deadline cap
        // the trailing note would lapse inside the reservation and stay mute.
        const chart = [2, 2.25, 2.5, 2.75, 3, 4, 5].map((hit, index) =>
            note(`n${index}`, hit)
        )
        const announced = new Set<string>()
        const spoken: string[][] = []
        let lastCueAtMs: number | null = null
        let lastHoldMs = 0
        for (let ms = 0; ms <= 5000; ms += FRAME_MS) {
            const plan = planRhythmReactorCue(
                { pendingNotes: chart, elapsedSeconds: ms / 1000 },
                announced,
                ms,
                lastCueAtMs,
                lastHoldMs
            )
            if (plan === null) {
                continue
            }
            for (const n of plan.notes) {
                announced.add(n.id)
            }
            spoken.push(plan.notes.map(n => n.id))
            lastCueAtMs = ms
            lastHoldMs = plan.holdMs
        }
        expect(spoken).toEqual([
            ['n0', 'n1', 'n2', 'n3'],
            ['n4', 'n5', 'n6'],
        ])
    })

    test('respects the channel reservation and the lead window', () => {
        const chart = [note('a', 2), note('b', 3)]
        const announced = new Set<string>()
        // Nothing inside the 1.5 s lead yet.
        expect(
            planRhythmReactorCue(
                { pendingNotes: chart, elapsedSeconds: 0.4 },
                announced,
                400,
                null,
                0
            )
        ).toBeNull()

        const plan = planRhythmReactorCue(
            { pendingNotes: chart, elapsedSeconds: 0.6 },
            announced,
            600,
            null,
            0
        )
        expect(plan).not.toBeNull()
        expect(plan?.notes.map(n => n.id)).toEqual(['a', 'b'])

        // Inside the hold the same frame content is not re-announced.
        expect(
            planRhythmReactorCue(
                { pendingNotes: chart, elapsedSeconds: 1.0 },
                new Set(['a', 'b']),
                1000,
                600,
                plan?.holdMs ?? 0
            )
        ).toBeNull()
    })
})
