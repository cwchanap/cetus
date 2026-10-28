import {
    MineGridGame,
    createMineGridConfig,
} from '@cetus/games/mine-grid/MineGridGame'
import {
    createMineGridRendererConfig,
    MineGridRenderer,
} from './MineGridRenderer'
import type {
    MineGridDifficulty,
    MineGridState,
} from '@cetus/games/mine-grid/types'
import type { BaseGameCallbacks, BaseGameState } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface MineGridInitResult {
    game: MineGridGame
    renderer: MineGridRenderer
    getGame: () => MineGridGame
    getState: () => ReturnType<MineGridGame['getState']>
    restart: () => void
    cleanup: () => void
}

export async function initMineGridGameFramework(
    // The island-owned board host (#mine-grid-container). The renderer
    // mounts into the frozen inner #mine-grid-board grid, so the host
    // itself is only passed for parity with the island mount contract
    // (HPA-393).
    _container: HTMLElement
): Promise<MineGridInitResult | undefined> {
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

    const setActionMode = (mode: 'reveal' | 'flag'): void => {
        actionMode = mode
        document
            .getElementById('reveal-mode-btn')
            ?.setAttribute('aria-pressed', String(mode === 'reveal'))
        document
            .getElementById('flag-mode-btn')
            ?.setAttribute('aria-pressed', String(mode === 'flag'))
    }

    const resetPresentation = (): void => {
        setActionMode('reveal')
        setDifficultyButtonsDisabled(false)
    }

    // React owns the HUD/buttons/overlay (HPA-393): the callbacks only keep
    // the bespoke control state (difficulty selectors lock during a run).
    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            renderer.render(state as MineGridState)
        },
        onStart: () => {
            setDifficultyButtonsDisabled(true)
        },
        onEnd: () => {
            setDifficultyButtonsDisabled(false)
        },
    }

    const game = new MineGridGame(
        { ...createMineGridConfig('medium'), submitScore },
        enhancedCallbacks
    )

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    const revealModeButton = document.getElementById('reveal-mode-btn')
    const flagModeButton = document.getElementById('flag-mode-btn')

    const revealModeHandler: EventListener = () => setActionMode('reveal')
    const flagModeHandler: EventListener = () => setActionMode('flag')

    listen(revealModeButton, 'click', revealModeHandler)
    listen(flagModeButton, 'click', flagModeHandler)

    const difficultyHandler =
        (difficulty: MineGridDifficulty): EventListener =>
        () => {
            if (game.newGame(difficulty)) {
                setDifficultySelection(difficulty)
                renderer.render(game.getState())
                resetPresentation()
                // newGame() resets without emitting; announce the fresh
                // state so the React session adapter re-projects the HUD.
                game.emit('state-change', { state: game.getState() })
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

    const resetHandler = (): void => {
        game.reset()
        renderer.render(game.getState())
        resetPresentation()
    }

    renderer.render(game.getState())
    setActionMode('reveal')
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
        removeForwarder()
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
