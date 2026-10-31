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

    // React owns the HUD/buttons/overlay (HPA-393): the callbacks keep the
    // bespoke controls derived from live state — tube rendering, the
    // undo/dead-end emphasis, and the difficulty lock/selection follow every
    // state-change (start, game over, a mid-run reset emitted via
    // onGameReset rather than onEnd); a fresh idle state restores 'Ready.'.
    const syncControls = (state: PotionSorterState): void => {
        setDifficultyButtonsDisabled(state.isActive && !state.isGameOver)
        setDifficultySelection(state.difficulty)
        if (!state.isActive && !state.isGameOver) {
            setStatus('Ready.')
        }
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const potionSorterState = state as PotionSorterState
            renderer.render(potionSorterState)
            syncControls(potionSorterState)
            syncUndoButton()
        },
        // end() flips isActive without emitting state-change, so re-sync
        // here or the difficulty buttons stay locked after game over.
        onEnd: () => {
            syncControls(game.getState())
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

    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        listen(
            document.getElementById(`${difficulty}-btn`),
            'click',
            // newGame() resets through reset() → onGameReset →
            // emitStateChange, which re-renders and re-derives the
            // controls — no manual render/emit per click.
            () => {
                game.newGame(difficulty)
            }
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
        cleanup,
    }
}
