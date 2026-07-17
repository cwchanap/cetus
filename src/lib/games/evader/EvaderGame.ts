// Evader game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type { EvaderState, EvaderConfig, EvaderStats } from './frameworkTypes'
import type { GameObject, GameHistoryEntry } from './types'
import { clamp, rectOverlap, generateId } from '@/lib/games/shared/utils'
import { rollSpawnType } from '@/lib/games/shared/spawner'

/** Input source for pressKey/releaseKey. Keyboard and touch are tracked
 * independently so releasing one source doesn't drop a key held by the other. */
export type InputSource = 'keyboard' | 'touch'

// Default configuration for the Evader game
export const DEFAULT_EVADER_CONFIG: EvaderConfig = {
    // BaseGameConfig — Evader is a 60-second countdown game.
    duration: 60,
    achievementIntegration: true,
    pausable: true,
    resettable: true,
    // EvaderConfig
    canvasWidth: 800,
    canvasHeight: 300,
    playerSize: 40,
    playerSpeed: 300, // pixels per second
    objectSize: 30,
    spawnInterval: 0.5, // seconds (doubled coin density)
    objectSpeed: 200, // pixels per second
    coinToBombRatio: 0.5, // 0.5:1 coins to bombs (2:1 bomb to coin)
    pointsForCoin: 100,
    pointsForBomb: -100,
    backgroundColor: 0x000a14,
}

export class EvaderGame extends BaseGame<
    EvaderState,
    EvaderConfig,
    EvaderStats
> {
    private spawnTimerId: number | null = null
    // Track keyboard and touch inputs separately so releasing one source
    // (e.g. the D-pad) doesn't drop a key still physically held by the other
    // (e.g. the keyboard). Both feed getActiveDirections() via union.
    private keyboardHeldKeys: Set<string> = new Set()
    private touchHeldKeys: Set<string> = new Set()

    constructor(
        config: Partial<EvaderConfig> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: EvaderConfig = {
            ...DEFAULT_EVADER_CONFIG,
            ...config,
        }
        super(
            GameID.EVADER,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                timeBonus: false,
            }
        )
    }

    createInitialState(): EvaderState {
        return {
            // BaseGameState fields
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            // EvaderState fields
            objects: [],
            player: {
                x: this.config.playerSize / 2, // Start at left edge
                y: this.config.canvasHeight / 2,
                size: this.config.playerSize,
                speed: this.config.playerSpeed,
            },
            coinsCollected: 0,
            bombsHit: 0,
            gameHistory: [],
        }
    }

    protected onGameStart(): void {
        this.clearHeldKeys()
        this.startSpawnTimer()
        this.emitStateChange()
    }

    protected onGamePause(): void {
        this.stopSpawnTimer()
    }

    protected onGameResume(): void {
        this.startSpawnTimer()
    }

    protected onGameEnd(_finalScore: number, _finalStats: EvaderStats): void {
        this.stopSpawnTimer()
        this.clearHeldKeys()
    }

    protected onGameReset(): void {
        this.stopSpawnTimer()
        this.clearHeldKeys()
        this.emitStateChange()
    }

    update(deltaTime: number): void {
        if (!this.state.isActive || this.state.isPaused) {
            return
        }

        // Update player position based on pressed keys
        const activeDirs = this.getActiveDirections()

        // Vertical movement
        let verticalVelocity = 0
        if (activeDirs.has('up')) {
            verticalVelocity = -this.config.playerSpeed
        } else if (activeDirs.has('down')) {
            verticalVelocity = this.config.playerSpeed
        }
        this.state.player.y += verticalVelocity * deltaTime
        this.state.player.y = clamp(
            this.state.player.y,
            this.state.player.size / 2,
            this.config.canvasHeight - this.state.player.size / 2
        )

        // Horizontal movement
        let horizontalVelocity = 0
        if (activeDirs.has('left')) {
            horizontalVelocity = -this.config.playerSpeed
        } else if (activeDirs.has('right')) {
            horizontalVelocity = this.config.playerSpeed
        }
        this.state.player.x += horizontalVelocity * deltaTime
        this.state.player.x = clamp(
            this.state.player.x,
            this.state.player.size / 2,
            this.config.canvasWidth - this.state.player.size / 2
        )

        // Move objects left
        this.state.objects.forEach(obj => {
            obj.x -= obj.speed * deltaTime
        })

        // Check collisions and remove off-screen / collected objects
        let changed = false
        this.state.objects = this.state.objects.filter(obj => {
            // Object off screen
            if (obj.x < 0) {
                changed = true
                return false
            }

            // Check collision with player
            const playerRect = {
                x: this.state.player.x - this.state.player.size / 2,
                y: this.state.player.y - this.state.player.size / 2,
                width: this.state.player.size,
                height: this.state.player.size,
            }
            const objRect = {
                x: obj.x - this.config.objectSize / 2,
                y: obj.y - this.config.objectSize / 2,
                width: this.config.objectSize,
                height: this.config.objectSize,
            }

            if (rectOverlap(playerRect, objRect)) {
                let points = 0
                const historyEntry: GameHistoryEntry = {
                    type: obj.type,
                    points: 0,
                }

                if (obj.type === 'coin') {
                    points = this.config.pointsForCoin
                    this.state.coinsCollected++
                    historyEntry.points = points
                } else {
                    points = this.config.pointsForBomb
                    this.state.bombsHit++
                    historyEntry.points = points
                }

                this.addScore(
                    points,
                    obj.type === 'coin' ? 'coin_collect' : 'bomb_hit'
                )
                this.state.gameHistory.push(historyEntry)
                changed = true
                return false // Remove object
            }

            return true
        })

        if (changed) {
            this.emitStateChange()
        }
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        this.stopSpawnTimer()
        this.state.objects = []
    }

    getGameStats(): EvaderStats {
        return {
            finalScore: this.state.score,
            timeElapsed: Math.max(
                0,
                this.config.duration - this.state.timeRemaining
            ),
            gameCompleted: this.state.isGameOver,
            coinsCollected: this.state.coinsCollected,
            bombsHit: this.state.bombsHit,
            gameHistory: [...this.state.gameHistory],
        }
    }

    protected getGameData(): Record<string, unknown> {
        const survivalTime = this.config.duration - this.state.timeRemaining
        return {
            coinsCollected: this.state.coinsCollected,
            bombsHit: this.state.bombsHit,
            longestSurvivalTime: Math.max(0, Math.floor(survivalTime)),
        }
    }

    // --- Evader-specific public API ---

    /**
     * Spawn a random object (coin or bomb) at the right edge of the canvas.
     */
    spawnRandomObject(): void {
        const objectType = rollSpawnType(this.config.coinToBombRatio)

        const now = Date.now()
        const newObject: GameObject = {
            id: generateId(),
            type: objectType,
            x: this.config.canvasWidth,
            y: Math.random() * this.config.canvasHeight,
            speed: this.config.objectSpeed,
            spawnTime: now,
        }

        this.state.objects.push(newObject)
        this.emitStateChange()
    }

    pressKey(key: string, source: InputSource = 'keyboard'): void {
        const movementKey = normalizeMovementKey(key)
        if (!movementKey) {
            return
        }
        this.heldKeysFor(source).add(key)
    }

    releaseKey(key: string, source: InputSource = 'keyboard'): void {
        const held = this.heldKeysFor(source)
        held.delete(key)
        if (source === 'keyboard') {
            // Clear case variants to handle Shift state changes between
            // keydown/keyup. e.g. press W (Shift held) adds 'W', release w
            // (Shift released) must also remove 'W'. Touch sources use fixed
            // data-key strings and don't need this.
            held.delete(key.toUpperCase())
            held.delete(key.toLowerCase())
        }
    }

    getConfig(): EvaderConfig {
        return { ...this.config }
    }

    /** Derive normalized direction set from currently held raw keys. */
    private getActiveDirections(): Set<string> {
        const dirs = new Set<string>()
        for (const key of this.keyboardHeldKeys) {
            const dir = normalizeMovementKey(key)
            if (dir) {
                dirs.add(dir)
            }
        }
        for (const key of this.touchHeldKeys) {
            const dir = normalizeMovementKey(key)
            if (dir) {
                dirs.add(dir)
            }
        }
        return dirs
    }

    private heldKeysFor(source: InputSource): Set<string> {
        return source === 'touch' ? this.touchHeldKeys : this.keyboardHeldKeys
    }

    private clearHeldKeys(): void {
        this.keyboardHeldKeys.clear()
        this.touchHeldKeys.clear()
    }

    /** Exposed for tests — returns the normalized direction set. */
    get pressedKeys(): Set<string> {
        return this.getActiveDirections()
    }

    private startSpawnTimer(): void {
        if (this.spawnTimerId !== null) {
            return
        }

        this.spawnTimerId = window.setInterval(() => {
            if (
                !this.state.isActive ||
                this.state.isPaused ||
                this.state.isGameOver
            ) {
                return
            }
            this.spawnRandomObject()
        }, this.config.spawnInterval * 1000)
    }

    private stopSpawnTimer(): void {
        if (this.spawnTimerId !== null) {
            clearInterval(this.spawnTimerId)
            this.spawnTimerId = null
        }
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}

export default EvaderGame

function normalizeMovementKey(
    key: string
): 'up' | 'down' | 'left' | 'right' | null {
    switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            return 'up'
        case 'ArrowDown':
        case 's':
        case 'S':
            return 'down'
        case 'ArrowLeft':
        case 'a':
        case 'A':
            return 'left'
        case 'ArrowRight':
        case 'd':
        case 'D':
            return 'right'
        default:
            return null
    }
}
