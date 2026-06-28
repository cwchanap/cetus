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
    // Flush any pending level entity swap — mirrors the production raf loop,
    // which calls update() before reading state each frame.
    game.update(0)
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
        // start() fires onScoreUpdate(0); the lock's 100 points is the last call.
        expect(cbs.calls.score?.[cbs.calls.score.length - 1]).toBe(100)
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

    it('fires onScoreUpdate(0) on start so the DOM score badge resets', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        expect(cbs.calls.score?.[0]).toBe(0)
        game.cleanup()
    })

    it('resets the combo when the combo window elapses between locks', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const state = game.getState()
        // First lock -> combo 1
        game.beginAim(state.satellites[0].id)
        game.aimAtTarget(state.satellites[0].id, state.targets[0].id)
        game.endAim(state.satellites[0].id)
        // Advance past the combo window (2500ms) and tick update so the
        // combo-reset guard fires.
        vi.advanceTimersByTime(3000)
        game.update(16)
        expect(game.getState().combo).toBe(0)
        // Second lock -> combo resets to 1, not 2
        game.beginAim(state.satellites[1].id)
        game.aimAtTarget(state.satellites[1].id, state.targets[1].id)
        game.endAim(state.satellites[1].id)
        const lockCalls = cbs.calls.lock as { combo: number }[]
        expect(lockCalls[lockCalls.length - 1].combo).toBe(1)
        game.cleanup()
    })

    it('cancels a stale snap when a moving target drifts out of range', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        // Advance to level 5 (Orbit Drift) which has moving targets.
        for (let lvl = 0; lvl < 4; lvl++) {
            solveCurrentLevel(game)
        }
        const state = game.getState()
        const sat = state.satellites[0]
        const target = state.targets[0]
        // Aim precisely at the target -> snap candidate recorded.
        game.beginAim(sat.id)
        game.aimAtTarget(sat.id, target.id)
        expect(game.getState().satellites[0].snapCandidateId).toBe(target.id)
        // Drift the target well past the 8deg snap threshold (18 deg/sec).
        game.update(2000)
        // Releasing must NOT lock — the candidate is stale.
        game.endAim(sat.id)
        expect(game.getState().targets[0].locked).toBe(false)
        game.cleanup()
    })

    it('getState() is pure — repeated calls do not flush pending levels', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        // Clear level 1 -> handleLevelClear sets pendingLevel for level 2.
        solveCurrentLevel(game)
        const colorsBefore = game.getState().targets.map(t => t.color)
        // Repeated getState() calls must return identical entities —
        // the flush happens only in update(), not as a read side effect.
        expect(game.getState().targets.map(t => t.color)).toEqual(colorsBefore)
        // Level 1 targets are all cyan; level 2 introduces magenta/yellow.
        expect(colorsBefore).toEqual(['cyan', 'cyan', 'cyan'])
        // update() performs the flush.
        game.update(0)
        const colorsAfter = game.getState().targets.map(t => t.color)
        expect(colorsAfter).toEqual(['cyan', 'magenta', 'yellow'])
        game.cleanup()
    })

    it('stop() halts the timer and sets status to idle', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        expect(game.getState().status).toBe('playing')
        game.stop()
        expect(game.getState().status).toBe('idle')
        // update() is a no-op once stopped.
        const before = game.getState().timeRemaining
        game.update(1000)
        expect(game.getState().timeRemaining).toBe(before)
        game.cleanup()
    })

    it('aim methods are no-ops for unknown satellite ids', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        const target = game.getState().targets[0]
        // None of these should throw or mutate state.
        game.beginAim('does-not-exist')
        game.updateAim('does-not-exist', 90)
        game.endAim('does-not-exist')
        expect(game.aimAtTarget('does-not-exist', target.id)).toBe(false)
        expect(
            game.aimAtTarget(game.getState().satellites[0].id, 'no-target')
        ).toBe(false)
        expect(game.getState().targets[0].locked).toBe(false)
        game.cleanup()
    })

    it('aim methods are no-ops when the game is not playing', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        // Idle game — beginAim/updateAim/endAim should bail out.
        game.beginAim('sat-0')
        game.updateAim('sat-0', 90)
        game.endAim('sat-0')
        expect(game.getState().status).toBe('idle')
        game.cleanup()
    })

    it('wraps moving target/obstacle angles into [0, 360) on negative drift', () => {
        const cbs = makeCallbacks()
        const game = new SatelliteSyncGame(cbs)
        game.start()
        // Advance to level 8 (Singularity) which has moving targets and
        // obstacles with direction -1. A large dt drives the modulo result
        // negative, exercising the += 360 wrap branches.
        for (let lvl = 0; lvl < 7; lvl++) {
            solveCurrentLevel(game)
        }
        expect(game.getState().levelIndex).toBe(7)
        game.update(20_000)
        for (const t of game.getState().targets) {
            expect(t.currentAngle).toBeGreaterThanOrEqual(0)
            expect(t.currentAngle).toBeLessThan(360)
        }
        for (const o of game.getState().obstacles) {
            expect(o.currentAngle).toBeGreaterThanOrEqual(0)
            expect(o.currentAngle).toBeLessThan(360)
        }
        game.cleanup()
    })
})
