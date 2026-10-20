import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WordScrambleGame } from './WordScrambleGame'
import type {
    WordScrambleConfig,
    WordScrambleCallbacks,
} from './frameworkTypes'

describe('WordScrambleGame', () => {
    let game: WordScrambleGame
    let config: Partial<WordScrambleConfig>
    let callbacks: WordScrambleCallbacks

    beforeEach(() => {
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
        } as Partial<WordScrambleConfig>

        callbacks = {
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onChallengeUpdate: vi.fn(),
            onCorrectAnswer: vi.fn(),
            onIncorrectAnswer: vi.fn(),
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
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.currentChallenge).toBe(null)
            expect(state.wordHistory).toEqual([])
        })

        it('should not be active initially', () => {
            expect(game.getState().isActive).toBe(false)
            expect(game.getState().isGameOver).toBe(false)
        })
    })

    describe('Game Start', () => {
        it('should start the game correctly', () => {
            game.start()

            expect(game.getState().isActive).toBe(true)
            expect(game.getState().isGameOver).toBe(false)
            expect(callbacks.onChallengeUpdate).toHaveBeenCalled()

            const state = game.getState()
            expect(state.currentChallenge).not.toBe(null)
        })

        it('should generate a challenge on start', () => {
            game.start()

            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)
            expect(challenge?.originalWord).toBeTruthy()
            expect(challenge?.scrambledWord).toBeTruthy()
            expect(challenge?.points).toBeGreaterThan(0)
        })
    })

    describe('Answer Submission', () => {
        beforeEach(() => {
            game.start()
        })

        it('should handle correct answer', () => {
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)

            const result = game.submitAnswer(challenge?.originalWord ?? '')

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
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)

            const result = game.submitAnswer('wronganswer')

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
            void game.end()

            const result = game.submitAnswer('test')

            expect(result).toBe(false)
        })

        it('should generate new challenge after answer', () => {
            const firstChallenge = game.getCurrentChallenge()
            expect(firstChallenge).not.toBe(null)

            game.submitAnswer(firstChallenge?.originalWord ?? '')

            const secondChallenge = game.getCurrentChallenge()
            expect(secondChallenge).not.toBe(null)
            expect(secondChallenge?.id).not.toBe(firstChallenge?.id)
        })
    })

    describe('Skip Challenge', () => {
        beforeEach(() => {
            game.start()
        })

        it('should skip current challenge', () => {
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)

            game.skipCurrentChallenge()

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
            game.start()
        })

        it('should calculate base points correctly', () => {
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)
            const initialScore = game.getState().score

            game.submitAnswer(challenge?.originalWord ?? '')

            const finalScore = game.getState().score
            expect(finalScore).toBeGreaterThan(initialScore)
            expect(finalScore).toBeGreaterThanOrEqual(challenge?.points ?? 0)
        })
    })

    describe('Game Stats', () => {
        beforeEach(() => {
            game.start()
        })

        it('should calculate game stats correctly', () => {
            const challenge1 = game.getCurrentChallenge()
            expect(challenge1).not.toBe(null)

            game.submitAnswer(challenge1?.originalWord ?? '')

            const challenge2 = game.getCurrentChallenge()
            expect(challenge2).not.toBe(null)
            game.submitAnswer('wronganswer')

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
            game.start()
        })

        it('should end game correctly', async () => {
            await game.end()

            expect(game.getState().isActive).toBe(false)
            expect(game.getState().isGameOver).toBe(true)
        })

        it('should not accept answers after game ends', async () => {
            await game.end()

            const result = game.submitAnswer('test')

            expect(result).toBe(false)
        })

        it('should preserve elapsed time in getGameStats after end()', async () => {
            vi.useFakeTimers()
            game.start()
            vi.advanceTimersByTime(5000)

            const stats = await game.end().then(() => game.getGameStats())

            // BaseGame.end() stops the timer before getGameStats() runs, so
            // getElapsedTime() returns 0 when not running. The game must
            // capture the elapsed time before the timer stops.
            expect(stats.timeElapsed).toBe(5)
            vi.useRealTimers()
        })
    })

    describe('Cleanup', () => {
        it('should cleanup resources on destroy', () => {
            game.start()

            expect(() => game.destroy()).not.toThrow()
        })
    })

    describe('Additional coverage', () => {
        it('getTimeRemaining returns correct value when game is active', () => {
            vi.useFakeTimers()
            game.start()
            const initialTime = game.getState().timeRemaining
            expect(initialTime).toBe(60)
            vi.advanceTimersByTime(5000)
            expect(game.getState().timeRemaining).toBe(initialTime - 5)
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
            const beforeWords = game.getState().wordsUnscrambled
            game.skipCurrentChallenge()
            expect(game.getState().wordsUnscrambled).toBe(beforeWords)
        })

        it('should end game when timer expires', () => {
            vi.useFakeTimers()
            game.start()
            vi.advanceTimersByTime(60 * 1000 + 1000)
            expect(game.getState().isActive).toBe(false)
            expect(game.getState().isGameOver).toBe(true)
            vi.useRealTimers()
            game.destroy()
        })

        it('should award 3-5 second speed bonus on correct answer', () => {
            vi.useFakeTimers()
            game.start()
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)
            const basePoints = challenge?.points ?? 0

            vi.advanceTimersByTime(3500)
            game.submitAnswer(challenge?.originalWord ?? '')

            expect(game.getState().score).toBe(basePoints + 5)
            vi.useRealTimers()
            game.destroy()
        })

        it('should award under-3-second speed bonus on correct answer', () => {
            vi.useFakeTimers()
            game.start()
            const challenge = game.getCurrentChallenge()
            expect(challenge).not.toBe(null)
            const basePoints = challenge?.points ?? 0

            vi.advanceTimersByTime(2000)
            game.submitAnswer(challenge?.originalWord ?? '')

            expect(game.getState().score).toBe(basePoints + 10)
            vi.useRealTimers()
            game.destroy()
        })

        it('should use medium difficulty after 5+ words when rand < 0.6', () => {
            vi.useFakeTimers()
            vi.spyOn(Math, 'random').mockReturnValue(0.3)
            game.start()
            for (let i = 0; i < 5; i++) {
                const ch = game.getCurrentChallenge()
                expect(ch).not.toBe(null)
                game.submitAnswer(ch!.originalWord)
            }
            const ch = game.getCurrentChallenge()
            expect(ch).not.toBe(null)
            expect(ch!.difficulty).toBe('medium')
            vi.restoreAllMocks()
            vi.useRealTimers()
            game.destroy()
        })

        it('should use hard difficulty after 10+ words when 0.4 <= rand < 0.7', () => {
            vi.useFakeTimers()
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            game.start()
            for (let i = 0; i < 10; i++) {
                const ch = game.getCurrentChallenge()
                expect(ch).not.toBe(null)
                game.submitAnswer(ch!.originalWord)
            }
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
            game.start()
            for (let i = 0; i < 10; i++) {
                const ch = game.getCurrentChallenge()
                expect(ch).not.toBe(null)
                game.submitAnswer(ch!.originalWord)
            }
            const ch = game.getCurrentChallenge()
            expect(ch).not.toBe(null)
            expect(ch!.difficulty).toBe('medium')
            vi.restoreAllMocks()
            vi.useRealTimers()
            game.destroy()
        })
    })

    describe('getGameStats longestWord / shortestWord reduce branches', () => {
        beforeEach(() => {
            game.start()
        })

        it('should cover both ternary branches when 2+ correct words with different lengths', () => {
            ;(game as any).state.wordHistory = [
                {
                    word: 'elephant',
                    scrambled: 'elephant',
                    userAnswer: 'elephant',
                    correct: true,
                    timeToAnswer: 1000,
                },
                {
                    word: 'cat',
                    scrambled: 'cat',
                    userAnswer: 'cat',
                    correct: true,
                    timeToAnswer: 1500,
                },
            ]

            const stats = game.getGameStats()
            expect(stats.longestWord).toBe('elephant')
            expect(stats.shortestWord).toBe('cat')
        })
    })

    describe('getGameData', () => {
        it('should return correct achievement data', () => {
            game.start()
            const challenge = game.getCurrentChallenge()
            game.submitAnswer(challenge?.originalWord ?? '')

            const gameData = (game as any).getGameData() as Record<
                string,
                unknown
            >
            expect(gameData.totalWordsScrambled).toBe(1)
            expect(Array.isArray(gameData.correctWords)).toBe(true)
            expect((gameData.correctWords as string[]).length).toBe(1)
        })
    })
})
