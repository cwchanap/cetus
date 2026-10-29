import {
    RhythmReactorGame,
    createRhythmReactorConfig,
} from '@cetus/games/rhythm-reactor/RhythmReactorGame'
import {
    createRhythmReactorRendererConfig,
    RhythmReactorRenderer,
} from './RhythmReactorRenderer'
import type {
    RhythmReactorLane,
    RhythmReactorState,
} from '@cetus/games/rhythm-reactor/types'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
} from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'
import { isEditableTarget } from '@/lib/keyboard'
import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface RhythmReactorInitResult {
    game: RhythmReactorGame
    renderer: RhythmReactorRenderer
    getGame: () => RhythmReactorGame
    getState: () => ReturnType<RhythmReactorGame['getState']>
    /** React-owned Reset re-syncs the bespoke lane controls through this
     * (HPA-393): reset() emits no event, so the island calls restart(). */
    restart: () => void
    cleanup: () => void
}

const KEY_TO_LANE: Record<string, RhythmReactorLane> = {
    d: 0,
    f: 1,
    j: 2,
    k: 3,
}

export async function initRhythmReactorGameFramework(
    container: HTMLElement
): Promise<RhythmReactorInitResult | undefined> {
    const config = { ...createRhythmReactorConfig(), submitScore }
    // The renderer mounts via a selector; derive it from the ref'd host
    // element (which keeps the frozen `#rhythm-reactor-canvas` e2e id —
    // the canvas div lives inside the ref'd board container).
    const renderer = new RhythmReactorRenderer({
        ...createRhythmReactorRendererConfig(config),
        container: `#${CSS.escape(container.id)} #rhythm-reactor-canvas`,
    })
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'RhythmReactor'
        )
        try {
            renderer.destroy()
        } catch (cleanupError) {
            handleGameError(cleanupError, 'RhythmReactor')
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

    // The HUD badges and score/time spans keep a synchronous DOM writer
    // (HPA-393): the frozen e2e reads them in the same JS tick as a
    // debug-handle mutation (performPerfectRhythmInput), which React's
    // batched re-render can never satisfy. React renders the same values
    // from the session projection; both writers derive from the same state
    // with identical formulas. Overlay/buttons/final stats are React-only.
    const setText = (id: string, value: string): void => {
        const element = document.getElementById(id)
        if (element) {
            element.textContent = value
        }
    }

    const syncHud = (state: RhythmReactorState): void => {
        const hits = state.perfectHits + state.goodHits
        const judgment = state.lastJudgment?.toUpperCase() ?? 'READY'
        setText('rhythm-reactor-combo', String(state.combo))
        setText('rhythm-reactor-hits', String(hits))
        setText('rhythm-reactor-judgment', judgment)
        setText('rhythm-reactor-stability', String(state.stability))
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
    }

    const announce = (message: string): void => {
        const element = document.getElementById('rhythm-reactor-status')
        if (element) {
            element.textContent = message
        }
    }

    // The bespoke lane-button controls live in the React-owned sidebar
    // card (outside the board host), so they are looked up by their
    // frozen id — same pattern as Signal Switch's gate controls (HPA-393).
    const laneButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
            '#rhythm-reactor-controls [data-rhythm-lane]'
        )
    )

    const syncControls = (state: RhythmReactorState): void => {
        for (const button of laneButtons) {
            button.disabled = !state.isActive || state.isGameOver
        }
    }

    let lastJudgmentAnnouncement = ''
    let lastAnnouncedStrayPresses = 0
    const trackAnnouncements = (state: RhythmReactorState): void => {
        if (!state.lastJudgment) {
            lastJudgmentAnnouncement = `${state.perfectHits}:${state.goodHits}:${state.misses}:${state.strayPresses}:`
            lastAnnouncedStrayPresses = state.strayPresses
            return
        }

        const announcementKey = `${state.perfectHits}:${state.goodHits}:${state.misses}:${state.strayPresses}:${state.lastJudgment}`
        if (announcementKey !== lastJudgmentAnnouncement) {
            announce(
                state.strayPresses > lastAnnouncedStrayPresses
                    ? 'Stray press.'
                    : state.lastJudgment === 'miss'
                      ? 'Miss.'
                      : `${state.lastJudgment.toUpperCase()} hit.`
            )
        }
        lastJudgmentAnnouncement = announcementKey
        lastAnnouncedStrayPresses = state.strayPresses
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const rhythmReactorState = state as RhythmReactorState
            // React owns the overlay/buttons/final stats (HPA-393); the
            // callbacks keep the HUD badges (same-tick e2e contract), the
            // bespoke lane controls and the polite live announcer in sync.
            syncHud(rhythmReactorState)
            syncControls(rhythmReactorState)
            trackAnnouncements(rhythmReactorState)
        },
        onScoreUpdate: (score: number) => setText('score', String(score)),
        onTimeUpdate: (timeRemaining: number) =>
            setText('time-remaining', String(timeRemaining)),
        onStart: () => {
            lastJudgmentAnnouncement = ''
            announce('Rhythm Reactor started.')
        },
        onEnd: (_finalScore: number, _stats: BaseGameStats) => {
            // end() flips isActive without emitting a final state change, so
            // re-sync here or active-lane buttons stay enabled after game over.
            syncControls(game.getState())
            announce('Run complete.')
        },
    }

    const game = new RhythmReactorGame(config, enhancedCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // React owns the start/reset/play-again buttons (HPA-393); the bespoke
    // lane controls stay initializer-wired.
    const laneControls = document.getElementById('rhythm-reactor-controls')
    const canvas = renderer.getApp()?.canvas ?? null

    if (canvas) {
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
    }

    // React drives the Reset button through this (HPA-393): reset() emits no
    // event, so the lane controls must re-sync explicitly, mirroring the
    // legacy reset handler (renderer + HUD/overlay are React-owned).
    const restart = (): void => {
        game.reset()
        renderer.render(game.getState())
        syncHud(game.getState())
        syncControls(game.getState())
        lastJudgmentAnnouncement = ''
        announce('Ready.')
    }
    const laneClickHandler: EventListener = event => {
        const target = event.target instanceof Element ? event.target : null
        const button = target?.closest('[data-rhythm-lane]')
        if (!button || !laneControls?.contains(button)) {
            return
        }
        game.hitLane(Number((button as HTMLElement).dataset.rhythmLane))
    }
    const keyboardHandler: EventListener = event => {
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
        // Enter/Space on a focused button synthesizes a click, which would
        // double-fire lane hits through laneClickHandler. Lane keys (D/F/J/K)
        // must stay reachable while a lane button holds focus.
        if (
            keyboardEvent.target instanceof HTMLButtonElement &&
            (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ')
        ) {
            return
        }
        const laneIndex = KEY_TO_LANE[keyboardEvent.key.toLowerCase()]
        if (laneIndex === undefined) {
            return
        }
        if (game.hitLane(laneIndex).accepted) {
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

    listen(laneControls, 'click', laneClickHandler)
    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())
    syncHud(game.getState())
    syncControls(game.getState())

    let frameId: number | null = null
    let lastFrameTime: number | null = null

    const frame = (timestamp: number): void => {
        const delta =
            lastFrameTime === null
                ? 0
                : Math.min(
                      (timestamp - lastFrameTime) / 1000,
                      config.maxUpdateDelta
                  )
        lastFrameTime = timestamp
        const state = game.getState()
        if (state.isActive && !state.isPaused) {
            game.update(delta)
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
