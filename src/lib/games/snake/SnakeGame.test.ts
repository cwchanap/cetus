import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SnakeGame, DEFAULT_SNAKE_CONFIG } from './SnakeGame'
import type { SnakeConfig } from './types'

describe('SnakeGame', () => {
    let game: SnakeGame

    beforeEach(() => {
        vi.useFakeTimers()
        game = new SnakeGame()
    })

    afterEach(() => {
        game.destroy()
        vi.useRealTimers()
    })

    describe('initialization', () => {
        it('should create initial state correctly', () => {
            const state = game.getState()

            expect(state.isActive).toBe(false)
            expect(state.isPaused).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.snake).toHaveLength(3)
            expect(state.food).toBeNull()
            expect(state.direction).toBe('right')
            expect(state.nextDirection).toBe('right')
            expect(state.score).toBe(0)
            expect(state.foodsEaten).toBe(0)
            expect(state.maxLength).toBe(3)
        })

        it('should accept custom configuration', () => {
            const customConfig: Partial<SnakeConfig> = {
                gridWidth: 30,
                gridHeight: 30,
                moveInterval: 100,
            }
            const customGame = new SnakeGame(customConfig)
            const config = customGame.getConfig()

            expect(config.gridWidth).toBe(30)
            expect(config.gridHeight).toBe(30)
            expect(config.moveInterval).toBe(100)

            customGame.destroy()
        })

        it('should use default config values', () => {
            const config = game.getConfig()

            expect(config.gridWidth).toBe(DEFAULT_SNAKE_CONFIG.gridWidth)
            expect(config.gridHeight).toBe(DEFAULT_SNAKE_CONFIG.gridHeight)
            expect(config.duration).toBe(DEFAULT_SNAKE_CONFIG.duration)
        })
    })

    describe('game lifecycle', () => {
        it('should start the game', () => {
            game.start()
            const state = game.getState()

            expect(state.isActive).toBe(true)
            expect(state.gameStarted).toBe(true)
            expect(state.isGameOver).toBe(false)
        })

        it('should spawn food when game starts', () => {
            game.start()
            const state = game.getState()

            expect(state.food).not.toBeNull()
            expect(state.food?.x).toBeGreaterThanOrEqual(0)
            expect(state.food?.y).toBeGreaterThanOrEqual(0)
        })

        it('should pause and resume the game', () => {
            game.start()
            game.pause()
            expect(game.getState().isPaused).toBe(true)

            game.resume()
            expect(game.getState().isPaused).toBe(false)
        })

        it('should not pause when game is not active', () => {
            game.pause()
            expect(game.getState().isPaused).toBe(false)
        })

        it('should reset the game', () => {
            game.start()
            game.reset()
            const state = game.getState()

            expect(state.isActive).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            expect(state.snake).toHaveLength(3)
        })
    })

    describe('direction changes', () => {
        it('should change direction when valid', () => {
            game.start()
            game.changeDirection('up')

            const state = game.getState()
            expect(state.nextDirection).toBe('up')
        })

        it('should not allow 180-degree turns', () => {
            game.start()
            // Starting direction is 'right'
            game.changeDirection('left')

            const state = game.getState()
            expect(state.nextDirection).toBe('right') // Should remain 'right'
        })

        it('should not change direction when paused', () => {
            game.start()
            game.pause()
            game.changeDirection('up')

            const state = game.getState()
            expect(state.nextDirection).toBe('right')
        })

        it('should not change direction when game is not active', () => {
            game.changeDirection('up')

            const state = game.getState()
            expect(state.nextDirection).toBe('right')
        })
    })

    describe('snake position', () => {
        it('should return correct head position', () => {
            const head = game.getHead()

            expect(head.x).toBe(Math.floor(DEFAULT_SNAKE_CONFIG.gridWidth / 2))
            expect(head.y).toBe(Math.floor(DEFAULT_SNAKE_CONFIG.gridHeight / 2))
        })

        it('should have snake segments in correct positions', () => {
            const state = game.getState()

            const expectedX = Math.floor(DEFAULT_SNAKE_CONFIG.gridWidth / 2)
            const expectedY = Math.floor(DEFAULT_SNAKE_CONFIG.gridHeight / 2)
            expect(state.snake[0]).toMatchObject({ x: expectedX, y: expectedY })
            expect(state.snake[1]).toMatchObject({
                x: Math.max(0, expectedX - 1),
                y: expectedY,
            })
            expect(state.snake[2]).toMatchObject({
                x: Math.max(0, expectedX - 2),
                y: expectedY,
            })
        })
    })

    describe('game stats', () => {
        it('should return correct game stats', () => {
            const stats = game.getGameStats()

            expect(stats.finalScore).toBe(0)
            expect(stats.foodsEaten).toBe(0)
            expect(stats.maxLength).toBe(3)
            expect(stats.gameCompleted).toBe(false)
        })

        it('should track max length correctly', () => {
            game.start()
            const initialStats = game.getGameStats()

            expect(initialStats.maxLength).toBe(3)

            // Get snake head position
            const head = game.getHead()

            // Place food directly in front of snake's path (moving right)
            // The snake will eat and grow on the next move
            const foodX = head.x + 1
            const foodY = head.y

            // Access internal state through game and manually set food for testing
            // @ts-expect-error - accessing private state for testing
            game.state.food = {
                x: foodX,
                y: foodY,
                id: 'test-food',
                spawnTime: Date.now(),
            }

            // Advance time to trigger a move
            vi.advanceTimersByTime(200)

            // Get updated stats - snake should have grown
            const updatedStats = game.getGameStats()
            expect(updatedStats.maxLength).toBeGreaterThan(
                initialStats.maxLength
            )
            expect(updatedStats.maxLength).toBe(4)
            expect(updatedStats.foodsEaten).toBe(1)
        })
    })

    describe('callbacks', () => {
        it('should call onStart callback when game starts', () => {
            const onStart = vi.fn()
            const gameWithCallback = new SnakeGame({}, { onStart })

            gameWithCallback.start()

            expect(onStart).toHaveBeenCalled()
            gameWithCallback.destroy()
        })

        it('should call onPause callback when game pauses', () => {
            const onPause = vi.fn()
            const gameWithCallback = new SnakeGame({}, { onPause })

            gameWithCallback.start()
            gameWithCallback.pause()

            expect(onPause).toHaveBeenCalled()
            gameWithCallback.destroy()
        })

        it('should call onResume callback when game resumes', () => {
            const onResume = vi.fn()
            const gameWithCallback = new SnakeGame({}, { onResume })

            gameWithCallback.start()
            gameWithCallback.pause()
            gameWithCallback.resume()

            expect(onResume).toHaveBeenCalled()
            gameWithCallback.destroy()
        })

        it('should call onScoreUpdate callback', () => {
            const onScoreUpdate = vi.fn()
            const gameWithCallback = new SnakeGame({}, { onScoreUpdate })

            gameWithCallback.start()
            // Manually add score to trigger callback
            gameWithCallback.addScore(10, 'test')

            expect(onScoreUpdate).toHaveBeenCalledWith(10)
            gameWithCallback.destroy()
        })
    })

    describe('event emission', () => {
        it('should emit start event', () => {
            const handler = vi.fn()
            game.on('start', handler)

            game.start()

            expect(handler).toHaveBeenCalled()
        })

        it('should emit pause event', () => {
            const handler = vi.fn()
            game.on('pause', handler)

            game.start()
            game.pause()

            expect(handler).toHaveBeenCalled()
        })

        it('should emit resume event', () => {
            const handler = vi.fn()
            game.on('resume', handler)

            game.start()
            game.pause()
            game.resume()

            expect(handler).toHaveBeenCalled()
        })

        it('should emit score-update event when score changes', () => {
            const handler = vi.fn()
            game.on('score-update', handler)

            game.start()
            game.addScore(10, 'test')

            expect(handler).toHaveBeenCalled()
        })
    })

    describe('cleanup', () => {
        it('should cleanup and stop game loops', () => {
            game.start()
            expect(game.getState().isActive).toBe(true)

            game.destroy()

            // After destroy, calling methods should not throw
            // The cleanup method stops game loops internally
            expect(() => game.getState()).not.toThrow()
        })

        it('should stop game loops on destroy', () => {
            game.start()
            game.destroy()

            // Game loop should be stopped (no errors on subsequent calls)
            expect(() => game.cleanup()).not.toThrow()
        })
    })
})
