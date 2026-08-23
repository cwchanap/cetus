import { SignalSwitchGame } from './SignalSwitchGame'
import {
    createSignalSwitchRendererConfig,
    SignalSwitchRenderer,
} from './SignalSwitchRenderer'
import {
    SIGNAL_SWITCH_SIGNALS,
    createSignalSwitchConfig,
    type SignalSwitchOutcome,
    type SignalSwitchState,
    type SignalSwitchStats,
} from './types'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
    ChallengeUpdates,
} from '@/lib/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'
import { isEditableTarget } from '@/lib/games/shared/utils'
import type { AchievementNotification } from '@/lib/achievements'

export interface SignalSwitchInitResult {
    game: SignalSwitchGame
    renderer: SignalSwitchRenderer
    getGame: () => SignalSwitchGame
    getState: () => ReturnType<SignalSwitchGame['getState']>
    cleanup: () => void
}

const KEY_TO_LANE: Record<string, number> = {
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
}

function outcomeTitle(outcome: SignalSwitchOutcome): string {
    return outcome === 'survived' ? 'SHIFT COMPLETE' : 'SIGNAL LOST'
}

function outcomeLabel(outcome: SignalSwitchOutcome): string {
    return outcome === 'survived' ? 'Survived' : 'Systems failed'
}

export async function initSignalSwitchGameFramework(): Promise<
    SignalSwitchInitResult | undefined
> {
    const container = document.getElementById('signal-switch-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('signal-switch-container'),
            'SignalSwitch'
        )
        return undefined
    }

    const config = createSignalSwitchConfig()
    const renderer = new SignalSwitchRenderer(
        createSignalSwitchRendererConfig(config)
    )
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

    const hideOverlay = (): void => {
        document.getElementById('game-over-overlay')?.classList.add('hidden')
    }

    const showOverlay = (): void => {
        document.getElementById('game-over-overlay')?.classList.remove('hidden')
    }

    const setStartVisible = (visible: boolean): void => {
        const startButton = document.getElementById(
            'start-btn'
        ) as HTMLButtonElement | null
        if (startButton) {
            startButton.style.display = visible ? 'inline-flex' : 'none'
        }
    }

    const totalLanes = config.laneUnlockSeconds.length

    const syncHud = (state: SignalSwitchState): void => {
        setText('signal-switch-integrity', String(state.integrity))
        setText('signal-switch-combo', String(state.combo))
        setText('signal-switch-safe-passes', String(state.safePasses))
        setText(
            'signal-switch-lanes',
            `${state.activeLaneCount} / ${totalLanes}`
        )
        setText('signal-switch-speed', String(Math.round(state.droneSpeed)))
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
    }

    const laneButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
            '#gate-controls [data-signal-lane]'
        )
    )

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
            syncHud(signalSwitchState)
            syncControls(signalSwitchState)
            trackAnnouncements(signalSwitchState)
        },
        onScoreUpdate: (score: number) => setText('score', String(score)),
        onTimeUpdate: (timeRemaining: number) =>
            setText('time-remaining', String(timeRemaining)),
        onStart: () => {
            // BaseGame.start() calls onStart before onGameStart emits the
            // fresh opening state. Clearing the baselines here keeps the live
            // region silent on run initialization; announcements only fire for
            // actual unlocks and integrity loss during the run.
            lastAnnouncedLaneCount = null
            lastAnnouncedIntegrity = null
            setStartVisible(false)
            hideOverlay()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const signalSwitchStats = stats as SignalSwitchStats
            setStartVisible(true)
            setText('game-over-title', outcomeTitle(signalSwitchStats.outcome))
            setText('final-outcome', outcomeLabel(signalSwitchStats.outcome))
            setText('final-score', String(finalScore))
            setText('final-safe-passes', String(signalSwitchStats.safePasses))
            setText('final-crashes', String(signalSwitchStats.crashes))
            setText('final-max-combo', String(signalSwitchStats.maxCombo))
            setText(
                'final-integrity',
                String(signalSwitchStats.integrityRemaining)
            )
            showOverlay()
            announce(
                signalSwitchStats.outcome === 'survived'
                    ? 'Shift complete. You survived the full run.'
                    : 'Signal lost. Systems failed.'
            )
        },
    }

    const game = new SignalSwitchGame(config, enhancedCallbacks)

    const onGameEnd = (event: unknown): void => {
        const data = (event as { data?: unknown }).data as
            | {
                  newAchievements?: AchievementNotification[]
                  challengeUpdates?: ChallengeUpdates
              }
            | undefined
        const globalWindow = window as Window & {
            showAchievementAward?: (
                achievements: AchievementNotification[]
            ) => void
            showChallengeComplete?: (updates: ChallengeUpdates) => void
        }
        if (data?.newAchievements?.length) {
            globalWindow.showAchievementAward?.(data.newAchievements)
        }
        if (data?.challengeUpdates?.completedChallenges?.length) {
            globalWindow.showChallengeComplete?.(data.challengeUpdates)
        }
    }
    game.on('end', onGameEnd)

    const startButton = document.getElementById('start-btn')
    const resetButton = document.getElementById('reset-btn')
    const playAgainButton = document.getElementById('play-again-btn')
    const gateControls = document.getElementById('gate-controls')
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

    const startHandler: EventListener = () => game.start()
    const resetHandler: EventListener = () => {
        game.reset()
        renderer.render(game.getState())
        syncHud(game.getState())
        syncControls(game.getState())
        hideOverlay()
        setStartVisible(true)
    }
    const playAgainHandler: EventListener = () => {
        hideOverlay()
        // BaseGame.start() auto-resets a completed run and immediately starts
        // it. Do not change Play Again to reset-only: Signal Switch expects
        // the next run to be active as soon as this button is pressed.
        game.start()
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

    listen(startButton, 'click', startHandler)
    listen(resetButton, 'click', resetHandler)
    listen(playAgainButton, 'click', playAgainHandler)
    listen(gateControls, 'click', gateClickHandler)
    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())
    syncHud(game.getState())
    syncControls(game.getState())
    setStartVisible(true)

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
        game.off('end', onGameEnd)
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
