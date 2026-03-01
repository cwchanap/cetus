import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WordScrambleGame } from './game'
import type { GameConfig, GameCallbacks } from './types'

describe('WordScrambleGame', () => {
    let game: WordScrambleGame
    let config: GameConfig
    let callbacks: GameCallbacks

    beforeEach(() => {
        // Mock config
        config = {
            gameDuration: 60,
            pointsPerWord: {
                easy: 10,
                medium: 20,
                hard: 30,
            },
            wordCategories: ['general'],
            minWordLength: 3,
            maxWordLength: 12,
        }

        // Mock callbacks
        callbacks = {
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onChallengeUpdate: vi.fn(),
            onGameOver: vi.fn(),
            onGameStart: vi.fn(),
            onCorrectAnswer: vi.fn(),
            onIncorrectAnswer: vi.fn(),
            onScoreUpload: vi.fn(),
        }

        game = new WordScrambleGame(config, callbacks)
    })

    describe('Game Initialization', () => {
        it('should initialize with correct default state', () => {
            const state = game.getState()
            expect(state.score).toBe(0)
            expect(state.wordsUnscrambled).toBe(0)
            expect(state.correctAnswers).toBe(0)
            expect(state.incorrectAnswers).toBe(0)
            expect(state.timeRemaining).toBe(60)
            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.currentChallenge).toBe(null)
            expect(state.wordHistory).toEqual([])
        })

        it('should not be active initially', () => {
            expect(game.isGameActive()).toBe(false)
            expect(game.isGameOver()).toBe(false)
        })
    })

    describe('Game Start', () => {
        it('should start the game correctly', () => {
            game.startGame()

            expect(game.isGameActive()).toBe(true)
            expect(game.isGameOver()).toBe(false)
            expect(callbacks.onGameStart).toHaveBeenCalled()
            expect(callbacks.onChallengeUpdate).toHaveBeenCalled()

            const state = game.getState()
            expect(state.currentChallenge).not.toBe(null)
            expect(state.gameStartTime).not.toBe(null)
        })

        it('should generate a challenge on start', () => {
            game.startGame()

            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)
            expect(challenge?.originalWord).toBeTruthy()
            expect(challenge?.scrambledWord).toBeTruthy()
            expect(challenge?.points).toBeGreaterThan(0)
        })
    })

    describe('Answer Submission', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should handle correct answer', () => {
            // Arrange
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)

            // Act
            const result = game.submitAnswer(challenge?.originalWord ?? '')

            // Assert
            expect(result).toBe(true)
            expect(callbacks.onCorrectAnswer).toHaveBeenCalledWith(
                challenge?.originalWord
            )
            expect(callbacks.onScoreUpdate).toHaveBeenCalled()

            const state = game.getState()
            expect(state.correctAnswers).toBe(1)
            expect(state.wordsUnscrambled).toBe(1)
            expect(state.score).toBeGreaterThan(0)
        })

        it('should handle incorrect answer', () => {
            // Arrange
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)

            // Act
            const result = game.submitAnswer('wronganswer')

            // Assert
            expect(result).toBe(false)
            expect(callbacks.onIncorrectAnswer).toHaveBeenCalledWith(
                challenge?.originalWord,
                'wronganswer'
            )

            const state = game.getState()
            expect(state.incorrectAnswers).toBe(1)
            expect(state.wordsUnscrambled).toBe(1)
            expect(state.score).toBe(0)
        })

        it('should not accept answers when game is not active', () => {
            // Arrange
            game.endGame()

            // Act
            const result = game.submitAnswer('test')

            // Assert
            expect(result).toBe(false)
        })

        it('should generate new challenge after answer', () => {
            // Arrange
            const firstChallenge = game.getCurrentChallenge()
            expect(firstChallenge).not.toBe(null)

            // Act
            game.submitAnswer(firstChallenge?.originalWord ?? '')

            // Assert
            const secondChallenge = game.getCurrentChallenge()
            expect(secondChallenge).not.toBe(null)
            expect(secondChallenge?.id).not.toBe(firstChallenge?.id)
        })
    })

    describe('Skip Challenge', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should skip current challenge', () => {
            // Arrange
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)

            // Act
            game.skipCurrentChallenge()

            // Assert
            const state = game.getState()
            expect(state.incorrectAnswers).toBe(1)
            expect(state.wordsUnscrambled).toBe(1)
            expect(state.score).toBe(0)

            const newChallenge = game.getCurrentChallenge()
            expect(newChallenge?.id).not.toBe(challenge?.id)
        })
    })

    describe('Score Calculation', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should calculate base points correctly', () => {
            // Arrange
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)
            const initialScore = game.getScore()

            // Act
            game.submitAnswer(challenge?.originalWord ?? '')

            // Assert
            const finalScore = game.getScore()
            expect(finalScore).toBeGreaterThan(initialScore)
            expect(finalScore).toBeGreaterThanOrEqual(challenge?.points ?? 0)
        })
    })

    describe('Game Stats', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should calculate game stats correctly', () => {
            // Arrange
            const challenge1 = game.getCurrentChallenge()
            expect(challenge1).not.toBe(null)

            // Act
            // Answer one correctly
            game.submitAnswer(challenge1?.originalWord ?? '')

            // Answer one incorrectly
            const challenge2 = game.getCurrentChallenge()
            expect(challenge2).not.toBe(null)
            game.submitAnswer('wronganswer')

            // Assert
            const stats = game.getGameStats()
            expect(stats.totalWords).toBe(2)
            expect(stats.correctAnswers).toBe(1)
            expect(stats.incorrectAnswers).toBe(1)
            expect(stats.accuracy).toBe(50)
            expect(stats.finalScore).toBeGreaterThan(0)
            expect(stats.wordsUnscrambled).toHaveLength(2)
        })
    })

    describe('Game End', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should end game correctly', () => {
            // Arrange & Act
            game.endGame()

            // Assert
            expect(game.isGameActive()).toBe(false)
            expect(game.isGameOver()).toBe(true)
            expect(callbacks.onGameOver).toHaveBeenCalled()
        })

        it('should not accept answers after game ends', () => {
            // Arrange
            game.endGame()

            // Act
            const result = game.submitAnswer('test')

            // Assert
            expect(result).toBe(false)
        })
    })

    describe('Cleanup', () => {
        it('should cleanup resources on destroy', () => {
            // Arrange
            game.startGame()

            // Act & Assert
            expect(() => game.destroy()).not.toThrow()
        })
    })

    describe('Additional coverage', () => {
        it('getTimeRemaining returns correct value when game is active', () => {
            vi.useFakeTimers()
            game.startGame()
            // Assert initial time remaining equals configured duration
            const initialTime = game.getTimeRemaining()
            expect(initialTime).toBe(config.gameDuration)
            // Advance timers by 5 seconds
            vi.advanceTimersByTime(5000)
            // Assert time remaining has decreased by that amount
            expect(game.getTimeRemaining()).toBe(initialTime - 5)
            vi.useRealTimers()
            game.destroy()
        })

        it('getGameStats returns correct values when game has not started', () => {
            const stats = game.getGameStats()
            expect(stats.totalWords).toBe(0)
            expect(stats.accuracy).toBe(0)
        })

        it('updateCurrentAnswer and getCurrentAnswer', () => {
            game.updateCurrentAnswer('hello')
            expect(game.getCurrentAnswer()).toBe('hello')
        })

        it('skipCurrentChallenge does nothing when game is not active', () => {
            // Game not started, skipCurrentChallenge should return early
            const state = game.getState()
            const beforeWords = state.wordsUnscrambled
            game.skipCurrentChallenge()
            expect(game.getState().wordsUnscrambled).toBe(beforeWords)
        })

        it('should end game when timer expires', () => {
            vi.useFakeTimers()
            game.startGame()
            // Advance timer past game duration to trigger endGame() via timer callback
            vi.advanceTimersByTime(config.gameDuration * 1000 + 1000)
            expect(game.isGameActive()).toBe(false)
            expect(game.isGameOver()).toBe(true)
            expect(callbacks.onGameOver).toHaveBeenCalled()
            vi.useRealTimers()
        })

        it('should award 3-5 second speed bonus on correct answer', () => {
            vi.useFakeTimers()
            game.startGame()
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)
            const basePoints = challenge?.points ?? 0

            // Advance 3.5 seconds — challengeStartTime was set at game start (fake time=0)
            // timeToAnswer = 3.5s → hits "else if (timeToAnswer < 5)" branch
            vi.advanceTimersByTime(3500)
            game.submitAnswer(challenge?.originalWord ?? '')

            expect(game.getScore()).toBeGreaterThan(basePoints)
            expect(game.getScore()).toBe(basePoints + 5) // 5-point quick bonus
            vi.useRealTimers()
            game.destroy()
        })

        it('should use medium difficulty after 5+ words when rand < 0.6', () => {
            vi.useFakeTimers()
            // Mock Math.random to return 0.3 (< 0.6) for difficulty selection
            vi.spyOn(Math, 'random').mockReturnValue(0.3)
            game.startGame()
            // Submit 5 words so wordsUnscrambled >= 5
            for (let i = 0; i < 5; i++) {
                const ch = game.getCurrentChallenge()
                expect(ch).not.toBe(null)
                game.submitAnswer(ch!.originalWord)
            }
            // Next challenge generation hits the >= 5 branch with rand 0.3 < 0.6 → medium
            const ch = game.getCurrentChallenge()
            expect(ch).not.toBe(null)
            expect(ch!.difficulty).toBe('medium')
            vi.restoreAllMocks()
            vi.useRealTimers()
            game.destroy()
        })

        it('should use hard difficulty after 10+ words when 0.4 <= rand < 0.7', () => {
            vi.useFakeTimers()
            // Mock Math.random: returns 0.5 for difficulty selection (>= 0.4, < 0.7 → hard)
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            game.startGame()
            for (let i = 0; i < 10; i++) {
                const ch = game.getCurrentChallenge()
                expect(ch).not.toBe(null)
                game.submitAnswer(ch!.originalWord)
            }
            // Next challenge hits >= 10 branch: rand=0.5 → not < 0.4, but < 0.7 → hard
            const ch = game.getCurrentChallenge()
            expect(ch).not.toBe(null)
            expect(ch!.difficulty).toBe('hard')
            vi.restoreAllMocks()
            vi.useRealTimers()
            game.destroy()
        })

        it('should use medium difficulty after 10+ words when rand < 0.4', () => {
            vi.useFakeTimers()
            vi.spyOn(Math, 'random').mockReturnValue(0.2)
            game.startGame()
            for (let i = 0; i < 10; i++) {
                const ch = game.getCurrentChallenge()
                expect(ch).not.toBe(null)
                game.submitAnswer(ch!.originalWord)
            }
            // rand=0.2 < 0.4 → medium difficulty (lines 44-47 of game.ts)
            const ch = game.getCurrentChallenge()
            expect(ch).not.toBe(null)
            expect(ch!.difficulty).toBe('medium')
            vi.restoreAllMocks()
            vi.useRealTimers()
            game.destroy()
        })
    })
})
