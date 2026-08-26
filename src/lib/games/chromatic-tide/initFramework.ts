import type { AchievementNotification } from '@/lib/achievements'
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
import { ChromaticTideGame } from './ChromaticTideGame'
import {
    ChromaticTideRenderer,
    createChromaticTideRendererConfig,
} from './ChromaticTideRenderer'
import {
    CHROMATIC_TIDE_PALETTE,
    CHROMATIC_TIDE_RULES,
    type ChromaticTideColor,
    type ChromaticTideState,
    type ChromaticTideStats,
} from './types'

export interface ChromaticTideInitResult {
    game: ChromaticTideGame
    renderer: ChromaticTideRenderer
    getGame: () => ChromaticTideGame
    getState: () => ReturnType<ChromaticTideGame['getState']>
    restart: () => void
    cleanup: () => void
}

const KEYBOARD_COLORS: Record<string, ChromaticTideColor> = {
    '1': 'teal',
    '2': 'amber',
    '3': 'magenta',
    '4': 'ice',
    '5': 'green',
}

export async function initChromaticTideGameFramework(): Promise<
    ChromaticTideInitResult | undefined
> {
    const container = document.getElementById('chromatic-tide-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('chromatic-tide-container'),
            'ChromaticTide'
        )
        return undefined
    }

    const renderer = new ChromaticTideRenderer(
        createChromaticTideRendererConfig()
    )
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'ChromaticTide'
        )
        renderer.destroy()
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

    const setStartVisible = (visible: boolean): void => {
        const startButton = document.getElementById(
            'start-btn'
        ) as HTMLButtonElement | null
        if (startButton) {
            startButton.style.display = visible ? 'inline-flex' : 'none'
        }
    }

    const hideOverlay = (): void => {
        document.getElementById('game-over-overlay')?.classList.add('hidden')
    }

    const showOverlay = (): void => {
        document.getElementById('game-over-overlay')?.classList.remove('hidden')
    }

    const colorButtons = (): HTMLButtonElement[] =>
        Array.from(
            container.querySelectorAll<HTMLButtonElement>(
                'button[data-tide-color]'
            )
        )

    const syncColorControls = (state: ChromaticTideState): void => {
        const canChoose = state.isActive && state.outcome === 'playing'
        for (const button of colorButtons()) {
            const color = button.dataset.tideColor
            button.disabled = !canChoose
            button.setAttribute(
                'aria-pressed',
                String(color === state.territoryColor)
            )
        }
    }

    const stateSummary = (state: ChromaticTideState): string => {
        const moveLabel = state.movesUsed === 1 ? 'move' : 'moves'
        const totalCells = CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols
        return `Territory ${state.territoryColor}, ${state.capturedCells} of ${totalCells} captured, ${state.movesUsed} ${moveLabel}.`
    }

    const announceState = (state: ChromaticTideState): void => {
        setText('chromatic-tide-status', stateSummary(state))
    }

    const syncHud = (state: ChromaticTideState): void => {
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
        setText('moves', String(state.movesUsed))
        setText(
            'captured',
            `${state.capturedCells} / ${CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols}`
        )
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const tideState = state as ChromaticTideState
            renderer.render(tideState)
            syncHud(tideState)
            syncColorControls(tideState)
            announceState(tideState)
        },
        onScoreUpdate: (score: number) => setText('score', String(score)),
        onTimeUpdate: (timeRemaining: number) =>
            setText('time-remaining', String(timeRemaining)),
        onStart: () => {
            const state = game.getState()
            setStartVisible(false)
            hideOverlay()
            syncColorControls(state)
            announceState(state)
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const tideStats = stats as ChromaticTideStats
            const state = game.getState()
            setStartVisible(true)
            syncColorControls(state)
            setText('game-over-title', getOutcomeTitle(tideStats.outcome))
            setText('final-score', String(finalScore))
            setText('final-outcome', getOutcomeLabel(tideStats.outcome))
            setText('final-moves', String(tideStats.movesUsed))
            setText(
                'final-captured',
                `${tideStats.capturedCells} / ${CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols}`
            )
            setText('final-time', formatTime(tideStats.timeElapsed))
            showOverlay()
            setText(
                'chromatic-tide-status',
                `${getOutcomeAnnouncement(tideStats.outcome)} ${stateSummary(state)}`
            )
        },
    }

    const game = new ChromaticTideGame(undefined, enhancedCallbacks)

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

    const chooseColor = (color: ChromaticTideColor): boolean =>
        game.chooseColor(color)

    for (const button of colorButtons()) {
        const color = button.dataset.tideColor
        if (!isChromaticTideColor(color)) {
            continue
        }
        listen(button, 'click', () => {
            chooseColor(color)
        })
    }

    const startButton = document.getElementById('start-btn')
    const resetButton = document.getElementById('reset-btn')
    const playAgainButton = document.getElementById('play-again-btn')

    const startHandler: EventListener = () => game.start()
    const resetHandler = (): void => {
        game.reset()
        const state = game.getState()
        renderer.render(state)
        syncHud(state)
        syncColorControls(state)
        announceState(state)
        hideOverlay()
        setStartVisible(true)
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

        const color = KEYBOARD_COLORS[keyboardEvent.key]
        if (!color) {
            return
        }

        const state = game.getState()
        if (!state.isActive || state.outcome !== 'playing') {
            return
        }

        keyboardEvent.preventDefault()
        chooseColor(color)
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
    listen(playAgainButton, 'click', resetHandler)
    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    const initialState = game.getState()
    renderer.render(initialState)
    syncHud(initialState)
    syncColorControls(initialState)
    announceState(initialState)
    setStartVisible(true)
    hideOverlay()

    let cleanedUp = false
    const cleanup = (): void => {
        if (cleanedUp) {
            return
        }
        cleanedUp = true
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
        restart: resetHandler,
        cleanup,
    }
}

function isChromaticTideColor(
    value: string | undefined
): value is ChromaticTideColor {
    return Boolean(
        value && CHROMATIC_TIDE_PALETTE.includes(value as ChromaticTideColor)
    )
}

function formatTime(seconds: number): string {
    return `${Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function getOutcomeTitle(outcome: ChromaticTideStats['outcome']): string {
    return outcome === 'cleared' ? 'TIDE COMPLETE!' : 'TIME UP!'
}

function getOutcomeLabel(outcome: ChromaticTideStats['outcome']): string {
    return outcome === 'cleared' ? 'Cleared' : 'Timeout'
}

function getOutcomeAnnouncement(
    outcome: ChromaticTideStats['outcome']
): string {
    return outcome === 'cleared' ? 'Board cleared.' : 'Time expired.'
}
