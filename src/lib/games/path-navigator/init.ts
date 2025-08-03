import { PathNavigatorGame, DEFAULT_CONFIG } from './game'
import {
    setupPixiJS,
    clearRenderer,
    renderBackground,
    renderPath,
    renderGoal,
    renderCursor,
} from './renderer'
import type {
    GameConfig,
    GameCallbacks,
    GameStats,
    RendererState,
} from './types'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

async function handleGameOver(
    finalScore: number,
    stats: GameStats
): Promise<void> {
    // Update final stats in overlay
    const finalScoreElement = document.getElementById('final-score')
    if (finalScoreElement) {
        finalScoreElement.textContent = finalScore.toString()
    }

    const levelsCompletedElement = document.getElementById('levels-completed')
    if (levelsCompletedElement) {
        levelsCompletedElement.textContent = stats.levelsCompleted.toString()
    }

    const totalTimeElement = document.getElementById('total-time')
    if (totalTimeElement) {
        totalTimeElement.textContent = Math.round(stats.totalTime).toString()
    }

    // Show game over overlay
    const gameOverOverlay = document.getElementById('game-over-overlay')
    if (gameOverOverlay) {
        gameOverOverlay.classList.remove('hidden')
    }

    // Save score to database
    try {
        await saveGameScore(
            GameID.PATH_NAVIGATOR,
            finalScore,
            undefined, // onSuccess callback
            undefined, // onError callback
            stats // gameData
        )
    } catch (_error) {
        // Score saving failed - this is non-critical
    }
}

export interface PathNavigatorGameInstance {
    startGame: () => void
    endGame: () => void
    pauseGame: () => void
    resumeGame: () => void
    resetGame: () => void
    cleanup: () => void
}

export async function initializePathNavigatorGame(
    config: Partial<GameConfig> = {},
    callbacks: Partial<GameCallbacks> = {}
): Promise<PathNavigatorGameInstance | undefined> {
    const gameContainer = document.getElementById('path-navigator-container')
    if (!gameContainer) {
        return undefined
    }

    const gameConfig = { ...DEFAULT_CONFIG, ...config }

    let renderer: RendererState | null = null
    let game: PathNavigatorGame | null = null
    let animationFrame: number | null = null

    try {
        // Initialize renderer
        renderer = await setupPixiJS(gameContainer, gameConfig)

        // Initialize game
        game = new PathNavigatorGame(gameConfig)

        // Set up callbacks
        const gameCallbacks: GameCallbacks = {
            onScoreUpdate: (score: number) => {
                const scoreElement = document.getElementById('score')
                if (scoreElement) {
                    scoreElement.textContent = score.toString()
                }
                callbacks.onScoreUpdate?.(score)
            },
            onTimeUpdate: (timeRemaining: number) => {
                const timeElement = document.getElementById('time-remaining')
                if (timeElement) {
                    timeElement.textContent = timeRemaining.toString()
                }
                callbacks.onTimeUpdate?.(timeRemaining)
            },
            onLevelChange: (level: number) => {
                const levelElement = document.getElementById('level')
                if (levelElement) {
                    levelElement.textContent = level.toString()
                }
                callbacks.onLevelChange?.(level)
            },
            onPathViolation: () => {
                // Visual feedback for path violation
                callbacks.onPathViolation?.()
            },
            onGoalReached: () => {
                // Visual feedback for goal reached
                callbacks.onGoalReached?.()
            },
            onGameOver: async (finalScore: number, stats: GameStats) => {
                await handleGameOver(finalScore, stats)
                callbacks.onGameOver?.(finalScore, stats)
            },
            onGameStart: () => {
                callbacks.onGameStart?.()
            },
            onScoreUpload: callbacks.onScoreUpload,
        }

        // Set up keyboard controls

        const handleKeyPress = (event: KeyboardEvent) => {
            if (!renderer || !game || !game.getState().isGameActive) {
                return
            }

            const state = game.getState()
            const currentPos = { x: state.cursor.x, y: state.cursor.y }

            // Movement step size - increased by 5x for faster movement
            const step = 25

            let newX = currentPos.x
            let newY = currentPos.y

            // Handle arrow key movement
            switch (event.key) {
                case 'ArrowUp':
                    newY = Math.max(0, currentPos.y - step)
                    break
                case 'ArrowDown':
                    newY = Math.min(gameConfig.gameHeight, currentPos.y + step)
                    break
                case 'ArrowLeft':
                    newX = Math.max(0, currentPos.x - step)
                    break
                case 'ArrowRight':
                    newX = Math.min(gameConfig.gameWidth, currentPos.x + step)
                    break
                default:
                    return
            }

            // Prevent default arrow key behavior
            event.preventDefault()

            // Update player position
            game.updatePlayerPosition(newX, newY)
        }

        // Track previous level for player positioning
        let previousLevel = 1

        // Game loop
        function gameLoop() {
            if (!renderer || !game) {
                return
            }

            const state = game.getState()
            const currentLevel = game.getCurrentLevel()

            // Check if level has changed
            if (state.currentLevel !== previousLevel) {
                // Position player at start of new level
                const startPoint = currentLevel.path.startPoint
                game.setCursorPosition(startPoint.x, startPoint.y)
                previousLevel = state.currentLevel
            }

            // Clear and render
            renderBackground(renderer, gameConfig)
            renderPath(renderer, currentLevel, gameConfig)
            renderGoal(renderer, currentLevel.path.endPoint, gameConfig)
            renderCursor(renderer, state.cursor, gameConfig, state.isOnPath)

            // Update callbacks
            gameCallbacks.onScoreUpdate(state.score)
            gameCallbacks.onTimeUpdate(state.timeRemaining)
            gameCallbacks.onLevelChange(state.currentLevel)

            // Check game over
            if (state.isGameOver) {
                const stats = game.getStats()
                gameCallbacks.onGameOver(state.score, stats)
                return
            }

            // Continue animation loop
            if (state.isGameActive) {
                animationFrame = requestAnimationFrame(gameLoop)
            }
        }

        // Game instance interface
        const gameInstance: PathNavigatorGameInstance = {
            startGame: () => {
                if (!game) {
                    return
                }

                // Start the game first
                game.startGame()

                // Position player at start of current level immediately
                const currentLevel = game.getCurrentLevel()
                const startPoint = currentLevel.path.startPoint

                game.setCursorPosition(startPoint.x, startPoint.y)

                // Force an initial render to show the player immediately
                if (renderer) {
                    const state = game.getState()
                    renderBackground(renderer, gameConfig)
                    renderPath(renderer, currentLevel, gameConfig)
                    renderGoal(renderer, currentLevel.path.endPoint, gameConfig)
                    renderCursor(
                        renderer,
                        state.cursor,
                        gameConfig,
                        state.isOnPath
                    )
                }

                // Enable keyboard controls
                document.addEventListener('keydown', handleKeyPress)
                animationFrame = requestAnimationFrame(gameLoop)

                // Call game start callback
                gameCallbacks.onGameStart()
            },
            endGame: () => {
                if (game) {
                    game.endGame()
                }
                if (animationFrame) {
                    cancelAnimationFrame(animationFrame)
                }
            },
            pauseGame: () => {
                if (game) {
                    game.pauseGame()
                }
                if (animationFrame) {
                    cancelAnimationFrame(animationFrame)
                }
            },
            resumeGame: () => {
                if (game && game.getState().isGameActive) {
                    animationFrame = requestAnimationFrame(gameLoop)
                }
                gameLoop()
            },
            resetGame: () => {
                if (!game) {
                    return
                }

                // Reset game state
                game.resetGame()

                // Cancel animation
                if (animationFrame) {
                    cancelAnimationFrame(animationFrame)
                    animationFrame = null
                }

                // Reset UI
                gameCallbacks.onScoreUpdate(0)
                gameCallbacks.onTimeUpdate(gameConfig.gameDuration)
                gameCallbacks.onLevelChange(1)
            },
            cleanup: () => {
                // Clean up resources
                if (animationFrame) {
                    cancelAnimationFrame(animationFrame)
                }

                // Remove keyboard event listener
                document.removeEventListener('keydown', handleKeyPress)

                if (game) {
                    game.cleanup()
                }

                if (renderer) {
                    clearRenderer(renderer)
                }
            },
        }

        return gameInstance
    } catch (_error) {
        // Clean up on error
        if (renderer) {
            clearRenderer(renderer)
        }
        if (game) {
            game.cleanup()
        }
        return undefined
    }
}
