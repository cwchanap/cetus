import type { BaseGame, BaseGameState, GameEvent } from '@cetus/games'
import type {
    GameSession,
    GameSessionActions,
    GameSessionCapabilities,
    GameSessionResult,
    GameSessionSnapshot,
} from './types'

type Listener = () => void

function deriveStatus(
    state: BaseGameState
): GameSessionSnapshot<never>['status'] {
    if (state.isGameOver) {
        return 'finished'
    }
    if (!state.gameStarted || !state.isActive) {
        return 'idle'
    }
    return state.isPaused ? 'paused' : 'running'
}

/**
 * Adapt one BaseGame run into a cached-snapshot store for
 * `useSyncExternalStore`. Subscribes once to the six canonical BaseGame
 * events plus the games' shared `state-change` event (DOM-renderer games
 * mutate HUD-only fields — flags, attempts, streaks — without a score or
 * timer event), keeps ONE cached snapshot (status, score, time, projection,
 * result) and
 * notifies subscribers only when a projected value actually changes —
 * `BaseGame.getState()` returns a fresh object every call, so raw state
 * must never leak through as the snapshot. `project` must return the same
 * reference while its projected values are unchanged.
 *
 * End discrimination: every real bare `end` (forwarded from
 * `GameTimer.stop()`) coincides with the game state already reporting the
 * run over, so status derives from state and both end kinds finish the
 * run; only the structured `end` (emitted after BaseGame's own score
 * save) populates `result`. The adapter never submits or re-submits
 * scores, and a stale save resolving during a newer run cannot finish it.
 */
export function createBaseGameSession<TProjected>(
    game: BaseGame,
    project: (state: BaseGameState) => TProjected
): GameSession<TProjected> {
    // BaseGame keeps `config` protected; peek it once for the capability
    // flags (precedent: tests read protected members through a cast too).
    const config = game as unknown as {
        config: { pausable: boolean; resettable: boolean }
    }
    const capabilities: GameSessionCapabilities = {
        pausable: config.config.pausable,
        resettable: config.config.resettable,
    }

    const listeners = new Set<Listener>()
    let disposed = false
    let pendingResult: GameSessionResult | null = null
    const initialState = game.getState()
    let snapshot: GameSessionSnapshot<TProjected> = {
        status: deriveStatus(initialState),
        score: initialState.score,
        timeRemaining: initialState.timeRemaining,
        projected: project(initialState),
        result: null,
    }

    function refresh(): void {
        const state = game.getState()
        const projected = project(state)
        const status = deriveStatus(state)
        // A result describes only the finished run; starting or resetting
        // drops a pending one so a stale save can never leak into a newer run.
        if (status !== 'finished') {
            pendingResult = null
        }
        const result = status === 'finished' ? pendingResult : null
        if (
            snapshot.status === status &&
            snapshot.score === state.score &&
            snapshot.timeRemaining === state.timeRemaining &&
            Object.is(snapshot.projected, projected) &&
            snapshot.result === result
        ) {
            return
        }
        snapshot = {
            status,
            score: state.score,
            timeRemaining: state.timeRemaining,
            projected,
            result,
        }
        for (const listener of [...listeners]) {
            listener()
        }
    }

    function onEvent(): void {
        refresh()
    }

    function onEndEvent(event: GameEvent): void {
        const data = event.data
        // Bare timer end: no payload. Structured end: score + stats.
        if (
            data &&
            typeof data.score === 'number' &&
            typeof data.stats === 'object' &&
            data.stats !== null
        ) {
            const payload = data as {
                score: number
                stats: GameSessionResult['stats']
                newAchievements?: GameSessionResult['newAchievements']
                challengeUpdates?: GameSessionResult['challengeUpdates']
            }
            pendingResult = {
                score: payload.score,
                stats: payload.stats,
                newAchievements: payload.newAchievements,
                challengeUpdates: payload.challengeUpdates,
            }
        }
        refresh()
    }

    game.on('start', onEvent)
    game.on('pause', onEvent)
    game.on('resume', onEvent)
    game.on('end', onEndEvent)
    game.on('score-update', onEvent)
    game.on('time-update', onEvent)
    game.on('state-change', onEvent)

    function subscribe(onStoreChange: Listener): () => void {
        if (disposed) {
            return () => {}
        }
        // Set semantics: subscribing the same listener twice notifies once.
        listeners.add(onStoreChange)
        return () => {
            listeners.delete(onStoreChange)
        }
    }

    function dispose(): void {
        if (disposed) {
            return
        }
        disposed = true
        game.off('start', onEvent)
        game.off('pause', onEvent)
        game.off('resume', onEvent)
        game.off('end', onEndEvent)
        game.off('score-update', onEvent)
        game.off('time-update', onEvent)
        game.off('state-change', onEvent)
        listeners.clear()
    }

    const actions: GameSessionActions = {
        start: () => game.start(),
        pause: () => game.pause(),
        resume: () => game.resume(),
        // reset emits no game event, so refresh the cache explicitly.
        reset: () => {
            game.reset()
            refresh()
        },
    }

    return {
        subscribe,
        getCachedSnapshot: () => snapshot,
        capabilities,
        actions,
        dispose,
    }
}
