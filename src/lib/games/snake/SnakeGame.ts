// Snake game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type {
    SnakeState,
    SnakeConfig,
    SnakeStats,
    SnakeSegment,
    Direction,
    Position,
} from './types'
import {
    generateId,
    generateFoodPosition,
    getNextPosition,
    isOutOfBounds,
    collidesWithSnake,
    positionsEqual,
    isValidDirectionChange,
} from './utils'

// Default configuration for Snake game
export const DEFAULT_SNAKE_CONFIG: SnakeConfig = {
    // BaseGameConfig
    duration: 60,
    achievementIntegration: true,
    pausable: true,
    resettable: true,
    // SnakeConfig
    gridWidth: 20,
    gridHeight: 20,
    cellSize: 25,
    gameWidth: 500,
    gameHeight: 500,
    moveInterval: 150,
    foodSpawnInterval: 1000,
    snakeColor: 0x00ff88,
    foodColor: 0xff3366,
    gridColor: 0x1a1a2e,
    backgroundColor: 0x0f0f1e,
}

export class SnakeGame extends BaseGame<SnakeState, SnakeConfig, SnakeStats> {
    private gameLoopId: number | null = null

    constructor(
        config: Partial<SnakeConfig> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: SnakeConfig = { ...DEFAULT_SNAKE_CONFIG, ...config }
        super(
            GameID.SNAKE,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 10,
                timeBonus: false, // Snake doesn't use time bonus
            }
        )
    }

    createInitialState(): SnakeState {
        if (this.config.gridWidth < 3 || this.config.gridHeight < 1) {
            throw new Error(
                'Snake grid too small for initialization (min width 3).'
            )
        }
        const headX = Math.max(0, Math.floor(this.config.gridWidth / 2))
        const headY = Math.max(0, Math.floor(this.config.gridHeight / 2))
        const segment1X = Math.max(0, headX - 1)
        const segment2X = Math.max(0, headX - 2)
        const initialSnake: SnakeSegment[] = [
            { x: headX, y: headY, id: generateId() },
            { x: segment1X, y: headY, id: generateId() },
            { x: segment2X, y: headY, id: generateId() },
        ]

        return {
            // BaseGameState fields
            score: 0,
            timeRemaining: this.config.duration * 1000, // Convert to ms
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            // SnakeState fields
            snake: initialSnake,
            food: null,
            direction: 'right',
            nextDirection: 'right',
            lastFoodSpawnTime: 0,
            lastMoveTime: 0,
            foodsEaten: 0,
            maxLength: initialSnake.length,
            needsRedraw: true,
        }
    }

    protected onGameStart(): void {
        // Spawn initial food
        this.spawnFood()

        // Start game loop
        this.startGameLoop()
    }

    protected onGamePause(): void {
        this.stopGameLoop()
    }

    protected onGameResume(): void {
        // Reset timing to avoid sudden jumps
        const now = Date.now()
        this.state.lastMoveTime = now
        this.state.lastFoodSpawnTime = now
        this.startGameLoop()
    }

    protected onGameEnd(_finalScore: number, _finalStats: SnakeStats): void {
        this.stopGameLoop()
    }

    protected onGameReset(): void {
        this.stopGameLoop()
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        // Game logic is driven by the game loop
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        this.stopGameLoop()
    }

    getGameStats(): SnakeStats {
        const timerStatus = this.getTimerStatus()
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
            foodsEaten: this.state.foodsEaten,
            maxLength: this.state.maxLength,
        }
    }

    protected getGameData(): Record<string, unknown> {
        const stats = this.getGameStats()
        return {
            foodsEaten: stats.foodsEaten,
            maxLength: stats.maxLength,
            timeElapsed: stats.timeElapsed,
        }
    }

    // --- Snake-specific methods ---

    /**
     * Change snake direction (public API for input handling)
     */
    changeDirection(newDirection: Direction): void {
        if (!this.state.isActive || this.state.isPaused) {
            return
        }

        if (isValidDirectionChange(this.state.direction, newDirection)) {
            this.state.nextDirection = newDirection
        }
    }

    /**
     * Get current snake head position
     */
    getHead(): Position {
        return this.state.snake[0]
    }

    /**
     * Get config for renderer
     */
    getConfig(): SnakeConfig {
        return { ...this.config }
    }

    // --- Private game logic methods ---

    private startGameLoop(): void {
        if (this.gameLoopId !== null) {
            return
        }

        const loop = () => {
            if (
                !this.state.isActive ||
                this.state.isPaused ||
                this.state.isGameOver
            ) {
                this.gameLoopId = null
                return
            }

            this.gameUpdate()
            this.gameLoopId = requestAnimationFrame(loop)
        }

        this.gameLoopId = requestAnimationFrame(loop)
    }

    private stopGameLoop(): void {
        if (this.gameLoopId !== null) {
            cancelAnimationFrame(this.gameLoopId)
            this.gameLoopId = null
        }
    }

    private gameUpdate(): void {
        const now = Date.now()

        // Move snake at interval
        if (now - this.state.lastMoveTime > this.config.moveInterval) {
            const moveSuccessful = this.moveSnake()
            if (!moveSuccessful) {
                this.end()
                return
            }
            this.state.lastMoveTime = now
        }

        // Spawn food if needed
        if (
            !this.state.food &&
            now - this.state.lastFoodSpawnTime > this.config.foodSpawnInterval
        ) {
            this.spawnFood()
        }

        this.emitStateChange()
    }

    private spawnFood(): void {
        const position = generateFoodPosition(this.state.snake, {
            GRID_WIDTH: this.config.gridWidth,
            GRID_HEIGHT: this.config.gridHeight,
        })
        const now = Date.now()
        this.state.food = {
            ...position,
            id: generateId(),
            spawnTime: now,
        }
        this.state.lastFoodSpawnTime = now
        this.state.needsRedraw = true
    }

    private moveSnake(): boolean {
        // Apply queued direction
        this.state.direction = this.state.nextDirection

        const head = this.state.snake[0]
        const newHead: SnakeSegment = {
            ...getNextPosition(head, this.state.direction),
            id: generateId(),
        }

        // Check collision with walls
        if (
            isOutOfBounds(newHead, {
                GRID_WIDTH: this.config.gridWidth,
                GRID_HEIGHT: this.config.gridHeight,
            })
        ) {
            return false
        }

        // Check if this move would eat food
        const willEatFood =
            this.state.food && positionsEqual(newHead, this.state.food)

        // Check collision with self
        const snakeToCheck = willEatFood
            ? this.state.snake
            : this.state.snake.slice(0, -1)

        if (collidesWithSnake(newHead, snakeToCheck)) {
            return false
        }

        // Add new head
        this.state.snake.unshift(newHead)

        // Handle food eating
        if (willEatFood) {
            this.addScore(10, 'food_eaten')
            this.state.foodsEaten++
            this.state.maxLength = Math.max(
                this.state.maxLength,
                this.state.snake.length
            )
            this.state.food = null
        } else {
            this.state.snake.pop()
        }

        this.state.needsRedraw = true
        return true
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}

export default SnakeGame
