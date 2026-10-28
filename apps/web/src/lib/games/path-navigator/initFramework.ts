// Path Navigator game initialization using BaseGame framework
import {
    PathNavigatorGame,
    DEFAULT_PATH_NAVIGATOR_CONFIG,
} from '@cetus/games/path-navigator/PathNavigatorGame'
import {
    PathNavigatorRenderer,
    createPathNavigatorRendererConfig,
} from './PathNavigatorRenderer'
import { clamp } from '@cetus/games/shared/utils'
import type { PathNavigatorConfig } from '@cetus/games/path-navigator/types'
import type { BaseGameCallbacks } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface PathNavigatorInitResult {
    game: PathNavigatorGame
    renderer: PathNavigatorRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<PathNavigatorGame['getState']>
    endGame: () => Promise<void>
}

export async function initPathNavigatorGameFramework(
    container: HTMLElement,
    customConfig?: Partial<PathNavigatorConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<PathNavigatorInitResult | undefined> {
    const config: PathNavigatorConfig = {
        ...DEFAULT_PATH_NAVIGATOR_CONFIG,
        ...customConfig,
        submitScore: customConfig?.submitScore ?? submitScore,
    }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#path-navigator-container` e2e id).
    const rendererConfig = createPathNavigatorRendererConfig(
        config,
        `#${CSS.escape(container.id)}`
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

    // React owns the HUD/buttons/overlay (HPA-393): callbacks stay as the
    // caller supplied them — no imperative DOM writers here.
    const game = new PathNavigatorGame(config, customCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // Set up keyboard controls (arrow-key navigation)
    const cleanupKeyboardControls = setupKeyboardControls(game, config)

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
            cleanupUnloadWarning()
            removeForwarder()
            renderer.cleanup()
            game.destroy()
        },
        restart: () => game.reset(),
        getState: () => game.getState(),
        endGame: () => game.end(),
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
