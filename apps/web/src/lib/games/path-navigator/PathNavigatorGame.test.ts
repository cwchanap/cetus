import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    PathNavigatorGame,
    DEFAULT_PATH_NAVIGATOR_CONFIG,
    GAME_LEVELS,
} from './PathNavigatorGame'
import type { PathNavigatorState } from './types'

// Direct access to internal state for edge-case tests.
function stateOf(game: PathNavigatorGame): PathNavigatorState {
    return (game as unknown as { state: PathNavigatorState }).state
}

describe('PathNavigatorGame', () => {
    let game: PathNavigatorGame

    beforeEach(() => {
        vi.useFakeTimers()
        // Stub rAF and fetch so the framework's render/save paths are no-ops.
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 1)
        )
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            })
        )
        game = new PathNavigatorGame()
    })

    afterEach(() => {
        game.destroy()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    describe('initialization', () => {
        it('should create game with default config', () => {
            const state = game.getState()

            expect(state.currentLevel).toBe(1)
            expect(state.score).toBe(0)
            expect(state.timeRemaining).toBe(
                DEFAULT_PATH_NAVIGATOR_CONFIG.duration
            )
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.isGameWon).toBe(false)
        })

        it('should accept custom config', () => {
            const customGame = new PathNavigatorGame({ duration: 120 })
            const state = customGame.getState()

            expect(state.timeRemaining).toBe(120)
            customGame.destroy()
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
            game.start()
            const state = game.getState()

            expect(state.isActive).toBe(true)
            expect(state.isGameOver).toBe(false)
            expect(state.gameStarted).toBe(true)
            expect(state.gameStartTime).not.toBeNull()
        })

        it('should not start if already active', () => {
            game.start()
            const firstStartTime = game.getState().gameStartTime

            game.start()
            const secondStartTime = game.getState().gameStartTime

            expect(firstStartTime).toBe(secondStartTime)
        })

        it('should end the game', async () => {
            game.start()
            await game.end()
            const state = game.getState()

            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(true)
        })

        it('should pause and resume the game', () => {
            game.start()
            game.pause()
            expect(game.getState().isPaused).toBe(true)

            game.resume()
            expect(game.getState().isPaused).toBe(false)
        })

        it('should reset the game', () => {
            game.start()
            game.reset()
            const state = game.getState()

            expect(state.isActive).toBe(false)
            expect(state.score).toBe(0)
            expect(state.currentLevel).toBe(1)
        })
    })

    describe('timer', () => {
        it('should decrement time remaining', () => {
            game.start()
            const initialTime = game.getState().timeRemaining

            vi.advanceTimersByTime(1000)

            expect(game.getState().timeRemaining).toBe(initialTime - 1)
        })

        it('should end game when time runs out', async () => {
            game.start()

            // Advance time to reach 0, then one more tick to trigger end
            await vi.advanceTimersByTimeAsync(
                (DEFAULT_PATH_NAVIGATOR_CONFIG.duration + 1) * 1000
            )

            expect(game.getState().isGameOver).toBe(true)
        })

        it('should stop timer when game ends', async () => {
            game.start()
            vi.advanceTimersByTime(5000)
            await game.end()

            const timeAtEnd = game.getState().timeRemaining
            vi.advanceTimersByTime(5000)

            expect(game.getState().timeRemaining).toBe(timeAtEnd)
        })
    })

    describe('player position', () => {
        it('should update cursor position', () => {
            game.start()
            game.setCursorPosition(100, 200)
            const state = game.getState()

            expect(state.cursor.x).toBe(100)
            expect(state.cursor.y).toBe(200)
        })

        it('should detect when player is on path', () => {
            game.start()
            const startPoint = GAME_LEVELS[0].path.startPoint
            const result = game.updatePlayerPosition(
                startPoint.x + 10,
                startPoint.y
            )

            expect(result.isOnPath).toBe(true)
        })

        it('should detect when player reaches goal', () => {
            game.start()
            const endPoint = GAME_LEVELS[0].path.endPoint
            const result = game.updatePlayerPosition(endPoint.x, endPoint.y)

            expect(result.hasReachedGoal).toBe(true)
        })

        it('should end game when player goes out of bounds', () => {
            game.start()
            // Move far off path
            game.updatePlayerPosition(100, 100)

            expect(game.getState().isGameOver).toBe(true)
        })
    })

    describe('level progression', () => {
        it('should advance to next level when goal reached', () => {
            game.start()
            expect(game.getState().currentLevel).toBe(1)

            // Reach goal of first level
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            expect(game.getState().currentLevel).toBe(2)
        })

        it('should add score when completing level', () => {
            game.start()
            const initialScore = game.getState().score

            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            expect(game.getState().score).toBeGreaterThan(initialScore)
        })

        it('should check bezier curve segments when on level 2', () => {
            game.start()

            // Complete level 1 to get to level 2 (which has curve segments)
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)
            expect(game.getState().currentLevel).toBe(2)

            // Move to a point in the middle of level 2 (not near start/end buffer)
            game.updatePlayerPosition(400, 250)
            const state = game.getState()
            expect(state.currentLevel).toBe(2)
            expect(state.cursor.x).toBe(400)
            expect(state.cursor.y).toBe(250)
        })

        it('should complete game when all levels are finished', () => {
            game.start()

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
            game.start()

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
            game.start()
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            const level = game.getCurrentLevel()

            expect(level.id).toBe(2)
        })
    })

    describe('getGameStats', () => {
        it('should return game statistics', () => {
            game.start()
            const stats = game.getGameStats()

            expect(stats).toHaveProperty('finalScore')
            expect(stats).toHaveProperty('levelsCompleted')
            expect(stats).toHaveProperty('totalTime')
            expect(stats).toHaveProperty('averageTimePerLevel')
            expect(stats).toHaveProperty('pathViolations')
            expect(stats).toHaveProperty('perfectLevels')
        })

        it('should return zero totalTime when game has not started', () => {
            const stats = game.getGameStats()
            expect(stats.totalTime).toBe(0)
            expect(stats.levelsCompleted).toBe(0)
        })

        it('should return GAME_LEVELS.length for levelsCompleted when game is won', () => {
            game.start()
            for (let i = 0; i < GAME_LEVELS.length; i++) {
                const levelEnd = GAME_LEVELS[i].path.endPoint
                game.updatePlayerPosition(levelEnd.x, levelEnd.y)
            }
            const stats = game.getGameStats()
            expect(stats.levelsCompleted).toBe(GAME_LEVELS.length)
            expect(stats.perfectLevels).toBeGreaterThan(0)
        })

        it('should track levels completed', () => {
            game.start()

            // Complete first level
            const endPoint = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(endPoint.x, endPoint.y)

            const stats = game.getGameStats()
            expect(stats.levelsCompleted).toBe(1)
        })

        it('should count path violations on game over', () => {
            game.start()
            game.updatePlayerPosition(100, 100) // Off path

            const stats = game.getGameStats()
            expect(stats.pathViolations).toBe(1)
        })
    })

    describe('getGameData (achievement data)', () => {
        it('should preserve pathsCompleted and perfectPaths fields', () => {
            game.start()
            for (let i = 0; i < GAME_LEVELS.length; i++) {
                const levelEnd = GAME_LEVELS[i].path.endPoint
                game.updatePlayerPosition(levelEnd.x, levelEnd.y)
            }
            // Access protected method for verification
            const data = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()
            expect(data).toHaveProperty('pathsCompleted')
            expect(data).toHaveProperty('perfectPaths')
            expect(data.pathsCompleted).toBe(GAME_LEVELS.length)
        })
    })

    describe('cleanup', () => {
        it('should stop timer on destroy', () => {
            game.start()
            game.destroy()

            const timeAfterDestroy = game.getState().timeRemaining
            vi.advanceTimersByTime(5000)

            expect(game.getState().timeRemaining).toBe(timeAfterDestroy)
        })
    })

    describe('isPointOnLine and isPointOnBezier edge cases', () => {
        it('should return false when point projection is before line start (param < 0)', () => {
            game.start()
            const level1Start = GAME_LEVELS[0].path.startPoint
            game.updatePlayerPosition(level1Start.x - 100, level1Start.y)
            expect(game.getState().isGameOver).toBe(true)
        })

        it('should return true when point is on bezier curve', () => {
            game.start()
            // Complete level 1 to reach level 2 (which has curve segments)
            const level1End = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(level1End.x, level1End.y)
            expect(game.getState().currentLevel).toBe(2)

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

        it('should return false when isPointOnLine called with zero-length segment (lenSq === 0)', () => {
            game.start()
            const level = GAME_LEVELS[stateOf(game).currentLevel - 1]
            const originalSegments = level.path.segments
            const zeroLenSegment = {
                type: 'straight' as const,
                start: { x: 500, y: 500 },
                end: { x: 500, y: 500 },
                width: 30,
            }
            try {
                level.path.segments = [zeroLenSegment]
                game.updatePlayerPosition(500, 500)
                expect(game.getState().isGameOver).toBe(true)
            } finally {
                level.path.segments = originalSegments
            }
        })

        it('should return false from isPointOnSegment for curve segment without controlPoint', () => {
            game.start()
            const level = GAME_LEVELS[stateOf(game).currentLevel - 1]
            const originalSegments = level.path.segments
            const badCurveSegment = {
                type: 'curve' as const,
                start: { x: 300, y: 300 },
                end: { x: 400, y: 300 },
                width: 30,
            }
            try {
                level.path.segments = [badCurveSegment]
                game.updatePlayerPosition(350, 300)
                expect(game.getState().isGameOver).toBe(true)
            } finally {
                level.path.segments = originalSegments
            }
        })
    })

    describe('guard return edge cases', () => {
        it('end should return early when game is not active', async () => {
            // game is not started, isActive = false
            await game.end()
            expect(game.getState().isGameOver).toBe(false)
        })

        it('pause should return early when game is not active', () => {
            game.pause()
            expect(game.getState().isActive).toBe(false)
        })

        it('pause should return early when game is over', async () => {
            game.start()
            await game.end() // sets isGameOver = true, isActive = false
            expect(game.getState().isGameOver).toBe(true)
            const before = game.getState().isPaused
            game.pause() // should return early
            expect(game.getState().isPaused).toBe(before)
        })

        it('resume should return early when game is not paused', () => {
            game.start()
            expect(game.getState().isActive).toBe(true)
            game.resume() // not paused → return early
            expect(game.getState().isPaused).toBe(false)
        })

        it('resume should return early when game is over', async () => {
            game.start()
            await game.end()
            game.resume()
            expect(game.getState().isActive).toBe(false)
        })

        it('updatePlayerPosition should return isOnPath:true when game is not active', () => {
            // game not started → isActive = false
            const result = game.updatePlayerPosition(0, 0)
            expect(result.isOnPath).toBe(true)
            expect(result.hasReachedGoal).toBe(false)
        })

        it('completeLevel should use levelTime=0 when levelStartTime is null', () => {
            game.start()
            // Null out levelStartTime to trigger fallback path
            stateOf(game).levelStartTime = null
            // Move to level end to trigger completeLevel
            const level1End = GAME_LEVELS[0].path.endPoint
            game.updatePlayerPosition(level1End.x, level1End.y)
            // Score should be added (basePoints + 0 time bonus from levelTime=0)
            expect(game.getState().score).toBeGreaterThan(0)
        })
    })
})
