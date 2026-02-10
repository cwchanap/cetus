// Tetris game initialization module
import type { GameState } from './types'
import {
    createGameState,
    generateNextPiece,
    movePiece,
    rotatePiece,
    hardDrop,
    startGame,
    togglePause,
    resetGame,
    gameLoop,
    updateUI,
    updateNextPieceDisplay,
    draw,
    endGame,
    GAME_CONSTANTS,
} from './game'
import { setupPixiJS } from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

export interface TetrisGameInstance {
    restart: () => void
    getState: () => GameState
    endGame: () => Promise<void>
    cleanup: () => void
}

export async function initTetrisGame(): Promise<
    TetrisGameInstance | undefined
> {
    const gameContainer = document.getElementById('tetris-container')
    const nextCanvas = document.getElementById(
        'next-canvas'
    ) as HTMLCanvasElement
    const nextCtx = nextCanvas?.getContext('2d')

    if (!gameContainer || !nextCtx) {
        return undefined
    }

    // Initialize game state
    const state = createGameState()
    const abortController = new AbortController()
    const { signal } = abortController
    const renderer = await setupPixiJS(gameContainer, GAME_CONSTANTS)

    // Enhanced state with score handling
    const enhancedState = {
        ...state,
        onGameOver: async (finalScore: number, stats: any) => {
            // Update final stats in overlay
            const finalScoreElement = document.getElementById('final-score')
            if (finalScoreElement) {
                finalScoreElement.textContent = finalScore.toString()
            }

            const finalLevelElement = document.getElementById('final-level')
            if (finalLevelElement) {
                finalLevelElement.textContent = stats.level?.toString() || '1'
            }

            const finalLinesElement = document.getElementById('final-lines')
            if (finalLinesElement) {
                finalLinesElement.textContent = stats.lines?.toString() || '0'
            }

            const finalPiecesElement = document.getElementById('final-pieces')
            if (finalPiecesElement) {
                finalPiecesElement.textContent = stats.pieces?.toString() || '0'
            }

            const finalTetrisesElement =
                document.getElementById('final-tetrises')
            if (finalTetrisesElement) {
                finalTetrisesElement.textContent =
                    stats.tetrises?.toString() || '0'
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
                GameID.TETRIS,
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
                    console.error('Failed to submit score:', error)
                },
                stats
            )
        },
    }

    // Helper functions that close over local state
    const updateNextPieceDisplayFn = () =>
        updateNextPieceDisplay(state, nextCtx, nextCanvas)

    const gameLoopFn = () => {
        if (
            enhancedState.gameStarted &&
            !enhancedState.gameOver &&
            !enhancedState.paused
        ) {
            gameLoop(enhancedState)
        }
    }

    const startHandler = () => startGame(enhancedState, gameLoopFn)
    const pauseHandler = () => togglePause(enhancedState, gameLoopFn)
    const resetHandler = () =>
        resetGame(enhancedState, updateNextPieceDisplayFn)
    const restartHandler = () =>
        resetGame(enhancedState, updateNextPieceDisplayFn)
    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
        if (
            enhancedState.gameStarted &&
            !enhancedState.gameOver &&
            !enhancedState.paused
        ) {
            event.preventDefault()
            const message =
                'You have a game in progress. Are you sure you want to leave?'
            event.returnValue = message
            return message
        }
    }
    const keydownHandler = (event: KeyboardEvent) => {
        if (
            !enhancedState.gameStarted ||
            enhancedState.gameOver ||
            enhancedState.paused
        ) {
            return
        }

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault()
                movePiece(enhancedState, -1, 0)
                break
            case 'ArrowRight':
                event.preventDefault()
                movePiece(enhancedState, 1, 0)
                break
            case 'ArrowDown':
                event.preventDefault()
                movePiece(enhancedState, 0, 1)
                break
            case 'ArrowUp':
                event.preventDefault()
                rotatePiece(enhancedState)
                break
            case ' ':
                event.preventDefault()
                hardDrop(enhancedState)
                break
            case 'p':
            case 'P':
                event.preventDefault()
                togglePause(enhancedState, gameLoopFn)
                break
        }
    }

    let drawFrameId: number | null = null
    let drawRunning = true
    let cleanupCalled = false

    // Setup event listeners
    function setupEventListeners() {
        document
            .getElementById('start-btn')
            ?.addEventListener('click', startHandler, { signal })
        document
            .getElementById('pause-btn')
            ?.addEventListener('click', pauseHandler, { signal })
        document
            .getElementById('reset-btn')
            ?.addEventListener('click', resetHandler, { signal })
        document
            .getElementById('restart-btn')
            ?.addEventListener('click', restartHandler, { signal })

        // Page unload warning
        window.addEventListener('beforeunload', beforeUnloadHandler, { signal })

        // Keyboard controls
        document.addEventListener('keydown', keydownHandler, { signal })
    }

    // Initialize everything
    setupEventListeners()
    enhancedState.nextPiece = generateNextPiece()
    updateNextPieceDisplayFn()
    updateUI(enhancedState)

    // Start continuous draw loop for rendering
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
        restart: () => resetGame(enhancedState, updateNextPieceDisplayFn),
        getState: () => enhancedState,
        endGame: () => endGame(enhancedState),
        cleanup: () => {
            // Idempotency guard - prevent multiple cleanups
            if (cleanupCalled) {
                return
            }
            cleanupCalled = true

            // Stop game loop by setting flags
            enhancedState.gameStarted = false
            enhancedState.gameOver = true
            drawRunning = false
            if (drawFrameId !== null) {
                cancelAnimationFrame(drawFrameId)
                drawFrameId = null
            }

            abortController.abort()

            // Destroy PixiJS renderer
            if (renderer.app) {
                renderer.app.destroy(true, { children: true, texture: true })
            }
        },
    }
}
