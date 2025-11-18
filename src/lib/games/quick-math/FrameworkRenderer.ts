import { DOMRenderer } from '@/lib/games/renderers/DOMRenderer'
import type { RendererConfig } from '@/lib/games/core/types'
import type {
    QuickMathState,
    QuickMathStats,
    MathQuestion,
} from './FrameworkGame'

export interface QuickMathRendererConfig extends RendererConfig {
    questionContainer: string
    answerInput: string
    submitButton: string
    statsContainer?: string
}

export class QuickMathRenderer extends DOMRenderer {
    protected config: QuickMathRendererConfig
    private questionElement: HTMLElement | null = null
    private answerInput: HTMLInputElement | null = null
    private submitButton: HTMLButtonElement | null = null
    private statsElements: {
        questions?: HTMLElement
        correct?: HTMLElement
        sessionScore?: HTMLElement
        mainScore?: HTMLElement
        time?: HTMLElement
    } = {}

    constructor(config: QuickMathRendererConfig) {
        super(config)
        this.config = config
    }

    async initialize(): Promise<void> {
        await super.initialize()

        // Find Quick Math specific elements
        this.questionElement = document.querySelector(
            this.config.questionContainer
        )
        this.answerInput = document.querySelector(
            this.config.answerInput
        ) as HTMLInputElement
        this.submitButton = document.querySelector(
            this.config.submitButton
        ) as HTMLButtonElement

        // Find stats elements
        this.statsElements = {
            questions:
                document.getElementById('current-questions') || undefined,
            correct: document.getElementById('current-correct') || undefined,
            sessionScore: document.getElementById('current-score') || undefined,
            mainScore: document.getElementById('score') || undefined,
            time: document.getElementById('time-remaining') || undefined,
        }

        if (!this.questionElement || !this.answerInput || !this.submitButton) {
            throw new Error('Required Quick Math DOM elements not found')
        }

        // Set up answer input events
        this.setupInputEvents()
    }

    private setupInputEvents(): void {
        if (!this.answerInput) {
            return
        }

        // Clear input on focus
        this.answerInput.addEventListener('focus', () => {
            if (this.answerInput) {
                this.answerInput.value = ''
                this.resetInputStyling()
            }
        })

        // Submit on Enter key
        this.answerInput.addEventListener('keypress', e => {
            if (
                e.key === 'Enter' &&
                this.submitButton &&
                !this.submitButton.disabled
            ) {
                this.submitButton.click()
            }
        })
    }

    public renderQuestion(question: MathQuestion): void {
        if (!this.questionElement) {
            return
        }

        this.questionElement.textContent = question.question

        // Enable and focus answer input
        if (this.answerInput) {
            this.answerInput.disabled = false
            this.answerInput.value = ''
            this.answerInput.focus()
            this.resetInputStyling()
        }

        // Enable submit button
        if (this.submitButton) {
            this.submitButton.disabled = false
        }
    }

    public renderGameState(state: QuickMathState): void {
        // Update stats display
        if (this.statsElements.questions) {
            this.statsElements.questions.textContent =
                state.questionsAnswered.toString()
        }
        if (this.statsElements.correct) {
            this.statsElements.correct.textContent =
                state.correctAnswers.toString()
        }
        if (this.statsElements.sessionScore) {
            this.statsElements.sessionScore.textContent = state.score.toString()
        }

        if (this.statsElements.mainScore) {
            this.statsElements.mainScore.textContent = state.score.toString()
        }

        if (this.statsElements.time) {
            this.statsElements.time.textContent = state.timeRemaining.toString()
        }

        // Update input state based on game state
        if (this.answerInput) {
            this.answerInput.disabled = !state.isActive
        }
        if (this.submitButton) {
            this.submitButton.disabled = !state.isActive
        }
    }

    public showAnswerFeedback(correct: boolean): void {
        if (!this.answerInput) {
            return
        }

        // Remove existing feedback classes
        this.resetInputStyling()

        // Add feedback styling
        if (correct) {
            this.answerInput.classList.add('border-green-400', 'border-2')
        } else {
            this.answerInput.classList.add('border-red-400', 'border-2')
        }

        // Reset after short delay
        setTimeout(() => {
            this.resetInputStyling()
        }, 500)
    }

    private resetInputStyling(): void {
        if (!this.answerInput) {
            return
        }

        this.answerInput.classList.remove(
            'border-green-400',
            'border-red-400',
            'border-2'
        )
    }

    public renderStats(stats: QuickMathStats): void {
        // Update final stats in game over overlay
        const totalQuestionsElement = document.getElementById('total-questions')
        const accuracyElement = document.getElementById('accuracy')

        if (totalQuestionsElement) {
            totalQuestionsElement.textContent = stats.totalQuestions.toString()
        }
        if (accuracyElement) {
            accuracyElement.textContent = `${stats.accuracy}%`
        }
    }

    public getAnswerValue(): string {
        return this.answerInput?.value.trim() || ''
    }

    public clearAnswer(): void {
        if (this.answerInput) {
            this.answerInput.value = ''
        }
    }

    public getSubmitButton(): HTMLButtonElement | null {
        return this.submitButton
    }

    // Required DOMRenderer methods
    render(): void {
        // Basic rendering is handled by specific render methods above
    }

    clear(): void {
        if (this.questionElement) {
            this.questionElement.textContent = 'Ready?'
        }
        if (this.answerInput) {
            this.answerInput.value = ''
            this.answerInput.disabled = true
        }
        if (this.submitButton) {
            this.submitButton.disabled = true
        }
        this.resetInputStyling()
    }

    cleanup(): void {
        // Remove event listeners if needed
        this.clear()
    }
}
