import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PathNavigatorGame, DEFAULT_CONFIG, GAME_LEVELS } from './game'

describe('PathNavigatorGame', () => {
    let game: PathNavigatorGame

    beforeEach(() => {
        vi.useFakeTimers()
        game = new PathNavigatorGame()
    })

    afterEach(() => {
        game.cleanup()
        vi.useRealTimers()
    })

    describe('initialization', () => {
        it('should create game with default config', () => {
            const state = game.getState()

            expect(state.currentLevel).toBe(1)
            expect(state.score).toBe(0)
            expect(state.timeRemaining).toBe(DEFAULT_CONFIG.gameDuration)
            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.isGameWon).toBe(false)
        })

        it('should accept custom config', () => {
            const customGame = new PathNavigatorGame({ gameDuration: 120 })
            const state = customGame.getState()

            expect(state.timeRemaining).toBe(120)
            customGame.cleanup()
        })

        it('should position cursor at first level start point', () => {
            const state = game.getState()
            const expectedStart = GAME_LEVELS[0].path.startPoint

            expect(state.cursor.x).toBe(expectedStart.x)
            expect(state.cursor.y).toBe(expectedStart.y)
        })

        it('should have correct total levels', () => {
            const state = game.getState()

            expect(state.totalLevels).toBe(GAME_LEVELS.length)
        })
    })

    describe('game lifecycle', () => {
        it('should start the game', () => {
            game.startGame()
            const state = game.getState()

            expect(state.isGameActive).toBe(true)
            expect(state.isGameOver).toBe(false)
            expect(state.gameStartTime).not.toBeNull()
        })

        it('should not start if already active', () => {
            game.startGame()
            const firstStartTime = game.getState().gameStartTime

            game.startGame()
            const secondStartTime = game.getState().gameStartTime

            expect(firstStartTime).toBe(secondStartTime)
        })

        it('should end the game', () => {
            game.startGame()
            game.endGame()
            const state = game.getState()

            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(true)
        })

        it('should pause and resume the game', () => {
            game.startGame()
            game.pauseGame()
            expect(game.getState().isGameActive).toBe(false)

            game.resumeGame()
            expect(game.getState().isGameActive).toBe(true)
        })

        it('should reset the game', () => {
            game.startGame()
            game.resetGame()
            const state = game.getState()

            expect(state.isGameActive).toBe(false)
            expect(state.score).toBe(0)
            expect(state.currentLevel).toBe(1)
        })
    })

    describe('timer', () => {
        it('should decrement time remaining', () => {
            game.startGame()
            const initialTime = game.getState().timeRemaining

            vi.advanceTimersByTime(1000)

            expect(game.getState().timeRemaining).toBe(initialTime - 1)
        })

        it('should end game when time runs out', () => {
            game.startGame()

            // Advance time to reach 0, then one more tick to trigger end
            vi.advanceTimersByTime((DEFAULT_CONFIG.gameDuration + 1) * 1000)

            expect(game.getState().isGameOver).toBe(true)
        })

        it('should stop timer when game ends', () => {
            game.startGame()
            vi.advanceTimersByTime(5000)
            game.endGame()

            const timeAtEnd = game.getState().timeRemaining
            vi.advanceTimersByTime(5000)

            expect(game.getState().timeRemaining).toBe(timeAtEnd)
        })
    })

    describe('player position', () => {
        it('should update cursor position', () => {
            game.startGame()
            game.setCursorPosition(100, 200)
            const state = game.getState()

            expect(state.cursor.x).toBe(100)
            expect(state.cursor.y).toBe(200)
        })

        it('should detect when player is on path', () => {
            game.startGame()
            const startPoint = GAME_LEVELS[0].path.startPoint
            const result = game.updatePlayerPosition(
                startPoint.x + 10,
                startPoint.y
            )

            expect(result.isOnPath).toBe(true)
        })

        it('should detect when player reaches goal', () => {
            game.startGame()
            const endPoint = GAME_LEVELS[0].path.endPoint
            const result = game.updatePlayerPosition(endPoint.x, endPoint.y)

            expect(result.hasReachedGoal).toBe(true)
        })

        it('should end game when player goes out of bounds', () => {
            game.startGame()
            // Move far off path
            game.updatePlayerPosition(100, 100)

            expect(game.getState().isGameOver).toBe(true)
        })
    })

    describe('level progression', () => {
        it('should advance to next level when goal reached', () => {
            game.startGame()
            expect(game.getState().currentLevel).toBe(1)

            // Reach goal of first level
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            expect(game.getState().currentLevel).toBe(2)
        })

        it('should add score when completing level', () => {
            game.startGame()
            const initialScore = game.getState().score

            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            expect(game.getState().score).toBeGreaterThan(initialScore)
        })

        it('should check bezier curve segments when on level 2', () => {
            game.startGame()

            // Complete level 1 to get to level 2 (which has curve segments)
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)
            expect(game.getState().currentLevel).toBe(2)

            // Move to a point in the middle of level 2 (not near start/end buffer)
            // This triggers isPointOnBezier -> getBezierPoint for curve segments
            game.updatePlayerPosition(400, 250)
            // Verify the game state after moving on bezier curve
            const state = game.getState()
            expect(state.currentLevel).toBe(2)
            expect(state.cursor.x).toBe(400)
            expect(state.cursor.y).toBe(250)
        })

        it('should complete game when all levels are finished', () => {
            game.startGame()

            // Complete all levels
            for (let i = 0; i < GAME_LEVELS.length; i++) {
                const endPoint = GAME_LEVELS[i].path.endPoint
                game.updatePlayerPosition(endPoint.x, endPoint.y)
            }

            expect(game.getState().isGameWon).toBe(true)
            expect(game.getState().isGameOver).toBe(true)
        })

        it('should position cursor at new level start', () => {
            if (GAME_LEVELS.length < 2) {
                return
            }
            game.startGame()

            // Complete first level
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            // Check cursor is at level 2 start
            const level2Start = GAME_LEVELS[1].path.startPoint
            const state = game.getState()

            expect(state.cursor.x).toBe(level2Start.x)
            expect(state.cursor.y).toBe(level2Start.y)
        })
    })

    describe('getCurrentLevel', () => {
        it('should return current level data', () => {
            const level = game.getCurrentLevel()

            expect(level.id).toBe(1)
            expect(level.name).toBe('Easy Path')
            expect(level.difficulty).toBe('easy')
        })

        it('should return updated level after progression', () => {
            game.startGame()
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            const level = game.getCurrentLevel()

            expect(level.id).toBe(2)
        })
    })

    describe('getStats', () => {
        it('should return game statistics', () => {
            game.startGame()
            const stats = game.getStats()

            expect(stats).toHaveProperty('finalScore')
            expect(stats).toHaveProperty('levelsCompleted')
            expect(stats).toHaveProperty('totalTime')
            expect(stats).toHaveProperty('averageTimePerLevel')
            expect(stats).toHaveProperty('pathViolations')
            expect(stats).toHaveProperty('perfectLevels')
        })

        it('should return zero totalTime when game has not started', () => {
            // gameStartTime is null before startGame — hits the ? 0 branch
            const stats = game.getStats()
            expect(stats.totalTime).toBe(0)
            expect(stats.levelsCompleted).toBe(0)
        })

        it('should return GAME_LEVELS.length for levelsCompleted when game is won', () => {
            // Complete all levels to trigger game won state through public API
            game.startGame()
            for (let i = 0; i < GAME_LEVELS.length; i++) {
                const levelEnd = GAME_LEVELS[i].path.endPoint
                game.updatePlayerPosition(levelEnd.x, levelEnd.y)
            }
            const stats = game.getStats()
            expect(stats.levelsCompleted).toBe(GAME_LEVELS.length)
            expect(stats.perfectLevels).toBeGreaterThan(0)
        })

        it('should track levels completed', () => {
            game.startGame()

            // Complete first level
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            const stats = game.getStats()
            expect(stats.levelsCompleted).toBe(1)
        })

        it('should count path violations on game over', () => {
            game.startGame()
            game.updatePlayerPosition(100, 100) // Off path

            const stats = game.getStats()
            expect(stats.pathViolations).toBe(1)
        })
    })

    describe('cleanup', () => {
        it('should stop timer on cleanup', () => {
            game.startGame()
            game.cleanup()

            const timeAfterCleanup = game.getState().timeRemaining
            vi.advanceTimersByTime(5000)

            expect(game.getState().timeRemaining).toBe(timeAfterCleanup)
        })
    })

    describe('isPointOnLine and isPointOnBezier edge cases', () => {
        it('should return false when point projection is before line start (param < 0)', () => {
            game.startGame()
            // Level 1 segment: x=[start.x..end.x], y=start.y
            // Moving to x=start.x - 100 gives param < 0 → isPointOnLine returns false
            // Distance > start buffer → not in start buffer
            const level1Start = GAME_LEVELS[0].path.startPoint
            game.updatePlayerPosition(level1Start.x - 100, level1Start.y)
            expect(game.getState().isGameOver).toBe(true)
        })

        it('should return true when point is on bezier curve', () => {
            game.startGame()
            // Complete level 1 to reach level 2 (which has curve segments)
            const level1End = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(level1End.x, level1End.y)
            expect(game.getState().currentLevel).toBe(2)

            // Level 2 segment 0 is a curve - test at the midpoint of the curve
            // B(t) = (1-t)²*start + 2*(1-t)*t*control + t²*end
            // At t=0.5 (midpoint): B(0.5) = 0.25*start + 0.5*control + 0.25*end
            const level2 = GAME_LEVELS[1]
            const segment = level2.path.segments[0]
            expect(segment.type).toBe('curve')
            const midX =
                0.25 * segment.start.x +
                0.5 * segment.controlPoint!.x +
                0.25 * segment.end.x
            const midY =
                0.25 * segment.start.y +
                0.5 * segment.controlPoint!.y +
                0.25 * segment.end.y
            game.updatePlayerPosition(midX, midY)
            // Player is on the bezier path → isGameOver stays false
            expect(game.getState().isGameOver).toBe(false)
        })
    })
})
