// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    BaseGame,
    type BaseGameConfig,
    type BaseGameState,
    type BaseGameStats,
} from '@cetus/games'
import { GameID } from '@cetus/shared/games'
import { AchievementRarity } from '@cetus/shared/achievements'
import { createBaseGameSession } from './createBaseGameSession'

// Minimal portable BaseGame stub: real lifecycle/event machinery, no DOM.
class StubGame extends BaseGame<BaseGameState, BaseGameConfig, BaseGameStats> {
    createInitialState(): BaseGameState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
        }
    }

    update(): void {}

    render(): void {}

    getGameStats(): BaseGameStats {
        return {
            finalScore: this.state.score,
            timeElapsed: 0,
            gameCompleted: this.state.isGameOver,
        }
    }

    cleanup(): void {}
}

function createStubGame(
    configOverrides: Partial<BaseGameConfig> = {}
): StubGame {
    return new StubGame(GameID.SNAKE, {
        duration: 60,
        pausable: true,
        resettable: true,
        submitScore: vi.fn(async () => ({ success: true })),
        ...configOverrides,
    })
}

const idleSnapshot = {
    status: 'idle',
    score: 0,
    timeRemaining: 60,
    projected: 0,
    result: null,
}

describe('createBaseGameSession', () => {
    let game: StubGame

    afterEach(() => {
        // Stops any timer interval the test started.
        game?.destroy()
    })

    it('exposes capabilities derived from the game config', () => {
        game = createStubGame({ pausable: true, resettable: false })
        const session = createBaseGameSession(game, state => state.score)
        expect(session.capabilities).toEqual({
            pausable: true,
            resettable: false,
        })
    })

    it('starts from the idle snapshot of the initial game state', () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        expect(session.getCachedSnapshot()).toEqual(idleSnapshot)
    })

    it('keeps the cached snapshot reference across repeated reads', () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        const first = session.getCachedSnapshot()
        expect(session.getCachedSnapshot()).toBe(first)
    })

    it('notifies once through no-change bursts and keeps the reference', () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        const listener = vi.fn()
        session.subscribe(listener)

        // game.start() emits 'start' twice (timer forward + game); only the
        // first changes the projection.
        game.start()
        expect(listener).toHaveBeenCalledTimes(1)
        const running = session.getCachedSnapshot()
        expect(running.status).toBe('running')
        expect(session.getCachedSnapshot()).toBe(running)

        game.addScore(5, 'test')
        expect(listener).toHaveBeenCalledTimes(2)
        const scored = session.getCachedSnapshot()
        expect(scored).not.toBe(running)
        expect(scored.score).toBe(5)
        expect(scored.projected).toBe(5)

        // Events whose projected values did not change: same reference, no notify.
        game.emit('time-update', { time: scored.timeRemaining })
        game.emit('score-update', { score: scored.score })
        game.emit('pause')
        expect(listener).toHaveBeenCalledTimes(2)
        expect(session.getCachedSnapshot()).toBe(scored)
    })

    it('refreshes the projection from state-change events', () => {
        game = createStubGame()
        const session = createBaseGameSession(
            game,
            state => (state as { attempts?: number }).attempts ?? 0
        )
        const listener = vi.fn()
        session.subscribe(listener)
        expect(session.getCachedSnapshot().projected).toBe(0)

        // HUD-only state changes carry no score/timer payload; the adapter
        // still sees them through the games' shared 'state-change' event.
        ;(game as unknown as { state: { attempts: number } }).state.attempts = 3
        game.emit('state-change', { state: game.getState() })

        expect(listener).toHaveBeenCalledTimes(1)
        expect(session.getCachedSnapshot().projected).toBe(3)

        // Unchanged projection: same snapshot reference, no notify.
        game.emit('state-change', { state: game.getState() })
        expect(listener).toHaveBeenCalledTimes(1)
        expect(session.getCachedSnapshot().projected).toBe(3)
    })

    it('drives status transitions through start/pause/resume/reset', () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        const status = () => session.getCachedSnapshot().status

        expect(status()).toBe('idle')
        game.start()
        expect(status()).toBe('running')
        game.pause()
        expect(status()).toBe('paused')
        game.resume()
        expect(status()).toBe('running')
        // reset() emits no game event, so the adapter refreshes explicitly.
        game.addScore(3, 'test')
        // reset() emits score-update through ScoreManager.reset; the
        // adapter's explicit refresh after reset is only defensive.
        session.actions.reset()
        expect(session.getCachedSnapshot()).toEqual(idleSnapshot)
    })

    it('never creates or clears a result from a bare timer end', async () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        game.start()

        await game.end()
        const structured = session.getCachedSnapshot().result
        expect(structured).not.toBeNull()

        // A bare 'end' (as GameTimer.stop() forwards it) arrives without a
        // payload; it must not manufacture or wipe a saved result.
        game.emit('end')

        expect(session.getCachedSnapshot().status).toBe('finished')
        expect(session.getCachedSnapshot().result).toBe(structured)
    })

    it('publishes local completion before the save and result after it', async () => {
        const submitScore = vi.fn(async () => ({ success: true }))
        game = createStubGame({ submitScore })
        const session = createBaseGameSession(game, state => state.score)
        game.start()
        game.addScore(12, 'test')

        const ended = game.end()

        // end() runs callbacks and timer stop synchronously; the bare end
        // has already finished the run before the save resolves. The
        // provisional result carries the live score and stats immediately.
        expect(session.getCachedSnapshot().status).toBe('finished')
        expect(session.getCachedSnapshot().result).toEqual({
            score: 12,
            stats: { finalScore: 12, timeElapsed: 0, gameCompleted: true },
        })

        await ended

        expect(submitScore).toHaveBeenCalledTimes(1)
        const finished = session.getCachedSnapshot()
        expect(finished.status).toBe('finished')
        expect(finished.result).toEqual({
            score: 12,
            stats: { finalScore: 12, timeElapsed: 0, gameCompleted: true },
            newAchievements: undefined,
            challengeUpdates: undefined,
        })
        // A finished run keeps replaying events without re-submitting.
        game.emit('time-update', { time: 0 })
        game.emit('score-update', { score: 12 })
        expect(submitScore).toHaveBeenCalledTimes(1)
    })

    it('carries reward payloads from the structured end event', async () => {
        const achievements = [
            {
                id: 'first_run',
                name: 'First Run',
                description: 'Finish a run',
                icon: '🐍',
                rarity: AchievementRarity.COMMON,
            },
        ]
        const submitScore = vi.fn(async () => ({
            success: true,
            newAchievements: achievements,
        }))
        game = createStubGame({ submitScore })
        const session = createBaseGameSession(game, state => state.score)
        game.start()

        await game.end()

        expect(session.getCachedSnapshot().result?.newAchievements).toEqual(
            achievements
        )
    })

    it('publishes a provisional result while the save stalls, then the structured end overwrites it', async () => {
        let resolveSave: (result: { success: boolean }) => void = () => {}
        const submitScore = vi.fn(
            () =>
                new Promise<{ success: boolean }>(resolve => {
                    resolveSave = resolve
                })
        )
        game = createStubGame({ submitScore })
        const session = createBaseGameSession(game, state => state.score)
        game.start()
        game.addScore(9, 'test')
        const ended = game.end()

        // The save never resolves: the finished run still shows real values.
        const stalled = session.getCachedSnapshot()
        expect(stalled.status).toBe('finished')
        expect(stalled.result).toEqual({
            score: 9,
            stats: { finalScore: 9, timeElapsed: 0, gameCompleted: true },
        })

        // The provisional reference is stable across unrelated refreshes.
        game.emit('time-update', { time: 0 })
        expect(session.getCachedSnapshot()).toBe(stalled)

        resolveSave({ success: true })
        await ended

        const finished = session.getCachedSnapshot()
        expect(finished.result).toEqual({
            score: 9,
            stats: { finalScore: 9, timeElapsed: 0, gameCompleted: true },
            newAchievements: undefined,
            challengeUpdates: undefined,
        })
        // The structured end replaced the provisional result.
        expect(finished.result).not.toBe(stalled.result)
    })

    it('drops a stale structured result when a newer run starts', async () => {
        let resolveSave: (result: { success: boolean }) => void = () => {}
        const submitScore = vi.fn(
            () =>
                new Promise<{ success: boolean }>(resolve => {
                    resolveSave = resolve
                })
        )
        game = createStubGame({ submitScore })
        const session = createBaseGameSession(game, state => state.score)
        game.start()
        const ended = game.end()

        // New run starts while the old save is in flight.
        session.actions.start()
        resolveSave({ success: true })
        await ended

        expect(submitScore).toHaveBeenCalledTimes(1)
        const snapshot = session.getCachedSnapshot()
        expect(snapshot.status).toBe('running')
        expect(snapshot.result).toBeNull()
    })

    it('drops a stale structured result arriving while the newer run is also finished', async () => {
        const resolvers: Array<(result: { success: boolean }) => void> = []
        const submitScore = vi.fn(
            () =>
                new Promise<{ success: boolean }>(resolve => {
                    resolvers.push(resolve)
                })
        )
        game = createStubGame({ submitScore })
        const session = createBaseGameSession(game, state => state.score)

        // Run A ends with its save still in flight.
        game.start()
        game.addScore(10, 'run-a')
        const endA = game.end()

        // Run B starts and finishes before A's save resolves.
        session.actions.start()
        game.addScore(20, 'run-b')
        const endB = game.end()

        const provisional = session.getCachedSnapshot().result
        expect(provisional).toEqual({
            score: 20,
            stats: { finalScore: 20, timeElapsed: 0, gameCompleted: true },
        })

        // A's save resolves late: its structured end carries the old runId
        // and must not overwrite the finished B run's displayed result.
        resolvers[0]({ success: true })
        await endA

        expect(session.getCachedSnapshot().status).toBe('finished')
        expect(session.getCachedSnapshot().result).toBe(provisional)

        // B's own structured end still lands and replaces the provisional.
        resolvers[1]({ success: true })
        await endB

        expect(session.getCachedSnapshot().result).toEqual({
            score: 20,
            stats: { finalScore: 20, timeElapsed: 0, gameCompleted: true },
            newAchievements: undefined,
            challengeUpdates: undefined,
        })
    })

    it('keeps the current run result when saves resolve out of order', async () => {
        const resolvers: Array<(result: { success: boolean }) => void> = []
        const submitScore = vi.fn(
            () =>
                new Promise<{ success: boolean }>(resolve => {
                    resolvers.push(resolve)
                })
        )
        game = createStubGame({ submitScore })
        const session = createBaseGameSession(game, state => state.score)

        game.start()
        game.addScore(10, 'run-a')
        const endA = game.end()
        session.actions.start()
        game.addScore(20, 'run-b')
        const endB = game.end()

        // B resolves first and is accepted; A's stale end arriving after
        // must not clobber the committed B result.
        resolvers[1]({ success: true })
        await endB

        const committed = session.getCachedSnapshot().result
        expect(committed?.score).toBe(20)

        resolvers[0]({ success: true })
        await endA

        expect(session.getCachedSnapshot().result).toBe(committed)
    })

    it('notifies duplicate and multiple subscribers exactly once per event', () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        const sameListener = vi.fn()
        const otherListener = vi.fn()
        session.subscribe(sameListener)
        session.subscribe(sameListener)
        session.subscribe(otherListener)

        // The adapter registers exactly ONE listener per game event type.
        expect(game.listenerCount('score-update')).toBe(1)

        game.addScore(4, 'test')
        expect(sameListener).toHaveBeenCalledTimes(1)
        expect(otherListener).toHaveBeenCalledTimes(1)
    })

    it('stops notifying after unsubscribe', () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        const listener = vi.fn()
        const unsubscribe = session.subscribe(listener)
        unsubscribe()
        unsubscribe()

        game.addScore(2, 'test')
        expect(listener).not.toHaveBeenCalled()
    })

    it('removes every game listener on dispose, idempotently', () => {
        game = createStubGame()
        const session = createBaseGameSession(game, state => state.score)
        const listener = vi.fn()
        session.subscribe(listener)
        game.start()
        game.pause()

        session.dispose()
        expect(() => session.dispose()).not.toThrow()

        for (const eventType of [
            'start',
            'pause',
            'resume',
            'end',
            'score-update',
            'time-update',
        ] as const) {
            expect(game.listenerCount(eventType)).toBe(0)
        }

        game.addScore(1, 'test')
        game.emit('end')
        expect(listener).toHaveBeenCalledTimes(2) // start + pause only
        expect(session.getCachedSnapshot().status).toBe('paused')
    })
})
