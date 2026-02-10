import { MemoryMatrixGame } from './game'
import { MemoryMatrixRenderer } from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

let game: MemoryMatrixGame | null = null
let renderer: MemoryMatrixRenderer | null = null
let abortController: AbortController | null = null

export async function initMemoryMatrixGame(callbacks?: {
    onGameComplete?: (finalScore: number, stats: any) => void
}): Promise<any> {
    // Clean up previous instance if any
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
        // Reset button state when game ends
        const startBtn = document.getElementById('start-btn')
        if (startBtn) {
            startBtn.textContent = 'Start Game'
            ;(startBtn as HTMLButtonElement).disabled = false
        }

        // Call external callback if provided
        if (callbacks?.onGameComplete) {
            callbacks.onGameComplete(finalScore, stats)
        } else {
            // Fallback to original behavior
            await saveScore(finalScore)
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
    return {
        restart: () => game?.resetGame(),
        getState: () => game?.getGameState(),
        getStats: () => game?.getGameStats(),
        endGame: () => game?.endGameEarly(),
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
            // Score save failed
        }
    )
}

function cleanup(): void {
    abortController?.abort()
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
