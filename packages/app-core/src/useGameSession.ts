import { useSyncExternalStore } from 'react'
import type {
    GameSession,
    GameSessionActions,
    GameSessionCapabilities,
    GameSessionSnapshot,
} from './types'

/**
 * Track one session adapter. Subscribes once per session (the adapter's
 * bound closures keep the subscription stable) and re-renders only when
 * the cached snapshot reference changes. Callers hide controls for
 * unavailable capabilities; the hook never saves scores itself.
 */
export function useGameSession<TProjected>(session: GameSession<TProjected>): {
    snapshot: GameSessionSnapshot<TProjected>
    actions: GameSessionActions
    capabilities: GameSessionCapabilities
} {
    const snapshot = useSyncExternalStore(
        session.subscribe,
        session.getCachedSnapshot
    )
    return {
        snapshot,
        actions: session.actions,
        capabilities: session.capabilities,
    }
}
