import {
    createGameState,
    initializeGrid,
    generateBubble,
    generateNextBubble,
    updateCurrentBubbleDisplay,
    updateNextBubbleDisplay,
    handleMouseMove,
    handleClick,
    startGame,
    resetGame,
    togglePause,
    gameLoop,
    draw,
    endGame,
    GAME_CONSTANTS,
} from './game'
import { setupPixiJS } from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

export async function initBubbleShooterGame(callbacks?: {
    onGameOver?: (finalScore: number, stats: any) => void
}): Promise<any> {
    const gameContainer = document.getElementById('game-container')
    const currentBubbleCanvas = document.getElementById(
        'current-bubble'
    ) as HTMLCanvasElement
    const nextBubbleCanvas = document.getElementById(
        'next-bubble'
    ) as HTMLCanvasElement

    if (!gameContainer || !currentBubbleCanvas || !nextBubbleCanvas) {
        throw new Error('Required DOM elements not found')
    }

    const currentBubbleCtx = currentBubbleCanvas.getContext('2d')!
    const nextBubbleCtx = nextBubbleCanvas.getContext('2d')!

    // Initialize game state
    const state = createGameState()
    const renderer = await setupPixiJS(gameContainer, GAME_CONSTANTS)

    // Enhanced game state with game over callback
    const enhancedState = {
        ...state,
        onGameOver: async (finalScore: number, stats: any) => {
            // Call external callback if provided
            if (callbacks?.onGameOver) {
                callbacks.onGameOver(finalScore, stats)
            } else {
                // Fallback to original behavior
                await saveScore(finalScore)
            }
        },
    }

    // Helper functions that close over local state
    const updateCurrentBubbleDisplayFn = () =>
        updateCurrentBubbleDisplay(
            enhancedState,
            currentBubbleCtx,
            currentBubbleCanvas
        )

    const updateNextBubbleDisplayFn = () =>
        updateNextBubbleDisplay(enhancedState, nextBubbleCtx, nextBubbleCanvas)

    const gameLoopFn = () => {
        if (
            enhancedState.gameStarted &&
            !enhancedState.gameOver &&
            !enhancedState.paused
        ) {
            gameLoop(enhancedState, renderer)
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        const startBtn = document.getElementById('start-btn')
        const endBtn = document.getElementById('end-btn')
        const pauseBtn = document.getElementById('pause-btn')
        const resetBtn = document.getElementById('reset-btn')
        const restartBtn = document.getElementById('restart-btn')
        const resumeBtn = document.getElementById('resume-btn')

        startBtn?.addEventListener('click', () => {
            startGame(enhancedState, gameLoopFn)
            // Show end button when game starts
            if (startBtn) {
                startBtn.style.display = 'none'
            }
            if (endBtn) {
                endBtn.style.display = 'inline-flex'
            }
        })

        endBtn?.addEventListener('click', () => {
            endGame(enhancedState)
        })

        pauseBtn?.addEventListener('click', () => {
            togglePause(enhancedState, gameLoopFn)
        })

        resetBtn?.addEventListener('click', () => {
            const gameOverOverlay = document.getElementById('game-over-overlay')
            if (gameOverOverlay) {
                gameOverOverlay.classList.add('hidden')
            }
            resetGame(
                enhancedState,
                updateCurrentBubbleDisplayFn,
                updateNextBubbleDisplayFn
            )
        })

        restartBtn?.addEventListener('click', () => {
            const gameOverOverlay = document.getElementById('game-over-overlay')
            if (gameOverOverlay) {
                gameOverOverlay.classList.add('hidden')
            }
            resetGame(
                enhancedState,
                updateCurrentBubbleDisplayFn,
                updateNextBubbleDisplayFn
            )
        })

        resumeBtn?.addEventListener('click', () => {
            togglePause(enhancedState, gameLoopFn)
        })

        // Canvas event listeners
        if (renderer.app && renderer.app.canvas) {
            renderer.app.canvas.addEventListener('mousemove', e =>
                handleMouseMove(e, enhancedState, renderer)
            )
            renderer.app.canvas.addEventListener('click', e =>
                handleClick(e, enhancedState, updateCurrentBubbleDisplayFn)
            )
        }

        // Keyboard controls
        document.addEventListener('keydown', e => {
            if (e.key === 'p' || e.key === 'P') {
                togglePause(enhancedState, gameLoopFn)
            }
        })
    }

    // Initialize everything
    setupEventListeners()
    initializeGrid(enhancedState)
    generateBubble(enhancedState)
    generateNextBubble(enhancedState)
    updateCurrentBubbleDisplayFn()
    updateNextBubbleDisplayFn()

    // Start continuous draw loop for rendering
    function drawLoop() {
        draw(renderer, enhancedState, GAME_CONSTANTS)
        requestAnimationFrame(drawLoop)
    }
    drawLoop()

    // Return game instance for external control
    return {
        restart: () =>
            resetGame(
                enhancedState,
                updateCurrentBubbleDisplayFn,
                updateNextBubbleDisplayFn
            ),
        getState: () => enhancedState,
        endGame: () => endGame(enhancedState),
        cleanup: () => {
            // Stop game loop by setting flags
            enhancedState.gameStarted = false
            enhancedState.gameOver = true

            // Remove canvas event listeners
            if (renderer.app && renderer.app.canvas) {
                renderer.app.canvas.removeEventListener('mousemove', e =>
                    handleMouseMove(e, enhancedState, renderer)
                )
                renderer.app.canvas.removeEventListener('click', e =>
                    handleClick(e, enhancedState, updateCurrentBubbleDisplayFn)
                )
            }

            // Destroy PixiJS renderer
            if (renderer.app) {
                renderer.app.destroy(true, { children: true, texture: true })
            }
        },
    }
}

async function saveScore(score: number): Promise<void> {
    await saveGameScore(
        GameID.BUBBLE_SHOOTER,
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
            console.error('Failed to submit score:', error)
        }
    )
}
