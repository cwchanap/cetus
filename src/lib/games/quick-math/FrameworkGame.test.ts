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
})
