// Memory Matrix game initialization using BaseGame framework
import {
    MemoryMatrixGame,
    DEFAULT_MEMORY_MATRIX_CONFIG,
} from './MemoryMatrixGame'
import { MemoryMatrixRenderer } from './MemoryMatrixRenderer'
import type { MemoryMatrixConfig, MemoryMatrixStats } from './frameworkTypes'
import type { BaseGameCallbacks, BaseGameStats } from '@/lib/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'
import { formatTime } from './utils'

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

export interface MemoryMatrixInitResult {
    game: MemoryMatrixGame
    renderer: MemoryMatrixRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<MemoryMatrixGame['getState']>
    endGame: () => Promise<void>
}

export async function initMemoryMatrixGameFramework(
    customConfig?: Partial<MemoryMatrixConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<MemoryMatrixInitResult | undefined> {
    const container = document.getElementById('memory-matrix-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('memory-matrix-container'),
            'MemoryMatrix'
        )
        return undefined
    }

    const config: MemoryMatrixConfig = {
        ...DEFAULT_MEMORY_MATRIX_CONFIG,
        ...customConfig,
    }

    const renderer = new MemoryMatrixRenderer({
        type: 'dom',
        container: '#memory-board',
        cleanOnRender: false,
    })

    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'MemoryMatrix'
        )
        renderer.destroy()
        return undefined
    }

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            renderer.render(state)
            customCallbacks?.onStateChange?.(state)
        },
        onScoreUpdate: score => {
            const el = document.getElementById('game-score')
            if (el) {
                el.textContent = score.toString()
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: time => {
            const el = document.getElementById('game-time')
            if (el) {
                el.textContent = formatTime(time)
                if (time <= 10) {
                    el.className = 'text-red-400 font-bold'
                } else if (time <= 30) {
                    el.className = 'text-yellow-400'
                } else {
                    el.className = 'text-white'
                }
            }
            customCallbacks?.onTimeUpdate?.(time)
        },
        onStart: () => {
            swapStartEndButtons(true)
            hideOverlay()
            renderer.render(game.getState())
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const state = game.getState()
            showGameOver(
                finalScore,
                stats as MemoryMatrixStats,
                state.timeRemaining,
                state.totalPairs
            )
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new MemoryMatrixGame(config, enhancedCallbacks)

    // Wire card clicks into game logic
    renderer.setCardClickCallback((row, col) => {
        game.flipCard({ row, col })
    })

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

    // Set up controls
    const cleanupButtonHandlers = setupButtonHandlers(game, renderer)
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Initial render
    renderer.render(game.getState())

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupButtonHandlers()
            cleanupUnloadWarning()
            game.off('end', onGameEnd)
            renderer.destroy()
            game.destroy()
        },
        restart: () => {
            game.reset()
            renderer.render(game.getState())
            resetButtonVisibility()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
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
            startBtn.textContent = 'Start Game'
            startBtn.disabled = false
        }
        if (endBtn) {
            endBtn.style.display = 'none'
        }
    }
}

function hideOverlay(): void {
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.add('hidden')
    }
}

function resetButtonVisibility(): void {
    swapStartEndButtons(false)
    hideOverlay()
}

function showGameOver(
    finalScore: number,
    stats: MemoryMatrixStats,
    timeRemaining: number,
    totalPairs: number
): void {
    swapStartEndButtons(false)

    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    setText('final-score', finalScore.toString())
    setText('final-pairs', `${stats.matchesFound}/${totalPairs}`)
    setText('final-accuracy', `${Math.round(stats.accuracy)}%`)
    setText('final-time', `${timeRemaining}s`)
    setText('final-attempts', stats.totalAttempts.toString())

    const overlayTitle = document.getElementById('game-over-title')
    if (overlayTitle) {
        if (stats.gameWon) {
            overlayTitle.textContent = 'VICTORY!'
            overlayTitle.className =
                'text-4xl font-orbitron font-bold text-green-400 mb-6'
        } else {
            overlayTitle.textContent = "TIME'S UP!"
            overlayTitle.className =
                'text-4xl font-orbitron font-bold text-cyan-400 mb-6'
        }
    }

    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function setupButtonHandlers(
    game: MemoryMatrixGame,
    renderer: MemoryMatrixRenderer
): () => void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const resetBtn = document.getElementById('reset-btn')
    const playAgainBtn = document.getElementById('play-again-btn')

    const startHandler = () => game.start()

    const endHandler = () => {
        void game.end()
    }

    const resetHandler = () => {
        game.reset()
        renderer.render(game.getState())
        resetButtonVisibility()
    }

    const playAgainHandler = () => {
        game.reset()
        renderer.render(game.getState())
        resetButtonVisibility()
    }

    startBtn?.addEventListener('click', startHandler)
    endBtn?.addEventListener('click', endHandler)
    resetBtn?.addEventListener('click', resetHandler)
    playAgainBtn?.addEventListener('click', playAgainHandler)

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        endBtn?.removeEventListener('click', endHandler)
        resetBtn?.removeEventListener('click', resetHandler)
        playAgainBtn?.removeEventListener('click', playAgainHandler)
    }
}

function setupUnloadWarning(game: MemoryMatrixGame): () => void {
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
