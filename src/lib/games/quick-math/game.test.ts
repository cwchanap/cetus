import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QuickMathGame } from './game'
import type { GameConfig, GameCallbacks } from './types'

describe('QuickMathGame', () => {
    let game: QuickMathGame
    let callbacks: GameCallbacks
    let config: GameConfig

    beforeEach(() => {
        vi.useFakeTimers()

        callbacks = {
            onGameStart: vi.fn(),
            onGameOver: vi.fn(),
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onQuestionUpdate: vi.fn(),
        }

        config = {
            gameDuration: 60,
            operations: ['addition', 'subtraction'],
            maxNumber: 10,
            pointsPerCorrectAnswer: 10,
        }

        game = new QuickMathGame(config, callbacks)
    })

    afterEach(() => {
        game.destroy()
        vi.useRealTimers()
    })

    describe('constructor', () => {
        it('should initialize with default state', () => {
            const state = game.getState()

            expect(state.score).toBe(0)
            expect(state.questionsAnswered).toBe(0)
            expect(state.correctAnswers).toBe(0)
            expect(state.incorrectAnswers).toBe(0)
            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.currentQuestion).toBeNull()
        })
    })

    describe('startGame', () => {
        it('should start the game and generate first question', () => {
            game.startGame()

            const state = game.getState()
            expect(state.isGameActive).toBe(true)
            expect(state.isGameOver).toBe(false)
            expect(state.currentQuestion).not.toBeNull()
            expect(callbacks.onGameStart).toHaveBeenCalled()
            expect(callbacks.onQuestionUpdate).toHaveBeenCalled()
        })

        it('should reset score and stats on start', () => {
            // First game
            game.startGame()
            game.submitAnswer(String(game.getState().currentQuestion!.answer))

            // Restart
            game.startGame()
            const state = game.getState()
            expect(state.score).toBe(0)
            expect(state.questionsAnswered).toBe(0)
            expect(state.correctAnswers).toBe(0)
        })

        it('should reset achievement flags on start', () => {
            game.startGame()
            const flags = game.getAchievementFlags()

            expect(flags.seenOnePlusOne).toBe(false)
            expect(flags.onePlusOneIncorrect).toBe(false)
            expect(flags.seenOperand999).toBe(false)
            expect(flags.zeroAnswerIncorrect).toBe(false)
        })

        it('should start countdown timer', () => {
            game.startGame()
            expect(game.getState().timeRemaining).toBe(60)

            vi.advanceTimersByTime(5000)
            expect(game.getState().timeRemaining).toBe(55)
        })
    })

    describe('submitAnswer', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should return false when game is not active', () => {
            game.endGame()
            const result = game.submitAnswer('5')
            expect(result).toBe(false)
        })

        it('should return false when no current question', () => {
            // Manually set game as not started to simulate missing question
            const inactiveGame = new QuickMathGame(config, callbacks)
            const result = inactiveGame.submitAnswer('5')
            expect(result).toBe(false)
            inactiveGame.destroy()
        })

        it('should return true for correct answer', () => {
            const question = game.getState().currentQuestion!
            const result = game.submitAnswer(String(question.answer))

            expect(result).toBe(true)
        })

        it('should return false for incorrect answer', () => {
            const question = game.getState().currentQuestion!
            const wrongAnswer = question.answer + 999
            const result = game.submitAnswer(String(wrongAnswer))

            expect(result).toBe(false)
        })

        it('should update score on correct answer', () => {
            const question = game.getState().currentQuestion!
            game.submitAnswer(String(question.answer))

            expect(game.getState().score).toBe(config.pointsPerCorrectAnswer)
            expect(callbacks.onScoreUpdate).toHaveBeenCalledWith(
                config.pointsPerCorrectAnswer
            )
        })

        it('should not update score on incorrect answer', () => {
            const question = game.getState().currentQuestion!
            game.submitAnswer(String(question.answer + 999))

            expect(game.getState().score).toBe(0)
        })

        it('should increment questionsAnswered on any answer', () => {
            game.submitAnswer('999999')
            expect(game.getState().questionsAnswered).toBe(1)

            game.submitAnswer('999999')
            expect(game.getState().questionsAnswered).toBe(2)
        })

        it('should increment correctAnswers on correct answer', () => {
            const question = game.getState().currentQuestion!
            game.submitAnswer(String(question.answer))

            expect(game.getState().correctAnswers).toBe(1)
        })

        it('should increment incorrectAnswers on wrong answer', () => {
            game.submitAnswer('999999')

            expect(game.getState().incorrectAnswers).toBe(1)
        })

        it('should generate next question after answering', () => {
            const firstQuestion = game.getState().currentQuestion
            game.submitAnswer('999999')
            const nextQuestion = game.getState().currentQuestion

            // Questions should usually be different (may rarely be the same by chance)
            expect(nextQuestion).not.toBeNull()
            expect(callbacks.onQuestionUpdate).toHaveBeenCalledTimes(2)
        })
    })

    describe('updateCurrentAnswer and getCurrentAnswer', () => {
        it('should update and retrieve current answer', () => {
            game.updateCurrentAnswer('42')
            expect(game.getCurrentAnswer()).toBe('42')
        })

        it('should start with empty string', () => {
            expect(game.getCurrentAnswer()).toBe('')
        })
    })

    describe('endGame', () => {
        it('should end the game and call onGameOver', () => {
            game.startGame()
            game.endGame()

            const state = game.getState()
            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(true)
            expect(callbacks.onGameOver).toHaveBeenCalled()
        })

        it('should stop the timer when game ends', () => {
            game.startGame()
            game.endGame()

            const timeBefore = game.getState().timeRemaining
            vi.advanceTimersByTime(5000)
            // Timer should be stopped - time doesn't advance
            expect(game.getState().timeRemaining).toBe(timeBefore)
        })
    })

    describe('timer countdown', () => {
        it('should call onTimeUpdate each second', () => {
            game.startGame()
            vi.advanceTimersByTime(3000)

            expect(callbacks.onTimeUpdate).toHaveBeenCalledTimes(3)
        })

        it('should end game when time runs out', () => {
            game.startGame()
            vi.advanceTimersByTime(61000)

            expect(callbacks.onGameOver).toHaveBeenCalled()
            expect(game.isGameOver()).toBe(true)
        })
    })

    describe('getGameStats', () => {
        it('should return zero accuracy when no questions answered', () => {
            game.startGame()
            const stats = game.getGameStats()

            expect(stats.accuracy).toBe(0)
            expect(stats.totalQuestions).toBe(0)
        })

        it('should calculate accuracy correctly', () => {
            game.startGame()
            // Answer 2 correctly, 2 wrong = 50% accuracy
            const q1 = game.getState().currentQuestion!
            game.submitAnswer(String(q1.answer)) // correct
            game.submitAnswer('999999') // wrong
            const q3 = game.getState().currentQuestion!
            game.submitAnswer(String(q3.answer)) // correct
            game.submitAnswer('999999') // wrong

            const stats = game.getGameStats()
            expect(stats.totalQuestions).toBe(4)
            expect(stats.correctAnswers).toBe(2)
            expect(stats.incorrectAnswers).toBe(2)
            expect(stats.accuracy).toBe(50)
        })

        it('should return finalScore in stats', () => {
            game.startGame()
            const q = game.getState().currentQuestion!
            game.submitAnswer(String(q.answer)) // correct

            const stats = game.getGameStats()
            expect(stats.finalScore).toBe(config.pointsPerCorrectAnswer)
        })

        it('should return 0 total time when game not started', () => {
            const stats = game.getGameStats()
            expect(stats.averageTimePerQuestion).toBe(0)
        })
    })

    describe('isGameActive and isGameOver', () => {
        it('should return false before game starts', () => {
            expect(game.isGameActive()).toBe(false)
            expect(game.isGameOver()).toBe(false)
        })

        it('should return true when game is active', () => {
            game.startGame()
            expect(game.isGameActive()).toBe(true)
            expect(game.isGameOver()).toBe(false)
        })

        it('should reflect game over state', () => {
            game.startGame()
            game.endGame()

            expect(game.isGameActive()).toBe(false)
            expect(game.isGameOver()).toBe(true)
        })
    })

    describe('getAchievementFlags', () => {
        it('should track seenOnePlusOne flag', () => {
            // Use addition-only config with maxNumber 1 to force 1+1
            const addConfig: GameConfig = {
                gameDuration: 60,
                operations: ['addition'],
                maxNumber: 1,
                pointsPerCorrectAnswer: 10,
            }
            const addGame = new QuickMathGame(addConfig, callbacks)
            addGame.startGame()

            // With maxNumber=1, first question must be 1+1
            const flags = addGame.getAchievementFlags()
            expect(flags.seenOnePlusOne).toBe(true)

            addGame.destroy()
        })

        it('should track onePlusOneIncorrect flag when answering 1+1 wrong', () => {
            expect.assertions(1)
            const addConfig: GameConfig = {
                gameDuration: 60,
                operations: ['addition'],
                maxNumber: 1,
                pointsPerCorrectAnswer: 10,
            }
            const addGame = new QuickMathGame(addConfig, callbacks)
            addGame.startGame()

            const q = addGame.getState().currentQuestion!
            // With maxNumber=1 and addition-only, the question must be 1+1=2
            if (
                q.operation === 'addition' &&
                q.operand1 === 1 &&
                q.operand2 === 1
            ) {
                addGame.submitAnswer('999') // wrong answer for 1+1
                const flags = addGame.getAchievementFlags()
                expect(flags.onePlusOneIncorrect).toBe(true)
            }

            addGame.destroy()
        })

        it('should return flags copy (not reference)', () => {
            game.startGame()
            const flags1 = game.getAchievementFlags()
            const flags2 = game.getAchievementFlags()
            expect(flags1).not.toBe(flags2)
        })
    })

    describe('destroy', () => {
        it('should stop the timer on destroy', () => {
            game.startGame()
            game.destroy()

            const timeBefore = game.getState().timeRemaining
            vi.advanceTimersByTime(5000)
            // After destroy, timer should be cleared
            expect(game.getState().timeRemaining).toBe(timeBefore)
        })
    })

    describe('question generation', () => {
        it('should generate addition questions', () => {
            const addConfig: GameConfig = {
                gameDuration: 60,
                operations: ['addition'],
                maxNumber: 10,
                pointsPerCorrectAnswer: 10,
            }
            const addGame = new QuickMathGame(addConfig, callbacks)
            addGame.startGame()

            const q = addGame.getState().currentQuestion!
            expect(q.operation).toBe('addition')
            expect(q.answer).toBe(q.operand1 + q.operand2)

            addGame.destroy()
        })

        it('should generate subtraction questions with non-negative results', () => {
            const subConfig: GameConfig = {
                gameDuration: 60,
                operations: ['subtraction'],
                maxNumber: 10,
                pointsPerCorrectAnswer: 10,
            }
            const subGame = new QuickMathGame(subConfig, callbacks)

            // Generate multiple questions to verify subtraction results are non-negative
            for (let i = 0; i < 5; i++) {
                subGame.startGame()
                const q = subGame.getState().currentQuestion!
                expect(q.operation).toBe('subtraction')
                expect(q.answer).toBeGreaterThanOrEqual(0)
                subGame.endGame()
            }

            subGame.destroy()
        })

        it('should generate unique question ids', () => {
            game.startGame()
            const q1Id = game.getState().currentQuestion!.id

            game.submitAnswer('0')
            const q2Id = game.getState().currentQuestion!.id

            expect(q1Id).not.toBe(q2Id)
        })
    })

    describe('zeroAnswerIncorrect flag', () => {
        it('should track when zero-answer question answered incorrectly', () => {
            expect.assertions(1)
            // Use subtraction with same operands to get 0 answer
            // Force equal operands: maxNumber=1, subtraction -> 1-1=0
            const subConfig: GameConfig = {
                gameDuration: 60,
                operations: ['subtraction'],
                maxNumber: 1,
                pointsPerCorrectAnswer: 10,
            }
            const subGame = new QuickMathGame(subConfig, callbacks)
            subGame.startGame()

            const q = subGame.getState().currentQuestion!
            if (q.answer === 0) {
                subGame.submitAnswer('999') // wrong answer for 0
                const flags = subGame.getAchievementFlags()
                expect(flags.zeroAnswerIncorrect).toBe(true)
            }

            subGame.destroy()
        })

        it('should set seenOperand999 flag when a question has operand 999', () => {
            // Force Math.random to produce 999 as operand: floor(0.999 * 999) + 1 = 999
            const mathRandomSpy = vi
                .spyOn(Math, 'random')
                .mockReturnValue(0.999)

            const bigGame = new QuickMathGame(
                {
                    gameDuration: 60,
                    operations: ['addition'],
                    maxNumber: 999,
                    pointsPerCorrectAnswer: 10,
                },
                callbacks
            )
            bigGame.startGame()
            const flags = bigGame.getAchievementFlags()
            expect(flags.seenOperand999).toBe(true)

            mathRandomSpy.mockRestore()
            bigGame.destroy()
        })
    })
})
