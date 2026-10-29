// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createHandleSession } from './createHandleSession'
import type { GameSessionActions, GameSessionResult } from './types'

const idleSnapshot = {
    status: 'idle' as const,
    score: 0,
    timeRemaining: 120,
    projected: { rotations: 0 },
    result: null,
}

function createSession(actions?: Partial<GameSessionActions>) {
    return createHandleSession({
        capabilities: { pausable: false, resettable: false },
        snapshot: idleSnapshot,
        actions,
    })
}

const endResult: GameSessionResult = {
    score: 900,
    stats: { finalScore: 900, timeElapsed: 0, gameCompleted: true },
}

describe('createHandleSession', () => {
    it('starts from the configured snapshot and keeps it reference-stable across reads', () => {
        const { session } = createSession()
        // getServerSnapshot-safe: the server snapshot IS the cached
        // snapshot object, stable until a handler changes a field.
        expect(session.getCachedSnapshot()).toBe(idleSnapshot)
        expect(session.getCachedSnapshot()).toBe(session.getCachedSnapshot())
        expect(session.capabilities).toEqual({
            pausable: false,
            resettable: false,
        })
    })

    it('keeps the cached reference and stays silent across no-change handler bursts', () => {
        const { session, handlers } = createSession()
        const listener = vi.fn()
        session.subscribe(listener)

        // The one real change: idle → running.
        handlers.onStart()
        expect(listener).toHaveBeenCalledTimes(1)
        const running = session.getCachedSnapshot()

        // Burst of callbacks carrying values the snapshot already has:
        // same reference, no notify.
        handlers.onTime?.(idleSnapshot.timeRemaining)
        handlers.onScore?.(idleSnapshot.score)
        handlers.setProjected(idleSnapshot.projected)
        handlers.onStart()

        expect(listener).toHaveBeenCalledTimes(1)
        expect(session.getCachedSnapshot()).toBe(running)
    })

    it('notifies once per changed field and preserves the reference otherwise', () => {
        const { session, handlers } = createSession()
        const listener = vi.fn()
        session.subscribe(listener)

        handlers.onTime?.(119)
        expect(listener).toHaveBeenCalledTimes(1)
        const timed = session.getCachedSnapshot()
        expect(timed).not.toBe(idleSnapshot)
        expect(timed.timeRemaining).toBe(119)

        handlers.onTime?.(119)
        expect(listener).toHaveBeenCalledTimes(1)
        expect(session.getCachedSnapshot()).toBe(timed)

        handlers.onScore?.(50)
        expect(listener).toHaveBeenCalledTimes(2)
        const scored = session.getCachedSnapshot()
        expect(scored.score).toBe(50)

        const rotated = { rotations: 3 }
        handlers.setProjected(rotated)
        expect(listener).toHaveBeenCalledTimes(3)
        const projectedSnapshot = session.getCachedSnapshot()
        expect(projectedSnapshot.projected).toBe(rotated)

        handlers.setProjected(rotated)
        expect(listener).toHaveBeenCalledTimes(3)
        expect(session.getCachedSnapshot()).toBe(projectedSnapshot)
    })

    it('drives status transitions through start/pause/resume', () => {
        const { session, handlers } = createSession()
        const status = () => session.getCachedSnapshot().status

        expect(status()).toBe('idle')
        handlers.onStart()
        expect(status()).toBe('running')
        handlers.onPause?.()
        expect(status()).toBe('paused')
        handlers.onResume?.()
        expect(status()).toBe('running')
    })

    it('onEnd sets the result and finishes the run', () => {
        const { session, handlers } = createSession()
        const listener = vi.fn()
        session.subscribe(listener)

        handlers.onStart()
        handlers.onEnd(endResult)

        expect(listener).toHaveBeenCalledTimes(2)
        const finished = session.getCachedSnapshot()
        expect(finished.status).toBe('finished')
        expect(finished.result).toBe(endResult)
    })

    it('defaults actions to no-ops and uses provided overrides', () => {
        const plain = createSession()
        expect(() => {
            plain.session.actions.start()
            plain.session.actions.pause()
            plain.session.actions.resume()
            plain.session.actions.reset()
        }).not.toThrow()

        const start = vi.fn()
        const { session } = createSession({ start })
        session.actions.start()
        expect(start).toHaveBeenCalledTimes(1)
        // Unoverridden actions stay no-ops.
        expect(() => session.actions.reset()).not.toThrow()
    })

    it('dispose is idempotent, stops notification, and keeps the cache coherent', () => {
        const { session, handlers } = createSession()
        const listener = vi.fn()
        session.subscribe(listener)

        session.dispose()
        expect(() => session.dispose()).not.toThrow()

        const unsubscribe = session.subscribe(listener)
        unsubscribe()

        handlers.onTime?.(30)
        expect(listener).not.toHaveBeenCalled()
        expect(session.getCachedSnapshot().timeRemaining).toBe(30)
    })
})
