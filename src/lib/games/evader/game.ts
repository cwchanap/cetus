import type {
    GameState,
    GameConfig,
    GameCallbacks,
    GameObject,
    GameStats,
} from './types'

export class EvaderGame {
    private state: GameState
    private config: GameConfig
    private callbacks: GameCallbacks
    private gameTimer: number | null = null
    private spawnTimer: number | null = null
    private lastUpdateTime: number = 0
    private pressedKeys: Set<string> = new Set()

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
        const isCoin =
            Math.random() <
            this.config.coinToBombRatio / (this.config.coinToBombRatio + 1)
        const objectType = isCoin ? 'coin' : 'bomb'

        const now = Date.now()
        const newObject: GameObject = {
            id: `${objectType}-${now}`,
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
        let velocity = 0
        if (this.state.isGameActive) {
            if (this.pressedKeys.has('ArrowUp')) {
                velocity = -this.config.playerSpeed
            } else if (this.pressedKeys.has('ArrowDown')) {
                velocity = this.config.playerSpeed
            }
            this.state.player.y += velocity * deltaTime
            this.state.player.y = Math.max(
                this.state.player.size / 2,
                Math.min(
                    this.config.canvasHeight - this.state.player.size / 2,
                    this.state.player.y
                )
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

            // Check collision with player (player is at x=0, width=player.size)
            const playerLeft = 0
            const playerRight = this.config.playerSize
            const playerTop = this.state.player.y - this.state.player.size / 2
            const playerBottom =
                this.state.player.y + this.state.player.size / 2

            const objLeft = obj.x - this.config.objectSize / 2
            const objRight = obj.x + this.config.objectSize / 2
            const objTop = obj.y - this.config.objectSize / 2
            const objBottom = obj.y + this.config.objectSize / 2

            if (
                objRight > playerLeft &&
                objLeft < playerRight &&
                objBottom > playerTop &&
                objTop < playerBottom
            ) {
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
        this.pressedKeys.add(key)
    }

    public releaseKey(key: string): void {
        this.pressedKeys.delete(key)
    }

    private generateGameStats(): GameStats {
        return {
            finalScore: this.state.score,
            coinsCollected: this.state.coinsCollected,
            bombsHit: this.state.bombsHit,
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
}
