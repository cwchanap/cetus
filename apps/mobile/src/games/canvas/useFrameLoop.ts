import { useEffect, useRef } from 'react'

/** A frame delta of 0.1s is the most one frame may advance a game; a
 *  longer wall gap (resume from a suspended app) is dropped. */
const MAX_DELTA_SECONDS = 0.1

export interface FrameLoopOptions {
    /** Live run gate read at frame time; false sleeps the loop. */
    isRunning: () => boolean
    /** Advance the owner by the capped wall delta in seconds. */
    step: (deltaSeconds: number) => void
    /** Subscribe wake-ups (schedule one frame) and timestamp resets (the
     *  next step gets a zero delta); return the unsubscribe. */
    subscribe: (wake: () => void, resetTimestamp: () => void) => () => void
    /** Render/sync the owner: runs at mount, on every running frame, and
     *  once more when the lifecycle key changes while not running. */
    onFrame: () => void
    /** Read before and after each frame. A change restarts timing from a
     *  zero delta and still renders one scene. */
    lifecycleKey: () => string
}

/**
 * The one requestAnimationFrame scheduler native boards share: one queued
 * frame at a time, a zero first delta, a 0.1s wall-delta cap, idle
 * timestamp reset, lifecycle renders while sleeping, and full cancellation
 * on unmount or owner change. The owner identity (game or controller)
 * restarts the loop; callback replacements do not.
 */
export function useFrameLoop(options: FrameLoopOptions, owner: unknown): void {
    const optionsRef = useRef(options)
    useEffect(() => {
        optionsRef.current = options
    })

    useEffect(() => {
        const loop = optionsRef.current
        let lastTimestamp: number | null = null
        let lifecycleKey = loop.lifecycleKey()
        loop.onFrame()

        let frameId: number | null = null
        const schedule = (): void => {
            if (frameId === null) {
                frameId = requestAnimationFrame(frame)
            }
        }
        const frame = (now: number): void => {
            frameId = null
            const current = optionsRef.current
            const keyBefore = lifecycleKey
            if (current.lifecycleKey() !== keyBefore) {
                lastTimestamp = null
            }
            const running = current.isRunning()
            if (running) {
                const deltaSeconds =
                    lastTimestamp === null
                        ? 0
                        : Math.min(
                              Math.max(0, now - lastTimestamp) / 1000,
                              MAX_DELTA_SECONDS
                          )
                lastTimestamp = now
                current.step(deltaSeconds)
            } else {
                lastTimestamp = null
            }
            lifecycleKey = current.lifecycleKey()
            if (running || lifecycleKey !== keyBefore) {
                current.onFrame()
            }
            if (running) {
                schedule()
            }
        }
        schedule()

        const wake = (): void => {
            schedule()
        }
        const resetTimestamp = (): void => {
            lastTimestamp = null
        }
        const unsubscribe = loop.subscribe(wake, resetTimestamp)
        return () => {
            if (frameId !== null) {
                cancelAnimationFrame(frameId)
            }
            unsubscribe()
        }
    }, [owner])
}
