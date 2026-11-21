import type { HandleSessionHandlers } from '@cetus/app-core'
import type { BaseGameStats } from '@cetus/games'
import { SatelliteSyncGame } from '@cetus/games/satellite-sync/game'
import { SATELLITE_SYNC_LEVELS } from '@cetus/games/satellite-sync/levels'
import type {
    SatelliteSyncCallbacks,
    SatelliteSyncState,
    SatelliteSyncStatus,
    SatelliteAimIdentity,
    SatelliteAimSnapshot,
} from '@cetus/games/satellite-sync/types'

import type { HandleResultHelper } from '../handleResult'
import type { NativeGameProjection } from '../registry'

export interface SatelliteSyncProjection extends NativeGameProjection {
    level: number
}

/**
 * Per-host Satellite Sync controller (the board binding). Owns the model
 * instance, maps its callbacks onto the shared handle session/result path
 * and wakes the board's ONE frame loop on lifecycle changes without faking
 * a BaseGame. `SatelliteSyncGame.stop()` fires no callback, so `stop()`
 * performs the idle transition itself. Score-eligible wins and losses save
 * once with `getGameData()`; a manual stop never POSTs.
 */
export class SatelliteSyncController {
    private game: SatelliteSyncGame | null = null
    private projected: SatelliteSyncProjection = { level: 1 }
    private readonly wakeHandlers = new Set<() => void>()
    private readonly resetHandlers = new Set<() => void>()

    constructor(
        private readonly deps: {
            handlers: HandleSessionHandlers<NativeGameProjection>
            results: HandleResultHelper
        }
    ) {}

    /** Debug/test seam (web parity: `satelliteSyncGame.getGame()`). */
    getGame(): SatelliteSyncGame | null {
        return this.game
    }

    getProjection(): SatelliteSyncProjection {
        return this.projected
    }

    /** Copied visible scene for the board; null while idle. */
    getScene(): SatelliteSyncState | null {
        return this.game?.getState() ?? null
    }

    getStatus(): SatelliteSyncStatus {
        return this.game?.getStatus() ?? 'idle'
    }

    isRunning(): boolean {
        return this.getStatus() === 'playing'
    }

    /** One subscription per frame loop; `reset` is used only at run start. */
    subscribe(wake: () => void, resetTimestamp: () => void): () => void {
        this.wakeHandlers.add(wake)
        this.resetHandlers.add(resetTimestamp)
        return () => {
            this.wakeHandlers.delete(wake)
            this.resetHandlers.delete(resetTimestamp)
        }
    }

    start(): void {
        this.game?.cleanup()
        this.game = null
        this.game = new SatelliteSyncGame(this.createCallbacks())
        // start() resets the score, loads level 1 and fires onGameStart.
        this.game.start()
    }

    /** The model expects MILLISECONDS; the frame loop converts seconds. */
    update(deltaMs: number): void {
        this.game?.update(deltaMs)
    }

    /**
     * Start a real drag only after RNGH activates the pan: capture the
     * pre-drag state first so a cancelled gesture can be restored, then
     * unlock/aim. Returns the snapshot (null when idle/no model).
     */
    beginAim(satelliteId: string): SatelliteAimSnapshot | null {
        const game = this.game
        if (!game) {
            return null
        }
        const snapshot = game.captureAimState(satelliteId)
        game.beginAim(satelliteId)
        return snapshot
    }

    updateAim(satelliteId: string, worldAngle: number): void {
        this.game?.updateAim(satelliteId, worldAngle)
    }

    endAim(satelliteId: string): void {
        this.game?.endAim(satelliteId)
    }

    /** Cancelled-drag cleanup: restore the pre-drag lock/aim/combo with no
     *  scoring or lock callbacks. The snapshot carries its originating
     *  model + entity generation, so a stale one is rejected by the model. */
    restoreAim(snapshot: SatelliteAimSnapshot): boolean {
        const game = this.game
        if (!game) {
            return false
        }
        return game.restoreAimState(snapshot)
    }

    /** True while the captured drag still belongs to this live model, run
     *  and entity set and nothing newer owns its satellite/target. */
    isAimCurrent(snapshot: SatelliteAimSnapshot): boolean {
        return this.game?.isAimStateCurrent(snapshot) ?? false
    }

    /** Identity of the current model/run + entity generation at gesture
     *  start; a later mismatch invalidates outstanding gesture events. */
    getAimIdentity(): SatelliteAimIdentity | null {
        return this.game?.getAimIdentity() ?? null
    }

    isAimIdentityCurrent(identity: SatelliteAimIdentity): boolean {
        return this.game?.isAimIdentityCurrent(identity) ?? false
    }

    /**
     * Screen-reader aiming: aim at a target through the model's own
     * `aimAtTarget` check (colour, snap threshold and obstacle blocking).
     * Releases only when the model reports the target as its snap
     * candidate, so a blocked/out-of-range target never locks something
     * else, and restores an existing lock when the attempt fails. Returns
     * that result so the board can announce it honestly.
     */
    lockTarget(satelliteId: string, targetId: string): boolean {
        const game = this.game
        if (!game) {
            return false
        }
        const snapshot = game.captureAimState(satelliteId)
        game.beginAim(satelliteId)
        const locked = game.aimAtTarget(satelliteId, targetId)
        if (locked) {
            game.endAim(satelliteId)
        } else if (snapshot) {
            game.restoreAimState(snapshot)
        }
        return locked
    }

    /** Manual stop: the model fires nothing, so idle the session, reset the
     *  HUD/scene and wake the loop for one final render. No score POST. */
    stop(): void {
        const game = this.game
        if (!game) {
            return
        }
        game.stop()
        game.cleanup()
        this.game = null
        this.deps.results.idle()
        this.deps.handlers.onScore?.(0)
        this.deps.handlers.onTime?.(SATELLITE_SYNC_LEVELS[0].timeBudget)
        this.publish(1)
        this.wakeLoop()
    }

    /** Stops the model timer and releases loop subscriptions on teardown. */
    cleanup(): void {
        this.game?.cleanup()
        this.game = null
        this.wakeHandlers.clear()
        this.resetHandlers.clear()
    }

    private createCallbacks(): SatelliteSyncCallbacks {
        return {
            onGameStart: () => {
                const budget =
                    this.game?.getState().timeBudget ??
                    SATELLITE_SYNC_LEVELS[0].timeBudget
                this.deps.results.beginRun(budget)
                this.publish(1)
                // A fresh run starts timing at a zero delta.
                for (const reset of [...this.resetHandlers]) {
                    reset()
                }
                this.wakeLoop()
            },
            onTimeUpdate: timeRemaining =>
                this.deps.handlers.onTime?.(timeRemaining),
            onScoreUpdate: score => this.deps.handlers.onScore?.(score),
            // The projection carries only the level; combos and locks are
            // scene-local and render on the next frame.
            onLock: () => {},
            onComboReset: () => {},
            // Fired BEFORE the model advances its level index, so the
            // callback's cleared level + 1 is the HUD level.
            onLevelClear: levelNumber => {
                this.publish(
                    Math.min(levelNumber + 1, SATELLITE_SYNC_LEVELS.length)
                )
                this.wakeLoop()
            },
            onFail: (_levelNumber, finalScore) =>
                this.finish(finalScore, false),
            onWin: finalScore => this.finish(finalScore, true),
        }
    }

    private finish(finalScore: number, won: boolean): void {
        this.publish((this.game?.getState().levelIndex ?? 0) + 1)
        const gameData = this.game?.getGameData()
        if (gameData) {
            this.deps.results.finishAndSave({
                score: finalScore,
                stats: {
                    finalScore,
                    // Display-only: the model exposes no whole-run elapsed.
                    timeElapsed: 0,
                    gameCompleted: won,
                } satisfies BaseGameStats,
                gameData: { ...gameData },
            })
        }
        this.wakeLoop()
    }

    private publish(level: number): void {
        if (this.projected.level !== level) {
            this.projected = { level }
        }
        this.deps.handlers.setProjected(this.projected)
    }

    private wakeLoop(): void {
        for (const wake of [...this.wakeHandlers]) {
            wake()
        }
    }
}
