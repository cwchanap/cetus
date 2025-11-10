// Snake game initialization module
import type { GameState, GameStats } from './types'
import {
    createGameState,
    startGame,
    togglePause,
    resetGame,
    gameLoop,
    updateUI,
    changeDirection,
    GAME_CONSTANTS,
    endGame,
} from './game'
import { setupPixiJS, drawGrid, draw } from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

export interface SnakeGameInstance {
    restart: () => void
    getState: () => GameState
    endGame: () => Promise<void>
}

export async function initSnakeGame(): Promise<SnakeGameInstance | undefined> {
    const gameContainer = document.getElementById('snake-container')

    if (!gameContainer) {
        return undefined
    }

    // Initialize game state
    const state = createGameState()
    const renderer = await setupPixiJS(gameContainer, GAME_CONSTANTS)

    // Draw the grid once (it doesn't change)
    drawGrid(renderer, GAME_CONSTANTS)

    // Enhanced state with score handling
    const enhancedState = {
        ...state,
        onGameOver: async (finalScore: number, stats: GameStats) => {
            // Update final stats in overlay
            const finalScoreElement = document.getElementById('final-score')
            if (finalScoreElement) {
                finalScoreElement.textContent = finalScore.toString()
            }

            const finalLengthElement = document.getElementById('final-length')
            if (finalLengthElement) {
                finalLengthElement.textContent =
                    stats.maxLength?.toString() || '3'
            }

            const finalFoodsElement = document.getElementById('final-foods')
            if (finalFoodsElement) {
                finalFoodsElement.textContent =
                    stats.foodsEaten?.toString() || '0'
            }

            const finalTimeElement = document.getElementById('final-time')
            if (finalTimeElement) {
                const seconds = Math.floor((stats.gameTime || 0) / 1000)
                finalTimeElement.textContent = `${seconds}s`
            }

            // Show game over overlay
            const gameOverOverlay = document.getElementById('game-over-overlay')
            if (gameOverOverlay) {
                gameOverOverlay.classList.remove('hidden')
            }

            // Reset buttons
            const startBtn = document.getElementById('start-btn')
            const endBtn = document.getElementById('end-btn')
            if (startBtn) {
                startBtn.style.display = 'inline-flex'
            }
            if (endBtn) {
                endBtn.style.display = 'none'
            }

            // Submit score
            await saveGameScore(
                GameID.SNAKE,
                finalScore,
                result => {
                    // Handle newly earned achievements
                    if (
                        result.newAchievements &&
                        result.newAchievements.length > 0
                    ) {
                        // Dispatch an event for achievement notifications
                        window.dispatchEvent(
                            new CustomEvent('achievementsEarned', {
                                detail: {
                                    achievementIds: result.newAchievements,
                                },
                            })
                        )
                    }
                },
                error => {
                    // eslint-disable-next-line no-console
                    console.error('Failed to submit score:', error)
                },
                stats
            )
        },
    }

    const gameLoopFn = () => {
        if (
            enhancedState.gameStarted &&
            !enhancedState.gameOver &&
            !enhancedState.paused
        ) {
            gameLoop(enhancedState)
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        document
            .getElementById('start-btn')
            ?.addEventListener('click', () =>
                startGame(enhancedState, gameLoopFn)
            )
        document
            .getElementById('pause-btn')
            ?.addEventListener('click', () =>
                togglePause(enhancedState, gameLoopFn)
            )
        document
            .getElementById('reset-btn')
            ?.addEventListener('click', () => resetGame(enhancedState))
        document
            .getElementById('restart-btn')
            ?.addEventListener('click', () => resetGame(enhancedState))

        // Page unload warning
        window.addEventListener('beforeunload', e => {
            if (
                enhancedState.gameStarted &&
                !enhancedState.gameOver &&
                !enhancedState.paused
            ) {
                e.preventDefault()
                const message =
                    'You have a game in progress. Are you sure you want to leave?'
                e.returnValue = message
                return message // For older browsers
            }
        })

        // Keyboard controls
        document.addEventListener('keydown', e => {
            if (!enhancedState.gameStarted || enhancedState.gameOver) {
                return
            }

            switch (e.key) {
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    e.preventDefault()
                    changeDirection(enhancedState, 'left')
                    break
                case 'ArrowRight':
                case 'd':
                case 'D':
                    e.preventDefault()
                    changeDirection(enhancedState, 'right')
                    break
                case 'ArrowUp':
                case 'w':
                case 'W':
                    e.preventDefault()
                    changeDirection(enhancedState, 'up')
                    break
                case 'ArrowDown':
                case 's':
                case 'S':
                    e.preventDefault()
                    changeDirection(enhancedState, 'down')
                    break
                case 'p':
                case 'P':
                    e.preventDefault()
                    togglePause(enhancedState, gameLoopFn)
                    break
            }
        })
    }

    // Initialize everything
    setupEventListeners()
    updateUI(enhancedState)

    // Start continuous draw loop for rendering
    function drawLoop() {
        draw(renderer, enhancedState, GAME_CONSTANTS)
        requestAnimationFrame(drawLoop)
    }
    drawLoop()

    // Return game instance for external control
    return {
        restart: () => resetGame(enhancedState),
        getState: () => enhancedState,
        endGame: () => endGame(enhancedState),
    }
}
