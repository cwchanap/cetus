import { SignalSwitchGame } from '@cetus/games/signal-switch/SignalSwitchGame'
import {
    createSignalSwitchRendererConfig,
    SignalSwitchRenderer,
} from './SignalSwitchRenderer'
import {
    SIGNAL_SWITCH_SIGNALS,
    createSignalSwitchConfig,
    type SignalSwitchState,
    type SignalSwitchStats,
} from '@cetus/games/signal-switch/types'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
} from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'
import { isEditableTarget } from '@/lib/keyboard'
import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface SignalSwitchInitResult {
    game: SignalSwitchGame
    renderer: SignalSwitchRenderer
    getGame: () => SignalSwitchGame
    getState: () => ReturnType<SignalSwitchGame['getState']>
    /** React-owned Reset re-syncs the bespoke gate controls through this
     * (HPA-393): reset() emits no event, so the island calls restart(). */
    restart: () => void
    cleanup: () => void
}

const KEY_TO_LANE: Record<string, number> = {
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
}

export async function initSignalSwitchGameFramework(
    container: HTMLElement
): Promise<SignalSwitchInitResult | undefined> {
    const config = { ...createSignalSwitchConfig(), submitScore }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#signal-switch-canvas` e2e id —
    // the canvas div lives inside the ref'd board container).
    const renderer = new SignalSwitchRenderer({
        ...createSignalSwitchRendererConfig(config),
        container: `#${CSS.escape(container.id)} #signal-switch-canvas`,
    })
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'SignalSwitch'
        )
        try {
            renderer.destroy()
        } catch (cleanupError) {
            handleGameError(cleanupError, 'SignalSwitch')
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

    const setText = (id: string, value: string): void => {
        const element = document.getElementById(id)
        if (element) {
            element.textContent = value
        }
    }

    // The bespoke lane-gate controls live in the React-owned sidebar card
    // (outside the board host), so they are looked up by their frozen id —
    // same pattern as Evader's controls-slot D-pad (HPA-393).
    const gateControls = document.getElementById('gate-controls')
    const laneButtons = gateControls
        ? Array.from(
              gateControls.querySelectorAll<HTMLButtonElement>(
                  '[data-signal-lane]'
              )
          )
        : []

    const syncControls = (state: SignalSwitchState): void => {
        for (const button of laneButtons) {
            const laneIndex = Number(button.dataset.signalLane)
            const signal = state.gateSignals[laneIndex]
            if (!signal) {
                continue
            }
            const meta = SIGNAL_SWITCH_SIGNALS[signal]
            button.textContent = `Lane ${laneIndex + 1}: ${meta.glyph} ${meta.label}`
            button.disabled =
                !state.isActive || laneIndex >= state.activeLaneCount
            button.setAttribute(
                'aria-label',
                `Lane ${laneIndex + 1} gate, ${meta.label} ${meta.shapeName}`
            )
        }
    }

    const announce = (message: string): void => {
        setText('signal-switch-status', message)
    }

    let lastAnnouncedLaneCount: number | null = null
    let lastAnnouncedIntegrity: number | null = null

    const trackAnnouncements = (state: SignalSwitchState): void => {
        if (
            lastAnnouncedLaneCount !== null &&
            state.activeLaneCount > lastAnnouncedLaneCount
        ) {
            announce(`Lane ${state.activeLaneCount} online.`)
        }
        if (
            lastAnnouncedIntegrity !== null &&
            state.integrity < lastAnnouncedIntegrity
        ) {
            announce(`Integrity at ${state.integrity}.`)
        }
        lastAnnouncedLaneCount = state.activeLaneCount
        lastAnnouncedIntegrity = state.integrity
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const signalSwitchState = state as SignalSwitchState
            // React owns the HUD badges (HPA-393); the callbacks keep the
            // bespoke gate controls and the polite live announcer in sync.
            syncControls(signalSwitchState)
            trackAnnouncements(signalSwitchState)
        },
        onStart: () => {
            // BaseGame.start() calls onStart before onGameStart emits the
            // fresh opening state. Clearing the baselines here keeps the live
            // region silent on run initialization; announcements only fire for
            // actual unlocks and integrity loss during the run.
            lastAnnouncedLaneCount = null
            lastAnnouncedIntegrity = null
        },
        onEnd: (_finalScore: number, stats: BaseGameStats) => {
            const signalSwitchStats = stats as SignalSwitchStats
            // end() flips isActive without emitting a final state change, so
            // re-sync here or active-lane buttons stay enabled after game over.
            syncControls(game.getState())
            announce(
                signalSwitchStats.outcome === 'survived'
                    ? 'Shift complete. You survived the full run.'
                    : 'Signal lost. Systems failed.'
            )
        },
    }

    const game = new SignalSwitchGame(config, enhancedCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // React owns the start/reset/play-again buttons (HPA-393); the bespoke
    // lane-gate controls stay initializer-wired.
    const canvas = renderer.getApp()?.canvas ?? null

    // PixiJSRenderer uses autoDensity: true, which writes inline
    // style.width/style.height in CSS pixels. On a narrow viewport the
    // stylesheet max-width can shrink the width, but the inline height wins
    // over CSS height: auto, stretching the canvas. Override both inline
    // values so the canvas fills its container width and scales its height
    // from the intrinsic aspect ratio.
    if (canvas) {
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
    }

    // React drives the Reset button through this (HPA-393): reset() emits no
    // event, so the gate controls must re-sync explicitly, mirroring the
    // legacy reset handler (renderer + HUD/overlay are React-owned).
    const restart = (): void => {
        game.reset()
        renderer.render(game.getState())
        syncControls(game.getState())
    }
    const gateClickHandler: EventListener = event => {
        const target = event.target instanceof Element ? event.target : null
        const button = target?.closest('[data-signal-lane]')
        if (!button) {
            return
        }
        game.cycleGate(Number((button as HTMLElement).dataset.signalLane))
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
        const laneIndex = KEY_TO_LANE[keyboardEvent.key]
        if (laneIndex === undefined) {
            return
        }
        if (game.cycleGate(laneIndex)) {
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

    listen(gateControls, 'click', gateClickHandler)
    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())
    syncControls(game.getState())

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
        restart,
        cleanup,
    }
}
