import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { clamp, lerp } from '@/lib/games/shared/utils'
import { GameID } from '@/lib/games'
import { calculateGravityFlipScore } from './scoring'
import {
    createGravityFlipConfig,
    type GravityFlipConfig,
    type GravityFlipGameData,
    type GravityFlipState,
    type GravityFlipStats,
} from './types'

export class GravityFlipGame extends BaseGame<
    GravityFlipState,
    GravityFlipConfig,
    GravityFlipStats
> {
    private elapsedSimSeconds = 0

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
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.elapsedSimSeconds = 0
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
