import type { BaseGame } from '@cetus/games'

import { useFrameLoop } from './useFrameLoop'

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

// Pause and resume can both land while a frame is still pending, leaving the
// lifecycle signature unchanged when it runs. Dropping the timestamp keeps
// the first resumed frame at a zero delta instead of accruing the pause.
const TIMESTAMP_RESET_EVENTS = ['pause', 'resume'] as const

/** BaseGame adapter over the shared frame-loop core: unchanged behavior
 *  for every existing board. */
export function useGameLoop(game: BaseGame, onFrame: () => void): void {
    useFrameLoop(
        {
            isRunning: () => {
                const { isActive, isPaused } = game.getState()
                return isActive && !isPaused
            },
            step: deltaSeconds => game.update(deltaSeconds),
            subscribe: (wake, resetTimestamp) => {
                for (const eventType of WAKE_EVENTS) {
                    game.on(eventType, wake)
                }
                for (const eventType of TIMESTAMP_RESET_EVENTS) {
                    game.on(eventType, resetTimestamp)
                }
                return () => {
                    for (const eventType of WAKE_EVENTS) {
                        game.off(eventType, wake)
                    }
                    for (const eventType of TIMESTAMP_RESET_EVENTS) {
                        game.off(eventType, resetTimestamp)
                    }
                }
            },
            onFrame,
            lifecycleKey: () => lifecycleSignature(game),
        },
        game
    )
}
