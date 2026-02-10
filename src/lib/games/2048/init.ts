// 2048 Game Initialization Module

import {
    type GameState,
    type Direction,
    type GameStats,
    type GameCallbacks,
    GAME_CONSTANTS,
} from './types'
import {
    createGameState,
    startGame,
    resetGame,
    processMove,
    endGame,
} from './game'
import {
    setupPixiJS,
    draw,
    playAnimations,
    destroyRenderer,
    type RendererState,
} from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

export interface Game2048Instance {
    start: () => void
    restart: () => void
    getState: () => GameState
    endGame: () => Promise<void>
    destroy: () => void
}

export interface Game2048Callbacks {
    onScoreChange?: (score: number) => void
    onGameOver?: (stats: GameStats) => void
    onWin?: () => void
}

export async function init2048Game(
    callbacks?: Game2048Callbacks
): Promise<Game2048Instance | undefined> {
    const gameContainer = document.getElementById('game-2048-container')
    if (!gameContainer) {
        console.error('Game container not found')
        return undefined
    }

    const abortController = new AbortController()
    const { signal } = abortController

    // Initialize game state
    let state = createGameState()
    let totalMerges = 0
    let renderer: RendererState | null = null
    let isAnimating = false

    // Touch handling state
    let touchStartX = 0
    let touchStartY = 0
    let touchStartTime = 0

    try {
        renderer = await setupPixiJS(gameContainer)
    } catch (error) {
        console.error('Failed to initialize PixiJS:', error)
        return undefined
    }

    // Update score display
    function updateScoreDisplay(score: number): void {
        const scoreElement = document.getElementById('score-display')
        if (scoreElement) {
            scoreElement.textContent = score.toString()
        }
    }

    // Update max tile display
    function updateMaxTileDisplay(maxTile: number): void {
        const maxTileElement = document.getElementById('max-tile-display')
        if (maxTileElement) {
            maxTileElement.textContent = maxTile.toString()
        }
    }

    // Game callbacks for internal use
    const gameCallbacks: GameCallbacks = {
        onScoreChange: (score: number) => {
            updateScoreDisplay(score)
            callbacks?.onScoreChange?.(score)
        },
        onGameOver: async (finalScore: number, stats: GameStats) => {
            // Update overlay stats
            const finalScoreElement = document.getElementById('final-score')
            if (finalScoreElement) {
                finalScoreElement.textContent = finalScore.toString()
            }

            const maxTileElement = document.getElementById('final-max-tile')
            if (maxTileElement) {
                maxTileElement.textContent = stats.maxTile.toString()
            }

            const movesElement = document.getElementById('final-moves')
            if (movesElement) {
                movesElement.textContent = stats.moveCount.toString()
            }

            // Show game over overlay
            const gameOverOverlay = document.getElementById('game-over-overlay')
            if (gameOverOverlay) {
                gameOverOverlay.classList.remove('hidden')
            }

            // Update overlay title based on win state
            const overlayTitle = document.getElementById('game-over-title')
            if (overlayTitle) {
                overlayTitle.textContent = stats.gameWon
                    ? '🎉 You Win!'
                    : 'Game Over'
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
                GameID.GAME_2048,
                finalScore,
                result => {
                    if (
                        result.newAchievements &&
                        result.newAchievements.length > 0
                    ) {
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
                {
                    maxTile: stats.maxTile,
                    mergeCount: stats.mergeCount,
                    gameWon: stats.gameWon,
                }
            )

            callbacks?.onGameOver?.(stats)
        },
        onWin: () => {
            // Show win notification but don't end game
            const winNotification = document.getElementById('win-notification')
            if (winNotification) {
                winNotification.classList.remove('hidden')
                setTimeout(() => {
                    winNotification.classList.add('hidden')
                }, 3000)
            }
            callbacks?.onWin?.()
        },
    }

    // Handle move direction
    async function handleMove(direction: Direction): Promise<void> {
        if (!state.gameStarted || state.gameOver || isAnimating || !renderer) {
            return
        }

        isAnimating = true

        const result = processMove(state, direction, totalMerges, gameCallbacks)

        if (result.state !== state) {
            state = result.state
            totalMerges = result.totalMerges

            // Update displays
            updateScoreDisplay(state.score)
            updateMaxTileDisplay(state.maxTile)

            // Play animations
            if (state.lastMoveAnimations.length > 0) {
                await playAnimations(renderer, state.lastMoveAnimations, state)
            } else {
                draw(renderer, state)
            }

            // Execute callbacks after animations
            result.callbacksToInvoke.forEach(cb => cb())
        }

        isAnimating = false
    }

    // Keyboard event handler
    function handleKeyDown(e: KeyboardEvent): void {
        if (!state.gameStarted || state.gameOver || isAnimating) {
            return
        }

        let direction: Direction | null = null

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                direction = 'up'
                break
            case 'ArrowDown':
            case 's':
            case 'S':
                direction = 'down'
                break
            case 'ArrowLeft':
            case 'a':
            case 'A':
                direction = 'left'
                break
            case 'ArrowRight':
            case 'd':
            case 'D':
                direction = 'right'
                break
        }

        if (direction) {
            e.preventDefault()
            handleMove(direction)
        }
    }

    // Touch event handlers
    function handleTouchStart(e: TouchEvent): void {
        if (!state.gameStarted || state.gameOver || isAnimating) {
            return
        }

        const touch = e.touches[0]
        touchStartX = touch.clientX
        touchStartY = touch.clientY
        touchStartTime = Date.now()
    }

    function handleTouchEnd(e: TouchEvent): void {
        if (!state.gameStarted || state.gameOver || isAnimating) {
            return
        }

        const touch = e.changedTouches[0]
        const deltaX = touch.clientX - touchStartX
        const deltaY = touch.clientY - touchStartY
        const deltaTime = Date.now() - touchStartTime

        // Only register swipe if it's fast enough (under 300ms)
        if (deltaTime > 300) {
            return
        }

        const absX = Math.abs(deltaX)
        const absY = Math.abs(deltaY)

        // Check if swipe exceeds threshold
        if (
            absX < GAME_CONSTANTS.SWIPE_THRESHOLD &&
            absY < GAME_CONSTANTS.SWIPE_THRESHOLD
        ) {
            return
        }

        const direction: Direction =
            absX > absY
                ? deltaX > 0
                    ? 'right'
                    : 'left'
                : deltaY > 0
                  ? 'down'
                  : 'up'

        e.preventDefault()
        handleMove(direction)
    }

    function handleTouchMove(e: TouchEvent): void {
        // Prevent scrolling while swiping on the game
        if (state.gameStarted && !state.gameOver) {
            e.preventDefault()
        }
    }

    // Start game function
    function start(): void {
        state = startGame(state)
        totalMerges = 0
        updateScoreDisplay(state.score)
        updateMaxTileDisplay(state.maxTile)

        // Hide game over overlay
        const gameOverOverlay = document.getElementById('game-over-overlay')
        if (gameOverOverlay) {
            gameOverOverlay.classList.add('hidden')
        }

        if (renderer) {
            draw(renderer, state)
        }
    }

    // Restart game function
    function restart(): void {
        state = resetGame(state)
        totalMerges = 0
        updateScoreDisplay(0)
        updateMaxTileDisplay(0)

        // Hide game over overlay
        const gameOverOverlay = document.getElementById('game-over-overlay')
        if (gameOverOverlay) {
            gameOverOverlay.classList.add('hidden')
        }

        if (renderer) {
            draw(renderer, state)
        }
    }

    // End game manually
    async function endGameManually(): Promise<void> {
        if (!state.gameStarted || state.gameOver) {
            return
        }

        const { state: endedState, stats } = endGame(state, totalMerges)
        state = endedState

        if (gameCallbacks.onGameOver) {
            await gameCallbacks.onGameOver(stats.finalScore, stats)
        }
    }

    // Destroy and cleanup
    function destroy(): void {
        abortController.abort()

        if (renderer) {
            destroyRenderer(renderer)
            renderer = null
        }
    }

    // Setup event listeners
    document.addEventListener('keydown', handleKeyDown, { signal })
    gameContainer.addEventListener('touchstart', handleTouchStart, {
        passive: false,
        signal,
    })
    gameContainer.addEventListener('touchend', handleTouchEnd, {
        passive: false,
        signal,
    })
    gameContainer.addEventListener('touchmove', handleTouchMove, {
        passive: false,
        signal,
    })

    // Initial draw
    draw(renderer, state)

    // Return game instance
    return {
        start,
        restart,
        getState: () => state,
        endGame: endGameManually,
        destroy,
    }
}
