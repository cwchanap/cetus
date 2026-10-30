// Sudoku game initialization using BaseGame framework
import {
    SudokuGame,
    DEFAULT_SUDOKU_CONFIG,
} from '@cetus/games/sudoku/SudokuGame'
import { SudokuRenderer, createSudokuRendererConfig } from './SudokuRenderer'
import type {
    SudokuConfig,
    SudokuState,
} from '@cetus/games/sudoku/frameworkTypes'
import type { BaseGameCallbacks, BaseGameState } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface SudokuInitResult {
    game: SudokuGame
    renderer: SudokuRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<SudokuGame['getState']>
    endGame: () => Promise<void>
}

export async function initSudokuGameFramework(
    // The island-owned board host (#sudoku-container); the renderer mounts
    // the 81-cell grid into it (HPA-393).
    _container: HTMLElement
): Promise<SudokuInitResult | undefined> {
    const config: SudokuConfig = {
        ...DEFAULT_SUDOKU_CONFIG,
        submitScore,
    }
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

    // React owns the HUD/buttons/overlay (HPA-393): the callbacks only keep
    // the bespoke #game-time elapsed span and the difficulty-button lock.
    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            renderer.render(state as SudokuState)
            // Difficulty lock derives from live state so a mid-run reset
            // (which emits state-change via onGameReset, not onEnd) releases
            // the buttons back to idle.
            setDifficultyButtonsDisabled(state.isActive && !state.isGameOver)
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
        },
        onStart: () => {
            setDifficultyButtonsDisabled(true)
            renderer.render(game.getState())
        },
        onEnd: () => {
            setDifficultyButtonsDisabled(false)
        },
    }

    // Create game instance
    const game = new SudokuGame(config, enhancedCallbacks)

    // Wire cell clicks into game logic
    renderer.setCellClickCallback((row, col) => {
        game.selectCell(row, col)
    })

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // Set up controls
    const cleanupButtonHandlers = setupButtonHandlers(game, renderer)
    const cleanupKeyboardControls = setupKeyboardControls(game)
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Initial render + difficulty display
    renderer.render(game.getState())
    setDifficultySelection(game.getState().difficulty)

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupButtonHandlers()
            cleanupKeyboardControls()
            cleanupUnloadWarning()
            removeForwarder()
            renderer.destroy()
            game.destroy()
        },
        restart: () => {
            game.newGame()
            renderer.render(game.getState())
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

// --- UI helper functions ---

function setDifficultyButtonsDisabled(disabled: boolean): void {
    const ids = ['easy-btn', 'medium-btn', 'hard-btn']
    ids.forEach(id => {
        const btn = document.getElementById(id) as HTMLButtonElement | null
        if (btn) {
            btn.disabled = disabled
        }
    })
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
}

function togglePause(game: SudokuGame): void {
    const state = game.getState()
    if (state.isPaused) {
        game.resume()
    } else {
        game.pause()
    }
}

// --- Setup functions ---

function setupButtonHandlers(
    game: SudokuGame,
    renderer: SudokuRenderer
): () => void {
    const easyBtn = document.getElementById('easy-btn')
    const mediumBtn = document.getElementById('medium-btn')
    const hardBtn = document.getElementById('hard-btn')

    const difficultyHandler =
        (difficulty: 'easy' | 'medium' | 'hard') => () => {
            game.newGame(difficulty)
            renderer.render(game.getState())
            setDifficultySelection(difficulty)
            // newGame() resets without emitting; announce the fresh state so
            // the React session adapter re-projects the HUD (HPA-393).
            game.emit('state-change', { state: game.getState() })
        }

    easyBtn?.addEventListener('click', difficultyHandler('easy'))
    mediumBtn?.addEventListener('click', difficultyHandler('medium'))
    hardBtn?.addEventListener('click', difficultyHandler('hard'))

    return () => {
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
