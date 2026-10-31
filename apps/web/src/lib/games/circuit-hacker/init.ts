// src/lib/games/circuit-hacker/init.ts
import { CircuitHackerGame } from '@cetus/games/circuit-hacker/game'
import {
    setupPixiJS,
    renderGrid,
    pointerToCell,
    cleanup as rendererCleanup,
    type RendererState,
} from './renderer'
import { DIFFICULTY_CONFIGS } from '@cetus/games/circuit-hacker/utils'
import type {
    Difficulty,
    CircuitHackerStats,
    RunEndReason,
} from '@cetus/games/circuit-hacker/types'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@cetus/shared/games'
import { createRunGuard } from '@cetus/games'

// Module-scope guard so a second init call invalidates pending callbacks
// from a prior instance (e.g., view-transition remount without cleanup).
const runGuard = createRunGuard()

export const CELL_SIZE = 48

export interface CircuitHackerUICallbacks {
    onTimeUpdate: (timeRemaining: number) => void
    onRotation: (rotationsUsed: number) => void
    onStart: () => void
    onEnd: (stats: CircuitHackerStats, outcome: CircuitHackerEndOutcome) => void
    // Surfaces non-fatal failures (e.g. score submission rejected by the
    // server) to the page so the player is informed rather than seeing a
    // misleading success overlay. Fatal failures (start/load) still throw
    // and are caught by the page's try/catch.
    onError?: (title: string, message: string) => void
}

/**
 * How the run ended, for the page's React-owned overlay: the headline the
 * legacy route rendered plus the fail reason (absent when solved). The
 * display result carries no side effects — persistence and reward toasts
 * stay owned by the saveGameScore path below.
 */
export interface CircuitHackerEndOutcome {
    title: string
    reason?: RunEndReason
}

export interface CircuitHackerHandle {
    start: (difficulty: Difficulty) => Promise<void>
    stop: () => void
    cleanup: () => void
    getGame: () => CircuitHackerGame | null
}

export async function initializeCircuitHackerGame(
    container: HTMLElement,
    callbacks: CircuitHackerUICallbacks
): Promise<CircuitHackerHandle> {
    let game: CircuitHackerGame | null = null
    let renderer: RendererState | null = null
    let pointerHandler: ((event: PointerEvent) => void) | null = null
    runGuard.next()

    const teardownRenderer = () => {
        if (renderer && pointerHandler) {
            renderer.app.canvas.removeEventListener(
                'pointerdown',
                pointerHandler
            )
        }
        if (renderer) {
            rendererCleanup(renderer)
            renderer = null
        }
        pointerHandler = null
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
    }

    const render = () => {
        if (renderer && game) {
            renderGrid(renderer, game.getState(), CELL_SIZE)
        }
    }

    const start = async (difficulty: Difficulty): Promise<void> => {
        runGuard.next()
        if (game) {
            game.cleanup()
        }
        teardownRenderer()

        const tier = DIFFICULTY_CONFIGS[difficulty]
        renderer = await setupPixiJS(container, tier.rows, tier.cols, CELL_SIZE)

        game = new CircuitHackerGame(
            { difficulty, cellSize: CELL_SIZE },
            {
                onGameStart: () => {
                    callbacks.onStart()
                    render()
                },
                onTimeUpdate: (t: number) => callbacks.onTimeUpdate(t),
                onRotation: n => {
                    callbacks.onRotation(n)
                    render()
                },
                onSolved: async (finalScore, stats) => {
                    render()
                    // Display-only end result: the React island opens its
                    // overlay from this; toasts stay owned by saveGameScore.
                    callbacks.onEnd(stats, { title: 'CIRCUIT POWERED!' })
                    const surfaceError = (message: string) => {
                        callbacks.onError?.(
                            'Score Not Saved',
                            `Your win was recorded locally but could not be submitted: ${message}`
                        )
                    }
                    const runId = runGuard.current()
                    try {
                        await saveGameScore(
                            GameID.CIRCUIT_HACKER,
                            finalScore,
                            result => {
                                if (result.newAchievements?.length) {
                                    window.dispatchEvent(
                                        new CustomEvent('achievementsEarned', {
                                            detail: {
                                                achievementIds:
                                                    result.newAchievements,
                                            },
                                        })
                                    )
                                }
                            },
                            error => {
                                // Surface to the player via the page's
                                // error UI rather than only console.error.
                                // The win itself still stands; only the
                                // score submission failed.
                                surfaceError(error)
                            },
                            {
                                difficulty: stats.difficulty,
                                secondsRemaining: stats.secondsRemaining,
                                rotationsUsed: stats.rotationsUsed,
                                solved: stats.solved,
                            },
                            { isStale: () => runGuard.isStale(runId) }
                        )
                    } catch (error) {
                        // saveGameScore threw synchronously (e.g. network
                        // unreachable). Mirror the error-callback path.
                        const message =
                            error instanceof Error
                                ? error.message
                                : typeof error === 'string'
                                  ? error
                                  : 'Unknown error'
                        surfaceError(message)
                    }
                },
                onFail: (stats, reason) => {
                    render()
                    callbacks.onEnd(stats, {
                        title: reason === 'manual' ? 'GAME OVER' : "TIME'S UP!",
                        reason,
                    })
                },
            }
        )

        pointerHandler = (event: PointerEvent) => {
            if (!renderer || !game) {
                /* c8 ignore start -- defensive: listener is removed before
                   renderer/game are nulled, so this guard is never reached
                   in normal flow */
                return
            }
            /* c8 ignore end */
            const rect = renderer.app.canvas.getBoundingClientRect()
            const scaleX = rect.width / (tier.cols * CELL_SIZE)
            const scaleY = rect.height / (tier.rows * CELL_SIZE)
            const x = (event.clientX - rect.left) / scaleX
            const y = (event.clientY - rect.top) / scaleY
            const cell = pointerToCell(x, y, CELL_SIZE, tier.rows, tier.cols)
            if (cell) {
                game.rotateTile(cell.row, cell.col)
            }
        }
        renderer.app.canvas.addEventListener('pointerdown', pointerHandler)

        game.startGame()
        render()
    }

    const stop = () => {
        game?.stopGame()
    }

    const cleanup = () => {
        game?.cleanup()
        game = null
        teardownRenderer()
    }

    return { start, stop, cleanup, getGame: () => game }
}
