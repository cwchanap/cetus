// Bubble Shooter game initialization using BaseGame framework
import {
    BubbleShooterGame,
    DEFAULT_BUBBLE_SHOOTER_CONFIG,
} from './BubbleShooterGame'
import {
    BubbleShooterRenderer,
    createBubbleShooterRendererConfig,
} from './BubbleShooterRenderer'
import { drawBubbleOnCanvas, pixiColorToHex } from './utils'
import type { BubbleShooterConfig, BubbleShooterStats } from './types'
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

export interface BubbleShooterInitResult {
    game: BubbleShooterGame
    renderer: BubbleShooterRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<BubbleShooterGame['getState']>
    endGame: () => Promise<void>
}

export async function initBubbleShooterGameFramework(
    customConfig?: Partial<BubbleShooterConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<BubbleShooterInitResult | undefined> {
    const container = document.getElementById('game-container')
    const currentBubbleCanvas = document.getElementById(
        'current-bubble'
    ) as HTMLCanvasElement | null
    const nextBubbleCanvas = document.getElementById(
        'next-bubble'
    ) as HTMLCanvasElement | null

    if (!container || !currentBubbleCanvas || !nextBubbleCanvas) {
        handleGameError(
            new DOMElementNotFoundError('game-container'),
            'BubbleShooterGame'
        )
        return undefined
    }

    const currentBubbleCtx = currentBubbleCanvas.getContext('2d')
    const nextBubbleCtx = nextBubbleCanvas.getContext('2d')

    const config: BubbleShooterConfig = {
        ...DEFAULT_BUBBLE_SHOOTER_CONFIG,
        ...customConfig,
    }
    const rendererConfig = createBubbleShooterRendererConfig(
        config,
        '#game-container'
    )

    // Initialize renderer with error handling
    const renderer = new BubbleShooterRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'BubbleShooterGame'
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

    // Helpers for the current/next bubble preview canvases
    const drawCurrentBubblePreview = (color: number | undefined) => {
        if (!currentBubbleCtx || color === undefined) {
            return
        }
        currentBubbleCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'
        currentBubbleCtx.fillRect(
            0,
            0,
            currentBubbleCanvas.width,
            currentBubbleCanvas.height
        )
        const centerX = currentBubbleCanvas.width / 2
        const centerY = currentBubbleCanvas.height / 2
        const radius = Math.min(centerX, centerY) - 4
        drawBubbleOnCanvas(
            currentBubbleCtx,
            centerX,
            centerY,
            radius,
            pixiColorToHex(color)
        )
    }

    const drawNextBubblePreview = (color: number | undefined) => {
        if (!nextBubbleCtx || color === undefined) {
            return
        }
        nextBubbleCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'
        nextBubbleCtx.fillRect(
            0,
            0,
            nextBubbleCanvas.width,
            nextBubbleCanvas.height
        )
        const centerX = nextBubbleCanvas.width / 2
        const centerY = nextBubbleCanvas.height / 2
        const radius = Math.min(centerX, centerY) - 4
        drawBubbleOnCanvas(
            nextBubbleCtx,
            centerX,
            centerY,
            radius,
            pixiColorToHex(color)
        )
    }

    // Track last-drawn preview colors to avoid redundant redraws
    let lastCurrentColor: number | null = null
    let lastNextColor: number | null = null

    // Enhanced callbacks with UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            const bsState = state as ReturnType<BubbleShooterGame['getState']>
            updateUI(bsState)

            const currentColor = bsState.currentBubble?.color
            if (
                currentColor !== undefined &&
                currentColor !== lastCurrentColor
            ) {
                lastCurrentColor = currentColor
                drawCurrentBubblePreview(currentColor)
            }
            const nextColor = bsState.nextBubble?.color
            if (nextColor !== undefined && nextColor !== lastNextColor) {
                lastNextColor = nextColor
                drawNextBubblePreview(nextColor)
            }

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
            const pauseOverlay = document.getElementById('pause-overlay')
            if (pauseOverlay) {
                pauseOverlay.classList.add('hidden')
            }
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const bsStats = stats as BubbleShooterStats
            showGameOver(finalScore, bsStats)
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    // Create game instance
    const game = new BubbleShooterGame(config, enhancedCallbacks)

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

    // Set up canvas aim/shoot handlers
    const cleanupCanvasControls = setupCanvasControls(game, renderer)

    // Set up button handlers
    const cleanupButtonHandlers = setupButtonHandlers(game)

    // Set up keyboard controls (pause toggle)
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

    // Initial render
    renderer.render(game.getState())

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupRenderLoop()
            cleanupCanvasControls()
            cleanupButtonHandlers()
            cleanupKeyboardControls()
            cleanupUnloadWarning()
            game.off('end', onGameEnd)
            renderer.cleanup()
            game.destroy()
        },
        restart: () => {
            lastCurrentColor = null
            lastNextColor = null
            game.reset()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

function updateUI(state: ReturnType<BubbleShooterGame['getState']>): void {
    const bubblesElement = document.getElementById('bubbles-remaining')
    if (bubblesElement) {
        bubblesElement.textContent = state.bubblesRemaining.toString()
    }
}

function showGameOver(finalScore: number, stats: BubbleShooterStats): void {
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

    const setText = (id: string, value: string) => {
        const el = document.getElementById(id)
        if (el) {
            el.textContent = value
        }
    }

    setText('final-score', finalScore.toString())
    setText('final-bubbles-popped', stats.bubblesPopped?.toString() || '0')
    setText('final-shots', stats.shotsFired?.toString() || '0')
    setText('final-accuracy', `${Math.round(stats.accuracy || 0)}%`)
    setText('final-combo', stats.largestCombo?.toString() || '0')

    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function setupButtonHandlers(game: BubbleShooterGame): () => void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const pauseBtn = document.getElementById('pause-btn')
    const resetBtn = document.getElementById('reset-btn')
    const restartBtn = document.getElementById('restart-btn')
    const resumeBtn = document.getElementById('resume-btn')

    const startHandler = () => game.start()
    const endHandler = () => {
        game.end().catch(err => console.error('BubbleShooter end failed', err))
    }

    const pauseHandler = () => {
        const state = game.getState()
        if (state.isPaused) {
            game.resume()
        } else {
            game.pause()
        }
        syncPauseUI(game)
    }

    const resetHandler = () => {
        game.reset()
        resetButtonVisibility()
    }

    const restartHandler = () => {
        game.reset()
        resetButtonVisibility()
    }

    const resumeHandler = () => {
        game.resume()
        syncPauseUI(game)
    }

    startBtn?.addEventListener('click', startHandler)
    endBtn?.addEventListener('click', endHandler)
    pauseBtn?.addEventListener('click', pauseHandler)
    resetBtn?.addEventListener('click', resetHandler)
    restartBtn?.addEventListener('click', restartHandler)
    resumeBtn?.addEventListener('click', resumeHandler)

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        endBtn?.removeEventListener('click', endHandler)
        pauseBtn?.removeEventListener('click', pauseHandler)
        resetBtn?.removeEventListener('click', resetHandler)
        restartBtn?.removeEventListener('click', restartHandler)
        resumeBtn?.removeEventListener('click', resumeHandler)
    }
}

function syncPauseUI(game: BubbleShooterGame): void {
    const state = game.getState()
    const pauseBtn = document.getElementById('pause-btn')
    const pauseOverlay = document.getElementById('pause-overlay')

    if (state.isPaused) {
        if (pauseBtn) {
            pauseBtn.textContent = 'Resume'
        }
        if (pauseOverlay) {
            pauseOverlay.classList.remove('hidden')
        }
    } else {
        if (pauseBtn) {
            pauseBtn.textContent = 'Pause'
        }
        if (pauseOverlay) {
            pauseOverlay.classList.add('hidden')
        }
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
    const pauseOverlay = document.getElementById('pause-overlay')
    if (pauseOverlay) {
        pauseOverlay.classList.add('hidden')
    }
}

function setupCanvasControls(
    game: BubbleShooterGame,
    renderer: BubbleShooterRenderer
): () => void {
    const app = renderer.getApp()
    const canvas = app?.canvas ?? null
    if (!canvas) {
        return () => {}
    }

    // Prevent the browser from intercepting touch gestures (scroll, zoom)
    // so pointer events reach our aim/shoot handlers on touch devices.
    canvas.style.touchAction = 'none'

    const pointerMoveHandler = (e: PointerEvent) => {
        const state = game.getState()
        if (!state.isActive || state.isPaused || state.projectile) {
            return
        }

        const rect = canvas.getBoundingClientRect()
        const pointerX = e.clientX - rect.left
        const pointerY = e.clientY - rect.top

        const aimFromY = state.currentBubble
            ? state.currentBubble.y
            : state.shooter.y
        const aimFromX = state.currentBubble
            ? state.currentBubble.x
            : state.shooter.x

        const angle = Math.atan2(pointerY - aimFromY, pointerX - aimFromX)
        game.setAimAngle(angle)
    }

    const pointerDownHandler = (e: PointerEvent) => {
        // Update aim on press so a tap shoots toward the touch point, not the
        // last pointermove position (which may not have fired on touch).
        pointerMoveHandler(e)
        game.shoot()
    }

    canvas.addEventListener('pointermove', pointerMoveHandler)
    canvas.addEventListener('pointerdown', pointerDownHandler)

    return () => {
        canvas.removeEventListener('pointermove', pointerMoveHandler)
        canvas.removeEventListener('pointerdown', pointerDownHandler)
    }
}

function setupKeyboardControls(game: BubbleShooterGame): () => void {
    const keydownHandler = (e: KeyboardEvent) => {
        if (e.key === 'p' || e.key === 'P') {
            const state = game.getState()
            if (!state.isActive || state.isGameOver) {
                return
            }
            e.preventDefault()
            if (state.isPaused) {
                game.resume()
            } else {
                game.pause()
            }
            syncPauseUI(game)
        }
    }

    document.addEventListener('keydown', keydownHandler)

    return () => {
        document.removeEventListener('keydown', keydownHandler)
    }
}

function setupUnloadWarning(game: BubbleShooterGame): () => void {
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
