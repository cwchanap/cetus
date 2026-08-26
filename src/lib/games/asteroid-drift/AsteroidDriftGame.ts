import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { circleOverlap } from '@/lib/games/shared/geometry'
import { clamp, lerp } from '@/lib/games/shared/utils'
import { GameID } from '@/lib/games'
import { calculateAsteroidDriftScore } from './scoring'
import {
    createIntroAsteroid,
    createRandomAsteroid,
    findEnergyOrbSpawn,
    isAsteroidOffArena,
} from './spawning'
import {
    createAsteroidDriftConfig,
    type AsteroidDriftConfig,
    type AsteroidDriftDirection,
    type AsteroidDriftGameData,
    type AsteroidDriftInputSource,
    type AsteroidDriftState,
    type AsteroidDriftStats,
} from './types'

export class AsteroidDriftGame extends BaseGame<
    AsteroidDriftState,
    AsteroidDriftConfig,
    AsteroidDriftStats
> {
    private elapsedSimSeconds = 0
    private asteroidSpawnAccumulator = 0
    private orbSpawnAccumulator = 0
    private entitySequence = 0
    private keyboardHeldDirections = new Set<AsteroidDriftDirection>()
    private touchHeldDirections = new Set<AsteroidDriftDirection>()

    constructor(
        config: AsteroidDriftConfig = createAsteroidDriftConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.ASTEROID_DRIFT, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): AsteroidDriftState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            player: {
                x: this.config.canvasWidth / 2,
                y: this.config.canvasHeight / 2,
                velocityX: 0,
                velocityY: 0,
                radius: this.config.playerRadius,
            },
            asteroids: [],
            energyOrb: null,
            orbsCollected: 0,
        }
    }

    pressDirection(
        direction: AsteroidDriftDirection,
        source: AsteroidDriftInputSource = 'keyboard'
    ): void {
        this.heldDirectionsFor(source).add(direction)
    }

    releaseDirection(
        direction: AsteroidDriftDirection,
        source: AsteroidDriftInputSource = 'keyboard'
    ): void {
        this.heldDirectionsFor(source).delete(direction)
    }

    get pressedDirections(): Set<AsteroidDriftDirection> {
        return this.getActiveDirections()
    }

    update(deltaTime: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            !Number.isFinite(deltaTime) ||
            deltaTime <= 0 ||
            !Number.isFinite(this.config.maxPhysicsStep) ||
            this.config.maxPhysicsStep <= 0
        ) {
            return
        }

        let remaining = Math.min(deltaTime, this.config.maxUpdateDelta)
        while (remaining > 0 && this.state.isActive) {
            // The simulation clock is authoritative for survival: once it
            // reaches config.duration, no further substeps may run, or a
            // collision in a post-duration frame could flip a survived run
            // to collision before handleTimeUp (independent GameTimer
            // clock) classifies the outcome.
            const simBudget = this.config.duration - this.elapsedSimSeconds
            if (simBudget <= 0) {
                break
            }
            const step = Math.min(
                remaining,
                this.config.maxPhysicsStep,
                simBudget
            )
            this.stepPhysics(step)
            remaining -= step
        }
        this.syncScore()
        this.emitStateChange()
    }

    render(): void {}

    getGameStats(): AsteroidDriftStats {
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
            gameCompleted: this.state.isGameOver,
            outcome: this.state.outcome,
            survivalSeconds: Math.floor(this.survivalSeconds()),
            orbsCollected: this.state.orbsCollected,
        }
    }

    cleanup(): void {}

    protected handleTimeUp(): void {
        const simulated = clamp(this.elapsedSimSeconds, 0, this.config.duration)
        const completedSimulation =
            simulated >= this.config.duration - this.config.maxUpdateDelta

        this.state.outcome = completedSimulation ? 'survived' : 'expired'
        this.syncScore()
        super.handleTimeUp()
    }

    protected getGameData(): Record<string, unknown> {
        const data = {
            survivalSeconds: Math.floor(this.survivalSeconds()),
            orbsCollected: this.state.orbsCollected,
            survivedFullRun: this.state.outcome === 'survived',
        } satisfies AsteroidDriftGameData
        return data
    }

    protected onGameStart(): void {
        this.elapsedSimSeconds = 0
        this.asteroidSpawnAccumulator = -this.config.openingRandomSpawnGrace
        this.orbSpawnAccumulator = 0
        this.entitySequence = 0
        this.keyboardHeldDirections.clear()
        this.touchHeldDirections.clear()
        this.state.asteroids.push(
            createIntroAsteroid(this.entityId('asteroid'), this.config)
        )
        this.emitStateChange()
    }

    protected onGameEnd(): void {
        this.keyboardHeldDirections.clear()
        this.touchHeldDirections.clear()
    }

    protected onGameReset(): void {
        this.elapsedSimSeconds = 0
        this.asteroidSpawnAccumulator = 0
        this.orbSpawnAccumulator = 0
        this.entitySequence = 0
        this.keyboardHeldDirections.clear()
        this.touchHeldDirections.clear()
    }

    /**
     * One fixed physics substep, in the spec order: (1) sim clock,
     * (2) player integration, (3) asteroid move/despawn, (4) orb aging,
     * (5) asteroid collision, (6) orb collection, (7) spawn accumulators.
     * Collision deliberately precedes collection so a same-substep
     * asteroid+orb contact loses the run without awarding the orb.
     */
    private stepPhysics(step: number): void {
        this.elapsedSimSeconds = Math.min(
            this.config.duration,
            this.elapsedSimSeconds + step
        )

        this.integratePlayer(step)

        this.state.asteroids = this.state.asteroids.filter(asteroid => {
            asteroid.x += asteroid.velocityX * step
            asteroid.y += asteroid.velocityY * step
            return !isAsteroidOffArena(asteroid, this.config)
        })

        if (this.state.energyOrb) {
            this.state.energyOrb.ageSeconds += step
            if (this.state.energyOrb.ageSeconds >= this.config.orbLifetime) {
                this.state.energyOrb = null
                this.orbSpawnAccumulator = 0
            }
        }

        for (const asteroid of this.state.asteroids) {
            if (
                circleOverlap(
                    this.state.player,
                    this.state.player.radius,
                    asteroid,
                    asteroid.radius
                )
            ) {
                this.state.outcome = 'collision'
                this.syncScore()
                void this.end().catch((error: unknown) =>
                    console.error('AsteroidDrift end failed', error)
                )
                return
            }
        }

        this.collectOrbIfOverlapping()

        this.advanceAsteroidSpawning(step)
        this.advanceOrbSpawning(step)
    }

    private integratePlayer(step: number): void {
        const player = this.state.player
        const directions = this.getActiveDirections()
        const rawX =
            Number(directions.has('right')) - Number(directions.has('left'))
        const rawY =
            Number(directions.has('down')) - Number(directions.has('up'))
        const inputLength = Math.hypot(rawX, rawY)
        const inputX = inputLength > 0 ? rawX / inputLength : 0
        const inputY = inputLength > 0 ? rawY / inputLength : 0

        player.velocityX += this.config.thrustAcceleration * inputX * step
        player.velocityY += this.config.thrustAcceleration * inputY * step

        const drag = Math.exp(-this.config.dragPerSecond * step)
        player.velocityX *= drag
        player.velocityY *= drag

        const speed = Math.hypot(player.velocityX, player.velocityY)
        if (speed > this.config.maxPlayerSpeed) {
            const scale = this.config.maxPlayerSpeed / speed
            player.velocityX *= scale
            player.velocityY *= scale
        }

        player.x += player.velocityX * step
        player.y += player.velocityY * step

        this.clampPlayerToArena(player)
    }

    private clampPlayerToArena(player: AsteroidDriftState['player']): void {
        const minX = this.config.playerRadius
        const maxX = this.config.canvasWidth - this.config.playerRadius
        const minY = this.config.playerRadius
        const maxY = this.config.canvasHeight - this.config.playerRadius

        if (player.x <= minX) {
            player.x = minX
            if (player.velocityX < 0) {
                player.velocityX = 0
            }
        } else if (player.x >= maxX) {
            player.x = maxX
            if (player.velocityX > 0) {
                player.velocityX = 0
            }
        }
        if (player.y <= minY) {
            player.y = minY
            if (player.velocityY < 0) {
                player.velocityY = 0
            }
        } else if (player.y >= maxY) {
            player.y = maxY
            if (player.velocityY > 0) {
                player.velocityY = 0
            }
        }
    }

    private collectOrbIfOverlapping(): void {
        const orb = this.state.energyOrb
        if (!orb) {
            return
        }
        if (
            circleOverlap(
                this.state.player,
                this.state.player.radius,
                orb,
                orb.radius
            )
        ) {
            this.state.energyOrb = null
            this.state.orbsCollected += 1
            this.orbSpawnAccumulator = 0
        }
    }

    private advanceAsteroidSpawning(step: number): void {
        const progress = clamp(
            this.elapsedSimSeconds / this.config.duration,
            0,
            1
        )
        const interval = lerp(
            this.config.asteroidInitialInterval,
            this.config.asteroidFinalInterval,
            progress
        )
        if (this.state.asteroids.length >= this.config.maxAsteroids) {
            // At capacity: consume zero RNG and cap spawn debt at one
            // current interval, so releasing capacity yields one spawn.
            this.asteroidSpawnAccumulator = Math.min(
                this.asteroidSpawnAccumulator + step,
                interval
            )
            return
        }
        this.asteroidSpawnAccumulator += step
        if (this.asteroidSpawnAccumulator >= interval) {
            this.asteroidSpawnAccumulator = 0
            this.state.asteroids.push(
                createRandomAsteroid(
                    this.entityId('asteroid'),
                    this.state.player,
                    progress,
                    this.config
                )
            )
        }
    }

    private advanceOrbSpawning(step: number): void {
        if (this.state.energyOrb) {
            // While an orb exists the accumulator may advance but stays
            // capped at one interval; no attempt runs.
            this.orbSpawnAccumulator = Math.min(
                this.orbSpawnAccumulator + step,
                this.config.orbSpawnInterval
            )
            return
        }
        this.orbSpawnAccumulator += step
        if (this.orbSpawnAccumulator >= this.config.orbSpawnInterval) {
            this.orbSpawnAccumulator = 0
            const spawn = findEnergyOrbSpawn(
                this.state.player,
                this.state.asteroids,
                this.config
            )
            if (spawn) {
                this.state.energyOrb = {
                    id: this.entityId('orb'),
                    x: spawn.x,
                    y: spawn.y,
                    radius: this.config.orbRadius,
                    ageSeconds: 0,
                }
            }
        }
    }

    private survivalSeconds(): number {
        if (this.state.outcome === 'survived') {
            return this.config.duration
        }
        return clamp(this.elapsedSimSeconds, 0, this.config.duration)
    }

    private syncScore(): void {
        const target = calculateAsteroidDriftScore(
            {
                survivalSeconds: this.survivalSeconds(),
                orbsCollected: this.state.orbsCollected,
            },
            this.config
        )
        const delta = target - this.state.score
        if (delta > 0) {
            this.addScore(delta, 'asteroid_drift_progress')
        }
    }

    private getActiveDirections(): Set<AsteroidDriftDirection> {
        return new Set([
            ...this.keyboardHeldDirections,
            ...this.touchHeldDirections,
        ])
    }

    private heldDirectionsFor(
        source: AsteroidDriftInputSource
    ): Set<AsteroidDriftDirection> {
        return source === 'touch'
            ? this.touchHeldDirections
            : this.keyboardHeldDirections
    }

    private entityId(prefix: 'asteroid' | 'orb'): string {
        return `${prefix}-${this.entitySequence++}`
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
