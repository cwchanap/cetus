import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { clamp, lerp, rectOverlap } from '@/lib/games/shared/utils'
import { GameID } from '@/lib/games'
import { calculateGravityFlipScore } from './scoring'
import {
    GRAVITY_FLIP_HAZARD_CATALOG,
    createGravityFlipConfig,
    getGravityFlipMoverBounds,
    type GravityFlipConfig,
    type GravityFlipGameData,
    type GravityFlipHazard,
    type GravityFlipHazardDescriptor,
    type GravityFlipHazardKind,
    type GravityFlipState,
    type GravityFlipStats,
} from './types'

export class GravityFlipGame extends BaseGame<
    GravityFlipState,
    GravityFlipConfig,
    GravityFlipStats
> {
    private elapsedSimSeconds = 0
    private distanceSinceChallenge = 0
    private entitySequence = 0

    constructor(
        config: GravityFlipConfig = createGravityFlipConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.GRAVITY_FLIP, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): GravityFlipState {
        const half = this.config.playerSize / 2
        const floorY =
            this.config.canvasHeight - this.config.corridorInset - half

        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            gravity: 'down',
            player: {
                x: this.config.playerX,
                y: floorY,
                velocityY: 0,
                size: this.config.playerSize,
            },
            hazards: [],
            stars: [],
            distance: 0,
            starsCollected: 0,
            flips: 0,
            worldSpeed: this.config.initialWorldSpeed,
        }
    }

    flipGravity(): boolean {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver
        ) {
            return false
        }
        this.state.gravity = this.state.gravity === 'down' ? 'up' : 'down'
        this.state.flips += 1
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

        let remaining = Math.min(deltaTime, 0.1)
        while (remaining > 0 && this.state.isActive) {
            const step = Math.min(remaining, this.config.maxPhysicsStep)
            this.stepPhysics(step)
            remaining -= step
        }
        this.syncScore()
        this.emitStateChange()
    }

    render(): void {}

    getConfig(): GravityFlipConfig {
        return { ...this.config }
    }

    getGameStats(): GravityFlipStats {
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
            gameCompleted: this.state.isGameOver,
            outcome: this.state.outcome,
            distance: Math.floor(this.state.distance),
            starsCollected: this.state.starsCollected,
            flips: this.state.flips,
        }
    }

    cleanup(): void {}

    protected handleTimeUp(): void {
        this.state.outcome = 'survived'
        super.handleTimeUp()
    }

    protected getGameData(): Record<string, unknown> {
        const data = {
            distance: Math.floor(this.state.distance),
            starsCollected: this.state.starsCollected,
            flips: this.state.flips,
            survivedFullRun: this.state.outcome === 'survived',
        } satisfies GravityFlipGameData
        return data
    }

    protected onGameStart(): void {
        this.elapsedSimSeconds = 0
        this.distanceSinceChallenge = 0
        this.entitySequence = 0
        this.spawnChallenge('floor-spike')
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.elapsedSimSeconds = 0
        this.distanceSinceChallenge = 0
        this.entitySequence = 0
    }

    private stepPhysics(step: number): void {
        this.elapsedSimSeconds = Math.min(
            this.config.duration,
            this.elapsedSimSeconds + step
        )
        const progress = clamp(
            this.elapsedSimSeconds / this.config.duration,
            0,
            1
        )
        this.state.worldSpeed = lerp(
            this.config.initialWorldSpeed,
            this.config.finalWorldSpeed,
            progress
        )

        const acceleration =
            this.state.gravity === 'down'
                ? this.config.gravityAcceleration
                : -this.config.gravityAcceleration
        this.state.player.velocityY = clamp(
            this.state.player.velocityY + acceleration * step,
            -this.config.maxVerticalSpeed,
            this.config.maxVerticalSpeed
        )
        this.state.player.y += this.state.player.velocityY * step

        const playerRect = this.playerRect()
        const floor = this.config.canvasHeight - this.config.corridorInset
        if (playerRect.y <= this.config.corridorInset) {
            this.state.player.y =
                this.config.corridorInset + playerRect.height / 2
            this.state.player.velocityY = 0
        } else if (playerRect.y + playerRect.height >= floor) {
            this.state.player.y = floor - playerRect.height / 2
            this.state.player.velocityY = 0
        }

        this.state.distance += this.state.worldSpeed * step
        this.distanceSinceChallenge += this.state.worldSpeed * step

        this.moveHazards(step)
        this.moveStars(step)
        this.collectStars()

        for (const hazard of this.state.hazards) {
            if (this.collidesWithHazard(hazard)) {
                this.state.outcome = 'collision'
                this.syncScore()
                void this.end()
                return
            }
        }

        this.spawnIfSpacingReached()
    }

    private playerRect() {
        const half = this.state.player.size / 2
        return {
            x: this.state.player.x - half,
            y: this.state.player.y - half,
            width: this.state.player.size,
            height: this.state.player.size,
        }
    }

    private entityId(prefix: 'hazard' | 'star'): string {
        return `${prefix}-${this.entitySequence++}`
    }

    private currentChallengeSpacing(): number {
        const progress = clamp(
            this.elapsedSimSeconds / this.config.duration,
            0,
            1
        )
        return lerp(
            this.config.initialChallengeSpacing,
            this.config.finalChallengeSpacing,
            progress
        )
    }

    private eligibleKinds(): GravityFlipHazardKind[] {
        return (
            Object.entries(GRAVITY_FLIP_HAZARD_CATALOG) as Array<
                [GravityFlipHazardKind, GravityFlipHazardDescriptor]
            >
        )
            .filter(
                ([, descriptor]) =>
                    descriptor.shape !== 'mover' ||
                    this.elapsedSimSeconds >= this.config.moverUnlockSeconds
            )
            .map(([kind]) => kind)
    }

    private pickChallengeKind(): GravityFlipHazardKind {
        const kinds = this.eligibleKinds()
        const sample = this.config.rng()
        const raw = Number.isFinite(sample) ? sample : 0
        const index = Math.min(
            kinds.length - 1,
            Math.max(0, Math.floor(raw * kinds.length))
        )
        return kinds[index]
    }

    private spawnIfSpacingReached(): void {
        const spacing = this.currentChallengeSpacing()
        if (this.distanceSinceChallenge >= spacing) {
            this.distanceSinceChallenge -= spacing
            this.spawnChallenge(this.pickChallengeKind())
        }
    }

    private spawnChallenge(kind: GravityFlipHazardKind): void {
        const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[kind]
        switch (descriptor.shape) {
            case 'mover':
                this.spawnMover()
                return
            case 'spike':
            case 'gap': {
                const width =
                    descriptor.shape === 'gap'
                        ? this.config.gapWidth
                        : this.config.spikeWidth
                const height =
                    descriptor.shape === 'gap'
                        ? this.config.gapHeight
                        : this.config.spikeHeight
                const x = this.config.canvasWidth + this.config.spawnOffsetX
                const y =
                    descriptor.surface === 'floor'
                        ? this.config.canvasHeight -
                          this.config.corridorInset -
                          height
                        : this.config.corridorInset

                this.state.hazards.push({
                    id: this.entityId('hazard'),
                    kind,
                    x,
                    y,
                    width,
                    height,
                    verticalVelocity: 0,
                })

                if (descriptor.hasStar) {
                    this.spawnOppositeSurfaceStar(
                        x + width / 2,
                        descriptor.surface
                    )
                }
                return
            }
        }
    }

    private spawnOppositeSurfaceStar(
        x: number,
        hazardSurface: 'floor' | 'ceiling'
    ): void {
        const halfPlayer = this.config.playerSize / 2
        const ceilingY = this.config.corridorInset + halfPlayer
        const floorY =
            this.config.canvasHeight - this.config.corridorInset - halfPlayer
        this.state.stars.push({
            id: this.entityId('star'),
            x,
            y: hazardSurface === 'floor' ? ceilingY : floorY,
            radius: this.config.starRadius,
        })
    }

    private spawnMover(): void {
        const { minY, maxY } = getGravityFlipMoverBounds(this.config)
        this.state.hazards.push({
            id: this.entityId('hazard'),
            kind: 'mover',
            x: this.config.canvasWidth + this.config.spawnOffsetX,
            y: (minY + maxY) / 2,
            width: this.config.moverSize,
            height: this.config.moverSize,
            verticalVelocity: this.config.moverVerticalSpeed,
        })
    }

    private moveHazards(step: number): void {
        const { minY, maxY } = getGravityFlipMoverBounds(this.config)
        const distance = this.state.worldSpeed * step
        this.state.hazards = this.state.hazards.filter(hazard => {
            hazard.x -= distance
            const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]
            if (descriptor.shape === 'mover') {
                hazard.y += hazard.verticalVelocity * step
                if (hazard.y <= minY) {
                    hazard.y = minY
                    hazard.verticalVelocity = Math.abs(hazard.verticalVelocity)
                } else if (hazard.y >= maxY) {
                    hazard.y = maxY
                    hazard.verticalVelocity = -Math.abs(hazard.verticalVelocity)
                }
            }
            return hazard.x + hazard.width >= 0
        })
    }

    private moveStars(step: number): void {
        const distance = this.state.worldSpeed * step
        this.state.stars = this.state.stars.filter(star => {
            star.x -= distance
            return star.x + star.radius >= 0
        })
    }

    private collectStars(): void {
        const player = this.playerRect()
        this.state.stars = this.state.stars.filter(star => {
            const starRect = {
                x: star.x - star.radius,
                y: star.y - star.radius,
                width: star.radius * 2,
                height: star.radius * 2,
            }
            if (rectOverlap(player, starRect)) {
                this.state.starsCollected += 1
                return false
            }
            return star.x + star.radius >= 0
        })
    }

    private hazardRect(hazard: GravityFlipHazard) {
        return {
            x: hazard.x,
            y: hazard.y,
            width: hazard.width,
            height: hazard.height,
        }
    }

    private collidesWithHazard(hazard: GravityFlipHazard): boolean {
        const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]
        switch (descriptor.shape) {
            case 'gap':
                return this.collidesWithGap(hazard, descriptor.surface)
            case 'spike':
            case 'mover':
                return rectOverlap(this.playerRect(), this.hazardRect(hazard))
        }
    }

    private collidesWithGap(
        hazard: GravityFlipHazard,
        surface: 'floor' | 'ceiling'
    ): boolean {
        const player = this.playerRect()
        const overlapsX =
            player.x < hazard.x + hazard.width &&
            player.x + player.width > hazard.x
        if (!overlapsX) {
            return false
        }

        const half = this.state.player.size / 2
        const ceilingY = this.config.corridorInset + half
        const floorY =
            this.config.canvasHeight - this.config.corridorInset - half
        const targetY = surface === 'floor' ? floorY : ceilingY
        return (
            Math.abs(this.state.player.y - targetY) <=
            this.config.gapRailTolerance
        )
    }

    private syncScore(): void {
        const target = calculateGravityFlipScore({
            distancePx: this.state.distance,
            starsCollected: this.state.starsCollected,
        })
        const delta = target - this.state.score
        if (delta > 0) {
            this.addScore(delta, 'gravity_flip_progress')
        }
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
