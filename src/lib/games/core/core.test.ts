import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GameEventEmitter } from '../core/EventEmitter'
import { GameTimer } from '../core/GameTimer'
import { ScoreManager } from '../core/ScoreManager'
import { GameID } from '@/lib/games'

// Mock the scoreService
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue(undefined),
}))

import { saveGameScore } from '@/lib/services/scoreService'

describe('Game Framework Core', () => {
    describe('GameEventEmitter', () => {
        let emitter: GameEventEmitter

        beforeEach(() => {
            emitter = new GameEventEmitter()
        })

        it('should emit and listen to events', () => {
            const listener = vi.fn()
            emitter.on('start', listener)
            emitter.emit('start', { test: 'data' })

            expect(listener).toHaveBeenCalledWith({
                type: 'start',
                data: { test: 'data' },
                timestamp: expect.any(Number),
            })
        })

        it('should remove listeners correctly', () => {
            const listener = vi.fn()
            emitter.on('start', listener)
            emitter.off('start', listener)
            emitter.emit('start')

            expect(listener).not.toHaveBeenCalled()
        })

        it('should count listeners correctly', () => {
            const listener1 = vi.fn()
            const listener2 = vi.fn()

            expect(emitter.listenerCount('start')).toBe(0)

            emitter.on('start', listener1)
            expect(emitter.listenerCount('start')).toBe(1)

            emitter.on('start', listener2)
            expect(emitter.listenerCount('start')).toBe(2)
        })
    })

    describe('GameTimer', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('should count down correctly', () => {
            const timer = new GameTimer({
                duration: 10,
                countDown: true,
                autoStart: false,
            })

            timer.start()
            expect(timer.getCurrentTime()).toBe(10)

            // Advance time by 5 seconds
            vi.advanceTimersByTime(5000)
            expect(timer.getCurrentTime()).toBe(5)
        })

        it('should handle pause and resume', () => {
            const timer = new GameTimer({
                duration: 10,
                countDown: true,
                autoStart: false,
            })

            timer.start()
            vi.advanceTimersByTime(3000)
            expect(timer.getCurrentTime()).toBe(7)

            timer.pause()
            vi.advanceTimersByTime(2000) // Time should not advance while paused
            expect(timer.getCurrentTime()).toBe(7)

            timer.resume()
            vi.advanceTimersByTime(2000)
            expect(timer.getCurrentTime()).toBe(5)
        })

        it('should emit events correctly', () => {
            const onStart = vi.fn()
            const onPause = vi.fn()
            const onComplete = vi.fn()

            const timer = new GameTimer({
                duration: 2,
                countDown: true,
                autoStart: false,
                onComplete,
            })

            timer.on('start', onStart)
            timer.on('pause', onPause)

            timer.start()
            expect(onStart).toHaveBeenCalled()

            timer.pause()
            expect(onPause).toHaveBeenCalled()

            timer.resume()
            vi.advanceTimersByTime(2000)
            expect(onComplete).toHaveBeenCalled()
        })
    })

    describe('ScoreManager', () => {
        let scoreManager: ScoreManager

        beforeEach(() => {
            scoreManager = new ScoreManager({
                gameId: GameID.TETRIS,
                scoringConfig: { basePoints: 10, timeBonus: true },
                achievementIntegration: false,
            })
        })

        it('should manage score correctly', () => {
            expect(scoreManager.getScore()).toBe(0)

            scoreManager.addPoints(100, 'test')
            expect(scoreManager.getScore()).toBe(100)

            scoreManager.subtractPoints(30, 'penalty')
            expect(scoreManager.getScore()).toBe(70)
        })

        it('should not allow negative scores', () => {
            scoreManager.subtractPoints(100, 'penalty')
            expect(scoreManager.getScore()).toBe(0)
        })

        it('should track score history', () => {
            scoreManager.addPoints(100, 'action1')
            scoreManager.addPoints(50, 'action2')
            scoreManager.subtractPoints(25, 'penalty')

            const history = scoreManager.getScoreHistory()
            expect(history).toHaveLength(3)
            expect(history[0]).toMatchObject({
                points: 100,
                reason: 'action1',
                timestamp: expect.any(Number),
            })
        })

        it('should calculate time bonus correctly', () => {
            const bonus = scoreManager.calculateTimeBonus(10)
            expect(bonus).toBe(50) // 10 seconds * 5 points per second

            const noBonusConfig = new ScoreManager({
                gameId: GameID.TETRIS,
                scoringConfig: { basePoints: 10, timeBonus: false },
                achievementIntegration: false,
            })
            const noBonus = noBonusConfig.calculateTimeBonus(10)
            expect(noBonus).toBe(0)
        })

        it('should provide score statistics', () => {
            scoreManager.addPoints(100, 'action1')
            scoreManager.addPoints(50, 'action2')
            scoreManager.addPoints(25, 'action1')

            const stats = scoreManager.getStats()
            expect(stats.totalScore).toBe(175)
            expect(stats.totalActions).toBe(3)
            expect(stats.averagePointsPerAction).toBeCloseTo(58.33)
            expect(stats.highestSingleScore).toBe(100)
            expect(stats.scoreBreakdown).toEqual({
                action1: 125,
                action2: 50,
            })
        })

        it('should reset correctly', () => {
            scoreManager.addPoints(100, 'test')
            expect(scoreManager.getScore()).toBe(100)
            expect(scoreManager.getScoreHistory()).toHaveLength(1)

            scoreManager.reset()
            expect(scoreManager.getScore()).toBe(0)
            expect(scoreManager.getScoreHistory()).toHaveLength(0)
        })

        it('should call onScoreUpdate callback on reset', () => {
            const onScoreUpdate = vi.fn()
            const sm = new ScoreManager({
                gameId: GameID.TETRIS,
                scoringConfig: {
                    basePoints: 10,
                    timeBonus: true,
                    bonusMultiplier: 1,
                },
                achievementIntegration: false,
                onScoreUpdate,
            })
            sm.addPoints(50, 'test')
            sm.reset()
            expect(onScoreUpdate).toHaveBeenLastCalledWith(0)
        })

        it('should apply time bonus correctly', () => {
            scoreManager.applyTimeBonus(10)
            expect(scoreManager.getScore()).toBe(50) // 10 * 5

            scoreManager.reset()
            scoreManager.applyTimeBonus(0)
            expect(scoreManager.getScore()).toBe(0) // no bonus when time is 0
        })

        it('should save final score without achievement integration', async () => {
            scoreManager.addPoints(100)
            const result = await scoreManager.saveFinalScore()
            expect(result.success).toBe(true)
            expect(saveGameScore).toHaveBeenCalledWith(GameID.TETRIS, 100)
        })

        it('should save final score with achievement integration using fetch', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ newAchievements: ['first_win'] }),
            })
            vi.stubGlobal('fetch', fetchMock)

            const sm = new ScoreManager({
                gameId: GameID.TETRIS,
                scoringConfig: { basePoints: 10, timeBonus: false },
                achievementIntegration: true,
            })
            sm.addPoints(200)
            const result = await sm.saveFinalScore({ level: 5 })

            expect(result.success).toBe(true)
            expect(result.newAchievements).toEqual(['first_win'])

            vi.unstubAllGlobals()
        })

        it('should return success false when fetch returns not ok', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
            })
            vi.stubGlobal('fetch', fetchMock)

            const sm = new ScoreManager({
                gameId: GameID.TETRIS,
                scoringConfig: { basePoints: 10, timeBonus: false },
                achievementIntegration: true,
            })
            const result = await sm.saveFinalScore()
            expect(result.success).toBe(false)

            vi.unstubAllGlobals()
        })

        it('should return success false when save throws', async () => {
            vi.mocked(saveGameScore).mockRejectedValueOnce(
                new Error('DB error')
            )
            const result = await scoreManager.saveFinalScore()
            expect(result.success).toBe(false)
        })
    })

    describe('GameTimer - additional coverage', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('should not start if already running', () => {
            const onTick = vi.fn()
            const timer = new GameTimer({
                duration: 10,
                countDown: true,
                autoStart: false,
                onTick,
            })
            timer.start()
            timer.start() // second call should be ignored
            vi.advanceTimersByTime(1000)
            // onTick called once means timer didn't restart
            expect(onTick).toHaveBeenCalledTimes(1)
        })

        it('should not pause if not running', () => {
            const timer = new GameTimer({
                duration: 10,
                countDown: true,
                autoStart: false,
            })
            // Pause before start — should not throw
            expect(() => timer.pause()).not.toThrow()
        })

        it('should not resume if not paused', () => {
            const timer = new GameTimer({
                duration: 10,
                countDown: true,
                autoStart: false,
            })
            timer.start()
            // Resume when not paused — should not throw
            expect(() => timer.resume()).not.toThrow()
        })

        it('should report complete status for count-up timers', () => {
            const timer = new GameTimer({
                duration: 10,
                countDown: false,
                autoStart: false,
            })
            expect(timer.isComplete()).toBe(false)
        })

        it('should report correct status when not running', () => {
            const timer = new GameTimer({
                duration: 10,
                countDown: true,
                autoStart: false,
            })
            const status = timer.getStatus()
            expect(status.isRunning).toBe(false)
            expect(status.isPaused).toBe(false)
            expect(status.currentTime).toBe(10)
            expect(status.elapsedTime).toBe(0)
            expect(status.isComplete).toBe(false)
        })

        it('should call onComplete when countdown reaches zero', () => {
            const onComplete = vi.fn()
            const timer = new GameTimer({
                duration: 2,
                countDown: true,
                autoStart: false,
                onComplete,
            })
            timer.start()
            vi.advanceTimersByTime(3000)
            expect(onComplete).toHaveBeenCalled()
        })

        it('should count up correctly', () => {
            const timer = new GameTimer({
                duration: 60,
                countDown: false,
                autoStart: false,
            })
            timer.start()
            vi.advanceTimersByTime(5000)
            expect(timer.getElapsedTime()).toBe(5)
        })

        it('should return 0 elapsed time when not running', () => {
            const timer = new GameTimer({
                duration: 10,
                countDown: true,
                autoStart: false,
            })
            expect(timer.getElapsedTime()).toBe(0)
        })
    })
})
