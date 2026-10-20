import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import { clamp, lerp } from '@/lib/games/shared/utils'
import { calculateSignalSwitchPassPoints } from './scoring'
import {
    SIGNAL_SWITCH_SIGNAL_ORDER,
    createSignalSwitchConfig,
    type SignalSwitchConfig,
    type SignalSwitchDrone,
    type SignalSwitchGameData,
    type SignalSwitchState,
    type SignalSwitchStats,
} from './types'

export class SignalSwitchGame extends BaseGame<
    SignalSwitchState,
    SignalSwitchConfig,
    SignalSwitchStats
> {
    private elapsedSimSeconds = 0
    private spawnElapsedSeconds = 0
    private droneSequence = 0

    constructor(
        config: SignalSwitchConfig = createSignalSwitchConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.SIGNAL_SWITCH, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): SignalSwitchState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            activeLaneCount: this.activeLaneCountForElapsed(0),
            gateSignals: Array.from(
                { length: this.config.laneUnlockSeconds.length },
                () => 'cyan' as const
            ),
            drones: [],
            integrity: this.config.startingIntegrity,
            safePasses: 0,
            crashes: 0,
            combo: 0,
            maxCombo: 0,
            droneSpeed: this.config.initialDroneSpeed,
            spawnInterval: this.config.initialSpawnInterval,
        }
    }

    cycleGate(laneIndex: number): boolean {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            !Number.isInteger(laneIndex)
        ) {
            return false
        }

        const laneCount = this.config.laneUnlockSeconds.length
        if (laneIndex < 0 || laneIndex >= laneCount) {
            return false
        }

        if (laneIndex >= this.state.activeLaneCount) {
            return false
        }

        const orderLength = SIGNAL_SWITCH_SIGNAL_ORDER.length
        const currentIndex = SIGNAL_SWITCH_SIGNAL_ORDER.indexOf(
            this.state.gateSignals[laneIndex]
        )
        this.state.gateSignals[laneIndex] =
            SIGNAL_SWITCH_SIGNAL_ORDER[(currentIndex + 1) % orderLength]
        this.emitStateChange()
        return true
    }

    update(deltaTime: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            !Number.isFinite(deltaTime) ||
            deltaTime <= 0
        ) {
            return
        }

        const step = Math.min(deltaTime, this.config.maxUpdateDelta)
        this.elapsedSimSeconds = Math.min(
            this.config.duration,
            this.elapsedSimSeconds + step
        )
        this.syncDifficulty()

        if (!this.moveAndResolveDrones(step)) {
            return
        }

        this.spawnElapsedSeconds = Math.min(
            this.state.spawnInterval,
            this.spawnElapsedSeconds + step
        )

        if (
            this.spawnElapsedSeconds >= this.state.spawnInterval &&
            this.trySpawnRandomDrone()
        ) {
            this.spawnElapsedSeconds = 0
        }

        this.emitStateChange()
    }

    render(): void {}

    cleanup(): void {}

    getGameStats(): SignalSwitchStats {
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
            gameCompleted: this.state.isGameOver,
            outcome: this.state.outcome,
            safePasses: this.state.safePasses,
            crashes: this.state.crashes,
            maxCombo: this.state.maxCombo,
            integrityRemaining: this.state.integrity,
        }
    }

    protected getGameData(): Record<string, unknown> {
        const data = {
            safePasses: this.state.safePasses,
            crashes: this.state.crashes,
            maxCombo: this.state.maxCombo,
            integrityRemaining: this.state.integrity,
            survivedFullRun:
                this.state.outcome === 'survived' && this.state.safePasses > 0,
        } satisfies SignalSwitchGameData
        return data
    }

    protected handleTimeUp(): void {
        this.state.outcome = 'survived'
        super.handleTimeUp()
    }

    protected onGameStart(): void {
        this.elapsedSimSeconds = 0
        this.spawnElapsedSeconds = 0
        this.droneSequence = 0
        this.state.drones.push({
            id: this.droneId(),
            laneIndex: 0,
            signal: 'magenta',
            x: this.config.droneSpawnX,
        })
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.elapsedSimSeconds = 0
        this.spawnElapsedSeconds = 0
        this.droneSequence = 0
    }

    private activeLaneCountForElapsed(elapsedSeconds: number): number {
        return this.config.laneUnlockSeconds.filter(
            unlockAt => elapsedSeconds >= unlockAt
        ).length
    }

    private syncDifficulty(): void {
        const progress = clamp(
            this.elapsedSimSeconds / this.config.duration,
            0,
            1
        )
        this.state.activeLaneCount = this.activeLaneCountForElapsed(
            this.elapsedSimSeconds
        )
        this.state.droneSpeed = lerp(
            this.config.initialDroneSpeed,
            this.config.finalDroneSpeed,
            progress
        )
        this.state.spawnInterval = lerp(
            this.config.initialSpawnInterval,
            this.config.finalSpawnInterval,
            progress
        )
    }

    private droneId(): string {
        const id = `drone-${this.droneSequence}`
        this.droneSequence += 1
        return id
    }

    private randomIndex(length: number): number {
        return Math.min(length - 1, Math.floor(this.config.rng() * length))
    }

    private freeActiveLanes(): number[] {
        const occupied = new Set(
            this.state.drones.map(drone => drone.laneIndex)
        )
        const lanes: number[] = []
        for (
            let laneIndex = 0;
            laneIndex < this.state.activeLaneCount;
            laneIndex += 1
        ) {
            if (!occupied.has(laneIndex)) {
                lanes.push(laneIndex)
            }
        }
        return lanes
    }

    private trySpawnRandomDrone(): boolean {
        const freeLanes = this.freeActiveLanes()
        if (freeLanes.length === 0) {
            return false
        }

        const laneIndex = freeLanes[this.randomIndex(freeLanes.length)]
        const currentGate = this.state.gateSignals[laneIndex]
        const candidates = SIGNAL_SWITCH_SIGNAL_ORDER.filter(
            signal => signal !== currentGate
        )
        const signal = candidates[this.randomIndex(candidates.length)]

        this.state.drones.push({
            id: this.droneId(),
            laneIndex,
            signal,
            x: this.config.droneSpawnX,
        })
        return true
    }

    private moveAndResolveDrones(step: number): boolean {
        const remaining: SignalSwitchDrone[] = []

        for (const drone of this.state.drones) {
            const previousX = drone.x
            const nextX = previousX + this.state.droneSpeed * step
            const crossedGate =
                previousX < this.config.gateX && nextX >= this.config.gateX

            if (!crossedGate) {
                remaining.push({ ...drone, x: nextX })
                continue
            }

            if (!this.resolveDrone(drone)) {
                this.state.drones = []
                return false
            }
        }

        this.state.drones = remaining
        return true
    }

    private resolveDrone(drone: SignalSwitchDrone): boolean {
        if (drone.signal === this.state.gateSignals[drone.laneIndex]) {
            this.state.safePasses += 1
            this.state.combo += 1
            this.state.maxCombo = Math.max(
                this.state.maxCombo,
                this.state.combo
            )
            this.addScore(
                calculateSignalSwitchPassPoints(this.state.combo),
                'safe_pass'
            )
            return true
        }

        this.state.crashes += 1
        this.state.combo = 0
        this.state.integrity -= 1

        if (this.state.integrity <= 0) {
            this.state.outcome = 'systems-failed'
            this.emitStateChange()
            void this.end().catch((error: unknown) =>
                console.error(
                    'SignalSwitchGame end failed (systems-failed)',
                    error
                )
            )
            return false
        }

        return true
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
