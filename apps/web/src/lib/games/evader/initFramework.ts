// Evader game initialization using BaseGame framework
import {
    EvaderGame,
    DEFAULT_EVADER_CONFIG,
} from '@cetus/games/evader/EvaderGame'
import { EvaderRenderer, createEvaderRendererConfig } from './EvaderRenderer'
import type { EvaderConfig } from '@cetus/games/evader/frameworkTypes'
import type { BaseGameCallbacks } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

const MOVEMENT_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'w',
    'W',
    'a',
    'A',
    's',
    'S',
    'd',
    'D',
])

export interface EvaderInitResult {
    game: EvaderGame
    renderer: EvaderRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<EvaderGame['getState']>
    endGame: () => Promise<void>
}

export async function initEvaderGameFramework(
    container: HTMLElement,
    customConfig?: Partial<EvaderConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<EvaderInitResult | undefined> {
    const config: EvaderConfig = {
        ...DEFAULT_EVADER_CONFIG,
        ...customConfig,
        submitScore: customConfig?.submitScore ?? submitScore,
    }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#game-canvas-container` e2e id).
    const rendererConfig = createEvaderRendererConfig(
        config,
        `#${CSS.escape(container.id)}`
    )

    // Initialize renderer with error handling
    const renderer = new EvaderRenderer(rendererConfig)
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'EvaderGame'
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

    // React owns the HUD/buttons/overlay (HPA-393): callbacks stay as the
    // caller supplied them — no imperative DOM writers here.
    const game = new EvaderGame(config, customCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // Set up keyboard controls
    const cleanupKeyboard = setupKeyboardControls(game)

    // Set up touch / pointer D-pad controls
    const cleanupTouchControls = setupTouchControls(game)

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Set up framework-level render + update loop (single rAF path)
    let renderLoopId: number | null = null
    let lastUpdateTime = Date.now()
    const startRenderLoop = () => {
        if (renderLoopId !== null) {
            return
        }
        const renderLoop = () => {
            const now = Date.now()
            // Clamp deltaTime to avoid physics spikes after tab throttling
            // or long pauses (e.g. background tabs rAF at ~1Hz).
            const deltaTime = Math.min((now - lastUpdateTime) / 1000, 0.1)
            lastUpdateTime = now

            const state = game.getState()
            // Drive per-frame physics while active, then render.
            if (state.isActive && !state.isPaused) {
                game.update(deltaTime)
            }
            renderer.render(game.getState())

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
            cleanupKeyboard()
            cleanupTouchControls()
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

function setupKeyboardControls(game: EvaderGame): () => void {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey) {
            return
        }
        if (MOVEMENT_KEYS.has(event.key) && game.getState().isActive) {
            event.preventDefault()
            game.pressKey(event.key, 'keyboard')
        }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
        if (MOVEMENT_KEYS.has(event.key)) {
            event.preventDefault()
            game.releaseKey(event.key, 'keyboard')
        }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('keyup', handleKeyUp)
    }
}

function setupTouchControls(game: EvaderGame): () => void {
    const dpad = document.getElementById('dpad')
    if (!dpad) {
        return () => {}
    }

    const buttons = Array.from(
        dpad.querySelectorAll<HTMLButtonElement>('button[data-key]')
    )

    const cleanups: (() => void)[] = []

    for (const button of buttons) {
        const key = button.dataset.key
        if (!key || !MOVEMENT_KEYS.has(key)) {
            continue
        }

        const press = (e: PointerEvent) => {
            e.preventDefault()
            button.classList.add('active')
            // Touch pointers receive implicit pointer capture on pointerdown,
            // which suppresses pointerleave while the finger is down — so
            // "slide off button to release" silently fails on real devices.
            // Release the capture so pointerleave fires normally on touch.
            try {
                button.releasePointerCapture(e.pointerId)
            } catch {
                // No-op: pointer not captured (mouse) or pointerId unavailable.
            }
            // Match the keyboard handler's isActive gate so a press before
            // the game starts doesn't leave a stuck key in rawHeldKeys.
            if (game.getState().isActive) {
                game.pressKey(key, 'touch')
            }
        }

        const release = (e: PointerEvent) => {
            e.preventDefault()
            button.classList.remove('active')
            game.releaseKey(key, 'touch')
        }

        // pointerdown starts movement; pointerup / pointerleave / pointercancel
        // end it so the player stops if the finger slides off the button.
        button.addEventListener('pointerdown', press)
        button.addEventListener('pointerup', release)
        button.addEventListener('pointerleave', release)
        button.addEventListener('pointercancel', release)

        cleanups.push(() => {
            button.removeEventListener('pointerdown', press)
            button.removeEventListener('pointerup', release)
            button.removeEventListener('pointerleave', release)
            button.removeEventListener('pointercancel', release)
        })
    }

    return () => {
        for (const cleanup of cleanups) {
            cleanup()
        }
    }
}

function setupUnloadWarning(game: EvaderGame): () => void {
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
