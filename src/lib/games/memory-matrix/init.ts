import { MemoryMatrixGame } from './game'
import { MemoryMatrixRenderer } from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'
import type { GameState, GameStats } from './types'

let game: MemoryMatrixGame | null = null
let renderer: MemoryMatrixRenderer | null = null
let abortController: AbortController | null = null

/**
 * Interface for the Memory Matrix game instance returned by initMemoryMatrixGame
 */
export interface MemoryMatrixGameInstance {
    restart: () => void
    getState: () => GameState
    getStats: () => GameStats
    endGame: () => void
    cleanup: () => void
}

/**
 * Callback types for initMemoryMatrixGame
 */
export interface MemoryMatrixCallbacks {
    onGameComplete?: (
        finalScore: number,
        stats: GameStats
    ) => void | Promise<void>
}

export async function initMemoryMatrixGame(
    callbacks?: MemoryMatrixCallbacks
): Promise<MemoryMatrixGameInstance> {
    // Clean up previous instances to prevent resource leaks
    if (game && typeof game.destroy === 'function') {
        try {
            game.destroy()
        } catch (e) {
            console.warn(
                '[initMemoryMatrixGame] Failed to destroy previous game:',
                e
            )
        }
    }
    if (renderer && typeof renderer.destroy === 'function') {
        try {
            renderer.destroy()
        } catch (e) {
            console.warn(
                '[initMemoryMatrixGame] Failed to destroy previous renderer:',
                e
            )
        }
    }

    // Abort previous abort controller before creating new one
    if (abortController) {
        abortController.abort()
    }
    abortController = new AbortController()
    const { signal } = abortController

    // Initialize game and renderer
    game = new MemoryMatrixGame()
    renderer = new MemoryMatrixRenderer('memory-matrix-container')

    // Set up callbacks
    game.setStateChangeCallback((state, stats) => {
        renderer?.render(state, stats)
    })

    game.setGameEndCallback(async (finalScore, stats) => {
        try {
            // Reset button state when game ends
            const startBtn = document.getElementById('start-btn')
            if (startBtn) {
                startBtn.textContent = 'Start Game'
                ;(startBtn as HTMLButtonElement).disabled = false
            }

            // Call external callback if provided
            if (callbacks?.onGameComplete) {
                await callbacks.onGameComplete(finalScore, stats)
            } else {
                // Fallback to original behavior
                await saveScore(finalScore)
            }
        } catch (error) {
            console.error('[MemoryMatrix] Error in game end callback:', error)
        }
    })

    renderer.setCardClickCallback((row, col) => {
        game?.flipCard({ row, col })
    })

    // Set up game controls
    setupGameControls(signal)

    // Set up restart listener
    window.addEventListener(
        'memory-matrix-restart',
        () => {
            game?.resetGame()
        },
        { signal }
    )

    // Initial render
    const initialState = game.getGameState()
    const initialStats = game.getGameStats()
    renderer.render(initialState, initialStats)

    // Return game instance for external control
    // Note: game is guaranteed to be non-null here since we just created it
    return {
        restart: () => {
            if (!game) {
                throw new Error(
                    'Memory Matrix game has been cleaned up. Please reinitialize.'
                )
            }
            return game.resetGame()
        },
        getState: () => {
            if (!game) {
                throw new Error(
                    'Memory Matrix game has been cleaned up. Please reinitialize.'
                )
            }
            return game.getGameState()
        },
        getStats: () => {
            if (!game) {
                throw new Error(
                    'Memory Matrix game has been cleaned up. Please reinitialize.'
                )
            }
            return game.getGameStats()
        },
        endGame: () => {
            if (!game) {
                throw new Error(
                    'Memory Matrix game has been cleaned up. Please reinitialize.'
                )
            }
            return game.endGameEarly()
        },
        cleanup,
    }
}

function setupGameControls(signal: AbortSignal): void {
    const startBtn = document.getElementById('start-btn')
    const resetBtn = document.getElementById('reset-btn')

    if (startBtn) {
        startBtn.addEventListener(
            'click',
            () => {
                if (game) {
                    const state = game.getGameState()
                    if (!state.gameStarted) {
                        game.startGame()
                        startBtn.textContent = 'Game Started'
                        ;(startBtn as HTMLButtonElement).disabled = true
                    }
                }
            },
            { signal }
        )
    }

    if (resetBtn) {
        resetBtn.addEventListener(
            'click',
            () => {
                if (game) {
                    game.resetGame()
                    if (startBtn) {
                        startBtn.textContent = 'Start Game'
                        ;(startBtn as HTMLButtonElement).disabled = false
                    }
                }
            },
            { signal }
        )
    }

    // Handle page unload
    window.addEventListener(
        'beforeunload',
        () => {
            cleanup()
        },
        { signal }
    )
}

async function saveScore(score: number): Promise<void> {
    await saveGameScore(
        GameID.MEMORY_MATRIX,
        score,
        result => {
            // Handle newly earned achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                // Dispatch an event for achievement notifications
                window.dispatchEvent(
                    new CustomEvent('achievementsEarned', {
                        detail: { achievementIds: result.newAchievements },
                    })
                )
            }
        },
        error => {
            console.error('[MemoryMatrix] Failed to save score:', error)
        }
    )
}

function cleanup(): void {
    abortController?.abort()
    abortController = null
    game?.destroy()
    renderer?.destroy()
    game = null
    renderer = null
}

// Export for debugging
if (typeof window !== 'undefined') {
    ;(window as Window & typeof globalThis).memoryMatrixGame = {
        getGame: () => game,
        getRenderer: () => renderer,
        cleanup,
    }
}
