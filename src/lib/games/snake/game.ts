// Main game controller for Snake
import type { GameState, GameConstants, SnakeSegment, Direction } from './types'
import {
    hexToPixiColor,
    isOutOfBounds,
    collidesWithSnake,
    positionsEqual,
    generateFoodPosition,
    getNextPosition,
    isValidDirectionChange,
    generateId,
} from './utils'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

export const GAME_CONSTANTS: GameConstants = {
    GRID_WIDTH: 20,
    GRID_HEIGHT: 20,
    CELL_SIZE: 25,
    GAME_WIDTH: 500,
    GAME_HEIGHT: 500,
    GAME_DURATION: 60000, // 60 seconds in milliseconds
    MOVE_INTERVAL: 150, // Move every 150ms
    FOOD_SPAWN_INTERVAL: 1000, // Spawn food every 1 second
    SNAKE_COLOR: hexToPixiColor('#00ff88'),
    FOOD_COLOR: hexToPixiColor('#ff3366'),
    GRID_COLOR: hexToPixiColor('#1a1a2e'),
    BACKGROUND_COLOR: hexToPixiColor('#0f0f1e'),
}

export function createGameState(): GameState {
    const initialSnake: SnakeSegment[] = [
        { x: 10, y: 10, id: generateId() },
        { x: 9, y: 10, id: generateId() },
        { x: 8, y: 10, id: generateId() },
    ]

    return {
        snake: initialSnake,
        food: null,
        direction: 'right',
        nextDirection: 'right',
        score: 0,
        timeRemaining: GAME_CONSTANTS.GAME_DURATION,
        gameOver: false,
        gameStarted: false,
        paused: false,
        pauseStartedAt: null,
        lastFoodSpawnTime: 0,
        lastMoveTime: 0,
        gameStartTime: null,
        foodsEaten: 0,
        maxLength: initialSnake.length,
        needsRedraw: true,
    }
}

export function spawnFood(state: GameState): void {
    const position = generateFoodPosition(state.snake, GAME_CONSTANTS)
    const now = Date.now()
    state.food = {
        ...position,
        id: generateId(),
        spawnTime: now,
    }
    state.lastFoodSpawnTime = now
    state.needsRedraw = true
}

export function moveSnake(state: GameState): boolean {
    // Apply the queued direction
    state.direction = state.nextDirection

    const head = state.snake[0]
    const newHead: SnakeSegment = {
        ...getNextPosition(head, state.direction),
        id: generateId(),
    }

    // Check collision with walls
    if (isOutOfBounds(newHead, GAME_CONSTANTS)) {
        return false
    }

    // Check if this move would eat food (snake will grow)
    const willEatFood = state.food && positionsEqual(newHead, state.food)

    // Check collision with self
    // If not eating food, exclude the tail since it will be removed
    // If eating food, check against full snake since tail won't be removed
    const snakeToCheck = willEatFood ? state.snake : state.snake.slice(0, -1) // Exclude tail on normal moves

    if (collidesWithSnake(newHead, snakeToCheck)) {
        return false
    }

    // Add new head
    state.snake.unshift(newHead)

    // Check if food is eaten
    if (willEatFood) {
        // Don't remove tail (snake grows)
        state.score += 10
        state.foodsEaten++
        state.maxLength = Math.max(state.maxLength, state.snake.length)
        state.food = null
    } else {
        // Remove tail (normal movement)
        state.snake.pop()
    }

    state.needsRedraw = true
    return true
}

export function changeDirection(
    state: GameState,
    newDirection: Direction
): void {
    // Validate against the queued direction (nextDirection) to prevent
    // 180° reversals when buffering multiple direction changes
    if (isValidDirectionChange(state.nextDirection, newDirection)) {
        state.nextDirection = newDirection
    }
}

export function startGame(state: GameState, gameLoopFn: () => void): void {
    if (!state.gameStarted) {
        state.gameStarted = true
        state.gameStartTime = Date.now()
        state.lastMoveTime = Date.now()
        state.lastFoodSpawnTime = Date.now()
        spawnFood(state)
        gameLoopFn()

        const startBtn = document.getElementById('start-btn')
        if (startBtn) {
            startBtn.textContent = 'Playing...'
            ;(startBtn as HTMLButtonElement).disabled = true
        }
    }
}

export function togglePause(state: GameState, gameLoopFn: () => void): void {
    if (!state.gameStarted || state.gameOver) {
        return
    }

    state.paused = !state.paused
    const pauseBtn = document.getElementById('pause-btn')
    if (pauseBtn) {
        pauseBtn.textContent = state.paused ? 'Resume' : 'Pause'
    }

    if (state.paused) {
        // Track when pause started
        state.pauseStartedAt = Date.now()
    } else {
        // Calculate pause duration before updating timestamps
        const pauseDuration = state.pauseStartedAt
            ? Date.now() - state.pauseStartedAt
            : 0

        // Adjust game start time to account for pause duration
        if (state.gameStartTime) {
            state.gameStartTime += pauseDuration
        }

        // Reset pause tracking and timing when resuming
        state.pauseStartedAt = null
        state.lastMoveTime = Date.now()
        state.lastFoodSpawnTime = Date.now()
        gameLoopFn()
    }
}

export function resetGame(state: GameState): void {
    // Cache externally injected callbacks before reset
    const cachedOnGameOver = state.onGameOver

    const newState = createGameState()
    Object.assign(state, newState)

    // Restore cached callbacks so they remain registered after reset
    state.onGameOver = cachedOnGameOver

    const gameOverOverlay = document.getElementById('game-over-overlay')
    if (gameOverOverlay) {
        gameOverOverlay.classList.add('hidden')
    }

    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    if (startBtn) {
        startBtn.textContent = 'Start'
        ;(startBtn as HTMLButtonElement).disabled = false
        startBtn.style.display = 'inline-flex'
    }
    if (endBtn) {
        endBtn.style.display = 'none'
    }

    const pauseBtn = document.getElementById('pause-btn')
    if (pauseBtn) {
        pauseBtn.textContent = 'Pause'
    }

    updateUI(state)
}

export async function endGame(state: GameState): Promise<void> {
    state.gameOver = true
    state.gameStarted = false

    // Calculate actual game time, excluding current pause if paused
    let gameTime = state.gameStartTime ? Date.now() - state.gameStartTime : 0
    if (state.paused && state.pauseStartedAt) {
        gameTime -= Date.now() - state.pauseStartedAt
    }

    const stats = {
        finalScore: state.score,
        foodsEaten: state.foodsEaten,
        maxLength: state.maxLength,
        gameTime,
    }

    // Show game over UI immediately (don't block on network)
    if (state.onGameOver) {
        await state.onGameOver(state.score, stats)
    }

    // Submit score to centralized Score Service in the background
    // Don't await to avoid blocking UI on slow/offline connections
    saveGameScore(
        GameID.SNAKE,
        state.score,
        result => {
            // Score submitted successfully, handle achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                // Dispatch achievement event for UI notification
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                        new CustomEvent('achievementsEarned', {
                            detail: {
                                achievementIds: result.newAchievements,
                            },
                        })
                    )
                }
            }
        },
        error => {
            // Log submission error without throwing
            // eslint-disable-next-line no-console
            console.error('Failed to submit score:', error)
        },
        stats
    ).catch(error => {
        // Handle any unexpected errors gracefully
        // eslint-disable-next-line no-console
        console.error('Error during score submission:', error)
    })
}

export function gameLoop(state: GameState): void {
    if (state.gameOver || state.paused || !state.gameStarted) {
        return
    }

    const now = Date.now()

    // Update time remaining
    if (state.gameStartTime) {
        const elapsed = now - state.gameStartTime
        state.timeRemaining = Math.max(
            0,
            GAME_CONSTANTS.GAME_DURATION - elapsed
        )

        // Check if time is up
        if (state.timeRemaining <= 0) {
            endGame(state)
            return
        }
    }

    // Move snake
    if (now - state.lastMoveTime > GAME_CONSTANTS.MOVE_INTERVAL) {
        const moveSuccessful = moveSnake(state)
        if (!moveSuccessful) {
            endGame(state)
            return
        }
        state.lastMoveTime = now
    }

    // Spawn food every second if there's no food
    if (
        !state.food &&
        now - state.lastFoodSpawnTime > GAME_CONSTANTS.FOOD_SPAWN_INTERVAL
    ) {
        spawnFood(state)
    }

    updateUI(state)
    requestAnimationFrame(() => gameLoop(state))
}

export function updateUI(state: GameState): void {
    const scoreElement = document.getElementById('score')
    const timeElement = document.getElementById('time-remaining')
    const lengthElement = document.getElementById('snake-length')
    const lengthStatsElement = document.getElementById('snake-length-stats')
    const foodsElement = document.getElementById('foods-eaten')

    if (scoreElement) {
        scoreElement.textContent = state.score.toString()
    }
    if (timeElement) {
        const seconds = Math.ceil(state.timeRemaining / 1000)
        timeElement.textContent = `${seconds}s`
    }
    if (lengthElement) {
        lengthElement.textContent = state.snake.length.toString()
    }
    if (lengthStatsElement) {
        lengthStatsElement.textContent = state.snake.length.toString()
    }
    if (foodsElement) {
        foodsElement.textContent = state.foodsEaten.toString()
    }
}
