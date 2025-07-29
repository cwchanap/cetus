import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GameEventEmitter } from '../core/EventEmitter'
import { GameTimer } from '../core/GameTimer'
import { ScoreManager } from '../core/ScoreManager'
import { GameID } from '@/lib/games'

// Mock the scoreService
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue(undefined),
}))

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
    })
})
