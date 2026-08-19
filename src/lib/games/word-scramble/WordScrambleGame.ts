import { BaseGame } from '@/lib/games/core/BaseGame'
import type { ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type { WordChallenge } from './types'
import type {
    WordScrambleState,
    WordScrambleConfig,
    WordScrambleStats,
    WordScrambleCallbacks,
} from './frameworkTypes'
import { getRandomWord, scrambleWord, getPointsForWord } from './words'
import { generateId } from '@/lib/games/shared/utils'

export const DEFAULT_WORD_SCRAMBLE_CONFIG: WordScrambleConfig = {
    duration: 60,
    achievementIntegration: true,
    pausable: false,
    resettable: true,
    pointsPerWord: {
        easy: 10,
        medium: 20,
        hard: 30,
    },
    wordCategories: ['general'],
    minWordLength: 3,
    maxWordLength: 12,
}

export class WordScrambleGame extends BaseGame<
    WordScrambleState,
    WordScrambleConfig,
    WordScrambleStats
> {
    private challengeStartTime: number = 0

    constructor(
        config: Partial<WordScrambleConfig> = {},
        callbacks: WordScrambleCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: WordScrambleConfig = {
            ...DEFAULT_WORD_SCRAMBLE_CONFIG,
            ...config,
        }
        super(
            GameID.WORD_SCRAMBLE,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                timeBonus: false,
            }
        )
    }

    createInitialState(): WordScrambleState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            currentChallenge: null,
            wordsUnscrambled: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            currentAnswer: '',
            wordHistory: [],
        }
    }

    protected onGameStart(): void {
        this.generateNextChallenge()
    }

    protected onGameReset(): void {
        this.state.currentChallenge = null
        this.state.wordsUnscrambled = 0
        this.state.correctAnswers = 0
        this.state.incorrectAnswers = 0
        this.state.currentAnswer = ''
        this.state.wordHistory = []
    }

    update(_deltaTime: number): void {
        // Game logic is event-driven (answer submissions + timer)
    }

    render(): void {
        // Rendering is handled by the page via callbacks
    }

    cleanup(): void {
        // No special resources to clean up
    }

    getGameStats(): WordScrambleStats {
        const totalTime = this.getTimerStatus().elapsedTime || 0

        const correctWords = this.state.wordHistory.filter(w => w.correct)
        const longestWord = correctWords.reduce(
            (longest, current) =>
                current.word.length > longest.length ? current.word : longest,
            ''
        )
        const shortestWord = correctWords.reduce(
            (shortest, current) =>
                current.word.length < shortest.length ? current.word : shortest,
            correctWords[0]?.word || ''
        )

        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(totalTime),
            gameCompleted: this.state.isGameOver,
            totalWords: this.state.wordsUnscrambled,
            correctAnswers: this.state.correctAnswers,
            incorrectAnswers: this.state.incorrectAnswers,
            accuracy:
                this.state.wordsUnscrambled > 0
                    ? Math.round(
                          (this.state.correctAnswers /
                              this.state.wordsUnscrambled) *
                              100
                      )
                    : 0,
            averageTimePerWord:
                this.state.wordsUnscrambled > 0
                    ? Math.round(
                          (totalTime / this.state.wordsUnscrambled) * 100
                      ) / 100
                    : 0,
            longestWord,
            shortestWord,
            wordsUnscrambled: [...this.state.wordHistory],
        }
    }

    protected getGameData(): Record<string, unknown> {
        const correctWords = this.state.wordHistory
            .filter(w => w.correct)
            .map(w => w.word)
        return {
            lastCorrectWord: correctWords[correctWords.length - 1] || null,
            correctWords,
            totalWordsScrambled: this.state.wordsUnscrambled,
        }
    }

    public submitAnswer(answer: string): boolean {
        if (!this.state.isActive || !this.state.currentChallenge) {
            return false
        }

        const userAnswer = answer.toLowerCase().trim()
        const correctAnswer = this.state.currentChallenge.originalWord
        const isCorrect = userAnswer === correctAnswer
        const timeToAnswer = (Date.now() - this.challengeStartTime) / 1000

        this.state.wordHistory.push({
            word: correctAnswer,
            scrambled: this.state.currentChallenge.scrambledWord,
            userAnswer: userAnswer,
            correct: isCorrect,
            timeToAnswer,
        })

        this.state.wordsUnscrambled++

        if (isCorrect) {
            this.state.correctAnswers++

            let points = this.state.currentChallenge.points
            if (timeToAnswer < 3) {
                points += 10
            } else if (timeToAnswer < 5) {
                points += 5
            }

            this.addScore(points, 'correct_answer')

            const callbacks = this.callbacks as WordScrambleCallbacks
            if (callbacks.onCorrectAnswer) {
                callbacks.onCorrectAnswer(correctAnswer)
            }
        } else {
            this.state.incorrectAnswers++

            const callbacks = this.callbacks as WordScrambleCallbacks
            if (callbacks.onIncorrectAnswer) {
                callbacks.onIncorrectAnswer(correctAnswer, userAnswer)
            }
        }

        this.generateNextChallenge()
        return isCorrect
    }

    public skipCurrentChallenge(): void {
        if (!this.state.isActive || !this.state.currentChallenge) {
            return
        }

        const timeToAnswer = (Date.now() - this.challengeStartTime) / 1000
        this.state.wordHistory.push({
            word: this.state.currentChallenge.originalWord,
            scrambled: this.state.currentChallenge.scrambledWord,
            userAnswer: '',
            correct: false,
            timeToAnswer,
        })

        this.state.wordsUnscrambled++
        this.state.incorrectAnswers++
        this.generateNextChallenge()
    }

    public updateCurrentAnswer(answer: string): void {
        this.state.currentAnswer = answer
    }

    public getCurrentAnswer(): string {
        return this.state.currentAnswer
    }

    public getCurrentChallenge(): WordChallenge | null {
        return this.state.currentChallenge
    }

    private generateRandomChallenge(): WordChallenge {
        let difficulty: 'easy' | 'medium' | 'hard' = 'easy'

        if (this.state.wordsUnscrambled >= 10) {
            const rand = Math.random()
            if (rand < 0.4) {
                difficulty = 'medium'
            } else if (rand < 0.7) {
                difficulty = 'hard'
            }
        } else if (this.state.wordsUnscrambled >= 5) {
            if (Math.random() < 0.6) {
                difficulty = 'medium'
            }
        }

        const originalWord = getRandomWord(difficulty)
        const scrambledWord = scrambleWord(originalWord)
        const points = getPointsForWord(difficulty)

        return {
            id: generateId(),
            originalWord: originalWord.toLowerCase(),
            scrambledWord,
            difficulty,
            points,
        }
    }

    private generateNextChallenge(): void {
        this.state.currentChallenge = this.generateRandomChallenge()
        this.state.currentAnswer = ''
        this.challengeStartTime = Date.now()

        const callbacks = this.callbacks as WordScrambleCallbacks
        if (callbacks.onChallengeUpdate) {
            callbacks.onChallengeUpdate(this.state.currentChallenge)
        }
    }
}

export default WordScrambleGame
