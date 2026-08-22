import { PotionSorterGame, createPotionSorterConfig } from './PotionSorterGame'
import {
    createPotionSorterRendererConfig,
    PotionSorterRenderer,
} from './PotionSorterRenderer'
import { hasLegalMove } from './puzzle'
import type {
    PotionSorterDifficulty,
    PotionSorterResult,
    PotionSorterState,
    PotionSorterStats,
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
import type { AchievementNotification } from '@/lib/achievements'

export interface PotionSorterInitResult {
    game: PotionSorterGame
    renderer: PotionSorterRenderer
    getGame: () => PotionSorterGame
    getState: () => ReturnType<PotionSorterGame['getState']>
    restart: () => void
    cleanup: () => void
}

export async function initPotionSorterGameFramework(): Promise<
    PotionSorterInitResult | undefined
> {
    const container = document.getElementById('potion-sorter-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('potion-sorter-container'),
            'PotionSorter'
        )
        return undefined
    }

    const renderer = new PotionSorterRenderer(
        createPotionSorterRendererConfig()
    )
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'PotionSorter'
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

    const setStatus = (text: string): void => {
        setText('potion-sorter-status', text)
    }

    const setStartVisible = (visible: boolean): void => {
        const startButton = document.getElementById(
            'start-btn'
        ) as HTMLButtonElement | null
        if (startButton) {
            startButton.style.display = visible ? 'inline-flex' : 'none'
        }
    }

    const setDifficultyButtonsDisabled = (disabled: boolean): void => {
        for (const id of ['easy-btn', 'medium-btn', 'hard-btn']) {
            const button = document.getElementById(
                id
            ) as HTMLButtonElement | null
            if (button) {
                button.disabled = disabled
            }
        }
    }

    const setDifficultySelection = (
        difficulty: PotionSorterDifficulty
    ): void => {
        for (const candidate of ['easy', 'medium', 'hard'] as const) {
            const button = document.getElementById(
                `${candidate}-btn`
            ) as HTMLButtonElement | null
            if (!button) {
                continue
            }
            button.setAttribute(
                'aria-pressed',
                String(candidate === difficulty)
            )
        }
    }

    const hideOverlay = (): void => {
        document.getElementById('game-over-overlay')?.classList.add('hidden')
    }

    const syncHud = (state: PotionSorterState): void => {
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
        setText('difficulty', capitalize(state.difficulty))
        setText('moves', String(state.movesMade))
        setText('undos', String(state.undosUsed))
    }

    const syncUndoButton = (): void => {
        const button = document.getElementById(
            'undo-btn'
        ) as HTMLButtonElement | null
        if (!button) {
            return
        }

        const state = game.getState()
        const deadEnded =
            state.isActive &&
            state.result === 'playing' &&
            !hasLegalMove(state.tubes)

        button.disabled = !game.canUndo()
        button.dataset.deadEnd = String(deadEnded)
    }

    const resetPresentation = (): void => {
        setStatus('Ready.')
        hideOverlay()
        setStartVisible(true)
        setDifficultyButtonsDisabled(false)
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const potionSorterState = state as PotionSorterState
            renderer.render(potionSorterState)
            syncHud(potionSorterState)
            syncUndoButton()
        },
        onScoreUpdate: (score: number) => {
            setText('score', String(score))
        },
        onTimeUpdate: (timeRemaining: number) => {
            setText('time-remaining', String(timeRemaining))
        },
        onStart: () => {
            setStartVisible(false)
            setDifficultyButtonsDisabled(true)
            hideOverlay()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const potionSorterStats = stats as PotionSorterStats
            setStartVisible(true)
            setDifficultyButtonsDisabled(false)
            syncUndoButton()
            setText('final-score', String(finalScore))
            setText('final-outcome', getOutcomeLabel(potionSorterStats.result))
            setText(
                'final-difficulty',
                capitalize(potionSorterStats.difficulty)
            )
            setText('final-moves', String(potionSorterStats.movesMade))
            setText('final-undos', String(potionSorterStats.undosUsed))
            setText('final-time', formatTime(potionSorterStats.timeElapsed))
            const title = document.getElementById('game-over-title')
            if (title) {
                title.textContent = getOutcomeTitle(potionSorterStats.result)
            }
            document
                .getElementById('game-over-overlay')
                ?.classList.remove('hidden')
        },
    }

    const game = new PotionSorterGame(
        createPotionSorterConfig('medium'),
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
    const undoButton = document.getElementById('undo-btn')

    const startHandler: EventListener = () => {
        game.start()
    }
    const resetHandler = (): void => {
        game.reset()
        renderer.render(game.getState())
        syncHud(game.getState())
        resetPresentation()
        syncUndoButton()
    }
    const undoHandler: EventListener = () => {
        if (game.undo()) {
            setStatus('Last pour undone.')
        }
        syncUndoButton()
    }

    listen(startButton, 'click', startHandler)
    listen(resetButton, 'click', resetHandler)
    listen(playAgainButton, 'click', resetHandler)
    listen(undoButton, 'click', undoHandler)

    const difficultyHandler =
        (difficulty: PotionSorterDifficulty): EventListener =>
        () => {
            if (game.newGame(difficulty)) {
                setDifficultySelection(difficulty)
                renderer.render(game.getState())
                syncHud(game.getState())
                resetPresentation()
                syncUndoButton()
            }
        }
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        listen(
            document.getElementById(`${difficulty}-btn`),
            'click',
            difficultyHandler(difficulty)
        )
    }

    renderer.setTubeActionCallback(index => {
        const result = game.activateTube(index)
        switch (result) {
            case 'selected':
                setStatus(`Selected tube ${index + 1}.`)
                break
            case 'deselected':
                setStatus('Selection cleared.')
                break
            case 'poured': {
                const state = game.getState()
                setStatus(
                    state.result === 'playing' && !hasLegalMove(state.tubes)
                        ? 'No pours left — undo or reset.'
                        : 'Potion poured.'
                )
                break
            }
            case 'invalid':
                setStatus('That pour is not allowed.')
                break
        }
        syncUndoButton()
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
    setDifficultyButtonsDisabled(false)
    setDifficultySelection(game.getState().difficulty)
    syncUndoButton()

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

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatTime(seconds: number): string {
    return `${Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function getOutcomeLabel(result: PotionSorterResult): string {
    switch (result) {
        case 'solved':
            return 'Solved'
        case 'timeout':
            return 'Timeout'
        default:
            return 'Game Over'
    }
}

function getOutcomeTitle(result: PotionSorterResult): string {
    switch (result) {
        case 'solved':
            return 'SOLVED!'
        case 'timeout':
            return 'TIME UP!'
        default:
            return 'GAME OVER!'
    }
}
