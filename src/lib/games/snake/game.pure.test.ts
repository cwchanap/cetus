import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    createGameState,
    moveSnake,
    changeDirection,
    spawnFood,
    startGame,
    togglePause,
    resetGame,
    updateUI,
    endGame,
    gameLoop,
    GAME_CONSTANTS,
} from './game'
import type { GameState } from './types'

// Mock saveGameScore to avoid network calls
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue(undefined),
}))

// Import saveGameScore for mock manipulation
import { saveGameScore } from '@/lib/services/scoreService'

describe('Snake game.ts pure logic', () => {
    let state: GameState

    beforeEach(() => {
        state = createGameState()
    })

    describe('GAME_CONSTANTS', () => {
        it('should have expected constants', () => {
            expect(GAME_CONSTANTS.GRID_WIDTH).toBe(20)
            expect(GAME_CONSTANTS.GRID_HEIGHT).toBe(20)
            expect(GAME_CONSTANTS.CELL_SIZE).toBe(25)
            expect(GAME_CONSTANTS.MOVE_INTERVAL).toBe(150)
        })
    })

    describe('createGameState', () => {
        it('should create initial game state with correct defaults', () => {
            expect(state.snake).toHaveLength(3)
            expect(state.direction).toBe('right')
            expect(state.nextDirection).toBe('right')
            expect(state.score).toBe(0)
            expect(state.gameOver).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.paused).toBe(false)
            expect(state.food).toBeNull()
            expect(state.foodsEaten).toBe(0)
        })

        it('should initialize snake at center position', () => {
            const head = state.snake[0]
            expect(head.x).toBe(10)
            expect(head.y).toBe(10)
        })

        it('should give each segment a unique id', () => {
            const ids = state.snake.map(s => s.id)
            const uniqueIds = new Set(ids)
            expect(uniqueIds.size).toBe(ids.length)
        })
    })

    describe('spawnFood', () => {
        it('should place food on the game board', () => {
            spawnFood(state)

            expect(state.food).not.toBeNull()
            expect(state.food!.x).toBeGreaterThanOrEqual(0)
            expect(state.food!.x).toBeLessThan(GAME_CONSTANTS.GRID_WIDTH)
            expect(state.food!.y).toBeGreaterThanOrEqual(0)
            expect(state.food!.y).toBeLessThan(GAME_CONSTANTS.GRID_HEIGHT)
        })

        it('should set needsRedraw after spawning food', () => {
            state.needsRedraw = false
            spawnFood(state)
            expect(state.needsRedraw).toBe(true)
        })

        it('should set lastFoodSpawnTime', () => {
            const before = Date.now()
            spawnFood(state)
            const after = Date.now()

            expect(state.lastFoodSpawnTime).toBeGreaterThanOrEqual(before)
            expect(state.lastFoodSpawnTime).toBeLessThanOrEqual(after)
        })

        it('should give food a unique id', () => {
            spawnFood(state)
            expect(state.food!.id).toBeDefined()
            expect(typeof state.food!.id).toBe('string')
        })
    })

    describe('changeDirection', () => {
        it('should change direction when valid', () => {
            // Right -> up is valid (not 180°)
            changeDirection(state, 'up')
            expect(state.nextDirection).toBe('up')
        })

        it('should not allow 180° reversal (right -> left)', () => {
            state.direction = 'right'
            changeDirection(state, 'left')
            expect(state.nextDirection).toBe('right') // unchanged
        })

        it('should not allow 180° reversal (up -> down)', () => {
            state.direction = 'up'
            state.nextDirection = 'up'
            changeDirection(state, 'down')
            expect(state.nextDirection).toBe('up') // unchanged
        })

        it('should allow changing to perpendicular direction', () => {
            state.direction = 'right'
            changeDirection(state, 'up')
            expect(state.nextDirection).toBe('up')

            state.direction = 'up'
            changeDirection(state, 'left')
            expect(state.nextDirection).toBe('left')
        })
    })

    describe('moveSnake', () => {
        it('should return true and move snake on valid move', () => {
            const initialHeadX = state.snake[0].x
            const result = moveSnake(state)

            expect(result).toBe(true)
            expect(state.snake[0].x).toBe(initialHeadX + 1) // moving right
        })

        it('should return false when snake hits wall', () => {
            // Position snake at right edge
            state.snake[0].x = GAME_CONSTANTS.GRID_WIDTH - 1
            state.direction = 'right'
            state.nextDirection = 'right'

            const result = moveSnake(state)

            expect(result).toBe(false)
        })

        it('should grow snake when eating food', () => {
            const initialLength = state.snake.length
            // Place food directly ahead of snake head
            state.food = {
                x: state.snake[0].x + 1,
                y: state.snake[0].y,
                id: 'food-1',
                spawnTime: Date.now(),
            }

            const result = moveSnake(state)

            expect(result).toBe(true)
            expect(state.snake.length).toBe(initialLength + 1) // grew
            expect(state.food).toBeNull() // food was eaten
            expect(state.score).toBe(10) // score increased
            expect(state.foodsEaten).toBe(1)
        })

        it('should not grow snake on normal move', () => {
            const initialLength = state.snake.length
            moveSnake(state)
            expect(state.snake.length).toBe(initialLength)
        })

        it('should set needsRedraw after moving', () => {
            state.needsRedraw = false
            moveSnake(state)
            expect(state.needsRedraw).toBe(true)
        })

        it('should return false when snake collides with self', () => {
            // Head at (5,5) moving right → new head at (6,5)
            // Body segment at (6,5) → self-collision → returns false
            state.snake = [
                { x: 5, y: 5, id: 'h' },
                { x: 6, y: 5, id: 'b1' }, // occupies position head moves into
                { x: 7, y: 5, id: 'b2' },
                { x: 8, y: 5, id: 'tail' },
            ]
            state.direction = 'right'
            state.nextDirection = 'right'
            state.food = null
            const result = moveSnake(state)
            expect(result).toBe(false)
        })

        it('should update maxLength when snake grows beyond previous max', () => {
            state.food = {
                x: state.snake[0].x + 1,
                y: state.snake[0].y,
                id: 'food-1',
                spawnTime: Date.now(),
            }
            const prevMax = state.maxLength
            moveSnake(state)
            expect(state.maxLength).toBeGreaterThanOrEqual(prevMax)
        })
    })

    describe('startGame', () => {
        it('should set gameStarted to true', () => {
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(state.gameStarted).toBe(true)
        })

        it('should call gameLoopFn when starting', () => {
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(gameLoopFn).toHaveBeenCalledOnce()
        })

        it('should spawn food when starting', () => {
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(state.food).not.toBeNull()
        })

        it('should set gameOver to false and paused to false', () => {
            state.gameOver = true
            state.paused = true
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(state.gameOver).toBe(false)
            expect(state.paused).toBe(false)
        })

        it('should not start again if already started', () => {
            state.gameStarted = true
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should set gameStartTime', () => {
            const before = Date.now()
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            const after = Date.now()
            expect(state.gameStartTime).toBeGreaterThanOrEqual(before)
            expect(state.gameStartTime).toBeLessThanOrEqual(after)
        })
    })

    describe('togglePause', () => {
        it('should do nothing if game not started', () => {
            state.gameStarted = false
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(state.paused).toBe(false)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should do nothing if game over', () => {
            state.gameStarted = true
            state.gameOver = true
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should pause when game is running', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(state.paused).toBe(true)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should resume when game is paused and call gameLoopFn', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = true
            state.pauseStartedAt = Date.now() - 1000
            state.gameStartTime = Date.now() - 5000
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(state.paused).toBe(false)
            expect(gameLoopFn).toHaveBeenCalledOnce()
        })

        it('should set pauseStartedAt when pausing', () => {
            state.gameStarted = true
            state.paused = false
            const before = Date.now()
            togglePause(state, vi.fn())
            const after = Date.now()
            expect(state.pauseStartedAt).toBeGreaterThanOrEqual(before)
            expect(state.pauseStartedAt).toBeLessThanOrEqual(after)
        })

        it('should clear pauseStartedAt when resuming', () => {
            state.gameStarted = true
            state.paused = true
            state.pauseStartedAt = Date.now()
            togglePause(state, vi.fn())
            expect(state.pauseStartedAt).toBeNull()
        })
    })

    describe('resetGame', () => {
        it('should reset score to 0', () => {
            state.score = 100
            resetGame(state)
            expect(state.score).toBe(0)
        })

        it('should reset gameStarted to false', () => {
            state.gameStarted = true
            resetGame(state)
            expect(state.gameStarted).toBe(false)
        })

        it('should reset snake to initial length', () => {
            // Grow snake
            state.snake.push({ x: 9, y: 10, id: 'extra' })
            resetGame(state)
            expect(state.snake).toHaveLength(3)
        })

        it('should preserve onGameOver callback', () => {
            const callback = vi.fn()
            state.onGameOver = callback
            resetGame(state)
            expect(state.onGameOver).toBe(callback)
        })

        it('should reset foodsEaten to 0', () => {
            state.foodsEaten = 5
            resetGame(state)
            expect(state.foodsEaten).toBe(0)
        })
    })

    describe('updateUI', () => {
        it('should not throw when DOM elements are missing', () => {
            // jsdom doesn't have these elements by default, so they return null
            expect(() => updateUI(state)).not.toThrow()
        })

        it('should update score element when it exists', () => {
            const scoreEl = document.createElement('div')
            scoreEl.id = 'score'
            document.body.appendChild(scoreEl)
            state.score = 42
            updateUI(state)
            expect(scoreEl.textContent).toBe('42')
            document.body.removeChild(scoreEl)
        })

        it('should update foods-eaten element when it exists', () => {
            const foodsEl = document.createElement('div')
            foodsEl.id = 'foods-eaten'
            document.body.appendChild(foodsEl)
            state.foodsEaten = 7
            updateUI(state)
            expect(foodsEl.textContent).toBe('7')
            document.body.removeChild(foodsEl)
        })

        it('should update snake-length and snake-length-stats elements', () => {
            const lengthEl = document.createElement('div')
            lengthEl.id = 'snake-length'
            const lengthStatsEl = document.createElement('div')
            lengthStatsEl.id = 'snake-length-stats'
            const timeEl = document.createElement('div')
            timeEl.id = 'time-remaining'
            document.body.appendChild(lengthEl)
            document.body.appendChild(lengthStatsEl)
            document.body.appendChild(timeEl)
            state.timeRemaining = 30000
            updateUI(state)
            expect(lengthEl.textContent).toBe('3') // snake starts with 3 segments
            expect(lengthStatsEl.textContent).toBe('3')
            expect(timeEl.textContent).toBe('30s')
            document.body.removeChild(lengthEl)
            document.body.removeChild(lengthStatsEl)
            document.body.removeChild(timeEl)
        })
    })

    describe('endGame', () => {
        it('should set gameOver to true', async () => {
            await endGame(state)
            expect(state.gameOver).toBe(true)
        })

        it('should set gameStarted to false', async () => {
            state.gameStarted = true
            await endGame(state)
            expect(state.gameStarted).toBe(false)
        })

        it('should call onGameOver callback if set', async () => {
            const onGameOver = vi.fn().mockResolvedValue(undefined)
            state.onGameOver = onGameOver
            state.score = 50
            await endGame(state)
            expect(onGameOver).toHaveBeenCalledWith(50, expect.any(Object))
        })

        it('should handle onGameOver callback errors gracefully', async () => {
            state.onGameOver = vi
                .fn()
                .mockRejectedValue(new Error('Callback error'))
            await expect(endGame(state)).resolves.toBeUndefined()
        })

        it('should calculate gameTime from gameStartTime', async () => {
            state.gameStartTime = Date.now() - 5000
            const onGameOver = vi.fn().mockResolvedValue(undefined)
            state.onGameOver = onGameOver
            await endGame(state)
            const stats = onGameOver.mock.calls[0][1]
            expect(stats.gameTime).toBeGreaterThanOrEqual(4000)
            expect(stats.gameTime).toBeLessThanOrEqual(6000)
        })

        it('should dispatch achievementsEarned event when new achievements received', async () => {
            // Override mock to call success callback with achievements
            vi.mocked(saveGameScore).mockImplementationOnce(
                (_gameId, _score, successCallback) => {
                    successCallback?.({ newAchievements: ['snake-first-game'] })
                    return Promise.resolve(undefined)
                }
            )
            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            await endGame(state)
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'achievementsEarned' })
            )
            dispatchSpy.mockRestore()
        })

        it('should handle saveGameScore error callback gracefully', async () => {
            // Override mock to call error callback
            vi.mocked(saveGameScore).mockImplementationOnce(
                (_gameId, _score, _successCb, errorCallback) => {
                    errorCallback?.(new Error('Network error'))
                    return Promise.resolve(undefined)
                }
            )
            await expect(endGame(state)).resolves.toBeUndefined()
        })
    })

    describe('gameLoop', () => {
        it('should return early when game is over', () => {
            state.gameOver = true
            expect(() => gameLoop(state)).not.toThrow()
        })

        it('should return early when paused', () => {
            state.gameStarted = true
            state.paused = true
            expect(() => gameLoop(state)).not.toThrow()
        })

        it('should return early when not started', () => {
            state.gameStarted = false
            state.gameOver = false
            expect(() => gameLoop(state)).not.toThrow()
        })

        it('should update timeRemaining when game is running', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            state.gameStartTime = Date.now() - 1000
            state.lastMoveTime = Date.now() + 10000 // prevent move
            state.lastFoodSpawnTime = Date.now() + 10000 // prevent food spawn
            vi.stubGlobal('requestAnimationFrame', vi.fn())
            gameLoop(state)
            expect(state.timeRemaining).toBeLessThan(
                GAME_CONSTANTS.GAME_DURATION
            )
            vi.unstubAllGlobals()
        })

        it('should end game when time runs out', async () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            state.gameStartTime =
                Date.now() - GAME_CONSTANTS.GAME_DURATION - 1000
            state.lastMoveTime = Date.now() + 10000
            gameLoop(state)
            // Should have called endGame which sets gameOver = true
            // Give time for async endGame to complete
            await vi.waitFor(() => {
                expect(state.gameOver).toBe(true)
            })
        })

        it('should call requestAnimationFrame when game is running', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            state.gameStartTime = Date.now() - 100
            state.lastMoveTime = Date.now() + 10000 // prevent move
            state.lastFoodSpawnTime = Date.now() + 10000 // prevent spawn
            const rafMock = vi.fn()
            vi.stubGlobal('requestAnimationFrame', rafMock)
            gameLoop(state)
            expect(rafMock).toHaveBeenCalledOnce()
            vi.unstubAllGlobals()
        })

        it('should move snake when move interval has elapsed', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            state.gameStartTime = Date.now() - 100
            state.lastMoveTime = Date.now() - GAME_CONSTANTS.MOVE_INTERVAL - 100
            state.lastFoodSpawnTime = Date.now() + 10000
            vi.stubGlobal('requestAnimationFrame', vi.fn())
            const prevLength = state.snake.length
            gameLoop(state)
            // snake should still be length 3 (normal move without eating)
            expect(state.snake.length).toBe(prevLength)
            vi.unstubAllGlobals()
        })

        it('should spawn food when food spawn interval elapsed and no food', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            state.gameStartTime = Date.now() - 100
            state.lastMoveTime = Date.now() + 10000 // prevent move
            state.lastFoodSpawnTime =
                Date.now() - GAME_CONSTANTS.FOOD_SPAWN_INTERVAL - 100
            state.food = null
            vi.stubGlobal('requestAnimationFrame', vi.fn())
            gameLoop(state)
            expect(state.food).not.toBeNull()
            vi.unstubAllGlobals()
        })
    })
})
