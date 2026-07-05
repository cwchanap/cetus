// Reflex game initialization using BaseGame framework
import { ReflexGame, DEFAULT_REFLEX_CONFIG } from './ReflexGame'
import { ReflexRenderer, createReflexRendererConfig } from './ReflexRenderer'
import type { ReflexConfig, ReflexStats } from './frameworkTypes'
import type {
    BaseGameCallbacks,
    BaseGameStats,
    ChallengeUpdates,
} from '@/lib/games/core/types'
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

export interface ReflexInitResult {
    game: ReflexGame
    renderer: ReflexRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<ReflexGame['getState']>
    endGame: () => Promise<void>
}

export async function initReflexGameFramework(
    customConfig?: Partial<ReflexConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<ReflexInitResult | undefined> {
    const container = document.getElementById('game-canvas-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('game-canvas-container'),
            'ReflexGame'
        )
        return undefined
    }

    const config: ReflexConfig = {
        ...DEFAULT_REFLEX_CONFIG,
        ...customConfig,
    }
    const rendererConfig = createReflexRendererConfig(
        config,
        '#game-canvas-container'
    )

    // Initialize renderer with error handling
    const renderer = new ReflexRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'ReflexGame'
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
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.3)'
        app.canvas.style.borderRadius = '12px'
        app.canvas.style.boxShadow = '0 0 30px rgba(6, 182, 212, 0.3)'
    }

    const logicalSize = renderer.getLogicalSize()

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            const reflexState = state as ReturnType<ReflexGame['getState']>
            updateLiveStats(reflexState)
            customCallbacks?.onStateChange?.(state)
        },
        onScoreUpdate: score => {
            const scoreEl = document.getElementById('score')
            if (scoreEl) {
                scoreEl.textContent = score.toString()
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: timeRemaining => {
            const timeEl = document.getElementById('time-remaining')
            if (timeEl) {
                timeEl.textContent = timeRemaining.toString()
            }
            customCallbacks?.onTimeUpdate?.(timeRemaining)
        },
        onStart: () => {
            swapStartStopButtons(true)
            hideOverlay()
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const reflexStats = stats as ReflexStats
            showGameOver(finalScore, reflexStats)
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new ReflexGame(config, enhancedCallbacks)

    // Handle achievement notifications
    const onGameEnd = (event: unknown) => {
        const data = (event as { data: unknown }).data as {
            newAchievements?: AchievementNotification[]
            challengeUpdates?: ChallengeUpdates
        }
        if (data?.newAchievements && data.newAchievements.length > 0) {
            if (
                typeof window !== 'undefined' &&
                typeof window.showAchievementAward === 'function'
            ) {
                window.showAchievementAward(data.newAchievements)
            }
        }
        if (data?.challengeUpdates?.completedChallenges?.length) {
            if (
                typeof window !== 'undefined' &&
                typeof window.showChallengeComplete === 'function'
            ) {
                window.showChallengeComplete(data.challengeUpdates)
            }
        }
    }
    game.on('end', onGameEnd)

    // Set up canvas click handler
    const cleanupCanvasControls = setupCanvasControls(
        game,
        renderer,
        logicalSize
    )

    // Set up button handlers
    const cleanupButtonHandlers = setupButtonHandlers(game)

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Set up framework-level render loop (single rAF path)
    let renderLoopId: number | null = null
    const startRenderLoop = () => {
        if (renderLoopId !== null) {
            return
        }
        const renderLoop = () => {
            const state = game.getState()
            // Always render while active so per-frame animations (e.g. the
            // pulsing effect) stay smooth; skip when paused or over.
            if (state.isActive && !state.isPaused) {
                renderer.render(state)
                game.markRendered()
            }
            renderLoopId = requestAnimationFrame(renderLoop)
        }
        renderLoopId = requestAnimationFrame(renderLoop)
    }
    startRenderLoop()

    const cleanupRenderLoop = () => {
        if (renderLoopId !== null) {
            cancelAnimationFrame(renderLoopId)
            renderLoopId = null
        }
    }

    // Initial render
    renderer.render(game.getState())

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupRenderLoop()
            cleanupCanvasControls()
            cleanupButtonHandlers()
            cleanupUnloadWarning()
            game.off('end', onGameEnd)
            renderer.cleanup()
            game.destroy()
        },
        restart: () => {
            game.reset()
            resetButtonVisibility()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

function updateLiveStats(state: ReturnType<ReflexGame['getState']>): void {
    const coinsEl = document.getElementById('coins-collected')
    if (coinsEl) {
        coinsEl.textContent = state.coinsCollected.toString()
    }

    const bombsEl = document.getElementById('bombs-hit')
    if (bombsEl) {
        bombsEl.textContent = state.bombsHit.toString()
    }

    const accuracyEl = document.getElementById('accuracy')
    if (accuracyEl) {
        const accuracy =
            state.totalClicks > 0
                ? Math.round((state.correctClicks / state.totalClicks) * 100)
                : 0
        accuracyEl.textContent = `${accuracy}%`
    }
}

function hideOverlay(): void {
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.add('hidden')
    }
}

function swapStartStopButtons(gameStarted: boolean): void {
    const startBtn = document.getElementById(
        'start-btn'
    ) as HTMLButtonElement | null
    const stopBtn = document.getElementById(
        'stop-btn'
    ) as HTMLButtonElement | null
    if (gameStarted) {
        if (startBtn) {
            startBtn.style.display = 'none'
        }
        if (stopBtn) {
            stopBtn.style.display = 'inline-flex'
        }
    } else {
        if (startBtn) {
            startBtn.style.display = 'inline-flex'
            startBtn.style.opacity = '1'
            startBtn.style.pointerEvents = 'auto'
        }
        if (stopBtn) {
            stopBtn.style.display = 'none'
        }
    }
}

export function showGameOver(finalScore: number, stats: ReflexStats): void {
    swapStartStopButtons(false)

    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    setText('final-score', finalScore.toString())
    setText('final-coins', stats.coinsCollected.toString())
    setText('final-bombs', stats.bombsHit.toString())
    setText('final-accuracy', `${Math.round(stats.accuracy)}%`)

    const avgReactionEl = document.getElementById('avg-reaction')
    if (avgReactionEl) {
        avgReactionEl.textContent = `${Math.round(stats.averageReactionTime)}ms`
    }

    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function resetButtonVisibility(): void {
    swapStartStopButtons(false)
    hideOverlay()
}

function setupButtonHandlers(game: ReflexGame): () => void {
    const startBtn = document.getElementById('start-btn')
    const stopBtn = document.getElementById('stop-btn')
    const playAgainBtn = document.getElementById('play-again-btn')

    const startHandler = () => {
        // After a game over, BaseGame.start() only flips flags, so reset
        // explicitly to clear accumulated score/stats before a new run.
        if (game.getState().isGameOver) {
            game.reset()
        }
        game.start()
    }
    const stopHandler = () => game.end()
    const playAgainHandler = () => {
        hideOverlay()
        resetButtonVisibility()
    }

    startBtn?.addEventListener('click', startHandler)
    stopBtn?.addEventListener('click', stopHandler)
    playAgainBtn?.addEventListener('click', playAgainHandler)

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        stopBtn?.removeEventListener('click', stopHandler)
        playAgainBtn?.removeEventListener('click', playAgainHandler)
    }
}

function setupCanvasControls(
    game: ReflexGame,
    renderer: ReflexRenderer,
    logicalSize: number
): () => void {
    const app = renderer.getApp()
    const canvas = app?.canvas ?? null
    if (!canvas) {
        return () => {}
    }

    const clickHandler = (event: MouseEvent) => {
        const state = game.getState()
        if (!state.isActive || state.isPaused) {
            return
        }

        const rect = canvas.getBoundingClientRect()
        const x = (event.clientX - rect.left) * (logicalSize / rect.width)
        const y = (event.clientY - rect.top) * (logicalSize / rect.height)

        const cellPosition = renderer.getCellFromPosition(x, y)
        if (cellPosition) {
            const result = game.handleCellClick(
                cellPosition.row,
                cellPosition.col
            )

            if (result.hit) {
                renderer.showClickEffect(
                    cellPosition.row,
                    cellPosition.col,
                    result.points > 0
                )
            }
        }
    }

    canvas.addEventListener('click', clickHandler)

    return () => {
        canvas.removeEventListener('click', clickHandler)
    }
}

function setupUnloadWarning(game: ReflexGame): () => void {
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        const state = game.getState()
        if (state.isActive && !state.isGameOver && !state.isPaused) {
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
