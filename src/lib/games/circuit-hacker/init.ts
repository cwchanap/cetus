// src/lib/games/circuit-hacker/init.ts
import { CircuitHackerGame } from './game'
import {
    setupPixiJS,
    renderGrid,
    pointerToCell,
    cleanup as rendererCleanup,
    type RendererState,
} from './renderer'
import { DIFFICULTY_CONFIGS } from './utils'
import type { Difficulty, CircuitHackerStats } from './types'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

export const CELL_SIZE = 48

export interface CircuitHackerUICallbacks {
    onTimeUpdate: (timeRemaining: number) => void
    onRotation: (rotationsUsed: number) => void
    onStart: () => void
    onEnd: (stats: CircuitHackerStats) => void
    // Surfaces non-fatal failures (e.g. score submission rejected by the
    // server) to the page so the player is informed rather than seeing a
    // misleading success overlay. Fatal failures (start/load) still throw
    // and are caught by the page's try/catch.
    onError?: (title: string, message: string) => void
}

export interface CircuitHackerHandle {
    start: (difficulty: Difficulty) => Promise<void>
    stop: () => void
    cleanup: () => void
    getGame: () => CircuitHackerGame | null
}

function setText(id: string, value: string): void {
    const el = document.getElementById(id)
    if (el) {
        el.textContent = value
    }
}

function resetButtons(): void {
    const startBtn = document.getElementById('start-btn')
    const stopBtn = document.getElementById('stop-btn')
    if (startBtn) {
        startBtn.style.display = 'inline-flex'
    }
    if (stopBtn) {
        stopBtn.style.display = 'none'
    }
}

function showOverlay(title: string, stats: CircuitHackerStats): void {
    setText('game-over-title', title)
    setText('final-score', stats.finalScore.toString())
    setText('final-time', `${stats.secondsRemaining}s`)
    setText('final-rotations', stats.rotationsUsed.toString())
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

export async function initializeCircuitHackerGame(
    container: HTMLElement,
    callbacks: CircuitHackerUICallbacks
): Promise<CircuitHackerHandle> {
    let game: CircuitHackerGame | null = null
    let renderer: RendererState | null = null
    let pointerHandler: ((event: PointerEvent) => void) | null = null

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
                onTimeUpdate: t => callbacks.onTimeUpdate(t),
                onRotation: n => {
                    callbacks.onRotation(n)
                    render()
                },
                onSolved: async (finalScore, stats) => {
                    render()
                    resetButtons()
                    showOverlay('CIRCUIT POWERED!', stats)
                    callbacks.onEnd(stats)
                    const surfaceError = (message: string) => {
                        callbacks.onError?.(
                            'Score Not Saved',
                            `Your win was recorded locally but could not be submitted: ${message}`
                        )
                    }
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
                            }
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
                    resetButtons()
                    showOverlay(
                        reason === 'manual' ? 'GAME OVER' : "TIME'S UP!",
                        stats
                    )
                    callbacks.onEnd(stats)
                },
            }
        )

        pointerHandler = (event: PointerEvent) => {
            if (!renderer || !game) {
                return
            }
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
