// Tetris game initialization using BaseGame framework
import { TetrisGame, DEFAULT_TETRIS_CONFIG } from './TetrisGame'
import { TetrisRenderer, createTetrisRendererConfig } from './TetrisRenderer'
import { drawNextPiece } from './utils'
import type { TetrisConfig, TetrisStats, Piece } from './types'
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

export interface TetrisInitResult {
    game: TetrisGame
    renderer: TetrisRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<TetrisGame['getState']>
    endGame: () => Promise<void>
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

    const config: TetrisConfig = { ...DEFAULT_TETRIS_CONFIG, ...customConfig }
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

    // Style the canvas only after successful initialization
    const app = renderer.getApp()
    if (app) {
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        app.canvas.style.borderRadius = '8px'
    }

    // Track the last-drawn next piece so we only redraw the preview on change
    let lastDrawnNextPiece: Piece | null = null
    const drawNextPiecePreview = (piece: Piece | null) => {
        if (!nextCtx || !nextCanvas) {
            return
        }
        if (piece === lastDrawnNextPiece) {
            return
        }
        lastDrawnNextPiece = piece
        drawNextPiece(piece, nextCtx, nextCanvas)
    }

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            const tetrisState = state as ReturnType<TetrisGame['getState']>
            updateUI(tetrisState)
            drawNextPiecePreview(tetrisState.nextPiece)
            customCallbacks?.onStateChange?.(state)
        },
        onScoreUpdate: score => {
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
    drawNextPiecePreview(game.getState().nextPiece)

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
            lastDrawnNextPiece = null
            game.reset()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
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
        startBtn.textContent = 'Start'
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
        resetButtonVisibility()
    }

    const restartHandler = () => {
        game.reset()
        resetButtonVisibility()
    }

    const playAgainHandler = () => {
        game.reset()
        resetButtonVisibility()
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

function resetButtonVisibility(): void {
    const startBtn = document.getElementById(
        'start-btn'
    ) as HTMLButtonElement | null
    const endBtn = document.getElementById(
        'end-btn'
    ) as HTMLButtonElement | null
    const pauseBtn = document.getElementById('pause-btn')
    if (startBtn) {
        startBtn.style.display = 'inline-flex'
        startBtn.textContent = 'Start'
    }
    if (endBtn) {
        endBtn.style.display = 'none'
    }
    if (pauseBtn) {
        pauseBtn.textContent = 'Pause'
    }
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.add('hidden')
    }
}

function setupKeyboardControls(game: TetrisGame): () => void {
    const keydownHandler = (e: KeyboardEvent) => {
        const state = game.getState()
        if (!state.gameStarted || state.isGameOver) {
            return
        }

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault()
                game.moveLeft()
                break
            case 'ArrowRight':
                e.preventDefault()
                game.moveRight()
                break
            case 'ArrowDown':
                e.preventDefault()
                game.softDrop()
                break
            case 'ArrowUp':
                e.preventDefault()
                game.rotate()
                break
            case ' ':
                e.preventDefault()
                game.hardDrop()
                break
            case 'p':
            case 'P': {
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
                break
            }
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
