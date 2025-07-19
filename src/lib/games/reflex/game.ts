import type {
    GameState,
    GameConfig,
    GameCallbacks,
    GameObject,
    Cell,
    SpawnResult,
    GameStats,
} from './types'

export class ReflexGame {
    private state: GameState
    private config: GameConfig
    private callbacks: GameCallbacks
    private gameTimer: number | null = null
    private spawnTimer: number | null = null
    private grid: Cell[][] = []

    constructor(config: GameConfig, callbacks: GameCallbacks) {
        this.config = config
        this.callbacks = callbacks
        this.state = this.getInitialState()
        this.initializeGrid()
    }

    private getInitialState(): GameState {
        return {
            score: 0,
            timeRemaining: this.config.gameDuration,
            isGameActive: false,
            isGameOver: false,
            gameStartTime: null,
            objects: [],
            totalClicks: 0,
            correctClicks: 0,
            incorrectClicks: 0,
            coinsCollected: 0,
            bombsHit: 0,
            missedCoins: 0,
            gameHistory: [],
        }
    }

    private initializeGrid(): void {
        this.grid = []
        for (let row = 0; row < this.config.gridSize; row++) {
            this.grid[row] = []
            for (let col = 0; col < this.config.gridSize; col++) {
                this.grid[row][col] = {
                    id: `cell-${row}-${col}`,
                    row,
                    col,
                    x: col * this.config.cellSize,
                    y: row * this.config.cellSize,
                }
            }
        }
    }

    public startGame(): void {
        if (this.state.isGameActive) {
            return
        }

        this.state = this.getInitialState()
        this.state.isGameActive = true
        this.state.gameStartTime = Date.now()

        this.callbacks.onGameStart()
        this.callbacks.onScoreUpdate(this.state.score)
        this.callbacks.onTimeUpdate(this.state.timeRemaining)

        this.startTimers()
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

    private spawnRandomObject(): SpawnResult {
        // Clean up expired objects first
        this.cleanupExpiredObjects()

        // Find available cells (not occupied by active objects)
        const occupiedCells = new Set(
            this.state.objects.map(obj => `${obj.cell.row}-${obj.cell.col}`)
        )
        const availableCells: Cell[] = []

        for (let row = 0; row < this.config.gridSize; row++) {
            for (let col = 0; col < this.config.gridSize; col++) {
                if (!occupiedCells.has(`${row}-${col}`)) {
                    availableCells.push(this.grid[row][col])
                }
            }
        }

        if (availableCells.length === 0) {
            return { success: false, reason: 'No available cells' }
        }

        // Select random cell
        const randomCell =
            availableCells[Math.floor(Math.random() * availableCells.length)]

        // Determine object type based on coin:bomb ratio (8:1)
        const isCoin =
            Math.random() <
            this.config.coinToBombRatio / (this.config.coinToBombRatio + 1)
        const objectType = isCoin ? 'coin' : 'bomb'

        const now = Date.now()
        const newObject: GameObject = {
            id: `${objectType}-${now}-${randomCell.row}-${randomCell.col}`,
            type: objectType,
            cell: randomCell,
            spawnTime: now,
            expirationTime: now + this.config.objectLifetime * 1000,
            isActive: true,
            clicked: false,
        }

        this.state.objects.push(newObject)
        this.callbacks.onObjectSpawn(newObject)

        return { success: true, object: newObject }
    }

    public cleanupExpiredObjects(): void {
        const now = Date.now()
        const expiredObjects = this.state.objects.filter(
            obj => now >= obj.expirationTime && obj.isActive
        )

        expiredObjects.forEach(obj => {
            obj.isActive = false
            this.callbacks.onObjectExpire(obj)

            // Track missed coins
            if (obj.type === 'coin' && !obj.clicked) {
                this.state.missedCoins++
                const penalty = this.config.pointsForMissedCoin
                this.state.score += penalty
                this.callbacks.onScoreUpdate(this.state.score)

                this.state.gameHistory.push({
                    objectId: obj.id,
                    type: obj.type,
                    clicked: false,
                    pointsAwarded: penalty,
                })
            }
        })

        // Remove expired objects
        this.state.objects = this.state.objects.filter(obj => obj.isActive)
    }

    public handleCellClick(row: number, col: number): boolean {
        if (!this.state.isGameActive) {
            return false
        }

        this.state.totalClicks++

        // Find object at this cell
        const clickedObject = this.state.objects.find(
            obj =>
                obj.isActive &&
                obj.cell.row === row &&
                obj.cell.col === col &&
                !obj.clicked
        )

        if (!clickedObject) {
            // Empty cell click - no points change
            return false
        }

        // Mark object as clicked
        clickedObject.clicked = true
        clickedObject.isActive = false

        const clickTime = Date.now()
        const reactionTime = clickTime - clickedObject.spawnTime

        let pointsAwarded = 0

        if (clickedObject.type === 'coin') {
            pointsAwarded = this.config.pointsForCoin
            this.state.coinsCollected++
            this.state.correctClicks++
        } else {
            pointsAwarded = this.config.pointsForBomb
            this.state.bombsHit++
            this.state.incorrectClicks++
        }

        this.state.score += pointsAwarded
        this.callbacks.onScoreUpdate(this.state.score)
        this.callbacks.onObjectClick(clickedObject, pointsAwarded)

        this.state.gameHistory.push({
            objectId: clickedObject.id,
            type: clickedObject.type,
            clicked: true,
            timeToClick: reactionTime,
            pointsAwarded,
        })

        // Remove clicked object
        this.state.objects = this.state.objects.filter(
            obj => obj.id !== clickedObject.id
        )

        return true
    }

    private generateGameStats(): GameStats {
        const totalReactionTime = this.state.gameHistory
            .filter(entry => entry.clicked && entry.timeToClick)
            .reduce((sum, entry) => sum + (entry.timeToClick || 0), 0)

        const clickedObjectsCount = this.state.gameHistory.filter(
            entry => entry.clicked
        ).length

        return {
            finalScore: this.state.score,
            totalClicks: this.state.totalClicks,
            correctClicks: this.state.correctClicks,
            incorrectClicks: this.state.incorrectClicks,
            accuracy:
                this.state.totalClicks > 0
                    ? (this.state.correctClicks / this.state.totalClicks) * 100
                    : 0,
            coinsCollected: this.state.coinsCollected,
            bombsHit: this.state.bombsHit,
            missedCoins: this.state.missedCoins,
            averageReactionTime:
                clickedObjectsCount > 0
                    ? totalReactionTime / clickedObjectsCount
                    : 0,
            objectsSpawned: this.state.gameHistory.length,
            gameHistory: [...this.state.gameHistory],
        }
    }

    public getState(): GameState {
        return { ...this.state }
    }

    public getGrid(): Cell[][] {
        return this.grid
    }

    public getActiveObjects(): GameObject[] {
        return this.state.objects.filter(obj => obj.isActive)
    }

    public cleanup(): void {
        this.clearTimers()
        this.state.objects = []
    }
}
