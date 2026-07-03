// 2048 game initialization using BaseGame framework
import { Game2048, DEFAULT_GAME2048_CONFIG } from './Game2048'
import {
    Game2048Renderer,
    createGame2048RendererConfig,
} from './Game2048Renderer'
import type { Game2048Config, Game2048Stats } from './frameworkTypes'
import { GAME_CONSTANTS, type Direction } from './types'
import type { BaseGameCallbacks, BaseGameStats } from '@/lib/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'

// Achievement notification type
interface AchievementNotification {
    id: string
    name: string
    description: string
    icon: string
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

declare global {
    interface Window {
        showAchievementAward?: (achievements: AchievementNotification[]) => void
    }
}

export interface Game2048InitResult {
    game: Game2048
    renderer: Game2048Renderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<Game2048['getState']>
    endGame: () => Promise<void>
}

export async function init2048GameFramework(
    customConfig?: Partial<Game2048Config>,
    customCallbacks?: BaseGameCallbacks
): Promise<Game2048InitResult | undefined> {
    const container = document.getElementById('game-2048-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('game-2048-container'),
            'Game2048'
        )
        return undefined
    }

    const config: Game2048Config = {
        ...DEFAULT_GAME2048_CONFIG,
        ...customConfig,
    }
    const rendererConfig = createGame2048RendererConfig(
        config,
        '#game-2048-container'
    )

    // Initialize renderer with error handling
    const renderer = new Game2048Renderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'Game2048'
        )
        try {
            const app = renderer.getApp()
            if (app?.canvas?.parentNode) {
                app.canvas.parentNode.removeChild(app.canvas)
            }
            renderer.cleanup()
        } catch (cleanupError) {
            console.error('Error during renderer cleanup:', cleanupError)
        }
        return undefined
    }

    // Style the canvas only after successful initialization
    const app = renderer.getApp()
    if (app) {
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        app.canvas.style.borderRadius = '8px'
        app.canvas.style.display = 'block'
    }

    // Track whether the player has already been notified of reaching 2048 so
    // we only show the win notification once (on the false -> true transition).
    let prevWon = false

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            const gameState = state as ReturnType<Game2048['getState']>
            updateMaxTileDisplay(gameState.maxTile)
            if (gameState.won && !prevWon) {
                showWinNotification()
            }
            prevWon = gameState.won
            customCallbacks?.onStateChange?.(state)
        },
        onScoreUpdate: score => {
            updateScoreDisplay(score)
            customCallbacks?.onScoreUpdate?.(score)
        },
        onStart: () => {
            swapStartEndButtons(true)
            hideOverlay()
            renderer.render(game.getState())
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const gameStats = stats as Game2048Stats
            showGameOver(finalScore, gameStats)
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new Game2048(config, enhancedCallbacks)

    // Animation queue state
    let isAnimating = false
    let pendingDirection: Direction | null = null

    // Handle achievement notifications
    const onGameEnd = (event: unknown) => {
        const data = (event as { data: unknown }).data as {
            newAchievements?: AchievementNotification[]
        }
        if (data?.newAchievements && data.newAchievements.length > 0) {
            if (
                typeof window !== 'undefined' &&
                typeof window.showAchievementAward === 'function'
            ) {
                window.showAchievementAward(data.newAchievements)
            }
        }
    }
    game.on('end', onGameEnd)

    // Event-driven move handler with animation orchestration
    const handleMove = async (direction: Direction): Promise<void> => {
        const state = game.getState()
        if (!state.gameStarted || state.isGameOver) {
            return
        }

        if (isAnimating) {
            pendingDirection = direction
            return
        }

        isAnimating = true

        try {
            const result = game.move(direction)
            if (result.moved) {
                if (result.animations.length > 0) {
                    await renderer.playAnimations(
                        result.animations,
                        game.getState()
                    )
                } else {
                    renderer.render(game.getState())
                }
            }
        } catch (err) {
            console.error('handleMove error', err)
        } finally {
            isAnimating = false

            const nextDirection = pendingDirection
            pendingDirection = null
            const currentState = game.getState()
            if (
                nextDirection &&
                currentState.gameStarted &&
                !currentState.isGameOver
            ) {
                void handleMove(nextDirection)
            }
        }
    }

    // Set up controls
    const cleanupButtonHandlers = setupButtonHandlers(game, renderer)
    const cleanupKeyboardControls = setupKeyboardControls(handleMove)
    const cleanupTouchControls = setupTouchControls(handleMove)
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Initial render
    renderer.render(game.getState())

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupButtonHandlers()
            cleanupKeyboardControls()
            cleanupTouchControls()
            cleanupUnloadWarning()
            game.off('end', onGameEnd)
            renderer.cleanup()
            game.destroy()
        },
        restart: () => {
            isAnimating = false
            pendingDirection = null
            game.reset()
            renderer.render(game.getState())
            resetButtonVisibility()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

function updateScoreDisplay(score: number): void {
    const scoreElement = document.getElementById('score-display')
    if (scoreElement) {
        scoreElement.textContent = score.toString()
    }
}

function updateMaxTileDisplay(maxTile: number): void {
    const maxTileElement = document.getElementById('max-tile-display')
    if (maxTileElement) {
        maxTileElement.textContent = maxTile.toString()
    }
}

function hideOverlay(): void {
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.add('hidden')
    }
}

function showWinNotification(): void {
    const winNotification = document.getElementById('win-notification')
    if (winNotification) {
        winNotification.classList.remove('hidden')
        setTimeout(() => {
            winNotification.classList.add('hidden')
        }, 3000)
    }
}

function swapStartEndButtons(gameStarted: boolean): void {
    const startBtn = document.getElementById(
        'start-btn'
    ) as HTMLButtonElement | null
    const endBtn = document.getElementById(
        'end-btn'
    ) as HTMLButtonElement | null
    if (gameStarted) {
        if (startBtn) {
            startBtn.style.display = 'none'
        }
        if (endBtn) {
            endBtn.style.display = 'inline-flex'
        }
    } else {
        if (startBtn) {
            startBtn.style.display = 'inline-flex'
        }
        if (endBtn) {
            endBtn.style.display = 'none'
        }
    }
}

function showGameOver(finalScore: number, stats: Game2048Stats): void {
    swapStartEndButtons(false)

    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    setText('final-score', finalScore.toString())
    setText('final-max-tile', stats.maxTile.toString())
    setText('final-moves', stats.moveCount.toString())

    // Update overlay title based on win state
    const overlayTitle = document.getElementById('game-over-title')
    if (overlayTitle) {
        overlayTitle.textContent = stats.won ? '🎉 You Win!' : 'Game Over'
    }

    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function resetButtonVisibility(): void {
    swapStartEndButtons(false)
    hideOverlay()
}

function setupButtonHandlers(
    game: Game2048,
    renderer: Game2048Renderer
): () => void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const resetBtn = document.getElementById('reset-btn')
    const restartBtn = document.getElementById('restart-btn')

    const startHandler = () => game.start()

    const endHandler = () => {
        void game.end()
    }

    const resetHandler = () => {
        game.reset()
        renderer.render(game.getState())
        resetButtonVisibility()
    }

    const restartHandler = () => {
        game.reset()
        renderer.render(game.getState())
        resetButtonVisibility()
    }

    startBtn?.addEventListener('click', startHandler)
    endBtn?.addEventListener('click', endHandler)
    resetBtn?.addEventListener('click', resetHandler)
    restartBtn?.addEventListener('click', restartHandler)

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        endBtn?.removeEventListener('click', endHandler)
        resetBtn?.removeEventListener('click', resetHandler)
        restartBtn?.removeEventListener('click', restartHandler)
    }
}

function setupKeyboardControls(
    handleMove: (direction: Direction) => void
): () => void {
    const directionMap: Record<string, Direction> = {
        ArrowLeft: 'left',
        a: 'left',
        A: 'left',
        ArrowRight: 'right',
        d: 'right',
        D: 'right',
        ArrowUp: 'up',
        w: 'up',
        W: 'up',
        ArrowDown: 'down',
        s: 'down',
        S: 'down',
    }

    const keydownHandler = (e: KeyboardEvent) => {
        const direction = directionMap[e.key]
        if (direction) {
            e.preventDefault()
            void handleMove(direction)
        }
    }

    document.addEventListener('keydown', keydownHandler)

    return () => {
        document.removeEventListener('keydown', keydownHandler)
    }
}

function setupTouchControls(
    handleMove: (direction: Direction) => void
): () => void {
    const container = document.getElementById('game-2048-container')
    if (!container) {
        return () => {}
    }

    let touchStartX = 0
    let touchStartY = 0
    let touchStartTime = 0

    const touchStartHandler = (e: TouchEvent) => {
        const touch = e.touches[0]
        touchStartX = touch.clientX
        touchStartY = touch.clientY
        touchStartTime = Date.now()
    }

    const touchEndHandler = (e: TouchEvent) => {
        const touch = e.changedTouches[0]
        const deltaX = touch.clientX - touchStartX
        const deltaY = touch.clientY - touchStartY
        const deltaTime = Date.now() - touchStartTime

        // Only register fast swipes
        if (deltaTime > 300) {
            return
        }

        const absX = Math.abs(deltaX)
        const absY = Math.abs(deltaY)

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
        void handleMove(direction)
    }

    const touchMoveHandler = (e: TouchEvent) => {
        e.preventDefault()
    }

    container.addEventListener('touchstart', touchStartHandler, {
        passive: false,
    })
    container.addEventListener('touchend', touchEndHandler, { passive: false })
    container.addEventListener('touchmove', touchMoveHandler, {
        passive: false,
    })

    return () => {
        container.removeEventListener('touchstart', touchStartHandler)
        container.removeEventListener('touchend', touchEndHandler)
        container.removeEventListener('touchmove', touchMoveHandler)
    }
}

function setupUnloadWarning(game: Game2048): () => void {
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        const state = game.getState()
        if (state.gameStarted && !state.isGameOver) {
            e.preventDefault()
            const message =
                'You have a game in progress. Are you sure you want to leave?'
            e.returnValue = message
            return message
        }
    }

    window.addEventListener('beforeunload', beforeUnloadHandler)

    return () => {
        window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
}
