// Snake game initialization using BaseGame framework
import { SnakeGame, DEFAULT_SNAKE_CONFIG } from './SnakeGame'
import { SnakeRenderer, createSnakeRendererConfig } from './SnakeRenderer'
import type { SnakeConfig, SnakeStats, Direction } from './types'
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

export interface SnakeInitResult {
    game: SnakeGame
    renderer: SnakeRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<SnakeGame['getState']>
    endGame: () => Promise<void>
}

export async function initSnakeGameFramework(
    customConfig?: Partial<SnakeConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<SnakeInitResult | undefined> {
    const container = document.getElementById('snake-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('snake-container'),
            'SnakeGame'
        )
        return undefined
    }

    const config: SnakeConfig = { ...DEFAULT_SNAKE_CONFIG, ...customConfig }
    const rendererConfig = createSnakeRendererConfig(config, '#snake-container')

    // Initialize renderer
    const renderer = new SnakeRenderer(rendererConfig)
    await renderer.initialize()

    // Style the canvas
    const app = renderer.getApp()
    if (app) {
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        app.canvas.style.borderRadius = '8px'
    }

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            renderer.render(state)
            updateUI(state as ReturnType<SnakeGame['getState']>)
            customCallbacks?.onStateChange?.(state)
        },
        onScoreUpdate: score => {
            const scoreEl = document.getElementById('score')
            if (scoreEl) {
                scoreEl.textContent = String(score)
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: time => {
            const timeEl = document.getElementById('time-remaining')
            if (timeEl) {
                timeEl.textContent = `${time}s`
            }
            customCallbacks?.onTimeUpdate?.(time)
        },
        onStart: () => {
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement | null
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement | null
            if (startBtn) {
                startBtn.style.display = 'none'
            }
            if (endBtn) {
                endBtn.style.display = 'inline-flex'
            }
            const overlay = document.getElementById('game-over-overlay')
            if (overlay) {
                overlay.classList.add('hidden')
            }
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const snakeStats = stats as SnakeStats
            showGameOver(finalScore, snakeStats)
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new SnakeGame(config, enhancedCallbacks)

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

    // Set up button handlers
    const cleanupButtonHandlers = setupButtonHandlers(game)

    // Set up keyboard controls
    const cleanupKeyboardControls = setupKeyboardControls(game)

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Initial render
    renderer.render(game.getState())

    // Continuous render loop for smooth visuals
    let renderFrameId: number | null = null
    let renderRunning = true
    function renderLoop() {
        if (!renderRunning) {
            return
        }
        const state = game.getState()
        renderer.render(state)
        // Reset redraw flag after rendering using the proper encapsulation method
        game.markRendered()
        renderFrameId = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    return {
        game,
        renderer,
        cleanup: () => {
            renderRunning = false
            if (renderFrameId !== null) {
                cancelAnimationFrame(renderFrameId)
                renderFrameId = null
            }
            cleanupButtonHandlers()
            cleanupKeyboardControls()
            cleanupUnloadWarning()
            game.off('end', onGameEnd)
            renderer.cleanup()
            game.destroy()
        },
        restart: () => game.reset(),
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

function updateUI(state: ReturnType<SnakeGame['getState']>): void {
    const lengthElement = document.getElementById('snake-length')
    const lengthStatsElement = document.getElementById('snake-length-stats')
    const foodsElement = document.getElementById('foods-eaten')

    if (lengthElement) {
        lengthElement.textContent = state.snake.length.toString()
    }
    if (lengthStatsElement) {
        lengthStatsElement.textContent = state.snake.length.toString()
    }
    if (foodsElement) {
        foodsElement.textContent = state.foodsEaten.toString()
    }
}

function showGameOver(finalScore: number, stats: SnakeStats): void {
    const startBtn = document.getElementById(
        'start-btn'
    ) as HTMLButtonElement | null
    const endBtn = document.getElementById(
        'end-btn'
    ) as HTMLButtonElement | null

    if (startBtn) {
        startBtn.style.display = 'inline-flex'
        startBtn.textContent = 'Start'
    }
    if (endBtn) {
        endBtn.style.display = 'none'
    }

    // Update overlay stats
    const finalScoreEl = document.getElementById('final-score')
    if (finalScoreEl) {
        finalScoreEl.textContent = finalScore.toString()
    }

    const finalLengthEl = document.getElementById('final-length')
    if (finalLengthEl) {
        finalLengthEl.textContent = stats.maxLength?.toString() || '3'
    }

    const finalFoodsEl = document.getElementById('final-foods')
    if (finalFoodsEl) {
        finalFoodsEl.textContent = stats.foodsEaten?.toString() || '0'
    }

    const finalTimeEl = document.getElementById('final-time')
    if (finalTimeEl) {
        const seconds = Math.floor(stats.timeElapsed || 0)
        finalTimeEl.textContent = `${seconds}s`
    }

    // Show overlay
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function setupButtonHandlers(game: SnakeGame): () => void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const pauseBtn = document.getElementById('pause-btn')
    const resetBtn = document.getElementById('reset-btn')
    const restartBtn = document.getElementById('restart-btn')
    const playAgainBtn = document.getElementById('play-again-btn')

    const startHandler = () => game.start()
    const endHandler = () => game.end()

    const pauseHandler = () => {
        const state = game.getState()
        if (state.isPaused) {
            game.resume()
            if (pauseBtn) {
                pauseBtn.textContent = 'Pause'
            }
        } else {
            game.pause()
            if (pauseBtn) {
                pauseBtn.textContent = 'Resume'
            }
        }
    }

    const resetHandler = () => {
        game.reset()
        const startBtn = document.getElementById(
            'start-btn'
        ) as HTMLButtonElement | null
        const endBtn = document.getElementById(
            'end-btn'
        ) as HTMLButtonElement | null
        if (startBtn) {
            startBtn.style.display = 'inline-flex'
        }
        if (endBtn) {
            endBtn.style.display = 'none'
        }
        const overlay = document.getElementById('game-over-overlay')
        if (overlay) {
            overlay.classList.add('hidden')
        }
    }

    const restartHandler = () => {
        game.reset()
        const overlay = document.getElementById('game-over-overlay')
        if (overlay) {
            overlay.classList.add('hidden')
        }
    }

    const playAgainHandler = () => {
        game.reset()
        const overlay = document.getElementById('game-over-overlay')
        if (overlay) {
            overlay.classList.add('hidden')
        }
    }

    startBtn?.addEventListener('click', startHandler)
    endBtn?.addEventListener('click', endHandler)
    pauseBtn?.addEventListener('click', pauseHandler)
    resetBtn?.addEventListener('click', resetHandler)
    restartBtn?.addEventListener('click', restartHandler)
    playAgainBtn?.addEventListener('click', playAgainHandler)

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        endBtn?.removeEventListener('click', endHandler)
        pauseBtn?.removeEventListener('click', pauseHandler)
        resetBtn?.removeEventListener('click', resetHandler)
        restartBtn?.removeEventListener('click', restartHandler)
        playAgainBtn?.removeEventListener('click', playAgainHandler)
    }
}

function setupKeyboardControls(game: SnakeGame): () => void {
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
        const state = game.getState()
        if (!state.gameStarted || state.isGameOver) {
            return
        }

        const direction = directionMap[e.key]
        if (direction) {
            e.preventDefault()
            game.changeDirection(direction)
            return
        }

        // Pause toggle
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault()
            const pauseBtn = document.getElementById('pause-btn')
            if (state.isPaused) {
                game.resume()
                if (pauseBtn) {
                    pauseBtn.textContent = 'Pause'
                }
            } else {
                game.pause()
                if (pauseBtn) {
                    pauseBtn.textContent = 'Resume'
                }
            }
        }
    }

    document.addEventListener('keydown', keydownHandler)

    return () => {
        document.removeEventListener('keydown', keydownHandler)
    }
}

function setupUnloadWarning(game: SnakeGame): () => void {
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        const state = game.getState()
        if (state.gameStarted && !state.isGameOver && !state.isPaused) {
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
