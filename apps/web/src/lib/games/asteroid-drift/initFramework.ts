import { AsteroidDriftGame } from '@cetus/games/asteroid-drift/AsteroidDriftGame'
import {
    createAsteroidDriftRendererConfig,
    AsteroidDriftRenderer,
} from './AsteroidDriftRenderer'
import {
    createAsteroidDriftConfig,
    type AsteroidDriftDirection,
    type AsteroidDriftOutcome,
    type AsteroidDriftState,
    type AsteroidDriftStats,
} from '@cetus/games/asteroid-drift/types'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
} from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'
import { isEditableTarget } from '@/lib/keyboard'
import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface AsteroidDriftInitResult {
    game: AsteroidDriftGame
    renderer: AsteroidDriftRenderer
    getGame: () => AsteroidDriftGame
    getState: () => ReturnType<AsteroidDriftGame['getState']>
    cleanup: () => void
}

const KEYBOARD_DIRECTIONS: Record<string, AsteroidDriftDirection> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    a: 'left',
    s: 'down',
    d: 'right',
    W: 'up',
    A: 'left',
    S: 'down',
    D: 'right',
}

function outcomeAnnouncement(outcome: AsteroidDriftOutcome): string {
    if (outcome === 'survived') {
        return 'Drift complete. You survived the full run.'
    }
    if (outcome === 'expired') {
        return 'Drift ended. The run expired before full simulation.'
    }
    return 'Collision. Ship lost.'
}

export async function initAsteroidDriftGameFramework(
    container: HTMLElement
): Promise<AsteroidDriftInitResult | undefined> {
    const config = { ...createAsteroidDriftConfig(), submitScore }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#asteroid-drift-canvas` e2e id —
    // the canvas div lives inside the ref'd board container).
    const renderer = new AsteroidDriftRenderer({
        ...createAsteroidDriftRendererConfig(config),
        container: `#${CSS.escape(container.id)} #asteroid-drift-canvas`,
    })
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'AsteroidDrift'
        )
        try {
            renderer.destroy()
        } catch (cleanupError) {
            handleGameError(cleanupError, 'AsteroidDrift')
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
        const element = document.getElementById('asteroid-drift-status')
        if (element) {
            element.textContent = message
        }
    }

    let lastAnnouncedOrbs: number | null = null

    const trackAnnouncements = (state: AsteroidDriftState): void => {
        if (
            lastAnnouncedOrbs !== null &&
            state.orbsCollected > lastAnnouncedOrbs
        ) {
            announce('Energy orb collected.')
        }
        lastAnnouncedOrbs = state.orbsCollected
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const driftState = state as AsteroidDriftState
            // React owns the HUD badges/overlay (HPA-393); the callbacks
            // keep only the polite live announcer in sync.
            trackAnnouncements(driftState)
        },
        onStart: () => {
            // BaseGame.start() calls onStart before onGameStart emits the
            // fresh opening state. Clearing the baseline here keeps the live
            // region silent on run initialization; announcements only fire
            // for orbs actually collected during the run.
            lastAnnouncedOrbs = null
            announce('Drift started.')
        },
        onEnd: (_finalScore: number, stats: BaseGameStats) => {
            const driftStats = stats as AsteroidDriftStats
            announce(outcomeAnnouncement(driftStats.outcome))
        },
    }

    const game = new AsteroidDriftGame(config, enhancedCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // React owns the start/reset/play-again buttons (HPA-393); the touch
    // D-pad stays initializer-wired (looked up by its frozen id in the
    // React-owned controls card, outside the board host).
    const dpad = document.getElementById('asteroid-drift-dpad')
    const canvas = renderer.getApp()?.canvas ?? null

    // PixiJSRenderer uses autoDensity: true, which writes inline
    // style.width/style.height in CSS pixels (e.g. "800px"/"480px"). On a
    // narrow viewport the stylesheet max-width can shrink the width, but the
    // inline height wins over CSS height: auto, stretching the canvas.
    // Override both inline values so the canvas fills its container width
    // and scales its height from the 800×480 intrinsic aspect ratio.
    if (canvas) {
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
    }

    // Keyboard: arrows/WASD press on keydown while active; keyup always
    // releases the mapped direction so a direction can never stay stuck.
    const keyboardDownHandler: EventListener = event => {
        const keyboardEvent = event as KeyboardEvent
        if (
            keyboardEvent.repeat ||
            keyboardEvent.ctrlKey ||
            keyboardEvent.metaKey ||
            keyboardEvent.altKey ||
            isEditableTarget(keyboardEvent.target)
        ) {
            return
        }
        const direction = KEYBOARD_DIRECTIONS[keyboardEvent.key]
        if (!direction) {
            return
        }
        if (game.getState().isActive) {
            keyboardEvent.preventDefault()
            game.pressDirection(direction, 'keyboard')
        }
    }
    const keyboardUpHandler: EventListener = event => {
        const keyboardEvent = event as KeyboardEvent
        const direction = KEYBOARD_DIRECTIONS[keyboardEvent.key]
        if (!direction) {
            return
        }
        keyboardEvent.preventDefault()
        game.releaseDirection(direction, 'keyboard')
    }

    // A keyup is not guaranteed to reach the document if the player holds
    // a movement key, switches tabs/windows, then releases it while the
    // page is unfocused. On return the held direction would persist with
    // no key physically held and the ship would resume thrusting. Blur
    // releases every direction from both sources and clears the active
    // D-pad classes for symmetry. Kept local — no shared input framework.
    const blurHandler: EventListener = () => {
        for (const direction of [
            'up',
            'down',
            'left',
            'right',
        ] as AsteroidDriftDirection[]) {
            game.releaseDirection(direction, 'keyboard')
            game.releaseDirection(direction, 'touch')
        }
        for (const button of dpadButtons) {
            button.classList.remove('active')
        }
    }

    // Touch/pointer D-pad, copied Evader-shaped: pointerdown presses (gated
    // on an active run so no latent input survives a pre-start press) and
    // defensively releases the implicit pointer capture touch pointers get,
    // otherwise pointerleave never fires while the finger is down.
    const isDpadDirection = (
        value: string | undefined
    ): value is AsteroidDriftDirection =>
        value === 'up' ||
        value === 'down' ||
        value === 'left' ||
        value === 'right'

    const dpadButtons = dpad
        ? Array.from(
              dpad.querySelectorAll<HTMLButtonElement>('button[data-direction]')
          )
        : []
    for (const button of dpadButtons) {
        const direction = button.dataset.direction
        if (!isDpadDirection(direction)) {
            continue
        }

        const press: EventListener = event => {
            const pointerEvent = event as PointerEvent
            pointerEvent.preventDefault()
            button.classList.add('active')
            try {
                button.releasePointerCapture(pointerEvent.pointerId)
            } catch {
                // No-op: pointer not captured (mouse) or pointerId unavailable.
            }
            if (game.getState().isActive) {
                game.pressDirection(direction, 'touch')
            }
        }
        const release: EventListener = event => {
            const pointerEvent = event as PointerEvent
            pointerEvent.preventDefault()
            button.classList.remove('active')
            game.releaseDirection(direction, 'touch')
        }

        listen(button, 'pointerdown', press)
        listen(button, 'pointerup', release)
        listen(button, 'pointerleave', release)
        listen(button, 'pointercancel', release)
    }

    const beforeUnloadHandler: EventListener = event => {
        if (!game.getState().isActive) {
            return
        }
        event.preventDefault()
        ;(event as BeforeUnloadEvent).returnValue =
            'You have a game in progress. Are you sure you want to leave?'
    }

    listen(document, 'keydown', keyboardDownHandler)
    listen(document, 'keyup', keyboardUpHandler)
    listen(window, 'blur', blurHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())

    let frameId: number | null = null
    let lastFrameTime: number | null = null

    const frame = (timestamp: number): void => {
        // Derive the delta from the rAF timestamp (monotonic); the first
        // frame has no previous sample, so it steps zero. One outer clamp
        // bounds hidden-tab/throttling spikes; the game subdivides further.
        const deltaSeconds =
            lastFrameTime === null
                ? 0
                : Math.min(
                      (timestamp - lastFrameTime) / 1000,
                      config.maxUpdateDelta
                  )
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
