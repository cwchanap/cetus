import { MemoryMatrixGame } from './game'
import { MemoryMatrixRenderer } from './renderer'

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
            console.log('Game ended with score:', finalScore)
            console.log('Game stats:', stats)

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

        console.log('Memory Matrix game initialized successfully')
    } catch (error) {
        console.error('Failed to initialize Memory Matrix game:', error)
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
    try {
        const response = await fetch('/api/scores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                gameId: 'memory_matrix',
                score: score,
            }),
        })

        if (!response.ok) {
            console.warn('Failed to save score:', response.statusText)
        } else {
            console.log('Score saved successfully')
        }
    } catch (error) {
        console.warn('Error saving score:', error)
    }
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
