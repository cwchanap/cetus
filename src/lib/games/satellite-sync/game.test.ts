import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SatelliteSyncGame } from './game'
import type { SatelliteSyncCallbacks } from './types'

function makeCallbacks(): SatelliteSyncCallbacks & {
    calls: Record<string, unknown[]>
} {
    const calls: Record<string, unknown[]> = {}
    const cbs = {
        onGameStart: () => {
            calls.start = (calls.start ?? []).concat([true])
        },
        onTimeUpdate: (s: number) => {
            calls.time = (calls.time ?? []).concat([s])
        },
        onScoreUpdate: (sc: number) => {
            calls.score = (calls.score ?? []).concat([sc])
        },
        onLock: (info: { combo: number; multiplier: number }) => {
            calls.lock = (calls.lock ?? []).concat([info])
        },
        onLevelClear: (n: number) => {
            calls.clear = (calls.clear ?? []).concat([n])
        },
        onFail: (n: number, sc: number) => {
            calls.fail = (calls.fail ?? []).concat([[n, sc]])
        },
        onWin: (sc: number) => {
            calls.win = (calls.win ?? []).concat([sc])
        },
    } as unknown as SatelliteSyncCallbacks & {
        calls: Record<string, unknown[]>
    }
    ;(cbs as { calls: Record<string, unknown[]> }).calls = calls
    return cbs
}

// Greedily clears the current level: for each target, try free satellites
// until one locks it. Works for the authored levels (each target has a
// reachable satellite among the extras). Avoids assuming a fixed
// satellite->target ordering.
function solveCurrentLevel(game: SatelliteSyncGame): void {
    const targetIds = game.getState().targets.map(t => t.id)
    for (const targetId of targetIds) {
        if (game.getState().targets.find(t => t.id === targetId)!.locked) {
            continue
        }
        for (const sat of game.getState().satellites) {
            if (sat.lockedTargetId) {
                continue
            }
            game.beginAim(sat.id)
            game.aimAtTarget(sat.id, targetId)
            game.endAim(sat.id)
            if (game.getState().targets.find(t => t.id === targetId)!.locked) {
                break
            }
        }
    }
}

describe('SatelliteSyncGame', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('starts on level 1 and reports the time budget', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const state = game.getState()
        expect(state.levelIndex).toBe(0)
        expect(state.status).toBe('playing')
        expect(cbs.calls.start).toHaveLength(1)
        expect(state.timeRemaining).toBe(60)
        game.cleanup()
    })

    it('locks a target when aimed correctly and awards combo points', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const sat = game.getState().satellites[0]
        const target = game.getState().targets[0]

        game.beginAim(sat.id)
        // Aim straight at the target's bearing (target on ring 1 at 60deg,
        // satellite on ring 0 at 0deg). Compute bearing to point exactly.
        const aim = game.aimAtTarget(sat.id, target.id)
        game.endAim(sat.id)

        expect(game.getState().targets[0].locked).toBe(true)
        expect(cbs.calls.lock).toHaveLength(1)
        expect(cbs.calls.score?.[0]).toBe(100)
        expect(aim).toBe(true)
        game.cleanup()
    })

    it('builds a combo on rapid successive locks', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const state = game.getState()
        // Lock two different satellites onto two targets quickly.
        game.beginAim(state.satellites[0].id)
        game.aimAtTarget(state.satellites[0].id, state.targets[0].id)
        game.endAim(state.satellites[0].id)
        game.beginAim(state.satellites[1].id)
        game.aimAtTarget(state.satellites[1].id, state.targets[1].id)
        game.endAim(state.satellites[1].id)

        const lockCalls = cbs.calls.lock as { combo: number }[]
        expect(lockCalls[1].combo).toBe(2)
        game.cleanup()
    })

    it('clears the level and advances when all targets locked', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        solveCurrentLevel(game)
        expect(cbs.calls.clear).toHaveLength(1)
        expect(cbs.calls.clear?.[0]).toBe(1)
        expect(game.getState().levelIndex).toBe(1)
        game.cleanup()
    })

    it('fails the run when the level timer expires', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        vi.advanceTimersByTime(61_000)
        expect(cbs.calls.fail).toHaveLength(1)
        expect(game.getState().status).toBe('lost')
        game.cleanup()
    })

    it('wins after clearing all 8 levels', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        for (let lvl = 0; lvl < 8; lvl++) {
            solveCurrentLevel(game)
        }
        expect(cbs.calls.win).toHaveLength(1)
        expect(game.getState().status).toBe('won')
        const data = game.getGameData()
        expect(data.solved).toBe(true)
        expect(data.levelsCleared).toBe(8)
        game.cleanup()
    })

    it('re-aiming a locked satellite unlocks its previous target', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const s = game.getState()
        game.beginAim(s.satellites[0].id)
        game.aimAtTarget(s.satellites[0].id, s.targets[0].id)
        game.endAim(s.satellites[0].id)
        expect(game.getState().targets[0].locked).toBe(true)
        // Grab it again -> previous target unlocks.
        game.beginAim(s.satellites[0].id)
        expect(game.getState().targets[0].locked).toBe(false)
        game.cleanup()
    })
})
