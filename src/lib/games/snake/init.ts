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

export interface SnakeGameInstance {
    restart: () => void
    getState: () => GameState
    endGame: () => Promise<void>
    cleanup: () => void
}

export async function initSnakeGame(): Promise<SnakeGameInstance | undefined> {
    const gameContainer = document.getElementById('snake-container')

    if (!gameContainer) {
        return undefined
    }

    // Initialize game state
    const abortController = new AbortController()
    const { signal } = abortController
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
                ;(startBtn as HTMLButtonElement).disabled = false
                startBtn.textContent = 'Start'
            }
            if (endBtn) {
                endBtn.style.display = 'none'
            }

            // Note: Score submission is now handled in game.ts endGame()
            // This callback only handles UI updates
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
            ?.addEventListener(
                'click',
                () => startGame(enhancedState, gameLoopFn),
                { signal }
            )
        document
            .getElementById('pause-btn')
            ?.addEventListener(
                'click',
                () => togglePause(enhancedState, gameLoopFn),
                { signal }
            )
        document
            .getElementById('reset-btn')
            ?.addEventListener('click', () => resetGame(enhancedState), {
                signal,
            })
        document
            .getElementById('restart-btn')
            ?.addEventListener('click', () => resetGame(enhancedState), {
                signal,
            })

        // Page unload warning
        window.addEventListener(
            'beforeunload',
            e => {
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
            },
            { signal }
        )

        // Keyboard controls
        document.addEventListener(
            'keydown',
            e => {
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
            },
            { signal }
        )
    }

    // Initialize everything
    setupEventListeners()
    updateUI(enhancedState)

    // Start continuous draw loop for rendering
    let drawFrameId: number | null = null
    let drawRunning = true

    function drawLoop() {
        if (!drawRunning) {
            return
        }
        draw(renderer, enhancedState, GAME_CONSTANTS)
        drawFrameId = requestAnimationFrame(drawLoop)
    }
    drawLoop()

    // Return game instance for external control
    return {
        restart: () => resetGame(enhancedState),
        getState: () => enhancedState,
        endGame: () => endGame(enhancedState),
        cleanup: () => {
            drawRunning = false
            if (drawFrameId !== null) {
                cancelAnimationFrame(drawFrameId)
            }
            abortController.abort()
            if (renderer.app) {
                renderer.app.destroy(true, { children: true, texture: true })
            }
        },
    }
}
