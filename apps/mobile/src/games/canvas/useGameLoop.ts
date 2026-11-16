import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import type { BaseGame } from '@cetus/games'

const lifecycleSignature = (game: BaseGame): string => {
    const { isActive, isPaused, isGameOver } = game.getState()
    return `${isActive}|${isPaused}|${isGameOver}|${game.getRunId()}`
}

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
        const frame = (now: number): void => {
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
            const signatureChanged = signature !== signatureRef.current
            signatureRef.current = signature
            if (running || signatureChanged) {
                onFrameRef.current()
            }
            frameId = requestAnimationFrame(frame)
        }
        frameId = requestAnimationFrame(frame)

        const subscription = AppState.addEventListener('change', next => {
            if (next === 'active') {
                lastTimestampRef.current = null
            }
        })
        return () => {
            if (frameId !== null) {
                cancelAnimationFrame(frameId)
            }
            subscription.remove()
        }
    }, [game])
}
