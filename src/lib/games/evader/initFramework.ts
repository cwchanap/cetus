// Evader game initialization using BaseGame framework
import { EvaderGame, DEFAULT_EVADER_CONFIG } from './EvaderGame'
import { EvaderRenderer, createEvaderRendererConfig } from './EvaderRenderer'
import type { EvaderConfig, EvaderStats } from './frameworkTypes'
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

const MOVEMENT_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'w',
    'W',
    'a',
    'A',
    's',
    'S',
    'd',
    'D',
])

export interface EvaderInitResult {
    game: EvaderGame
    renderer: EvaderRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<EvaderGame['getState']>
    endGame: () => Promise<void>
}

export async function initEvaderGameFramework(
    customConfig?: Partial<EvaderConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<EvaderInitResult | undefined> {
    const container = document.getElementById('game-canvas-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('game-canvas-container'),
            'EvaderGame'
        )
        return undefined
    }

    const config: EvaderConfig = {
        ...DEFAULT_EVADER_CONFIG,
        ...customConfig,
    }
    const rendererConfig = createEvaderRendererConfig(
        config,
        '#game-canvas-container'
    )

    // Initialize renderer with error handling
    const renderer = new EvaderRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'EvaderGame'
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

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            const evaderState = state as ReturnType<EvaderGame['getState']>
            updateLiveStats(evaderState)
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
            hideStatusMessage()
            hideOverlay()
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const evaderStats = stats as EvaderStats
            showGameOver(finalScore, evaderStats)
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new EvaderGame(config, enhancedCallbacks)

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

    // Set up keyboard controls
    const cleanupKeyboard = setupKeyboardControls(game)

    // Set up button handlers
    const cleanupButtonHandlers = setupButtonHandlers(game)

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Set up framework-level render + update loop (single rAF path)
    let renderLoopId: number | null = null
    let lastUpdateTime = Date.now()
    const startRenderLoop = () => {
        if (renderLoopId !== null) {
            return
        }
        const renderLoop = () => {
            const now = Date.now()
            // Clamp deltaTime to avoid physics spikes after tab throttling
            // or long pauses (e.g. background tabs rAF at ~1Hz).
            const deltaTime = Math.min((now - lastUpdateTime) / 1000, 0.1)
            lastUpdateTime = now

            const state = game.getState()
            // Drive per-frame physics while active, then render.
            if (state.isActive && !state.isPaused) {
                game.update(deltaTime)
            }
            renderer.render(game.getState())

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
            cleanupKeyboard()
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

function updateLiveStats(state: ReturnType<EvaderGame['getState']>): void {
    const coinsEl = document.getElementById('coins-collected')
    if (coinsEl) {
        coinsEl.textContent = state.coinsCollected.toString()
    }

    const bombsEl = document.getElementById('bombs-hit')
    if (bombsEl) {
        bombsEl.textContent = state.bombsHit.toString()
    }
}

function hideOverlay(): void {
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.add('hidden')
    }
}

function hideStatusMessage(): void {
    const status = document.getElementById('game-status')
    if (status) {
        status.style.display = 'none'
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

export function showGameOver(finalScore: number, stats: EvaderStats): void {
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

    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function resetButtonVisibility(): void {
    swapStartStopButtons(false)
    hideOverlay()
}

function setupButtonHandlers(game: EvaderGame): () => void {
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

function setupKeyboardControls(game: EvaderGame): () => void {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey) {
            return
        }
        if (MOVEMENT_KEYS.has(event.key) && game.getState().isActive) {
            event.preventDefault()
            game.pressKey(event.key)
        }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
        if (MOVEMENT_KEYS.has(event.key)) {
            event.preventDefault()
            game.releaseKey(event.key)
        }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('keyup', handleKeyUp)
    }
}

function setupUnloadWarning(game: EvaderGame): () => void {
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
