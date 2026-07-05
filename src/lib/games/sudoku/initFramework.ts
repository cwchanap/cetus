// Sudoku game initialization using BaseGame framework
import { SudokuGame, DEFAULT_SUDOKU_CONFIG } from './SudokuGame'
import { SudokuRenderer, createSudokuRendererConfig } from './SudokuRenderer'
import type { SudokuConfig, SudokuStats } from './frameworkTypes'
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

export interface SudokuInitResult {
    game: SudokuGame
    renderer: SudokuRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<SudokuGame['getState']>
    endGame: () => Promise<void>
}

export async function initSudokuGameFramework(
    customConfig?: Partial<SudokuConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<SudokuInitResult | undefined> {
    const container = document.getElementById('sudoku-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('sudoku-container'),
            'Sudoku'
        )
        return undefined
    }

    const config: SudokuConfig = { ...DEFAULT_SUDOKU_CONFIG, ...customConfig }
    const renderer = new SudokuRenderer(createSudokuRendererConfig())

    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'Sudoku'
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
            const el = document.getElementById('score')
            if (el) {
                el.textContent = score.toString()
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: () => {
            const elapsed = game.getElapsedTime()
            const el = document.getElementById('game-time')
            if (el) {
                const minutes = Math.floor(elapsed / 60)
                    .toString()
                    .padStart(2, '0')
                const seconds = (elapsed % 60).toString().padStart(2, '0')
                el.textContent = `${minutes}:${seconds}`
            }
            customCallbacks?.onTimeUpdate?.(elapsed)
        },
        onStart: () => {
            swapStartEndButtons(true)
            hideOverlay()
            setDifficultyButtonsDisabled(true)
            renderer.render(game.getState())
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            showGameOver(finalScore, stats as SudokuStats, game.getState())
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new SudokuGame(config, enhancedCallbacks)

    // Wire cell clicks into game logic
    renderer.setCellClickCallback((row, col) => {
        game.selectCell(row, col)
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
    const cleanupKeyboardControls = setupKeyboardControls(game)
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Initial render + difficulty display
    renderer.render(game.getState())
    updateDifficultyDisplay(game.getState().difficulty)
    setDifficultySelection(game.getState().difficulty)

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupButtonHandlers()
            cleanupKeyboardControls()
            cleanupUnloadWarning()
            game.off('end', onGameEnd)
            renderer.destroy()
            game.destroy()
        },
        restart: () => {
            game.newGame()
            renderer.render(game.getState())
            resetButtonVisibility()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

// --- UI helper functions ---

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
    setDifficultyButtonsDisabled(false)
}

function setDifficultyButtonsDisabled(disabled: boolean): void {
    const ids = ['easy-btn', 'medium-btn', 'hard-btn']
    ids.forEach(id => {
        const btn = document.getElementById(id) as HTMLButtonElement | null
        if (btn) {
            btn.disabled = disabled
        }
    })
}

function updateDifficultyDisplay(difficulty: 'easy' | 'medium' | 'hard'): void {
    const el = document.getElementById('difficulty')
    if (el) {
        el.textContent =
            difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
    }
}

const DIFFICULTY_VARIANT_CLASSES = {
    primary: [
        'bg-gradient-to-r',
        'from-cyan-500',
        'to-purple-600',
        'text-white',
        'shadow-lg',
        'shadow-purple-500/25',
        'hover:from-cyan-400',
        'hover:to-purple-500',
        'hover-glow-cyan',
    ],
    outline: [
        'border-2',
        'border-cyan-400',
        'text-white',
        'bg-transparent',
        'hover:bg-cyan-400',
        'hover:text-slate-900',
    ],
}

function setDifficultySelection(difficulty: 'easy' | 'medium' | 'hard'): void {
    const buttons = document.querySelectorAll(
        '#easy-btn, #medium-btn, #hard-btn'
    )
    buttons.forEach(btn => {
        btn.classList.remove(
            ...DIFFICULTY_VARIANT_CLASSES.primary,
            ...DIFFICULTY_VARIANT_CLASSES.outline
        )
        if (btn.id === `${difficulty}-btn`) {
            btn.classList.add(...DIFFICULTY_VARIANT_CLASSES.primary)
        } else {
            btn.classList.add(...DIFFICULTY_VARIANT_CLASSES.outline)
        }
    })
    updateDifficultyDisplay(difficulty)
}

function showGameOver(
    finalScore: number,
    stats: SudokuStats,
    state: ReturnType<SudokuGame['getState']>
): void {
    swapStartEndButtons(false)
    setDifficultyButtonsDisabled(false)

    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    const elapsed = stats.timeElapsed
    const minutes = Math.floor(elapsed / 60)
        .toString()
        .padStart(2, '0')
    const seconds = (elapsed % 60).toString().padStart(2, '0')
    setText('final-time', `${minutes}:${seconds}`)
    setText('final-score', finalScore.toString())

    const difficulty =
        state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1)
    setText('final-difficulty', difficulty)

    const titleElement = document.getElementById('game-over-title')
    if (titleElement) {
        if (stats.isComplete) {
            titleElement.textContent = 'PUZZLE SOLVED!'
            titleElement.className =
                'text-4xl font-orbitron font-bold text-green-400 mb-6'
        } else {
            titleElement.textContent = 'GAME OVER'
            titleElement.className =
                'text-4xl font-orbitron font-bold text-red-400 mb-6'
        }
    }

    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function togglePause(game: SudokuGame): void {
    const state = game.getState()
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

// --- Setup functions ---

function setupButtonHandlers(
    game: SudokuGame,
    renderer: SudokuRenderer
): () => void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const pauseBtn = document.getElementById('pause-btn')
    const resetBtn = document.getElementById('reset-btn')
    const restartBtn = document.getElementById('restart-btn')
    const easyBtn = document.getElementById('easy-btn')
    const mediumBtn = document.getElementById('medium-btn')
    const hardBtn = document.getElementById('hard-btn')

    const startHandler = () => {
        // After a game over (or solved puzzle), BaseGame.start() only flips
        // flags, so generate a fresh puzzle before starting a new run.
        if (game.getState().isGameOver) {
            game.newGame()
        }
        game.start()
    }

    const endHandler = () => {
        void game.end()
    }

    const pauseHandler = () => togglePause(game)

    const resetHandler = () => {
        game.newGame()
        renderer.render(game.getState())
        resetButtonVisibility()
        updateDifficultyDisplay(game.getState().difficulty)
        setDifficultySelection(game.getState().difficulty)
    }

    const restartHandler = () => {
        game.newGame()
        renderer.render(game.getState())
        resetButtonVisibility()
        updateDifficultyDisplay(game.getState().difficulty)
        setDifficultySelection(game.getState().difficulty)
    }

    const difficultyHandler =
        (difficulty: 'easy' | 'medium' | 'hard') => () => {
            game.newGame(difficulty)
            renderer.render(game.getState())
            resetButtonVisibility()
            setDifficultySelection(difficulty)
        }

    startBtn?.addEventListener('click', startHandler)
    endBtn?.addEventListener('click', endHandler)
    pauseBtn?.addEventListener('click', pauseHandler)
    resetBtn?.addEventListener('click', resetHandler)
    restartBtn?.addEventListener('click', restartHandler)
    easyBtn?.addEventListener('click', difficultyHandler('easy'))
    mediumBtn?.addEventListener('click', difficultyHandler('medium'))
    hardBtn?.addEventListener('click', difficultyHandler('hard'))

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        endBtn?.removeEventListener('click', endHandler)
        pauseBtn?.removeEventListener('click', pauseHandler)
        resetBtn?.removeEventListener('click', resetHandler)
        restartBtn?.removeEventListener('click', restartHandler)
        easyBtn?.removeEventListener('click', difficultyHandler('easy'))
        mediumBtn?.removeEventListener('click', difficultyHandler('medium'))
        hardBtn?.removeEventListener('click', difficultyHandler('hard'))
    }
}

function setupKeyboardControls(game: SudokuGame): () => void {
    const keydownHandler = (e: KeyboardEvent) => {
        const state = game.getState()
        if (!state.gameStarted || state.isGameOver) {
            return
        }

        // Handle pause regardless of other state
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault()
            togglePause(game)
            return
        }

        if (state.isPaused) {
            return
        }

        // Number keys (1-9)
        if (e.key >= '1' && e.key <= '9') {
            game.placeNumber(parseInt(e.key, 10))
            return
        }

        // Delete/Backspace to clear
        if (e.key === 'Delete' || e.key === 'Backspace') {
            game.clearSelectedCell()
            return
        }

        // Arrow key navigation
        if (state.grid.selectedCell) {
            const { row, col } = state.grid.selectedCell
            let newRow = row
            let newCol = col

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault()
                    newRow = Math.max(0, row - 1)
                    break
                case 'ArrowDown':
                    e.preventDefault()
                    newRow = Math.min(8, row + 1)
                    break
                case 'ArrowLeft':
                    e.preventDefault()
                    newCol = Math.max(0, col - 1)
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    newCol = Math.min(8, col + 1)
                    break
                default:
                    return
            }

            if (newRow !== row || newCol !== col) {
                game.selectCell(newRow, newCol)
            }
        }
    }

    document.addEventListener('keydown', keydownHandler)

    return () => {
        document.removeEventListener('keydown', keydownHandler)
    }
}

function setupUnloadWarning(game: SudokuGame): () => void {
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
