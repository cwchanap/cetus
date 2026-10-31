// Memory Matrix game initialization using BaseGame framework
import {
    MemoryMatrixGame,
    DEFAULT_MEMORY_MATRIX_CONFIG,
} from '@cetus/games/memory-matrix/MemoryMatrixGame'
import { MemoryMatrixRenderer } from './MemoryMatrixRenderer'
import type { MemoryMatrixConfig } from '@cetus/games/memory-matrix/frameworkTypes'
import type { BaseGameCallbacks, BaseGameState } from '@cetus/games/core/types'
import { handleGameError } from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface MemoryMatrixInitResult {
    game: MemoryMatrixGame
    renderer: MemoryMatrixRenderer
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<MemoryMatrixGame['getState']>
    endGame: () => Promise<void>
}

export async function initMemoryMatrixGameFramework(
    // The island-owned board host (#memory-matrix-container). The renderer
    // mounts into the frozen inner #memory-board grid, so the host itself
    // is only passed for parity with the island mount contract (HPA-393).
    _container: HTMLElement,
    customConfig?: Partial<MemoryMatrixConfig>,
    customCallbacks?: BaseGameCallbacks
): Promise<MemoryMatrixInitResult | undefined> {
    const config: MemoryMatrixConfig = {
        ...DEFAULT_MEMORY_MATRIX_CONFIG,
        ...customConfig,
        submitScore: customConfig?.submitScore ?? submitScore,
    }

    const renderer = new MemoryMatrixRenderer({
        type: 'dom',
        container: '#memory-board',
        cleanOnRender: false,
    })

    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'MemoryMatrix'
        )
        renderer.destroy()
        return undefined
    }

    // React owns the HUD/buttons/overlay (HPA-393): the callbacks only keep
    // the imperative board rendering — every caller callback passes through.
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: (state: BaseGameState) => {
            renderer.render(state)
            customCallbacks?.onStateChange?.(state)
        },
        onStart: () => {
            renderer.render(game.getState())
            customCallbacks?.onStart?.()
        },
    }

    // Create game instance
    const game = new MemoryMatrixGame(config, enhancedCallbacks)

    // Wire card clicks into game logic
    renderer.setCardClickCallback((row, col) => {
        game.flipCard({ row, col })
    })

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    // Set up page unload warning
    const cleanupUnloadWarning = setupUnloadWarning(game)

    // Initial render
    renderer.render(game.getState())

    return {
        game,
        renderer,
        cleanup: () => {
            cleanupUnloadWarning()
            removeForwarder()
            renderer.destroy()
            game.destroy()
        },
        // onGameReset emits state-change, so the onStateChange callback
        // above re-renders the fresh board — a single reset() keeps model,
        // renderer and session on the same final state.
        restart: () => {
            game.reset()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

function setupUnloadWarning(game: MemoryMatrixGame): () => void {
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        const state = game.getState()
        if (state.gameStarted && !state.isGameOver) {
            e.preventDefault()
            const message =
                'You have a game in progress. Are you sure you want to leave?'
            e.returnValue = message
            return message
        }
    }

    window.addEventListener('beforeunload', beforeUnloadHandler)

    return () => {
        window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
}
