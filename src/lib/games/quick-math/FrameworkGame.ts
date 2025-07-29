import { BaseGame } from '@/lib/games/core/BaseGame'
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameCallbacks,
    BaseGameStats,
} from '@/lib/games/core/types'
import type { GameID } from '@/lib/games'

// Quick Math specific types
export interface MathQuestion {
    id: string
    question: string
    answer: number
    operation: 'addition' | 'subtraction'
    operand1: number
    operand2: number
}

export interface QuickMathState extends BaseGameState {
    currentQuestion: MathQuestion | null
    questionsAnswered: number
    correctAnswers: number
    incorrectAnswers: number
    currentAnswer: string
}

export interface QuickMathConfig extends BaseGameConfig {
    pointsPerCorrectAnswer: number
    maxNumber: number
    operations: Array<'addition' | 'subtraction'>
}

export interface QuickMathStats extends BaseGameStats {
    totalQuestions: number
    correctAnswers: number
    incorrectAnswers: number
    accuracy: number
    averageTimePerQuestion: number
}

export interface QuickMathCallbacks extends BaseGameCallbacks {
    onQuestionUpdate?: (question: MathQuestion) => void
    onAnswerSubmit?: (
        correct: boolean,
        question: MathQuestion,
        answer: string
    ) => void
}

export class QuickMathFrameworkGame extends BaseGame<
    QuickMathState,
    QuickMathConfig,
    QuickMathStats
> {
    private questionStartTime: number = 0

    constructor(
        gameId: GameID,
        config: QuickMathConfig,
        callbacks: QuickMathCallbacks = {}
    ) {
        super(gameId, config, callbacks, {
            basePoints: config.pointsPerCorrectAnswer,
        })
    }

    createInitialState(): QuickMathState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            currentQuestion: null,
            questionsAnswered: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            currentAnswer: '',
        }
    }

    protected onGameStart(): void {
        this.generateNextQuestion()
    }

    protected onGameEnd(
        _finalScore: number,
        _finalStats: QuickMathStats
    ): void {
        // Game ended, cleanup if needed
    }

    protected onGameReset(): void {
        this.state.currentQuestion = null
        this.state.questionsAnswered = 0
        this.state.correctAnswers = 0
        this.state.incorrectAnswers = 0
        this.state.currentAnswer = ''
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
            // Ensure subtraction result is positive
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

    private generateNextQuestion(): void {
        const question = this.generateRandomQuestion()
        this.state.currentQuestion = question
        this.questionStartTime = Date.now()

        // Notify callbacks only
        const callbacks = this.callbacks as QuickMathCallbacks
        if (callbacks.onQuestionUpdate) {
            callbacks.onQuestionUpdate(question)
        }
    }

    public submitAnswer(answer: string): boolean {
        if (!this.state.isActive || !this.state.currentQuestion) {
            return false
        }

        const isCorrect = parseInt(answer) === this.state.currentQuestion.answer
        this.state.questionsAnswered++

        if (isCorrect) {
            this.state.correctAnswers++
            this.addScore(this.config.pointsPerCorrectAnswer, 'correct_answer')
        } else {
            this.state.incorrectAnswers++
        }

        // Notify callbacks only
        const callbacks = this.callbacks as QuickMathCallbacks
        if (callbacks.onAnswerSubmit) {
            callbacks.onAnswerSubmit(
                isCorrect,
                this.state.currentQuestion,
                answer
            )
        }

        // Generate next question if game is still active
        if (this.state.isActive) {
            this.generateNextQuestion()
        }

        return isCorrect
    }

    public getCurrentQuestion(): MathQuestion | null {
        return this.state.currentQuestion
    }

    public getGameStats(): QuickMathStats {
        const totalTime = this.getTimerStatus().elapsedTime || 0

        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(totalTime),
            gameCompleted: this.state.isGameOver,
            totalQuestions: this.state.questionsAnswered,
            correctAnswers: this.state.correctAnswers,
            incorrectAnswers: this.state.incorrectAnswers,
            accuracy:
                this.state.questionsAnswered > 0
                    ? Math.round(
                          (this.state.correctAnswers /
                              this.state.questionsAnswered) *
                              100
                      )
                    : 0,
            averageTimePerQuestion:
                this.state.questionsAnswered > 0
                    ? Math.round(
                          (totalTime / this.state.questionsAnswered) * 100
                      ) / 100
                    : 0,
        }
    }

    protected getGameData(): Record<string, unknown> {
        const stats = this.getGameStats()
        return {
            questionsAnswered: stats.totalQuestions,
            correctAnswers: stats.correctAnswers,
            accuracy: stats.accuracy,
            averageTimePerQuestion: stats.averageTimePerQuestion,
        }
    }

    // Required abstract methods
    update(_deltaTime: number): void {
        // Quick Math doesn't need continuous updates
        // Timer and scoring are handled by the framework
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        // No special cleanup needed for Quick Math
    }
}
