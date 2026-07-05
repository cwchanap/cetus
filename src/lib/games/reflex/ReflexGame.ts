// Reflex game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type { ReflexState, ReflexConfig, ReflexStats } from './frameworkTypes'
import type { GameObject, Cell, GameHistoryEntry, SpawnResult } from './types'
import { randomElement, generateId } from '@/lib/games/shared/utils'
import { rollSpawnType } from '@/lib/games/shared/spawner'

/** Result returned by {@link ReflexGame.handleCellClick}. */
export interface ClickResult {
    /** Whether an active object was hit by the click. */
    hit: boolean
    /** Points awarded for this click (positive for coins, negative for bombs). */
    points: number
}

// Default configuration for the Reflex game
export const DEFAULT_REFLEX_CONFIG: ReflexConfig = {
    // BaseGameConfig — Reflex is a 60-second countdown game.
    duration: 60,
    achievementIntegration: true,
    pausable: true,
    resettable: true,
    // ReflexConfig
    gridSize: 12,
    cellSize: 40,
    objectLifetime: 2,
    spawnInterval: 1,
    coinToBombRatio: 2,
    pointsForCoin: 10,
    pointsForBomb: -15,
    pointsForMissedCoin: -5,
    backgroundColor: 0x000a14,
    gridLineColor: 0x0ea5e9,
}

export class ReflexGame extends BaseGame<
    ReflexState,
    ReflexConfig,
    ReflexStats
> {
    private spawnTimerId: number | null = null

    constructor(
        config: Partial<ReflexConfig> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: ReflexConfig = {
            ...DEFAULT_REFLEX_CONFIG,
            ...config,
        }
        super(
            GameID.REFLEX,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                timeBonus: false,
            }
        )
    }

    createInitialState(): ReflexState {
        return {
            // BaseGameState fields
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            // ReflexState fields
            objects: [],
            grid: this.buildGrid(),
            totalClicks: 0,
            correctClicks: 0,
            incorrectClicks: 0,
            coinsCollected: 0,
            bombsHit: 0,
            missedCoins: 0,
            gameHistory: [],
            needsRedraw: true,
        }
    }

    protected onGameStart(): void {
        this.startSpawnTimer()
        this.emitStateChange()
    }

    protected onGamePause(): void {
        this.stopSpawnTimer()
    }

    protected onGameResume(): void {
        this.startSpawnTimer()
    }

    protected onGameEnd(_finalScore: number, _finalStats: ReflexStats): void {
        this.stopSpawnTimer()
    }

    protected onGameReset(): void {
        this.stopSpawnTimer()
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        // Game logic is driven by the spawn timer interval
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        this.stopSpawnTimer()
    }

    getGameStats(): ReflexStats {
        const timerStatus = this.getTimerStatus()
        const totalReactionTime = this.state.gameHistory
            .filter(entry => entry.clicked && entry.timeToClick)
            .reduce((sum, entry) => sum + (entry.timeToClick || 0), 0)

        const clickedObjectsCount = this.state.gameHistory.filter(
            entry => entry.clicked
        ).length

        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
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

    protected getGameData(): Record<string, unknown> {
        return {
            coinsCollected: this.state.coinsCollected,
            bombsHit: this.state.bombsHit,
            missedCoins: this.state.missedCoins,
            accuracy:
                this.state.totalClicks > 0
                    ? (this.state.correctClicks / this.state.totalClicks) * 100
                    : 0,
            totalClicks: this.state.totalClicks,
            gameHistory: [...this.state.gameHistory],
        }
    }

    // --- Reflex-specific public API ---

    /**
     * Result of handling a click on a grid cell.
     */
    handleCellClick(row: number, col: number): ClickResult {
        if (!this.state.isActive || this.state.isPaused) {
            return { hit: false, points: 0 }
        }

        this.state.totalClicks++

        const clickedObject = this.state.objects.find(
            obj =>
                obj.isActive &&
                obj.cell.row === row &&
                obj.cell.col === col &&
                !obj.clicked
        )

        if (!clickedObject) {
            return { hit: false, points: 0 }
        }

        clickedObject.clicked = true
        clickedObject.isActive = false

        const clickTime = Date.now()
        const reactionTime = clickTime - clickedObject.spawnTime

        let pointsAwarded = 0
        let reason = ''

        if (clickedObject.type === 'coin') {
            pointsAwarded = this.config.pointsForCoin
            this.state.coinsCollected++
            this.state.correctClicks++
            reason = 'coin_collect'
        } else {
            pointsAwarded = this.config.pointsForBomb
            this.state.bombsHit++
            this.state.incorrectClicks++
            reason = 'bomb_hit'
        }

        this.addScore(pointsAwarded, reason)

        const historyEntry: GameHistoryEntry = {
            objectId: clickedObject.id,
            type: clickedObject.type,
            clicked: true,
            timeToClick: reactionTime,
            pointsAwarded,
        }
        this.state.gameHistory.push(historyEntry)

        this.state.objects = this.state.objects.filter(
            obj => obj.id !== clickedObject.id
        )

        this.state.needsRedraw = true
        this.emitStateChange()

        return { hit: true, points: pointsAwarded }
    }

    /**
     * Spawn a random object on an available cell.
     */
    spawnRandomObject(): SpawnResult {
        this.cleanupExpiredObjects()

        const occupiedCells = new Set(
            this.state.objects.map(obj => `${obj.cell.row}-${obj.cell.col}`)
        )
        const availableCells: Cell[] = []

        for (let row = 0; row < this.config.gridSize; row++) {
            for (let col = 0; col < this.config.gridSize; col++) {
                if (!occupiedCells.has(`${row}-${col}`)) {
                    availableCells.push(this.state.grid[row][col])
                }
            }
        }

        if (availableCells.length === 0) {
            return { success: false, reason: 'No available cells' }
        }

        const randomCell = randomElement(availableCells)!
        const objectType = rollSpawnType(this.config.coinToBombRatio)

        const now = Date.now()
        const newObject: GameObject = {
            id: generateId(),
            type: objectType,
            cell: randomCell,
            spawnTime: now,
            expirationTime: now + this.config.objectLifetime * 1000,
            isActive: true,
            clicked: false,
        }

        this.state.objects.push(newObject)
        this.state.needsRedraw = true
        this.emitStateChange()

        return { success: true, object: newObject }
    }

    /**
     * Remove expired objects and apply penalties for missed coins.
     */
    cleanupExpiredObjects(): void {
        const now = Date.now()
        const expiredObjects = this.state.objects.filter(
            obj => now >= obj.expirationTime && obj.isActive
        )

        expiredObjects.forEach(obj => {
            obj.isActive = false

            if (obj.type === 'coin' && !obj.clicked) {
                this.state.missedCoins++
                const penalty = this.config.pointsForMissedCoin
                this.addScore(penalty, 'missed_coin')

                this.state.gameHistory.push({
                    objectId: obj.id,
                    type: obj.type,
                    clicked: false,
                    pointsAwarded: penalty,
                })
            }
        })

        const hadExpired = expiredObjects.length > 0
        this.state.objects = this.state.objects.filter(obj => obj.isActive)

        if (hadExpired) {
            this.state.needsRedraw = true
            this.emitStateChange()
        }
    }

    getConfig(): ReflexConfig {
        return { ...this.config }
    }

    getActiveObjects(): GameObject[] {
        return this.state.objects.filter(obj => obj.isActive)
    }

    getGrid(): Cell[][] {
        return this.state.grid
    }

    markRendered(): void {
        this.state.needsRedraw = false
    }

    // --- Private game logic ---

    private buildGrid(): Cell[][] {
        const grid: Cell[][] = []
        for (let row = 0; row < this.config.gridSize; row++) {
            grid[row] = []
            for (let col = 0; col < this.config.gridSize; col++) {
                grid[row][col] = {
                    id: `cell-${row}-${col}`,
                    row,
                    col,
                    x: col * this.config.cellSize,
                    y: row * this.config.cellSize,
                }
            }
        }
        return grid
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

export default ReflexGame
