import { PatternPulseGame } from './PatternPulseGame'
import { PatternPulseRenderer } from './PatternPulseRenderer'
import {
    createPatternPulseConfig,
    type PatternPad,
    type PatternPulseState,
    type PatternPulseStats,
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

export interface PatternPulseInitResult {
    game: PatternPulseGame
    renderer: PatternPulseRenderer
    getGame: () => PatternPulseGame
    getState: () => ReturnType<PatternPulseGame['getState']>
    restart: () => void
    cleanup: () => void
}

function shortcutToPad(key: string): PatternPad | null {
    if (key === '1') {
        return 0
    }
    if (key === '2') {
        return 1
    }
    if (key === '3') {
        return 2
    }
    if (key === '4') {
        return 3
    }
    return null
}

function statusText(state: PatternPulseState): string {
    if (state.outcome === 'timeout') {
        return 'TIME'
    }
    if (state.outcome === 'mistakes') {
        return 'SIGNAL LOST'
    }
    if (state.phase === 'idle') {
        return 'READY'
    }
    if (state.phase === 'watch') {
        return 'WATCH'
    }
    if (state.phase === 'input') {
        return 'REPEAT'
    }
    if (state.feedback === 'correct') {
        return 'CORRECT'
    }
    if (state.feedback === 'wrong') {
        return 'WRONG — WATCH AGAIN'
    }
    return 'READY'
}

export async function initPatternPulseGameFramework(): Promise<
    PatternPulseInitResult | undefined
> {
    const container = document.getElementById('pattern-pulse-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('pattern-pulse-container'),
            'PatternPulse'
        )
        return undefined
    }

    const renderer = new PatternPulseRenderer()
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'PatternPulse'
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

    const syncHud = (state: PatternPulseState): void => {
        setText('sequence-length', String(state.sequence.length))
        setText('completed-rounds', String(state.completedRounds))
        setText('streak', String(state.streak))
        setText('mistakes', String(state.mistakes))
        setText('time-remaining', String(state.timeRemaining))
        setText('pattern-status', statusText(state))
    }

    const resetPresentation = (): void => {
        hideOverlay()
        setStartVisible(true)
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const patternPulseState = state as PatternPulseState
            renderer.render(patternPulseState)
            syncHud(patternPulseState)
        },
        onScoreUpdate: (score: number) => {
            setText('score', String(score))
        },
        onTimeUpdate: (timeRemaining: number) => {
            setText('time-remaining', String(timeRemaining))
        },
        onStart: () => {
            setStartVisible(false)
            hideOverlay()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const patternPulseStats = stats as PatternPulseStats
            resetPresentation()
            setText('final-score', String(finalScore))
            setText('final-outcome', getOutcomeLabel(patternPulseStats.outcome))
            setText('final-rounds', String(patternPulseStats.completedRounds))
            setText(
                'final-longest-sequence',
                String(patternPulseStats.longestSequence)
            )
            setText('final-max-streak', String(patternPulseStats.maxStreak))
            setText('final-mistakes', String(patternPulseStats.mistakes))
            const title = document.getElementById('game-over-title')
            if (title) {
                title.textContent = getOutcomeTitle(patternPulseStats.outcome)
            }
            document
                .getElementById('game-over-overlay')
                ?.classList.remove('hidden')
        },
    }

    const game = new PatternPulseGame(
        createPatternPulseConfig(),
        enhancedCallbacks
    )

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

    const startHandler: EventListener = () => {
        game.start()
    }
    const resetHandler = (): void => {
        game.reset()
        renderer.render(game.getState())
        syncHud(game.getState())
        resetPresentation()
    }

    listen(startButton, 'click', startHandler)
    listen(resetButton, 'click', resetHandler)
    listen(playAgainButton, 'click', resetHandler)

    // The shortcut listens on `document`; the game stays the final phase
    // authority because `pressPad` gates on the input phase. Auto-repeated
    // keydown events (held keys) are ignored so a held pad cannot consume
    // multiple sequence positions or inflate the speed bonus.
    const keyboardHandler: EventListener = event => {
        if (isEditableTarget(event.target)) {
            return
        }
        const keyboardEvent = event as KeyboardEvent
        if (keyboardEvent.repeat) {
            return
        }
        const pad = shortcutToPad(keyboardEvent.key)
        if (pad === null) {
            return
        }
        game.pressPad(pad)
    }
    listen(document, 'keydown', keyboardHandler)

    renderer.setPadPressCallback(pad => {
        game.pressPad(pad)
    })

    const beforeUnloadHandler: EventListener = event => {
        if (game.getState().isActive) {
            event.preventDefault()
            ;(event as BeforeUnloadEvent).returnValue =
                'You have a game in progress. Are you sure you want to leave?'
        }
    }
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())
    syncHud(game.getState())
    setStartVisible(true)

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

function getOutcomeLabel(outcome: PatternPulseStats['outcome']): string {
    switch (outcome) {
        case 'timeout':
            return 'Timeout'
        case 'mistakes':
            return 'Mistake Limit'
        default:
            return 'Game Over'
    }
}

function getOutcomeTitle(outcome: PatternPulseStats['outcome']): string {
    switch (outcome) {
        case 'timeout':
            return 'TIME UP!'
        case 'mistakes':
            return 'SIGNAL LOST!'
        default:
            return 'GAME OVER!'
    }
}
