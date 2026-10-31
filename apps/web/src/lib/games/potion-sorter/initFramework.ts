import {
    PotionSorterGame,
    createPotionSorterConfig,
} from '@cetus/games/potion-sorter/PotionSorterGame'
import {
    createPotionSorterRendererConfig,
    PotionSorterRenderer,
} from './PotionSorterRenderer'
import { hasLegalMove } from '@cetus/games/potion-sorter/puzzle'
import type {
    PotionSorterDifficulty,
    PotionSorterState,
} from '@cetus/games/potion-sorter/types'
import type { BaseGameCallbacks, BaseGameState } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface PotionSorterInitResult {
    game: PotionSorterGame
    renderer: PotionSorterRenderer
    getGame: () => PotionSorterGame
    getState: () => ReturnType<PotionSorterGame['getState']>
    restart: () => void
    syncPresentation: () => void
    cleanup: () => void
}

export async function initPotionSorterGameFramework(
    // The island-owned board host (#potion-sorter-container). The renderer
    // mounts into the frozen inner #potion-sorter-board, so the host itself
    // is only passed for parity with the island mount contract (HPA-393).
    _container: HTMLElement
): Promise<PotionSorterInitResult | undefined> {
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

    const setStatus = (text: string): void => {
        const status = document.getElementById('potion-sorter-status')
        if (status) {
            status.textContent = text
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
        setDifficultyButtonsDisabled(false)
    }

    // React owns the HUD/buttons/overlay (HPA-393): the callbacks only keep
    // the bespoke control state (tube rendering, undo/dead-end emphasis,
    // difficulty selectors lock during a run).
    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const potionSorterState = state as PotionSorterState
            renderer.render(potionSorterState)
            syncUndoButton()
        },
        onStart: () => {
            setDifficultyButtonsDisabled(true)
        },
        onEnd: () => {
            setDifficultyButtonsDisabled(false)
            syncUndoButton()
        },
    }

    const game = new PotionSorterGame(
        { ...createPotionSorterConfig('medium'), submitScore },
        enhancedCallbacks
    )

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    const undoButton = document.getElementById('undo-btn')

    const undoHandler: EventListener = () => {
        if (game.undo()) {
            setStatus('Last pour undone.')
        }
        syncUndoButton()
    }

    listen(undoButton, 'click', undoHandler)

    const difficultyHandler =
        (difficulty: PotionSorterDifficulty): EventListener =>
        () => {
            if (game.newGame(difficulty)) {
                setDifficultySelection(difficulty)
                renderer.render(game.getState())
                resetPresentation()
                syncUndoButton()
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

    // Render-only sync after a session-driven reset: onGameReset already
    // emitted state-change (onStateChange re-rendered the fresh tubes and
    // re-synced undo), so this restores the idle status/difficulty lock
    // without a second reset() (HPA-393).
    const syncPresentation = (): void => {
        renderer.render(game.getState())
        resetPresentation()
        syncUndoButton()
    }

    const resetHandler = (): void => {
        game.reset()
        syncPresentation()
    }

    renderer.render(game.getState())
    setStatus('Ready.')
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
        syncPresentation,
        cleanup,
    }
}
