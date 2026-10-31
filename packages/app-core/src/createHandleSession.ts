import type {
    GameSession,
    GameSessionActions,
    GameSessionCapabilities,
    GameSessionResult,
    GameSessionSnapshot,
} from './types'

type Listener = () => void

const NOOP_ACTIONS: GameSessionActions = {
    start: () => {},
    pause: () => {},
    resume: () => {},
    reset: () => {},
}

/**
 * Imperative setters a web island calls from a handle-based game
 * initializer's UI callbacks (`onStart`/`onEnd`/`onTimeUpdate`/…). The
 * session stays a pure state container — no DOM, no event emitter, no
 * score submission: the handle game owns its control flow and its
 * `saveGameScore` persistence/toasts.
 */
export interface HandleSessionHandlers<TProjected> {
    onStart(): void
    onPause?(): void
    onResume?(): void
    /** Display-only result of a finished run; never a toast source. */
    onEnd(result: GameSessionResult): void
    /**
     * Return to the pre-start state without a game callback — e.g. a
     * manual stop whose initializer only cancels the run (Satellite
     * Sync's end button fires nothing; its chrome must go back to idle).
     */
    onIdle?(): void
    onScore?(score: number): void
    onTime?(timeRemaining: number): void
    setProjected(projected: TProjected): void
}

export interface HandleSessionConfig<TProjected> {
    capabilities: GameSessionCapabilities
    /** Initial (usually idle) snapshot; stays the stable SSR snapshot. */
    snapshot: GameSessionSnapshot<TProjected>
    /** Defaults to no-ops: handle games own their control flow. */
    actions?: Partial<GameSessionActions>
}

/**
 * State container for one handle-based game run (HPA-393 §3). Keeps ONE
 * cached snapshot — the configured object itself until a handler first
 * changes a field — and notifies subscribers only when a handler actually
 * changes something, so `useSyncExternalStore` never re-renders on
 * no-change callback bursts. `setProjected` compares by reference: pass a
 * stable projected object and reallocate it only when a projected value
 * changes (same discipline as the BaseGame adapter's projector).
 *
 * There are no external listeners to remove, so `dispose` only clears
 * subscribers and is idempotent; the shape matches the BaseGame adapter
 * so islands tear both down the same way.
 */
export function createHandleSession<TProjected>(
    config: HandleSessionConfig<TProjected>
): {
    session: GameSession<TProjected>
    handlers: HandleSessionHandlers<TProjected>
} {
    const listeners = new Set<Listener>()
    let disposed = false
    let snapshot = config.snapshot

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

    function update(patch: Partial<GameSessionSnapshot<TProjected>>): void {
        const changed = (Object.keys(patch) as Array<keyof typeof patch>).some(
            key => !Object.is(snapshot[key], patch[key])
        )
        if (!changed) {
            return
        }
        snapshot = { ...snapshot, ...patch }
        for (const listener of [...listeners]) {
            listener()
        }
    }

    const handlers: HandleSessionHandlers<TProjected> = {
        onStart: () => update({ status: 'running' }),
        onPause: () => update({ status: 'paused' }),
        onResume: () => update({ status: 'running' }),
        onEnd: result => update({ status: 'finished', result }),
        onIdle: () => update({ status: 'idle' }),
        onScore: score => update({ score }),
        onTime: timeRemaining => update({ timeRemaining }),
        setProjected: projected => update({ projected }),
    }

    function dispose(): void {
        if (disposed) {
            return
        }
        disposed = true
        listeners.clear()
    }

    return {
        session: {
            subscribe,
            getCachedSnapshot: () => snapshot,
            capabilities: config.capabilities,
            actions: { ...NOOP_ACTIONS, ...config.actions },
            dispose,
        },
        handlers,
    }
}
