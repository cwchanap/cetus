// Reflex game initialization using BaseGame framework
import {
    ReflexGame,
    DEFAULT_REFLEX_CONFIG,
} from '@cetus/games/reflex/ReflexGame'
import { ReflexRenderer, createReflexRendererConfig } from './ReflexRenderer'
import type { ReflexConfig } from '@cetus/games/reflex/frameworkTypes'
import type { BaseGameCallbacks } from '@cetus/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface ReflexInitResult {
    game: ReflexGame
    renderer: ReflexRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<ReflexGame['getState']>
    endGame: () => Promise<void>
}

export async function initReflexGameFramework(
    // The island-owned board host (#game-canvas-container); the renderer
    // mounts the Pixi canvas into it (HPA-393).
    container: HTMLElement,
    customConfig?: Partial<ReflexConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<ReflexInitResult | undefined> {
    const config: ReflexConfig = {
        ...DEFAULT_REFLEX_CONFIG,
        ...customConfig,
        submitScore: customConfig?.submitScore ?? submitScore,
    }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#game-canvas-container` e2e id).
    const rendererConfig = createReflexRendererConfig(
        config,
        `#${CSS.escape(container.id)}`
    )

    // Initialize renderer with error handling
    const renderer = new ReflexRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'ReflexGame'
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

    const logicalSize = renderer.getLogicalSize()

    // React owns the HUD/buttons/overlay (HPA-393): callbacks stay as the
    // caller supplied them — no imperative DOM writers here.
    const game = new ReflexGame(config, customCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // Set up canvas click handler
    const cleanupCanvasControls = setupCanvasControls(
        game,
        renderer,
        logicalSize
    )

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Set up framework-level render loop (single rAF path)
    let renderLoopId: number | null = null
    const startRenderLoop = () => {
        if (renderLoopId !== null) {
            return
        }
        const renderLoop = () => {
            const state = game.getState()
            // Always render while active so per-frame animations (e.g. the
            // pulsing effect) stay smooth; skip when paused or over.
            if (state.isActive && !state.isPaused) {
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
            cleanupUnloadWarning()
            removeForwarder()
            renderer.cleanup()
            game.destroy()
        },
        restart: () => {
            game.reset()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

function setupCanvasControls(
    game: ReflexGame,
    renderer: ReflexRenderer,
    logicalSize: number
): () => void {
    const app = renderer.getApp()
    const canvas = app?.canvas ?? null
    if (!canvas) {
        return () => {}
    }

    const clickHandler = (event: MouseEvent) => {
        const state = game.getState()
        if (!state.isActive || state.isPaused) {
            return
        }

        const rect = canvas.getBoundingClientRect()
        const x = (event.clientX - rect.left) * (logicalSize / rect.width)
        const y = (event.clientY - rect.top) * (logicalSize / rect.height)

        const cellPosition = renderer.getCellFromPosition(x, y)
        if (cellPosition) {
            const result = game.handleCellClick(
                cellPosition.row,
                cellPosition.col
            )

            if (result.hit) {
                renderer.showClickEffect(
                    cellPosition.row,
                    cellPosition.col,
                    result.points > 0
                )
            }
        }
    }

    canvas.addEventListener('click', clickHandler)

    return () => {
        canvas.removeEventListener('click', clickHandler)
    }
}

function setupUnloadWarning(game: ReflexGame): () => void {
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
