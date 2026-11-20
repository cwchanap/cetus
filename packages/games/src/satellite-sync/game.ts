import { GameTimer } from '../core/GameTimer'
import { ScoreManager } from '../core/ScoreManager'
import { GameID } from '@cetus/shared/games'
import { SATELLITE_SYNC_LEVELS } from './levels'
import {
    polarToWorld,
    bearing,
    normalizeAngle,
    angleDiff,
    segmentIntersectsCircle,
    findLockableTarget,
    type WorldPoint,
} from './geometry'
import {
    SCORING_CONFIG,
    comboMultiplier,
    lockPoints,
    levelClearBonus,
    timeBonus,
} from './scoring'
import type {
    SatelliteSyncCallbacks,
    SatelliteSyncState,
    SatelliteSyncStatus,
    RuntimeSatellite,
    SatelliteSyncGameData,
    SatelliteAimIdentity,
    SatelliteAimSnapshot,
} from './types'

// One id per constructed model so a snapshot captured before Stop/Replay
// can never be restored into the replacement instance.
let nextModelInstanceId = 1

export class SatelliteSyncGame {
    private readonly modelInstanceId = nextModelInstanceId++
    private entityGeneration = 0
    // Monotonic counter over every combo/multiplier write, so a cancelled
    // drag can tell its own unlock reset apart from an unrelated one.
    private comboRevision = 0
    private callbacks: SatelliteSyncCallbacks
    private scoreManager: ScoreManager
    private timer: GameTimer | null = null
    private state: SatelliteSyncState
    private maxCombo = 0
    private totalLocks = 0
    private minTimeRatio = 1
    private lastLockAt = 0
    private pendingLevel: number | null = null

    constructor(callbacks: SatelliteSyncCallbacks) {
        this.callbacks = callbacks
        this.scoreManager = new ScoreManager({
            gameId: GameID.SATELLITE_SYNC,
            scoringConfig: {
                basePoints: SCORING_CONFIG.lockBase,
                bonusMultiplier: 1,
                timeBonus: true,
            },
            onScoreUpdate: (score: number) => {
                this.state.score = score
                this.callbacks.onScoreUpdate(score)
            },
        })
        this.state = this.createIdleState()
    }

    private createIdleState(): SatelliteSyncState {
        return {
            levelIndex: 0,
            levelName: '',
            timeBudget: 0,
            timeRemaining: 0,
            satellites: [],
            targets: [],
            obstacles: [],
            combo: 0,
            multiplier: 1,
            score: 0,
            status: 'idle',
        }
    }

    start(): void {
        this.scoreManager.reset()
        this.maxCombo = 0
        this.totalLocks = 0
        this.minTimeRatio = 1
        this.loadLevel(0)
        this.callbacks.onGameStart()
    }

    stop(): void {
        this.stopTimer()
        this.state.status = 'idle'
        // Drop any level swap queued by a just-completed level clear so a
        // subsequent update() tick cannot replace the stopped game's entities.
        this.pendingLevel = null
    }

    cleanup(): void {
        this.stopTimer()
        this.scoreManager.removeAllListeners()
    }

    private loadLevel(index: number): void {
        this.applyLevelMetadata(index)
        this.loadLevelEntities(index)
        this.pendingLevel = null
    }

    private applyLevelMetadata(index: number): void {
        const level = SATELLITE_SYNC_LEVELS[index]
        this.state.levelIndex = index
        this.state.levelName = level.name
        this.state.timeBudget = level.timeBudget
        this.state.timeRemaining = level.timeBudget
        this.state.combo = 0
        this.state.multiplier = 1
        this.comboRevision += 1
        this.state.status = 'playing'

        this.stopTimer()
        this.timer = new GameTimer({
            duration: level.timeBudget,
            countDown: true,
            autoStart: false,
            onTick: t => {
                this.state.timeRemaining = t
                this.callbacks.onTimeUpdate(t)
            },
            onComplete: () => this.handleTimeout(),
        })
        this.timer.start()
        this.callbacks.onTimeUpdate(level.timeBudget)
    }

    private loadLevelEntities(index: number): void {
        // Every entity set (new run or level swap) gets a fresh generation;
        // snapshots from the previous entities are no longer restorable.
        this.entityGeneration += 1
        const level = SATELLITE_SYNC_LEVELS[index]
        this.state.satellites = level.satellites.map((s, i) => ({
            id: `sat-${i}`,
            ring: s.ring,
            angle: s.angle,
            color: s.color,
            aimAngle: 0,
            lockedTargetId: null,
            snapCandidateId: null,
        }))
        this.state.targets = level.targets.map((t, i) => ({
            id: `target-${i}`,
            ring: t.ring,
            defAngle: t.angle,
            currentAngle: t.angle,
            color: t.color,
            moving: t.moving ?? null,
            locked: false,
            lockedBySatId: null,
        }))
        this.state.obstacles = level.obstacles.map((o, i) => ({
            id: `obs-${i}`,
            ring: o.ring,
            defAngle: o.angle,
            currentAngle: o.angle,
            radius: o.radius,
            moving: o.moving ?? null,
        }))
    }

    private stopTimer(): void {
        if (this.timer) {
            this.timer.stop()
            this.timer = null
        }
    }

    private handleTimeout(): void {
        if (this.state.status !== 'playing') {
            return
        }
        this.updateMinRatio()
        this.state.status = 'lost'
        this.stopTimer()
        this.callbacks.onFail(
            this.state.levelIndex + 1,
            this.scoreManager.getScore()
        )
    }

    private updateMinRatio(): void {
        const budget = this.state.timeBudget || 1
        const ratio = this.state.timeRemaining / budget
        if (ratio < this.minTimeRatio) {
            this.minTimeRatio = ratio
        }
    }

    update(deltaMs: number): void {
        if (this.pendingLevel !== null) {
            this.loadLevelEntities(this.pendingLevel)
            this.pendingLevel = null
        }
        if (this.state.status !== 'playing') {
            return
        }
        const dt = deltaMs / 1000
        for (const target of this.state.targets) {
            if (target.moving) {
                target.currentAngle = normalizeAngle(
                    target.currentAngle +
                        target.moving.speed * target.moving.direction * dt
                )
                // A locked moving target keeps drifting. Re-point the
                // locking satellite's beam at the target's new bearing so
                // the visible "locked" beam stays attached to the target
                // instead of freezing at the lock-time angle.
                if (target.locked && target.lockedBySatId) {
                    const sat = this.state.satellites.find(
                        s => s.id === target.lockedBySatId
                    )
                    if (sat) {
                        sat.aimAngle = bearing(
                            this.satWorld(sat),
                            polarToWorld(target.ring, target.currentAngle)
                        )
                    }
                }
            }
        }
        for (const obs of this.state.obstacles) {
            if (obs.moving) {
                obs.currentAngle = normalizeAngle(
                    obs.currentAngle +
                        obs.moving.speed * obs.moving.direction * dt
                )
            }
        }
        if (
            this.state.combo > 0 &&
            Date.now() - this.lastLockAt > SCORING_CONFIG.comboWindowMs
        ) {
            this.state.combo = 0
            this.state.multiplier = 1
            this.comboRevision += 1
            this.callbacks.onComboReset()
        }
    }

    beginAim(satId: string): void {
        const sat = this.findSatellite(satId)
        if (!sat || this.state.status !== 'playing') {
            return
        }
        if (sat.lockedTargetId) {
            this.unlockSatellite(sat)
        }
    }

    updateAim(satId: string, worldAngle: number): void {
        const sat = this.findSatellite(satId)
        if (!sat || this.state.status !== 'playing') {
            return
        }
        sat.aimAngle = worldAngle
        const candidate = findLockableTarget(
            this.satWorld(sat),
            sat.color,
            worldAngle,
            this.state.targets,
            this.state.obstacles,
            SCORING_CONFIG.snapThresholdDeg
        )
        sat.snapCandidateId = candidate ? candidate.id : null
    }

    endAim(satId: string): void {
        const sat = this.findSatellite(satId)
        if (!sat || this.state.status !== 'playing') {
            return
        }
        if (sat.snapCandidateId) {
            const target = this.state.targets.find(
                t => t.id === sat.snapCandidateId
            )
            if (target && !target.locked && target.color === sat.color) {
                const satWorld = this.satWorld(sat)
                const targetWorld = polarToWorld(
                    target.ring,
                    target.currentAngle
                )
                const diff = angleDiff(
                    bearing(satWorld, targetWorld),
                    sat.aimAngle
                )
                const blocked = this.state.obstacles.some(o =>
                    segmentIntersectsCircle(
                        satWorld,
                        targetWorld,
                        polarToWorld(o.ring, o.currentAngle),
                        o.radius
                    )
                )
                if (diff <= SCORING_CONFIG.snapThresholdDeg && !blocked) {
                    this.applyLock(sat, target.id)
                }
            }
        }
        sat.snapCandidateId = null
    }

    /** Read-only pre-drag snapshot; never mutates the run. */
    captureAimState(satId: string): SatelliteAimSnapshot | null {
        const sat = this.findSatellite(satId)
        if (!sat) {
            return null
        }
        return {
            modelInstanceId: this.modelInstanceId,
            entityGeneration: this.entityGeneration,
            satelliteId: satId,
            aimAngle: sat.aimAngle,
            snapCandidateId: sat.snapCandidateId,
            lockedTargetId: sat.lockedTargetId,
            combo: this.state.combo,
            multiplier: this.state.multiplier,
            comboRevision: this.comboRevision,
        }
    }

    /** Identity of the current model instance + entity generation, for
     *  invalidating gesture events that arrive after a lifecycle change. */
    getAimIdentity(): SatelliteAimIdentity {
        return {
            modelInstanceId: this.modelInstanceId,
            entityGeneration: this.entityGeneration,
        }
    }

    /** True while a gesture that began with `identity` may still mutate the
     *  live run. */
    isAimIdentityCurrent(identity: SatelliteAimIdentity): boolean {
        return (
            this.state.status === 'playing' &&
            identity.modelInstanceId === this.modelInstanceId &&
            identity.entityGeneration === this.entityGeneration
        )
    }

    /**
     * True when a captured snapshot still describes the live satellite and
     * entity generation, so a drag may keep aiming and commit. False after
     * a run/level change, a stop/finish, or when another satellite has
     * claimed the target the snapshot expects to restore.
     */
    isAimStateCurrent(snapshot: SatelliteAimSnapshot): boolean {
        if (!this.isAimIdentityCurrent(snapshot)) {
            return false
        }
        const sat = this.findSatellite(snapshot.satelliteId)
        if (!sat || sat.lockedTargetId !== null) {
            return false
        }
        if (snapshot.lockedTargetId) {
            const target = this.state.targets.find(
                t => t.id === snapshot.lockedTargetId
            )
            if (!target || target.locked) {
                return false
            }
        }
        return true
    }

    /**
     * Undo a cancelled drag's aim/unlock mutations. Restores the captured
     * lock, aim, snap candidate and combo WITHOUT scoring or emitting lock
     * callbacks. Returns false without touching anything when the snapshot
     * is stale (another model instance, a level/entity swap, a finished or
     * stopped run) or when another satellite has since claimed the target,
     * so a rollback can never overwrite a newer run, level or lock owner.
     */
    restoreAimState(snapshot: SatelliteAimSnapshot): boolean {
        if (!this.isAimIdentityCurrent(snapshot)) {
            return false
        }
        const sat = this.findSatellite(snapshot.satelliteId)
        if (!sat || sat.lockedTargetId !== null) {
            return false
        }
        sat.aimAngle = snapshot.aimAngle
        sat.snapCandidateId = snapshot.snapCandidateId
        if (!this.isAimStateCurrent(snapshot)) {
            return false
        }
        const restoredTarget = snapshot.lockedTargetId
            ? this.state.targets.find(t => t.id === snapshot.lockedTargetId)
            : undefined

        sat.lockedTargetId = restoredTarget ? restoredTarget.id : null
        for (const target of this.state.targets) {
            if (target.id === sat.lockedTargetId) {
                target.locked = true
                target.lockedBySatId = sat.id
            } else if (target.lockedBySatId === sat.id) {
                // Defensive: a drag cannot commit, but never leave this
                // satellite holding a second lock.
                target.locked = false
                target.lockedBySatId = null
            }
        }
        // Restore the combo only when the sole write since capture is this
        // drag's own unlock reset (a locked pre-drag satellite always resets
        // it to 0/×1 in beginAim). An unrelated reset that coincidentally
        // also leaves 0/×1 increments the revision a second time, so the
        // newer reset stands instead of being rolled back.
        const expectedRevision = snapshot.lockedTargetId
            ? snapshot.comboRevision + 1
            : snapshot.comboRevision
        if (this.comboRevision === expectedRevision) {
            this.state.combo = snapshot.combo
            this.state.multiplier = snapshot.multiplier
            this.comboRevision += 1
        }
        return true
    }

    aimAtTarget(satId: string, targetId: string): boolean {
        const sat = this.findSatellite(satId)
        const target = this.state.targets.find(t => t.id === targetId)
        // Mirror the status guard used by beginAim/updateAim/endAim so a
        // stale snapCandidateId can't produce a false match after the run
        // ends (won/lost/idle).
        if (!sat || !target || this.state.status !== 'playing') {
            return false
        }
        const aim = bearing(
            this.satWorld(sat),
            polarToWorld(target.ring, target.currentAngle)
        )
        this.updateAim(satId, aim)
        return sat.snapCandidateId === targetId
    }

    private applyLock(sat: RuntimeSatellite, targetId: string): void {
        const target = this.state.targets.find(t => t.id === targetId)
        if (!target || target.locked) {
            return
        }
        if (sat.lockedTargetId) {
            this.unlockSatellite(sat)
        }
        target.locked = true
        target.lockedBySatId = sat.id
        sat.lockedTargetId = target.id
        sat.aimAngle = bearing(
            this.satWorld(sat),
            polarToWorld(target.ring, target.currentAngle)
        )

        const now = Date.now()
        if (
            this.state.combo > 0 &&
            now - this.lastLockAt <= SCORING_CONFIG.comboWindowMs
        ) {
            this.state.combo += 1
        } else {
            this.state.combo = 1
        }
        this.lastLockAt = now
        this.state.multiplier = comboMultiplier(this.state.combo)
        if (this.state.combo > this.maxCombo) {
            this.maxCombo = this.state.combo
        }
        this.totalLocks += 1

        const points = lockPoints(this.state.combo)
        this.scoreManager.addPoints(points, 'lock')
        this.comboRevision += 1
        this.callbacks.onLock({
            combo: this.state.combo,
            multiplier: this.state.multiplier,
        })

        if (this.state.targets.every(t => t.locked)) {
            this.handleLevelClear()
        }
    }

    private unlockSatellite(sat: RuntimeSatellite): void {
        if (!sat.lockedTargetId) {
            return
        }
        const target = this.state.targets.find(t => t.id === sat.lockedTargetId)
        if (target) {
            target.locked = false
            target.lockedBySatId = null
        }
        sat.lockedTargetId = null
        this.state.combo = 0
        this.state.multiplier = 1
        this.comboRevision += 1
        this.callbacks.onComboReset()
    }

    private handleLevelClear(): void {
        this.updateMinRatio()
        const levelNumber = this.state.levelIndex + 1
        const bonus =
            levelClearBonus(levelNumber) + timeBonus(this.state.timeRemaining)
        this.scoreManager.addPoints(bonus, 'level_clear')
        this.callbacks.onLevelClear(levelNumber)

        if (levelNumber >= SATELLITE_SYNC_LEVELS.length) {
            this.state.status = 'won'
            this.stopTimer()
            this.callbacks.onWin(this.scoreManager.getScore())
        } else {
            const next = this.state.levelIndex + 1
            this.applyLevelMetadata(next)
            this.pendingLevel = next
        }
    }

    private findSatellite(id: string): RuntimeSatellite | undefined {
        return this.state.satellites.find(s => s.id === id)
    }

    private satWorld(sat: RuntimeSatellite): WorldPoint {
        return polarToWorld(sat.ring, sat.angle)
    }

    getStatus(): SatelliteSyncStatus {
        return this.state.status
    }

    getState(): SatelliteSyncState {
        return {
            ...this.state,
            satellites: this.state.satellites.map(s => ({ ...s })),
            targets: this.state.targets.map(t => ({
                ...t,
                moving: t.moving ? { ...t.moving } : null,
            })),
            obstacles: this.state.obstacles.map(o => ({
                ...o,
                moving: o.moving ? { ...o.moving } : null,
            })),
        }
    }

    getGameData(): SatelliteSyncGameData {
        return {
            levelsCleared:
                this.state.status === 'won'
                    ? SATELLITE_SYNC_LEVELS.length
                    : this.state.levelIndex,
            maxCombo: this.maxCombo,
            totalLocks: this.totalLocks,
            solved: this.state.status === 'won',
            minTimeRemainingRatio: this.minTimeRatio,
        }
    }
}
