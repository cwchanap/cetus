import { useCallback, useSyncExternalStore } from 'react'
import type {
    GameSession,
    GameSessionActions,
    GameSessionCapabilities,
    GameSessionSnapshot,
} from './types'

/**
 * Null-session fallback (Astro islands SSR before their effect imports the
 * game): one stable idle snapshot, no-op actions, no capabilities. Only
 * `projected` is unknowable here — callers with a real projection pass
 * `initialSnapshot`.
 */
const DEFAULT_SNAPSHOT: GameSessionSnapshot<never> = {
    status: 'idle',
    score: 0,
    timeRemaining: 0,
    projected: undefined as never,
    result: null,
}

const NOOP_ACTIONS: GameSessionActions = {
    start: () => {},
    pause: () => {},
    resume: () => {},
    reset: () => {},
}

const NO_CAPABILITIES: GameSessionCapabilities = {
    pausable: false,
    resettable: false,
}

function noopSubscribe(): () => void {
    return () => {}
}

/**
 * Track one session adapter. Subscribes once per session (the adapter's
 * bound closures keep the subscription stable) and re-renders only when
 * the cached snapshot reference changes. Callers hide controls for
 * unavailable capabilities; the hook never saves scores itself.
 *
 * SSR-safe for Astro islands: a null session (game not imported yet)
 * renders `initialSnapshot` — or the generic idle default — without
 * touching any store, and the server snapshot is the session's cached
 * snapshot itself, so hydration renders server-consistent state.
 * `initialSnapshot` must be a stable reference (module const).
 */
export function useGameSession<TProjected>(
    session: GameSession<TProjected> | null,
    initialSnapshot?: GameSessionSnapshot<TProjected>
): {
    snapshot: GameSessionSnapshot<TProjected>
    actions: GameSessionActions
    capabilities: GameSessionCapabilities
} {
    const fallback =
        initialSnapshot ?? (DEFAULT_SNAPSHOT as GameSessionSnapshot<TProjected>)
    const getFallback = useCallback(() => fallback, [fallback])
    const snapshot = useSyncExternalStore(
        session?.subscribe ?? noopSubscribe,
        session?.getCachedSnapshot ?? getFallback,
        session?.getCachedSnapshot ?? getFallback
    )
    return {
        snapshot,
        actions: session?.actions ?? NOOP_ACTIONS,
        capabilities: session?.capabilities ?? NO_CAPABILITIES,
    }
}
