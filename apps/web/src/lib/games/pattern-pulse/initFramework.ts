import { PatternPulseGame } from '@cetus/games/pattern-pulse/PatternPulseGame'
import { PatternPulseRenderer } from './PatternPulseRenderer'
import {
    createPatternPulseConfig,
    type PatternPad,
    type PatternPulseState,
} from '@cetus/games/pattern-pulse/types'
import type { BaseGameCallbacks, BaseGameState } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'
import { isEditableTarget } from '@/lib/keyboard'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

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

export async function initPatternPulseGameFramework(
    // The island-owned board host (#pattern-pulse-container). The renderer
    // mounts into the frozen inner #pattern-pulse-board pad grid, so the
    // host itself is only passed for parity with the island mount contract
    // (HPA-393).
    _container: HTMLElement
): Promise<PatternPulseInitResult | undefined> {
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

    // React owns the HUD/buttons/overlay (HPA-393): the callbacks only keep
    // the imperative pad rendering — every caller callback passes through.
    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            renderer.render(state as PatternPulseState)
        },
    }

    const game = new PatternPulseGame(
        { ...createPatternPulseConfig(), submitScore },
        enhancedCallbacks
    )

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

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

    // onGameReset emits state-change, so the onStateChange callback above
    // re-renders the fresh sequence — a single reset() keeps model, renderer
    // and session on the same final state (a second reset would draw another
    // RNG sequence the renderer never shows).
    const resetHandler = (): void => {
        game.reset()
    }

    renderer.render(game.getState())

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
