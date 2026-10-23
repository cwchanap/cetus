// Tetris game initialization using BaseGame framework
import {
    TetrisGame,
    DEFAULT_TETRIS_CONFIG,
} from '@cetus/games/tetris/TetrisGame'
import { TetrisRenderer, createTetrisRendererConfig } from './TetrisRenderer'
import { drawNextPiece } from './drawing'
import type {
    TetrisConfig,
    TetrisStats,
    Piece,
} from '@cetus/games/tetris/types'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
    ChallengeUpdates,
} from '@cetus/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@cetus/games/core/errors'
import { isEditableTarget } from '@/lib/keyboard'

import { type AchievementNotification } from '@cetus/shared/achievements'
import { submitScore } from '@/lib/services/scoreService'

export interface TetrisInitResult {
    game: TetrisGame
    renderer: TetrisRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<TetrisGame['getState']>
    endGame: () => Promise<void>
    setPreferences: (ghost: boolean, glyphs: boolean) => void
}

export async function initTetrisGameFramework(
    customConfig?: Partial<TetrisConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<TetrisInitResult | undefined> {
    const container = document.getElementById('tetris-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('tetris-container'),
            'TetrisGame'
        )
        return undefined
    }

    const nextCanvas = document.getElementById(
        'next-canvas'
    ) as HTMLCanvasElement | null
    const nextCtx = nextCanvas?.getContext('2d') ?? null

    const config: TetrisConfig = {
        ...DEFAULT_TETRIS_CONFIG,
        ...customConfig,
        submitScore,
    }
    const rendererConfig = createTetrisRendererConfig(
        config,
        '#tetris-container'
    )

    // Initialize renderer with error handling
    const renderer = new TetrisRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'TetrisGame'
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

    const canvas = renderer.getApp()?.canvas
    if (canvas) {
        canvas.tabIndex = 0
        canvas.setAttribute('role', 'application')
        canvas.setAttribute(
            'aria-label',
            'Tetris board, 10 by 20. Arrow keys to move and rotate, Space to hard drop, C to hold.'
        )
    }
    const holdCanvas = document.getElementById(
        'hold-canvas'
    ) as HTMLCanvasElement | null
    const holdCtx = holdCanvas?.getContext('2d') ?? null
    let lastQueue: Piece[] | null = null
    let lastHeld: Piece | null | undefined
    let glyphs = false
    const drawPreviews = (state: ReturnType<TetrisGame['getState']>) => {
        if (nextCtx && nextCanvas && state.queue !== lastQueue) {
            drawNextPiece(state.queue, nextCtx, nextCanvas, glyphs)
            lastQueue = state.queue
        }
        if (holdCtx && holdCanvas && state.heldPiece !== lastHeld) {
            drawNextPiece(state.heldPiece, holdCtx, holdCanvas, glyphs)
            lastHeld = state.heldPiece
        }
    }

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: (state: BaseGameState) => {
            const tetrisState = state as ReturnType<TetrisGame['getState']>
            updateUI(tetrisState)
            drawPreviews(tetrisState)
            customCallbacks?.onStateChange?.(state)
        },
        onScoreUpdate: (score: number) => {
            const scoreEl = document.getElementById('score')
            if (scoreEl) {
                scoreEl.textContent = String(score)
            }
            customCallbacks?.onScoreUpdate?.(score)
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
            const tetrisStats = stats as TetrisStats
            showGameOver(finalScore, tetrisStats)
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new TetrisGame(config, enhancedCallbacks)

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

    // Set up button handlers
    const cleanupButtonHandlers = setupButtonHandlers(game)

    // Set up keyboard controls
    const cleanupKeyboardControls = setupKeyboardControls(game)

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Set up framework-level render loop (single rAF path)
    let renderLoopId: number | null = null
    let lastFrame = 0
    const startRenderLoop = () => {
        if (renderLoopId !== null) {
            return
        }
        const renderLoop = () => {
            const now = performance.now()
            if (lastFrame === 0) {
                lastFrame = now
            }
            const dt = now - lastFrame
            lastFrame = now
            // Drive game logic from the single rAF loop (no dual-RAF).
            game.update(dt)
            const state = game.getState()
            if (state.needsRedraw) {
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

    // Initial render + next piece preview
    renderer.render(game.getState())
    drawPreviews(game.getState())

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupRenderLoop()
            cleanupButtonHandlers()
            cleanupKeyboardControls()
            cleanupUnloadWarning()
            game.off('end', onGameEnd)
            renderer.cleanup()
            game.destroy()
        },
        restart: () => {
            lastQueue = null
            game.reset()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
        setPreferences: (ghost, showGlyphs) => {
            glyphs = showGlyphs
            renderer.setPreferences(ghost, glyphs)
            renderer.render({ ...game.getState(), needsRedraw: true })
            lastQueue = null
            lastHeld = undefined
            drawPreviews(game.getState())
        },
    }
}

function updateUI(state: ReturnType<TetrisGame['getState']>): void {
    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    setText('score', state.score.toString())
    setText('level', state.level.toString())
    setText('lines', state.lines.toString())
    setText('pieces-count', state.stats.pieces.toString())
    setText('singles-count', state.stats.singles.toString())
    setText('doubles-count', state.stats.doubles.toString())
    setText('triples-count', state.stats.triples.toString())
    setText('tetrises-count', state.stats.tetrises.toString())
}

function showGameOver(finalScore: number, stats: TetrisStats): void {
    const startBtn = document.getElementById(
        'start-btn'
    ) as HTMLButtonElement | null
    const endBtn = document.getElementById(
        'end-btn'
    ) as HTMLButtonElement | null

    if (startBtn) {
        startBtn.style.display = 'inline-flex'
        startBtn.textContent = 'Begin the dive'
    }
    if (endBtn) {
        endBtn.style.display = 'none'
    }

    // Update overlay stats
    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    setText('final-score', finalScore.toString())
    setText('final-level', stats.level?.toString() || '1')
    setText('final-lines', stats.lines?.toString() || '0')
    setText('final-pieces', stats.pieces?.toString() || '0')
    setText('final-tetrises', stats.tetrises?.toString() || '0')

    // Show overlay
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function setupButtonHandlers(game: TetrisGame): () => void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const pauseBtn = document.getElementById('pause-btn')
    const resetBtn = document.getElementById('reset-btn')
    const restartBtn = document.getElementById('restart-btn')
    const playAgainBtn = document.getElementById('play-again-btn')

    const startHandler = () => game.start()
    const endHandler = () => game.end()

    const pauseHandler = () => {
        if (game.getState().isPaused) {
            game.resume()
        } else {
            game.pause()
        }
    }
    const resetHandler = () => {
        game.reset()
        game.start()
    }
    const restartHandler = resetHandler
    const playAgainHandler = resetHandler

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

function setupKeyboardControls(game: TetrisGame): () => void {
    const keydownHandler = (e: KeyboardEvent) => {
        if (e.defaultPrevented) {
            return
        }
        const state = game.getState()
        if (!state.gameStarted || state.isGameOver) {
            return
        }

        if (
            isEditableTarget(e.target) ||
            e.target instanceof HTMLButtonElement ||
            e.target instanceof HTMLAnchorElement
        ) {
            return
        }
        const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
        if (dialog) {
            return
        }
        if (e.key.toLowerCase() === 'p') {
            e.preventDefault()
            game.pause()
            return
        }
        const actions: Record<string, () => void> = {
            ArrowLeft: () => game.moveLeft(),
            ArrowRight: () => game.moveRight(),
            ArrowDown: () => game.softDrop(),
            ArrowUp: () => game.rotate(),
            ' ': () => game.hardDrop(),
            c: () => game.holdPiece(),
            C: () => game.holdPiece(),
        }
        if (actions[e.key]) {
            e.preventDefault()
            actions[e.key]()
        }
    }

    document.addEventListener('keydown', keydownHandler)

    return () => {
        document.removeEventListener('keydown', keydownHandler)
    }
}

function setupUnloadWarning(game: TetrisGame): () => void {
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
