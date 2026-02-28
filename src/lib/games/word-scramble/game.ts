import type {
    GameState,
    GameConfig,
    GameCallbacks,
    WordChallenge,
    GameStats,
} from './types'
import { getRandomWord, scrambleWord, getPointsForWord } from './words'

export class WordScrambleGame {
    private state: GameState
    private config: GameConfig
    private callbacks: GameCallbacks
    private gameTimer: number | null = null
    private challengeStartTime: number = 0

    constructor(config: GameConfig, callbacks: GameCallbacks) {
        this.config = config
        this.callbacks = callbacks
        this.state = this.getInitialState()
    }

    private getInitialState(): GameState {
        return {
            score: 0,
            currentChallenge: null,
            wordsUnscrambled: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            timeRemaining: this.config.gameDuration,
            isGameActive: false,
            isGameOver: false,
            gameStartTime: null,
            currentAnswer: '',
            wordHistory: [],
        }
    }

    private generateRandomChallenge(): WordChallenge {
        // Determine difficulty based on game progression
        let difficulty: 'easy' | 'medium' | 'hard' = 'easy'

        // As the game progresses, introduce harder words
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
            id: `challenge_${Date.now()}_${Math.random()}`,
            originalWord: originalWord.toLowerCase(),
            scrambledWord,
            difficulty,
            points,
        }
    }

    private startGameTimer(): void {
        this.gameTimer = window.setInterval(() => {
            this.state.timeRemaining--
            this.callbacks.onTimeUpdate(this.state.timeRemaining)

            if (this.state.timeRemaining <= 0) {
                this.endGame()
            }
        }, 1000)
    }

    private stopGameTimer(): void {
        if (this.gameTimer) {
            clearInterval(this.gameTimer)
            this.gameTimer = null
        }
    }

    public startGame(): void {
        this.state = this.getInitialState()
        this.state.isGameActive = true
        this.state.gameStartTime = Date.now()
        this.challengeStartTime = Date.now()

        this.generateNextChallenge()
        this.startGameTimer()
        this.callbacks.onGameStart()
    }

    public submitAnswer(answer: string): boolean {
        if (!this.state.isGameActive || !this.state.currentChallenge) {
            return false
        }

        const userAnswer = answer.toLowerCase().trim()
        const correctAnswer = this.state.currentChallenge.originalWord
        const isCorrect = userAnswer === correctAnswer
        const timeToAnswer = (Date.now() - this.challengeStartTime) / 1000

        // Record the attempt in history
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

            // Calculate bonus points for quick answers
            let points = this.state.currentChallenge.points
            if (timeToAnswer < 3) {
                points += 10 // Speed bonus
            } else if (timeToAnswer < 5) {
                points += 5 // Quick bonus
            }

            this.state.score += points
            this.callbacks.onScoreUpdate(this.state.score)
            this.callbacks.onCorrectAnswer(correctAnswer)
        } else {
            this.state.incorrectAnswers++
            this.callbacks.onIncorrectAnswer(correctAnswer, userAnswer)
        }

        this.generateNextChallenge()
        return isCorrect
    }

    private generateNextChallenge(): void {
        this.state.currentChallenge = this.generateRandomChallenge()
        this.state.currentAnswer = ''
        this.challengeStartTime = Date.now()
        this.callbacks.onChallengeUpdate(this.state.currentChallenge)
    }

    public updateCurrentAnswer(answer: string): void {
        this.state.currentAnswer = answer
    }

    public getCurrentAnswer(): string {
        return this.state.currentAnswer
    }

    public skipCurrentChallenge(): void {
        if (!this.state.isGameActive || !this.state.currentChallenge) {
            return
        }

        // Record as incorrect answer
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

    public endGame(): void {
        this.state.isGameActive = false
        this.state.isGameOver = true
        this.stopGameTimer()

        const stats = this.getGameStats()
        this.callbacks.onGameOver(this.state.score, stats)
    }

    public getGameStats(): GameStats {
        const totalTime = this.state.gameStartTime
            ? (Date.now() - this.state.gameStartTime) / 1000
            : 0

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
            totalWords: this.state.wordsUnscrambled,
            correctAnswers: this.state.correctAnswers,
            incorrectAnswers: this.state.incorrectAnswers,
            accuracy:
                this.state.wordsUnscrambled > 0
                    ? (this.state.correctAnswers /
                          this.state.wordsUnscrambled) *
                      100
                    : 0,
            averageTimePerWord:
                this.state.wordsUnscrambled > 0
                    ? totalTime / this.state.wordsUnscrambled
                    : 0,
            finalScore: this.state.score,
            longestWord,
            shortestWord,
            wordsUnscrambled: [...this.state.wordHistory],
        }
    }

    public getState(): GameState {
        return { ...this.state }
    }

    public isGameActive(): boolean {
        return this.state.isGameActive
    }

    public isGameOver(): boolean {
        return this.state.isGameOver
    }

    public getCurrentChallenge(): WordChallenge | null {
        return this.state.currentChallenge
    }

    public getScore(): number {
        return this.state.score
    }

    public getTimeRemaining(): number {
        return this.state.timeRemaining
    }

    public destroy(): void {
        this.stopGameTimer()
    }
}
