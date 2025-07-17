import { MemoryMatrixGame } from './game'
import { MemoryMatrixRenderer } from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

let game: MemoryMatrixGame | null = null
let renderer: MemoryMatrixRenderer | null = null

export async function initMemoryMatrixGame(): Promise<void> {
    try {
        // Initialize game and renderer
        game = new MemoryMatrixGame()
        renderer = new MemoryMatrixRenderer('memory-matrix-container')

        // Set up callbacks
        game.setStateChangeCallback((state, stats) => {
            renderer?.render(state, stats)
        })

        game.setGameEndCallback(async (finalScore, stats) => {
            // Save score if user is logged in
            await saveScore(finalScore)
        })

        renderer.setCardClickCallback((row, col) => {
            game?.flipCard({ row, col })
        })

        // Set up game controls
        setupGameControls()

        // Set up restart listener
        window.addEventListener('memory-matrix-restart', () => {
            game?.resetGame()
        })

        // Initial render
        const initialState = game.getGameState()
        const initialStats = game.getGameStats()
        renderer.render(initialState, initialStats)
    } catch (error) {
        // TODO: Handle initialization errors more gracefully, e.g., display a message to the user
    }
}

function setupGameControls(): void {
    const startBtn = document.getElementById('start-btn')
    const resetBtn = document.getElementById('reset-btn')

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (game) {
                const state = game.getGameState()
                if (!state.gameStarted) {
                    game.startGame()
                    startBtn.textContent = 'Game Started'
                    ;(startBtn as HTMLButtonElement).disabled = true
                }
            }
        })
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (game) {
                game.resetGame()
                if (startBtn) {
                    startBtn.textContent = 'Start Game'
                    ;(startBtn as HTMLButtonElement).disabled = false
                }
            }
        })
    }

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        cleanup()
    })
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
    game?.destroy()
    renderer?.destroy()
    game = null
    renderer = null
}

// Export for debugging
if (typeof window !== 'undefined') {
    ;(window as any).memoryMatrixGame = {
        getGame: () => game,
        getRenderer: () => renderer,
        cleanup,
    }
}
