import { GravityFlipGame } from '@cetus/games/gravity-flip/GravityFlipGame'
import {
    createGravityFlipRendererConfig,
    GravityFlipRenderer,
} from './GravityFlipRenderer'
import {
    createGravityFlipConfig,
    type GravityFlipState,
    type GravityFlipStats,
} from '@cetus/games/gravity-flip/types'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
} from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'
import { isEditableTarget } from '@/lib/keyboard'
import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface GravityFlipInitResult {
    game: GravityFlipGame
    renderer: GravityFlipRenderer
    getGame: () => GravityFlipGame
    getState: () => ReturnType<GravityFlipGame['getState']>
    cleanup: () => void
}

export async function initGravityFlipGameFramework(
    container: HTMLElement
): Promise<GravityFlipInitResult | undefined> {
    const config = { ...createGravityFlipConfig(), submitScore }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#gravity-flip-canvas` e2e id —
    // the canvas div lives inside the ref'd board container).
    const renderer = new GravityFlipRenderer({
        ...createGravityFlipRendererConfig(config),
        container: `#${CSS.escape(container.id)} #gravity-flip-canvas`,
    })
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'GravityFlip'
        )
        try {
            renderer.destroy()
        } catch (cleanupError) {
            handleGameError(cleanupError, 'GravityFlip')
        }
        return undefined
    }

    const trackedListeners: Array<{
        target: EventTarget
        type: string
        handler: EventListener
    }> = []

    const listen = (
        target: EventTarget | null,
        type: string,
        handler: EventListener
    ): void => {
        if (!target) {
            return
        }
        target.addEventListener(type, handler)
        trackedListeners.push({ target, type, handler })
    }

    const announce = (message: string): void => {
        const element = document.getElementById('gravity-flip-status')
        if (element) {
            element.textContent = message
        }
    }

    let lastAnnouncedGravity: GravityFlipState['gravity'] | null = null

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const gravityFlipState = state as GravityFlipState
            // React owns the HUD badges/overlay (HPA-393); the callbacks
            // keep only the polite live announcer in sync.
            if (
                lastAnnouncedGravity !== null &&
                gravityFlipState.gravity !== lastAnnouncedGravity
            ) {
                announce(
                    gravityFlipState.gravity === 'down'
                        ? 'Gravity pulling to the floor'
                        : 'Gravity pulling to the ceiling'
                )
            }
            lastAnnouncedGravity = gravityFlipState.gravity
        },
        onStart: () => {
            // BaseGame.start() calls onStart before onGameStart emits the
            // fresh (gravity: 'down') state. Clearing the baseline here keeps
            // the live region silent on run initialization; announcements only
            // fire for actual flips during the run.
            lastAnnouncedGravity = null
        },
        onEnd: (_finalScore: number, stats: BaseGameStats) => {
            const gravityFlipStats = stats as GravityFlipStats
            announce(
                gravityFlipStats.outcome === 'survived'
                    ? 'Run complete. You survived the full minute.'
                    : 'Collision. Run ended.'
            )
        },
    }

    const game = new GravityFlipGame(config, enhancedCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // React owns the start/reset/play-again buttons (HPA-393); the bespoke
    // flip button stays initializer-wired.
    const flipButton = document.getElementById('flip-btn')
    const canvas = renderer.getApp()?.canvas ?? null

    // PixiJSRenderer uses autoDensity: true, which writes inline
    // style.width/style.height in CSS pixels (e.g. "800px"/"320px"). On a
    // narrow viewport the stylesheet max-width can shrink the width, but the
    // inline height wins over CSS height: auto, stretching the canvas. Override
    // both inline values so the canvas fills its container width and scales its
    // height from the 800×320 intrinsic aspect ratio.
    if (canvas) {
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
    }

    const flipHandler: EventListener = () => {
        game.flipGravity()
    }
    const keyboardHandler: EventListener = event => {
        const keyboardEvent = event as KeyboardEvent
        if (
            keyboardEvent.repeat ||
            keyboardEvent.ctrlKey ||
            keyboardEvent.metaKey ||
            keyboardEvent.altKey ||
            isEditableTarget(keyboardEvent.target) ||
            keyboardEvent.target instanceof HTMLButtonElement
        ) {
            return
        }
        if (
            ![' ', 'Spacebar', 'ArrowUp', 'ArrowDown'].includes(
                keyboardEvent.key
            )
        ) {
            return
        }
        if (game.flipGravity()) {
            keyboardEvent.preventDefault()
        }
    }
    const beforeUnloadHandler: EventListener = event => {
        if (!game.getState().isActive) {
            return
        }
        event.preventDefault()
        ;(event as BeforeUnloadEvent).returnValue =
            'You have a game in progress. Are you sure you want to leave?'
    }

    listen(flipButton, 'click', flipHandler)
    listen(canvas, 'pointerdown', flipHandler)
    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())

    let frameId: number | null = null
    let lastFrameTime: number | null = null

    const frame = (timestamp: number): void => {
        // Derive the delta from the rAF timestamp (monotonic); the first
        // frame has no previous sample, so it steps zero.
        const deltaSeconds =
            lastFrameTime === null
                ? 0
                : Math.min((timestamp - lastFrameTime) / 1000, 0.1)
        lastFrameTime = timestamp
        const state = game.getState()
        if (state.isActive && !state.isPaused) {
            game.update(deltaSeconds)
        }
        renderer.render(game.getState())
        frameId = requestAnimationFrame(frame)
    }
    frameId = requestAnimationFrame(frame)

    let cleanedUp = false
    const cleanup = (): void => {
        if (cleanedUp) {
            return
        }
        cleanedUp = true
        if (frameId !== null) {
            cancelAnimationFrame(frameId)
            frameId = null
        }
        for (const { target, type, handler } of trackedListeners) {
            target.removeEventListener(type, handler)
        }
        removeForwarder()
        renderer.destroy()
        game.destroy()
    }

    return {
        game,
        renderer,
        getGame: () => game,
        getState: () => game.getState(),
        cleanup,
    }
}
