import type {
    RhythmReactorNote,
    RhythmReactorState,
} from '@cetus/games/rhythm-reactor/types'

const CUE_LEAD_SECONDS = 1.5
const CUE_INTERVAL_MS = 1500
const CUE_EXTRA_NOTE_MS = 500
export const UPCOMING_LIMIT = 4
/** Notice the next cue still gets ahead of an omitted note's hit time: the
 *  hold is shortened so that note is spoken this early rather than never. */
const CUE_OMITTED_NOTICE_MS = 250

export interface RhythmReactorCue {
    notes: RhythmReactorNote[]
    holdMs: number
}

/** Hold the announcement channel long enough for a multi-note cue to finish
 *  speaking before the next cue can fire and cut it off. */
const cueDurationMs = (noteCount: number): number =>
    CUE_INTERVAL_MS + Math.max(0, noteCount - 2) * CUE_EXTRA_NOTE_MS

type CueState = Pick<RhythmReactorState, 'pendingNotes' | 'elapsedSeconds'>

/**
 * Pick the next spoken lane cue for a frame, or null while the channel is
 * still reserved or no unannounced note sits inside the lead window — the
 * batch announces at most UPCOMING_LIMIT notes; when a further note would
 * lapse inside the reservation, the hold is shortened so the next cue can
 * still announce it before it reaches the hit line.
 */
export const planRhythmReactorCue = (
    state: CueState,
    announced: ReadonlySet<string>,
    nowMs: number,
    lastCueAtMs: number | null,
    lastHoldMs: number
): RhythmReactorCue | null => {
    if (lastCueAtMs !== null && nowMs - lastCueAtMs < lastHoldMs) {
        return null
    }
    const upcoming = state.pendingNotes
        .filter(
            note =>
                !announced.has(note.id) &&
                note.hitTimeSeconds >= state.elapsedSeconds
        )
        .sort((a, b) => a.hitTimeSeconds - b.hitTimeSeconds)
    const [earliest] = upcoming
    if (
        earliest === undefined ||
        earliest.hitTimeSeconds - state.elapsedSeconds > CUE_LEAD_SECONDS
    ) {
        return null
    }
    const windowed = upcoming.filter(
        note =>
            note.hitTimeSeconds - state.elapsedSeconds <=
            CUE_LEAD_SECONDS + CUE_INTERVAL_MS / 1000
    )
    const notes = windowed.slice(0, UPCOMING_LIMIT)
    const nextOmitted = windowed[UPCOMING_LIMIT]
    // A shortened hold can let the next cue interrupt this batch's tail
    // phrases, but every batched note hits at or before nextOmitted — so a
    // cut phrase only ever describes a note within the notice margin of
    // its hit, with no usable lead left. Shrinking the batch would not
    // help: the dropped note just becomes an earlier nextOmitted with a
    // tighter deadline.
    const holdMs = Math.min(
        cueDurationMs(notes.length),
        nextOmitted === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(
                  0,
                  (nextOmitted.hitTimeSeconds - state.elapsedSeconds) * 1000 -
                      CUE_OMITTED_NOTICE_MS
              )
    )
    return { notes, holdMs }
}
