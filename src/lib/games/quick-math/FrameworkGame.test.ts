import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    QuickMathFrameworkGame,
    type QuickMathConfig,
    type QuickMathCallbacks,
} from './FrameworkGame'
import { GameID } from '@/lib/games'

describe('QuickMath Framework Implementation', () => {
    let game: QuickMathFrameworkGame
    let mockCallbacks: QuickMathCallbacks

    beforeEach(() => {
        mockCallbacks = {
            onStart: vi.fn(),
            onEnd: vi.fn(),
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onQuestionUpdate: vi.fn(),
            onAnswerSubmit: vi.fn(),
        }

        const config: QuickMathConfig = {
            duration: 60,
            achievementIntegration: true,
            pausable: false,
            resettable: true,
            pointsPerCorrectAnswer: 20,
            maxNumber: 10, // Small numbers for testing
            operations: ['addition'],
        }

        game = new QuickMathFrameworkGame(
            GameID.QUICK_MATH,
            config,
            mockCallbacks
        )
    })

    it('should initialize with correct state', () => {
        const state = game.getState()

        expect(state.score).toBe(0)
        expect(state.questionsAnswered).toBe(0)
        expect(state.correctAnswers).toBe(0)
        expect(state.incorrectAnswers).toBe(0)
        expect(state.isActive).toBe(false)
        expect(state.currentQuestion).toBe(null)
    })

    it('should start game correctly', () => {
        game.start()

        const state = game.getState()
        expect(state.isActive).toBe(true)
        expect(state.currentQuestion).not.toBe(null)
        expect(mockCallbacks.onStart).toHaveBeenCalled()
        expect(mockCallbacks.onQuestionUpdate).toHaveBeenCalled()
    })

    it('should handle correct answers', () => {
        game.start()
        const question = game.getCurrentQuestion()

        if (question) {
            const isCorrect = game.submitAnswer(question.answer.toString())

            expect(isCorrect).toBe(true)
            expect(game.getState().correctAnswers).toBe(1)
            expect(game.getState().score).toBe(20) // pointsPerCorrectAnswer
            expect(mockCallbacks.onAnswerSubmit).toHaveBeenCalledWith(
                true,
                question,
                question.answer.toString()
            )
        }
    })

    it('should handle incorrect answers', () => {
        game.start()
        const question = game.getCurrentQuestion()

        if (question) {
            const wrongAnswer = (question.answer + 999).toString()
            const isCorrect = game.submitAnswer(wrongAnswer)

            expect(isCorrect).toBe(false)
            expect(game.getState().incorrectAnswers).toBe(1)
            expect(game.getState().score).toBe(0)
            expect(mockCallbacks.onAnswerSubmit).toHaveBeenCalledWith(
                false,
                question,
                wrongAnswer
            )
        }
    })

    it('should generate math questions correctly', () => {
        game.start()
        const question = game.getCurrentQuestion()

        expect(question).not.toBe(null)
        if (question) {
            expect(question.operation).toBe('addition')
            expect(question.question).toMatch(/^\d+ \+ \d+$/)
            expect(question.answer).toBeGreaterThan(0)
            expect(question.operand1).toBeGreaterThanOrEqual(1)
            expect(question.operand1).toBeLessThanOrEqual(10)
            expect(question.operand2).toBeGreaterThanOrEqual(1)
            expect(question.operand2).toBeLessThanOrEqual(10)
        }
    })

    it('should calculate stats correctly', () => {
        game.start()

        // Answer a few questions
        for (let i = 0; i < 3; i++) {
            const question = game.getCurrentQuestion()
            if (question) {
                if (i < 2) {
                    // First two correct
                    game.submitAnswer(question.answer.toString())
                } else {
                    // Last one incorrect
                    game.submitAnswer('999')
                }
            }
        }

        const stats = game.getGameStats()
        expect(stats.totalQuestions).toBe(3)
        expect(stats.correctAnswers).toBe(2)
        expect(stats.incorrectAnswers).toBe(1)
        expect(stats.accuracy).toBe(67) // 2/3 = 66.67 rounded to 67
        expect(stats.finalScore).toBe(40) // 2 * 20 points
    })

    it('should reset correctly', () => {
        game.start()

        // Play a bit
        const question = game.getCurrentQuestion()
        if (question) {
            game.submitAnswer(question.answer.toString())
        }

        // Reset
        game.reset()

        const state = game.getState()
        expect(state.score).toBe(0)
        expect(state.questionsAnswered).toBe(0)
        expect(state.correctAnswers).toBe(0)
        expect(state.incorrectAnswers).toBe(0)
        expect(state.isActive).toBe(false)
        expect(state.currentQuestion).toBe(null)
    })

    it('should not accept answers when inactive', () => {
        // Don't start the game
        const result = game.submitAnswer('123')
        expect(result).toBe(false)
        expect(game.getState().questionsAnswered).toBe(0)
    })

    it('should support subtraction operation', () => {
        const config = {
            duration: 60,
            achievementIntegration: false,
            pausable: true,
            resettable: true,
            pointsPerCorrectAnswer: 10,
            maxNumber: 20,
            operations: ['subtraction'] as Array<'addition' | 'subtraction'>,
        }
        const subGame = new QuickMathFrameworkGame(
            GameID.QUICK_MATH,
            config,
            {}
        )
        subGame.start()
        const question = subGame.getCurrentQuestion()
        expect(question).not.toBeNull()
        expect(question!.operation).toBe('subtraction')
        // Answer should be non-negative (larger - smaller)
        expect(question!.answer).toBeGreaterThanOrEqual(0)
        // Question format should be "a - b"
        expect(question!.question).toMatch(/^\d+ - \d+$/)
        subGame.destroy()
    })

    it('should pause and resume correctly', () => {
        const pausedConfig = {
            duration: 60,
            achievementIntegration: false,
            pausable: true,
            resettable: true,
            pointsPerCorrectAnswer: 10,
            maxNumber: 10,
            operations: ['addition'] as Array<'addition' | 'subtraction'>,
        }
        const onPause = vi.fn()
        const onResume = vi.fn()
        const pauseGame = new QuickMathFrameworkGame(
            GameID.QUICK_MATH,
            pausedConfig,
            { onPause, onResume }
        )
        pauseGame.start()
        pauseGame.pause()
        expect(pauseGame.getState().isPaused).toBe(true)
        expect(onPause).toHaveBeenCalled()

        pauseGame.resume()
        expect(pauseGame.getState().isPaused).toBe(false)
        expect(onResume).toHaveBeenCalled()

        pauseGame.destroy()
    })

    it('should call update, render, cleanup without throwing', () => {
        expect(() => {
            ;(game as any).update(16)
            ;(game as any).render()
            ;(game as any).cleanup()
        }).not.toThrow()
    })

    it('should destroy properly', () => {
        game.start()
        expect(() => game.destroy()).not.toThrow()
    })

    it('should return zero stats when no questions answered', () => {
        const stats = game.getGameStats()
        expect(stats.accuracy).toBe(0)
        expect(stats.averageTimePerQuestion).toBe(0)
        expect(stats.totalQuestions).toBe(0)
    })

    it('should expose getGameData via score saving', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ newAchievements: [] }),
        })
        vi.stubGlobal('fetch', fetchMock)

        const achievConfig = {
            duration: 60,
            achievementIntegration: true,
            pausable: false,
            resettable: true,
            pointsPerCorrectAnswer: 10,
            maxNumber: 10,
            operations: ['addition'] as Array<'addition' | 'subtraction'>,
        }
        const achievGame = new QuickMathFrameworkGame(
            GameID.QUICK_MATH,
            achievConfig,
            {}
        )
        achievGame.start()
        await achievGame.end()

        const body = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(body).toHaveProperty('gameData')

        vi.unstubAllGlobals()
    })
})
