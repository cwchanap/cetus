import { MineGridGame, createMineGridConfig } from './MineGridGame'
import {
    createMineGridRendererConfig,
    MineGridRenderer,
} from './MineGridRenderer'
import {
    MINE_GRID_PRESETS,
    type MineGridDifficulty,
    type MineGridState,
    type MineGridStats,
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

export interface MineGridInitResult {
    game: MineGridGame
    renderer: MineGridRenderer
    getGame: () => MineGridGame
    getState: () => ReturnType<MineGridGame['getState']>
    restart: () => void
    cleanup: () => void
}

export async function initMineGridGameFramework(): Promise<
    MineGridInitResult | undefined
> {
    const container = document.getElementById('mine-grid-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('mine-grid-container'),
            'MineGrid'
        )
        return undefined
    }

    const renderer = new MineGridRenderer(createMineGridRendererConfig())
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'MineGrid'
        )
        renderer.destroy()
        return undefined
    }

    let actionMode: 'reveal' | 'flag' = 'reveal'
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

    // `aria-pressed` is the single source of truth for the selected difficulty
    // button — the page's scoped CSS keys the primary styling off it, so this
    // only toggles the attribute (no class swapping).
    const setDifficultySelection = (difficulty: MineGridDifficulty): void => {
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

    const setActionMode = (mode: 'reveal' | 'flag'): void => {
        actionMode = mode
        document
            .getElementById('reveal-mode-btn')
            ?.setAttribute('aria-pressed', String(mode === 'reveal'))
        document
            .getElementById('flag-mode-btn')
            ?.setAttribute('aria-pressed', String(mode === 'flag'))
    }

    const syncHud = (state: MineGridState): void => {
        const preset = MINE_GRID_PRESETS[state.difficulty]
        setText('difficulty', capitalize(state.difficulty))
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
        setText('flags', String(state.flagsPlaced))
        setText(
            'safe-progress',
            `${state.revealedSafeCells} / ${preset.rows * preset.cols - preset.mines}`
        )
    }

    const resetPresentation = (): void => {
        setActionMode('reveal')
        hideOverlay()
        setStartVisible(true)
        setDifficultyButtonsDisabled(false)
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: state => {
            const mineGridState = state as MineGridState
            renderer.render(mineGridState)
            syncHud(mineGridState)
        },
        onScoreUpdate: score => {
            setText('score', String(score))
        },
        onTimeUpdate: timeRemaining => {
            setText('time-remaining', String(timeRemaining))
        },
        onStart: () => {
            setStartVisible(false)
            setDifficultyButtonsDisabled(true)
            hideOverlay()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const mineGridStats = stats as MineGridStats
            setStartVisible(true)
            setDifficultyButtonsDisabled(false)
            setText('final-score', String(finalScore))
            setText('final-outcome', getOutcomeLabel(mineGridStats.result))
            setText('final-difficulty', capitalize(mineGridStats.difficulty))
            setText('final-time', formatTime(mineGridStats.timeElapsed))
            setText(
                'final-incorrect-flags',
                String(mineGridStats.incorrectFlagActions)
            )
            const title = document.getElementById('game-over-title')
            if (title) {
                title.textContent = getOutcomeTitle(mineGridStats.result)
            }
            document
                .getElementById('game-over-overlay')
                ?.classList.remove('hidden')
        },
    }

    const game = new MineGridGame(
        createMineGridConfig('medium'),
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
    const revealModeButton = document.getElementById('reveal-mode-btn')
    const flagModeButton = document.getElementById('flag-mode-btn')

    const startHandler: EventListener = () => {
        game.start()
    }
    const resetHandler = (): void => {
        game.reset()
        renderer.render(game.getState())
        syncHud(game.getState())
        resetPresentation()
    }
    const revealModeHandler: EventListener = () => setActionMode('reveal')
    const flagModeHandler: EventListener = () => setActionMode('flag')

    listen(startButton, 'click', startHandler)
    listen(resetButton, 'click', resetHandler)
    listen(playAgainButton, 'click', resetHandler)
    listen(revealModeButton, 'click', revealModeHandler)
    listen(flagModeButton, 'click', flagModeHandler)

    const difficultyHandler =
        (difficulty: MineGridDifficulty): EventListener =>
        () => {
            if (game.newGame(difficulty)) {
                setDifficultySelection(difficulty)
                renderer.render(game.getState())
                syncHud(game.getState())
                resetPresentation()
            }
        }
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        listen(
            document.getElementById(`${difficulty}-btn`),
            'click',
            difficultyHandler(difficulty)
        )
    }

    renderer.setCellActionCallback((row, col, action) => {
        if (action === 'flag' || actionMode === 'flag') {
            game.toggleFlag(row, col)
        } else {
            game.revealCell(row, col)
        }
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
    setActionMode('reveal')
    setStartVisible(true)
    setDifficultyButtonsDisabled(false)
    setDifficultySelection(game.getState().difficulty)

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

function getOutcomeLabel(result: MineGridStats['result']): string {
    switch (result) {
        case 'cleared':
            return 'Cleared'
        case 'mine':
            return 'Mine Detonated'
        case 'timeout':
            return 'Timeout'
        default:
            return 'Game Over'
    }
}

function getOutcomeTitle(result: MineGridStats['result']): string {
    switch (result) {
        case 'cleared':
            return 'GRID CLEARED!'
        case 'mine':
            return 'MINE DETONATED'
        case 'timeout':
            return 'TIMEOUT'
        default:
            return 'GAME OVER!'
    }
}
