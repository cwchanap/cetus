// Path Navigator game initialization using BaseGame framework
import {
    PathNavigatorGame,
    DEFAULT_PATH_NAVIGATOR_CONFIG,
} from './PathNavigatorGame'
import {
    PathNavigatorRenderer,
    createPathNavigatorRendererConfig,
} from './PathNavigatorRenderer'
import { clamp } from '@/lib/games/shared/utils'
import type { PathNavigatorConfig, PathNavigatorStats } from './types'
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

export interface PathNavigatorInitResult {
    game: PathNavigatorGame
    renderer: PathNavigatorRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<PathNavigatorGame['getState']>
    endGame: () => Promise<void>
}

export async function initPathNavigatorGameFramework(
    customConfig?: Partial<PathNavigatorConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<PathNavigatorInitResult | undefined> {
    const container = document.getElementById('path-navigator-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('path-navigator-container'),
            'PathNavigatorGame'
        )
        return undefined
    }

    const config: PathNavigatorConfig = {
        ...DEFAULT_PATH_NAVIGATOR_CONFIG,
        ...customConfig,
    }
    const rendererConfig = createPathNavigatorRendererConfig(
        config,
        '#path-navigator-container'
    )

    // Initialize renderer with error handling
    const renderer = new PathNavigatorRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'PathNavigatorGame'
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
    }

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onScoreUpdate: score => {
            const scoreEl = document.getElementById('score')
            if (scoreEl) {
                scoreEl.textContent = String(score)
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: timeRemaining => {
            const timeEl = document.getElementById('time-remaining')
            if (timeEl) {
                timeEl.textContent = String(timeRemaining)
            }
            customCallbacks?.onTimeUpdate?.(timeRemaining)
        },
        onStart: () => {
            swapStartEndButtons(true)
            hideOverlay()
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const navStats = stats as PathNavigatorStats
            showGameOver(finalScore, navStats)
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new PathNavigatorGame(config, enhancedCallbacks)

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

    // Set up keyboard controls (arrow-key navigation)
    const cleanupKeyboardControls = setupKeyboardControls(game, config)

    // Set up button handlers
    const cleanupButtonHandlers = setupButtonHandlers(game)

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Framework-level render loop (single rAF path). The cursor uses a
    // time-based pulse, so we render every frame while the game is active.
    let renderLoopId: number | null = null
    const startRenderLoop = () => {
        if (renderLoopId !== null) {
            return
        }
        const renderLoop = () => {
            const state = game.getState()
            renderer.render(state)
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
            cleanupKeyboardControls()
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

function updateLevelDisplay(level: number): void {
    const levelEl = document.getElementById('level')
    if (levelEl) {
        levelEl.textContent = level.toString()
    }
}

function hideOverlay(): void {
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.add('hidden')
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

function showGameOver(finalScore: number, stats: PathNavigatorStats): void {
    swapStartEndButtons(false)

    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    setText('final-score', finalScore.toString())
    setText('levels-completed', stats.levelsCompleted.toString())
    setText('total-time', Math.round(stats.totalTime).toString())

    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function resetButtonVisibility(): void {
    swapStartEndButtons(false)
    hideOverlay()
}

function setupButtonHandlers(game: PathNavigatorGame): () => void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const playAgainBtn = document.getElementById('play-again-btn')

    const startHandler = () => {
        updateLevelDisplay(1)
        game.start()
    }

    const endHandler = () => {
        void game.end()
    }

    const playAgainHandler = () => {
        game.reset()
        updateLevelDisplay(1)
        const scoreEl = document.getElementById('score')
        if (scoreEl) {
            scoreEl.textContent = '0'
        }
        const timeEl = document.getElementById('time-remaining')
        if (timeEl) {
            timeEl.textContent = String(game.getConfig().duration)
        }
        resetButtonVisibility()
    }

    startBtn?.addEventListener('click', startHandler)
    endBtn?.addEventListener('click', endHandler)
    playAgainBtn?.addEventListener('click', playAgainHandler)

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        endBtn?.removeEventListener('click', endHandler)
        playAgainBtn?.removeEventListener('click', playAgainHandler)
    }
}

function setupKeyboardControls(
    game: PathNavigatorGame,
    config: PathNavigatorConfig
): () => void {
    const keydownHandler = (event: KeyboardEvent) => {
        const state = game.getState()
        if (!state.isActive || state.isPaused || state.isGameOver) {
            return
        }

        const currentPos = { x: state.cursor.x, y: state.cursor.y }
        const step = 25

        let newX = currentPos.x
        let newY = currentPos.y

        switch (event.key) {
            case 'ArrowUp':
                newY = clamp(currentPos.y - step, 0, config.gameHeight)
                break
            case 'ArrowDown':
                newY = clamp(currentPos.y + step, 0, config.gameHeight)
                break
            case 'ArrowLeft':
                newX = clamp(currentPos.x - step, 0, config.gameWidth)
                break
            case 'ArrowRight':
                newX = clamp(currentPos.x + step, 0, config.gameWidth)
                break
            default:
                return
        }

        // Prevent default arrow key behavior (page scroll)
        event.preventDefault()

        game.updatePlayerPosition(newX, newY)
        // Re-read level after the update: reaching the goal can increment
        // currentLevel inside updatePlayerPosition -> completeLevel.
        updateLevelDisplay(game.getState().currentLevel)
    }

    document.addEventListener('keydown', keydownHandler)

    return () => {
        document.removeEventListener('keydown', keydownHandler)
    }
}

function setupUnloadWarning(game: PathNavigatorGame): () => void {
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
