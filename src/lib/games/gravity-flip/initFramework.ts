import { GravityFlipGame } from './GravityFlipGame'
import {
    createGravityFlipRendererConfig,
    GravityFlipRenderer,
} from './GravityFlipRenderer'
import {
    createGravityFlipConfig,
    type GravityFlipOutcome,
    type GravityFlipState,
    type GravityFlipStats,
} from './types'
import type {
    BaseGameCallbacks,
    BaseGameStats,
    ChallengeUpdates,
} from '@/lib/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'
import type { AchievementNotification } from '@/lib/achievements'

export interface GravityFlipInitResult {
    game: GravityFlipGame
    renderer: GravityFlipRenderer
    getGame: () => GravityFlipGame
    getState: () => ReturnType<GravityFlipGame['getState']>
    cleanup: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false
    }
    return (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    )
}

function outcomeTitle(outcome: GravityFlipOutcome): string {
    return outcome === 'survived' ? 'RUN COMPLETE' : 'GRAVITY LOST'
}

function outcomeLabel(outcome: GravityFlipOutcome): string {
    return outcome === 'survived' ? 'Survived' : 'Collision'
}

export async function initGravityFlipGameFramework(): Promise<
    GravityFlipInitResult | undefined
> {
    const container = document.getElementById('gravity-flip-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('gravity-flip-container'),
            'GravityFlip'
        )
        return undefined
    }

    const config = createGravityFlipConfig()
    const renderer = new GravityFlipRenderer(
        createGravityFlipRendererConfig(config)
    )
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

    const syncHud = (state: GravityFlipState): void => {
        setText(
            'gravity-direction',
            state.gravity === 'down' ? 'FLOOR ↓' : 'CEILING ↑'
        )
        setText('distance-traveled', String(Math.floor(state.distance)))
        setText('stars-collected', String(state.starsCollected))
        setText('flip-count', String(state.flips))
        setText('world-speed', String(Math.round(state.worldSpeed)))
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: state => {
            const gravityFlipState = state as GravityFlipState
            syncHud(gravityFlipState)
        },
        onScoreUpdate: score => setText('score', String(score)),
        onTimeUpdate: timeRemaining =>
            setText('time-remaining', String(timeRemaining)),
        onStart: () => {
            setStartVisible(false)
            hideOverlay()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const gravityFlipStats = stats as GravityFlipStats
            setStartVisible(true)
            setText('game-over-title', outcomeTitle(gravityFlipStats.outcome))
            setText('final-outcome', outcomeLabel(gravityFlipStats.outcome))
            setText('final-score', String(finalScore))
            setText('final-distance', String(gravityFlipStats.distance))
            setText('final-stars', String(gravityFlipStats.starsCollected))
            setText('final-flips', String(gravityFlipStats.flips))
            showOverlay()
        },
    }

    const game = new GravityFlipGame(config, enhancedCallbacks)

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
    const flipButton = document.getElementById('flip-btn')
    const playAgainButton = document.getElementById('play-again-btn')
    const canvas = renderer.getApp()?.canvas ?? null

    const startHandler: EventListener = () => game.start()
    const resetHandler: EventListener = () => {
        game.reset()
        renderer.render(game.getState())
        syncHud(game.getState())
        hideOverlay()
        setStartVisible(true)
    }
    const flipHandler: EventListener = () => {
        game.flipGravity()
    }
    const playAgainHandler: EventListener = () => {
        hideOverlay()
        // BaseGame.start() auto-resets a completed run and immediately starts it.
        // Do not change Play Again to reset-only: Gravity Flip expects the next
        // run to be active as soon as this button is pressed.
        game.start()
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

    listen(startButton, 'click', startHandler)
    listen(resetButton, 'click', resetHandler)
    listen(flipButton, 'click', flipHandler)
    listen(playAgainButton, 'click', playAgainHandler)
    listen(canvas, 'pointerdown', flipHandler)
    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())
    syncHud(game.getState())
    setStartVisible(true)

    let frameId: number | null = null
    let lastUpdateTime = Date.now()

    const frame = (): void => {
        const now = Date.now()
        const deltaSeconds = Math.min((now - lastUpdateTime) / 1000, 0.1)
        lastUpdateTime = now
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
