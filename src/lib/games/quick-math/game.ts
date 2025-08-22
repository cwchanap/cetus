import type {
    GameState,
    GameConfig,
    GameCallbacks,
    MathQuestion,
    GameStats,
} from './types'

export class QuickMathGame {
    private state: GameState
    private config: GameConfig
    private callbacks: GameCallbacks
    private gameTimer: number | null = null
    private questionStartTime: number = 0
    // Achievement tracking flags
    private achievementFlags: {
        seenOnePlusOne: boolean
        onePlusOneIncorrect: boolean
        seenOperand999: boolean
        zeroAnswerIncorrect: boolean
    } = {
        seenOnePlusOne: false,
        onePlusOneIncorrect: false,
        seenOperand999: false,
        zeroAnswerIncorrect: false,
    }

    constructor(config: GameConfig, callbacks: GameCallbacks) {
        this.config = config
        this.callbacks = callbacks
        this.state = this.getInitialState()
    }

    private getInitialState(): GameState {
        return {
            score: 0,
            currentQuestion: null,
            questionsAnswered: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            timeRemaining: this.config.gameDuration,
            isGameActive: false,
            isGameOver: false,
            gameStartTime: null,
            currentAnswer: '',
        }
    }

    private generateRandomQuestion(): MathQuestion {
        const operation =
            this.config.operations[
                Math.floor(Math.random() * this.config.operations.length)
            ]
        const operand1 = Math.floor(Math.random() * this.config.maxNumber) + 1
        const operand2 = Math.floor(Math.random() * this.config.maxNumber) + 1

        let question: string
        let answer: number

        if (operation === 'addition') {
            question = `${operand1} + ${operand2}`
            answer = operand1 + operand2
        } else {
            // For subtraction, ensure result is positive
            const larger = Math.max(operand1, operand2)
            const smaller = Math.min(operand1, operand2)
            question = `${larger} - ${smaller}`
            answer = larger - smaller
        }

        return {
            id: `q_${Date.now()}_${Math.random()}`,
            question,
            answer,
            operation,
            operand1,
            operand2,
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
        this.questionStartTime = Date.now()

        // Reset achievement flags
        this.achievementFlags = {
            seenOnePlusOne: false,
            onePlusOneIncorrect: false,
            seenOperand999: false,
            zeroAnswerIncorrect: false,
        }

        this.generateNextQuestion()
        this.startGameTimer()
        this.callbacks.onGameStart()
    }

    public submitAnswer(answer: string): boolean {
        if (!this.state.isGameActive || !this.state.currentQuestion) {
            return false
        }

        const numericAnswer = parseInt(answer, 10)
        const isCorrect = numericAnswer === this.state.currentQuestion.answer

        this.state.questionsAnswered++

        // Update achievement flags based on current question and answer
        const q = this.state.currentQuestion
        if (
            q.operation === 'addition' &&
            q.operand1 === 1 &&
            q.operand2 === 1 &&
            !isCorrect
        ) {
            this.achievementFlags.onePlusOneIncorrect = true
        }
        if (q.answer === 0 && !isCorrect) {
            this.achievementFlags.zeroAnswerIncorrect = true
        }

        if (isCorrect) {
            this.state.correctAnswers++
            this.state.score += this.config.pointsPerCorrectAnswer
            this.callbacks.onScoreUpdate(this.state.score)
        } else {
            this.state.incorrectAnswers++
        }

        this.generateNextQuestion()
        return isCorrect
    }

    private generateNextQuestion(): void {
        this.state.currentQuestion = this.generateRandomQuestion()
        this.state.currentAnswer = ''
        this.questionStartTime = Date.now()

        // Update achievement flags when question appears
        const q = this.state.currentQuestion
        if (q) {
            if (
                q.operation === 'addition' &&
                q.operand1 === 1 &&
                q.operand2 === 1
            ) {
                this.achievementFlags.seenOnePlusOne = true
            }
            if (q.operand1 === 999 || q.operand2 === 999) {
                this.achievementFlags.seenOperand999 = true
            }
        }
        this.callbacks.onQuestionUpdate(this.state.currentQuestion)
    }

    public updateCurrentAnswer(answer: string): void {
        this.state.currentAnswer = answer
    }

    public getCurrentAnswer(): string {
        return this.state.currentAnswer
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

        return {
            totalQuestions: this.state.questionsAnswered,
            correctAnswers: this.state.correctAnswers,
            incorrectAnswers: this.state.incorrectAnswers,
            accuracy:
                this.state.questionsAnswered > 0
                    ? (this.state.correctAnswers /
                          this.state.questionsAnswered) *
                      100
                    : 0,
            averageTimePerQuestion:
                this.state.questionsAnswered > 0
                    ? totalTime / this.state.questionsAnswered
                    : 0,
            finalScore: this.state.score,
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

    public destroy(): void {
        this.stopGameTimer()
    }

    // Expose achievement flags for score submission
    public getAchievementFlags(): {
        seenOnePlusOne: boolean
        onePlusOneIncorrect: boolean
        seenOperand999: boolean
        zeroAnswerIncorrect: boolean
    } {
        return { ...this.achievementFlags }
    }
}
