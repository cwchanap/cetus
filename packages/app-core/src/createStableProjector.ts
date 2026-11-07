/**
 * Structural-memoizing projector factory for native game views
 * (HPA-425 Stage 1). `select` must return a NEW plain serializable
 * visible-state snapshot — copied cell values, never a reference into the
 * game's mutable board — so an in-place model mutation shows up as changed
 * content. The returned projector compares consecutive snapshots by
 * serialized structure and hands back the PREVIOUS reference when nothing
 * changed, so `useSyncExternalStore`-driven views keep stable props across
 * timer ticks. The JSON comparison is deliberately lightweight: it is meant
 * for 12×12-and-smaller boards where a serialized diff is cheaper than a
 * deep walk.
 *
 * Sudoku-style HUD fields that change every tick (an elapsed-time clock)
 * must NOT go through this helper as part of the board prop: stabilize the
 * board with one projector and read the clock straight off the model, so
 * ticks update the HUD without invalidating the memoized grid.
 */
export function createStableProjector<TInput, TProjected>(
    select: (input: TInput) => TProjected
): (input: TInput) => TProjected {
    let hasPrevious = false
    let previous: TProjected
    let previousKey: string

    return (input: TInput): TProjected => {
        const next = select(input)
        // Same select function => stable key order, so serialized equality
        // is exact equality for plain serializable snapshots.
        const key = JSON.stringify(next)
        if (hasPrevious && key === previousKey) {
            return previous
        }
        hasPrevious = true
        previous = next
        previousKey = key
        return next
    }
}
