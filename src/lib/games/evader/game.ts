import type {
    GameState,
    GameConfig,
    GameCallbacks,
    GameObject,
    GameStats,
} from './types'
import { clamp, rectOverlap, generateId } from '@/lib/games/shared/utils'
import { rollSpawnType } from '@/lib/games/shared/spawner'

export class EvaderGame {
    private state: GameState
    private config: GameConfig
    private callbacks: GameCallbacks
    private gameTimer: number | null = null
    private spawnTimer: number | null = null
    private lastUpdateTime: number = 0
    private rawHeldKeys: Set<string> = new Set()

    constructor(config: GameConfig, callbacks: GameCallbacks) {
        this.config = config
        this.callbacks = callbacks
        this.state = this.getInitialState()
    }

    private getInitialState(): GameState {
        return {
            score: 0,
            timeRemaining: this.config.gameDuration,
            isGameActive: false,
            isGameOver: false,
            gameStartTime: null,
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

    public startGame(): void {
        if (this.state.isGameActive) {
            return
        }

        this.state = this.getInitialState()
        this.state.isGameActive = true
        this.state.gameStartTime = Date.now()
        this.lastUpdateTime = Date.now()

        this.callbacks.onGameStart()
        this.callbacks.onScoreUpdate(this.state.score)
        this.callbacks.onTimeUpdate(this.state.timeRemaining)

        this.startTimers()
        this.gameLoop()
    }

    public stopGame(): void {
        this.clearTimers()
        this.state.isGameActive = false
        this.state.isGameOver = true
        this.rawHeldKeys.clear()

        const stats = this.generateGameStats()
        this.callbacks.onGameOver(this.state.score, stats)
    }

    private startTimers(): void {
        // Game countdown timer
        this.gameTimer = window.setInterval(() => {
            if (!this.state.isGameActive) {
                return
            }

            this.state.timeRemaining--
            this.callbacks.onTimeUpdate(this.state.timeRemaining)

            if (this.state.timeRemaining <= 0) {
                this.stopGame()
            }
        }, 1000)

        // Object spawn timer
        this.spawnTimer = window.setInterval(() => {
            if (!this.state.isGameActive) {
                return
            }
            this.spawnRandomObject()
        }, this.config.spawnInterval * 1000)
    }

    private clearTimers(): void {
        if (this.gameTimer) {
            clearInterval(this.gameTimer)
            this.gameTimer = null
        }
        if (this.spawnTimer) {
            clearInterval(this.spawnTimer)
            this.spawnTimer = null
        }
    }

    private spawnRandomObject(): void {
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
        this.callbacks.onObjectSpawn(newObject)
    }

    private gameLoop = (): void => {
        if (!this.state.isGameActive) {
            return
        }

        const now = Date.now()
        const deltaTime = (now - this.lastUpdateTime) / 1000
        this.lastUpdateTime = now

        this.update(deltaTime)

        requestAnimationFrame(this.gameLoop)
    }

    private update(deltaTime: number): void {
        // Update player position based on pressed keys
        if (this.state.isGameActive) {
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
        }

        // Move objects left
        this.state.objects.forEach(obj => {
            obj.x -= obj.speed * deltaTime
        })

        // Check collisions
        this.state.objects = this.state.objects.filter(obj => {
            if (obj.x < 0) {
                // Object off screen
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
                // Collision
                let points = 0
                if (obj.type === 'coin') {
                    points = this.config.pointsForCoin
                    this.state.coinsCollected++
                } else {
                    points = this.config.pointsForBomb
                    this.state.bombsHit++
                }

                this.state.score += points
                this.callbacks.onScoreUpdate(this.state.score)
                this.callbacks.onCollision(obj, points)

                this.state.gameHistory.push({
                    type: obj.type,
                    points,
                })

                return false // Remove object
            }

            return true
        })
    }

    public pressKey(key: string): void {
        const movementKey = normalizeMovementKey(key)
        if (movementKey) {
            this.rawHeldKeys.add(key)
        }
    }

    public releaseKey(key: string): void {
        this.rawHeldKeys.delete(key)
        // Clear case variants to handle Shift state changes between keydown/keyup.
        // e.g. press W (Shift held) adds 'W', release w (Shift released) must also remove 'W'.
        this.rawHeldKeys.delete(key.toUpperCase())
        this.rawHeldKeys.delete(key.toLowerCase())
    }

    private generateGameStats(): GameStats {
        return {
            finalScore: this.state.score,
            coinsCollected: this.state.coinsCollected,
            bombsHit: this.state.bombsHit,
            gameTime: this.config.gameDuration - this.state.timeRemaining,
            gameHistory: [...this.state.gameHistory],
        }
    }

    public getState(): GameState {
        return { ...this.state }
    }

    public cleanup(): void {
        this.clearTimers()
        this.state.objects = []
    }

    /** Derive normalized direction set from currently held raw keys. */
    private getActiveDirections(): Set<string> {
        const dirs = new Set<string>()
        for (const key of this.rawHeldKeys) {
            const dir = normalizeMovementKey(key)
            if (dir) {
                dirs.add(dir)
            }
        }
        return dirs
    }

    /** Exposed for tests — returns the normalized direction set. */
    get pressedKeys(): Set<string> {
        return this.getActiveDirections()
    }
}

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
