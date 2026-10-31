import type { BaseGameCallbacks, BaseGameState } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'
import { isEditableTarget } from '@/lib/keyboard'
import { ChromaticTideGame } from '@cetus/games/chromatic-tide/ChromaticTideGame'
import {
    ChromaticTideRenderer,
    createChromaticTideRendererConfig,
} from './ChromaticTideRenderer'
import {
    CHROMATIC_TIDE_PALETTE,
    CHROMATIC_TIDE_RULES,
    type ChromaticTideColor,
    type ChromaticTideOutcome,
    type ChromaticTideState,
} from '@cetus/games/chromatic-tide/types'
import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface ChromaticTideInitResult {
    game: ChromaticTideGame
    renderer: ChromaticTideRenderer
    getGame: () => ChromaticTideGame
    getState: () => ReturnType<ChromaticTideGame['getState']>
    cleanup: () => void
}

const KEYBOARD_COLORS: Record<string, ChromaticTideColor> = {
    '1': 'teal',
    '2': 'amber',
    '3': 'magenta',
    '4': 'ice',
    '5': 'green',
}

export async function initChromaticTideGameFramework(
    // The island-owned board host (#chromatic-tide-container). The renderer
    // mounts into the frozen inner #chromatic-tide-board grid and the color
    // buttons live beside it inside the host (HPA-393).
    container: HTMLElement
): Promise<ChromaticTideInitResult | undefined> {
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
        const status = document.getElementById('chromatic-tide-status')
        if (status) {
            status.textContent = stateSummary(state)
        }
    }

    // React owns the HUD/buttons/overlay (HPA-393): the callbacks only keep
    // the bespoke control state (color availability/pressed state) and the
    // polite live announcer.
    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const tideState = state as ChromaticTideState
            renderer.render(tideState)
            syncColorControls(tideState)
            announceState(tideState)
        },
        onStart: () => {
            const state = game.getState()
            syncColorControls(state)
            announceState(state)
        },
        onEnd: () => {
            const state = game.getState()
            syncColorControls(state)
            const outcomeAnnouncement = getOutcomeAnnouncement(state.outcome)
            const status = document.getElementById('chromatic-tide-status')
            if (status) {
                status.textContent = [outcomeAnnouncement, stateSummary(state)]
                    .filter(Boolean)
                    .join(' ')
            }
        },
    }

    const game = new ChromaticTideGame({ submitScore }, enhancedCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

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

    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    const initialState = game.getState()
    renderer.render(initialState)
    syncColorControls(initialState)
    announceState(initialState)

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

function isChromaticTideColor(
    value: string | undefined
): value is ChromaticTideColor {
    return Boolean(
        value && CHROMATIC_TIDE_PALETTE.includes(value as ChromaticTideColor)
    )
}

function getOutcomeAnnouncement(outcome: ChromaticTideOutcome): string {
    switch (outcome) {
        case 'cleared':
            return 'Board cleared.'
        case 'timeout':
            return 'Time expired.'
        case 'playing':
            return ''
    }
}
