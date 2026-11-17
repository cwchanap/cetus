import { useEffect, useRef } from 'react'
import type { BaseGame } from '@cetus/games'

const lifecycleSignature = (game: BaseGame): string => {
    const { isActive, isPaused, isGameOver } = game.getState()
    return `${isActive}|${isPaused}|${isGameOver}|${game.getRunId()}`
}

// Lifecycle events wake a sleeping loop so paused/ended/reset scenes still
// render once. Background handling belongs to the session owner
// (NativeGameHost), which pauses pausable games; non-pausable games rely on
// the platform suspending animation frames, matching the web hidden-tab
// policy.
const WAKE_EVENTS = [
    'start',
    'pause',
    'resume',
    'end',
    'state-change',
    'score-update',
    'time-update',
    'time-complete',
] as const

export function useGameLoop(game: BaseGame, onFrame: () => void): void {
    const onFrameRef = useRef(onFrame)
    const lastTimestampRef = useRef<number | null>(null)
    const signatureRef = useRef('')

    useEffect(() => {
        onFrameRef.current = onFrame
    })

    useEffect(() => {
        lastTimestampRef.current = null
        signatureRef.current = lifecycleSignature(game)
        onFrameRef.current()

        let frameId: number | null = null
        const schedule = (): void => {
            if (frameId === null) {
                frameId = requestAnimationFrame(frame)
            }
        }
        const frame = (now: number): void => {
            frameId = null
            const signatureBefore = signatureRef.current
            if (lifecycleSignature(game) !== signatureBefore) {
                lastTimestampRef.current = null
            }
            const state = game.getState()
            const running = state.isActive && !state.isPaused
            if (running) {
                const last = lastTimestampRef.current
                const deltaSeconds =
                    last === null
                        ? 0
                        : Math.min(Math.max(0, now - last) / 1000, 0.1)
                lastTimestampRef.current = now
                game.update(deltaSeconds)
            } else {
                lastTimestampRef.current = null
            }
            const signature = lifecycleSignature(game)
            signatureRef.current = signature
            if (running || signature !== signatureBefore) {
                onFrameRef.current()
            }
            if (running) {
                schedule()
            }
        }
        schedule()

        const wake = (): void => {
            schedule()
        }
        for (const eventType of WAKE_EVENTS) {
            game.on(eventType, wake)
        }
        return () => {
            if (frameId !== null) {
                cancelAnimationFrame(frameId)
            }
            for (const eventType of WAKE_EVENTS) {
                game.off(eventType, wake)
            }
        }
    }, [game])
}
