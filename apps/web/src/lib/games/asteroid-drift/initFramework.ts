import { AsteroidDriftGame } from './AsteroidDriftGame'
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

function outcomeTitle(outcome: AsteroidDriftOutcome): string {
    if (outcome === 'survived') {
        return 'DRIFT COMPLETE'
    }
    if (outcome === 'expired') {
        return 'DRIFT ENDED'
    }
    return 'SHIP LOST'
}

function outcomeLabel(outcome: AsteroidDriftOutcome): string {
    if (outcome === 'survived') {
        return 'Survived'
    }
    if (outcome === 'expired') {
        return 'Expired'
    }
    return 'Collision'
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

export async function initAsteroidDriftGameFramework(): Promise<
    AsteroidDriftInitResult | undefined
> {
    const container = document.getElementById('asteroid-drift-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('asteroid-drift-container'),
            'AsteroidDrift'
        )
        return undefined
    }

    const config = createAsteroidDriftConfig()
    const renderer = new AsteroidDriftRenderer(
        createAsteroidDriftRendererConfig(config)
    )
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

    const syncHud = (state: AsteroidDriftState): void => {
        setText('orbs-collected', String(state.orbsCollected))
        setText(
            'ship-speed',
            String(
                Math.round(
                    Math.hypot(state.player.velocityX, state.player.velocityY)
                )
            )
        )
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
    }

    const announce = (message: string): void => {
        setText('asteroid-drift-status', message)
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
            syncHud(driftState)
            trackAnnouncements(driftState)
        },
        onScoreUpdate: (score: number) => setText('score', String(score)),
        onTimeUpdate: (timeRemaining: number) =>
            setText('time-remaining', String(timeRemaining)),
        onStart: () => {
            // BaseGame.start() calls onStart before onGameStart emits the
            // fresh opening state. Clearing the baseline here keeps the live
            // region silent on run initialization; announcements only fire
            // for orbs actually collected during the run.
            lastAnnouncedOrbs = null
            setStartVisible(false)
            hideOverlay()
            announce('Drift started.')
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const driftStats = stats as AsteroidDriftStats
            setStartVisible(true)
            setText('game-over-title', outcomeTitle(driftStats.outcome))
            setText('final-outcome', outcomeLabel(driftStats.outcome))
            setText('final-score', String(finalScore))
            setText('final-survival', String(driftStats.survivalSeconds))
            setText('final-orbs', String(driftStats.orbsCollected))
            showOverlay()
            announce(outcomeAnnouncement(driftStats.outcome))
        },
    }

    const game = new AsteroidDriftGame(config, enhancedCallbacks)

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

    const startHandler: EventListener = () => game.start()
    const resetHandler: EventListener = () => {
        game.reset()
        lastAnnouncedOrbs = null
        renderer.render(game.getState())
        syncHud(game.getState())
        hideOverlay()
        setStartVisible(true)
    }
    const playAgainHandler: EventListener = () => {
        hideOverlay()
        // BaseGame.start() auto-resets a completed run and immediately starts
        // it. Do not change Play Again to reset-only: Asteroid Drift expects
        // the next run to be active as soon as this button is pressed.
        game.start()
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

    listen(startButton, 'click', startHandler)
    listen(resetButton, 'click', resetHandler)
    listen(playAgainButton, 'click', playAgainHandler)
    listen(document, 'keydown', keyboardDownHandler)
    listen(document, 'keyup', keyboardUpHandler)
    listen(window, 'blur', blurHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())
    syncHud(game.getState())
    setStartVisible(true)

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
