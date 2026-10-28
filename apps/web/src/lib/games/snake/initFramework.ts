// Snake game initialization using BaseGame framework
import { SnakeGame, DEFAULT_SNAKE_CONFIG } from '@cetus/games/snake/SnakeGame'
import { SnakeRenderer, createSnakeRendererConfig } from './SnakeRenderer'
import type { SnakeConfig, Direction } from '@cetus/games/snake/types'
import type {
    BaseGameCallbacks,
    ChallengeUpdates,
} from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'

import { type AchievementNotification } from '@cetus/shared/achievements'
import { submitScore } from '@/lib/services/scoreService'

export interface SnakeInitResult {
    game: SnakeGame
    renderer: SnakeRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<SnakeGame['getState']>
    endGame: () => Promise<void>
}

export async function initSnakeGameFramework(
    container: HTMLElement,
    customConfig?: Partial<SnakeConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<SnakeInitResult | undefined> {
    const config: SnakeConfig = {
        ...DEFAULT_SNAKE_CONFIG,
        ...customConfig,
        submitScore: customConfig?.submitScore ?? submitScore,
    }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#snake-container` e2e id).
    const rendererConfig = createSnakeRendererConfig(
        config,
        `#${CSS.escape(container.id)}`
    )

    // Initialize renderer with error handling
    const renderer = new SnakeRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'SnakeGame'
        )
        // Cleanup partial resources
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

    // React owns the HUD/buttons/overlay (HPA-393): callbacks stay as the
    // caller supplied them — no imperative DOM writers here.
    const game = new SnakeGame(config, customCallbacks)

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

        // Pause toggle (the controlled pause button label is React-owned)
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault()
            if (state.isPaused) {
                game.resume()
            } else {
                game.pause()
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
