import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    QuickMathRenderer,
    type QuickMathRendererConfig,
} from './FrameworkRenderer'
import type {
    MathQuestion,
    QuickMathState,
    QuickMathStats,
} from './FrameworkGame'

function makeQuestion(overrides: Partial<MathQuestion> = {}): MathQuestion {
    return {
        question: '3 + 4',
        answer: 7,
        operation: 'addition',
        num1: 3,
        num2: 4,
        ...overrides,
    }
}

function makeState(overrides: Partial<QuickMathState> = {}): QuickMathState {
    return {
        score: 0,
        timeRemaining: 60,
        isActive: true,
        isPaused: false,
        isGameOver: false,
        gameStarted: true,
        questionsAnswered: 0,
        correctAnswers: 0,
        currentQuestion: null,
        streak: 0,
        ...overrides,
    }
}

describe('QuickMathRenderer', () => {
    let container: HTMLElement
    let questionEl: HTMLElement
    let answerInput: HTMLInputElement
    let submitBtn: HTMLButtonElement
    let renderer: QuickMathRenderer

    const config: QuickMathRendererConfig = {
        type: 'dom',
        container: '#qm-container',
        questionContainer: '#question',
        answerInput: '#answer-input',
        submitButton: '#submit-answer',
    }

    beforeEach(async () => {
        container = document.createElement('div')
        container.id = 'qm-container'

        questionEl = document.createElement('div')
        questionEl.id = 'question'

        answerInput = document.createElement('input')
        answerInput.id = 'answer-input'

        submitBtn = document.createElement('button')
        submitBtn.id = 'submit-answer'

        document.body.appendChild(container)
        document.body.appendChild(questionEl)
        document.body.appendChild(answerInput)
        document.body.appendChild(submitBtn)

        renderer = new QuickMathRenderer(config)
        await renderer.initialize()
    })

    afterEach(() => {
        renderer.cleanup()
        ;[container, questionEl, answerInput, submitBtn].forEach(el => {
            if (el.parentNode) {
                el.parentNode.removeChild(el)
            }
        })
        // Remove stats elements if created
        ;[
            'current-questions',
            'current-correct',
            'current-score',
            'score',
            'time-remaining',
            'total-questions',
            'accuracy',
        ].forEach(id => {
            const el = document.getElementById(id)
            if (el) {
                el.parentNode?.removeChild(el)
            }
        })
        vi.restoreAllMocks()
    })

    describe('initialize', () => {
        it('should find all required elements', async () => {
            // Already initialized in beforeEach — no throw means success
            expect(renderer.isReady()).toBe(true)
        })

        it('should throw when required elements are missing', async () => {
            const badRenderer = new QuickMathRenderer({
                ...config,
                questionContainer: '#nonexistent',
            })
            await expect(badRenderer.initialize()).rejects.toThrow(
                'Required Quick Math DOM elements not found'
            )
        })

        it('should set up Enter key to click submit button', async () => {
            const clickSpy = vi.spyOn(submitBtn, 'click')
            submitBtn.disabled = false
            const event = new KeyboardEvent('keypress', {
                key: 'Enter',
                bubbles: true,
            })
            answerInput.dispatchEvent(event)
            expect(clickSpy).toHaveBeenCalled()
        })

        it('should not click submit when Enter is pressed and submit is disabled', () => {
            const clickSpy = vi.spyOn(submitBtn, 'click')
            submitBtn.disabled = true
            const event = new KeyboardEvent('keypress', {
                key: 'Enter',
                bubbles: true,
            })
            answerInput.dispatchEvent(event)
            expect(clickSpy).not.toHaveBeenCalled()
        })

        it('should clear input value on focus', () => {
            answerInput.value = 'old value'
            answerInput.dispatchEvent(new FocusEvent('focus'))
            expect(answerInput.value).toBe('')
        })
    })

    describe('renderQuestion', () => {
        it('should display question text', () => {
            const q = makeQuestion({ question: '7 × 8' })
            renderer.renderQuestion(q)
            expect(questionEl.textContent).toBe('7 × 8')
        })

        it('should enable answer input and clear its value', () => {
            answerInput.value = '42'
            answerInput.disabled = true
            renderer.renderQuestion(makeQuestion())
            expect(answerInput.disabled).toBe(false)
            expect(answerInput.value).toBe('')
        })

        it('should enable submit button', () => {
            submitBtn.disabled = true
            renderer.renderQuestion(makeQuestion())
            expect(submitBtn.disabled).toBe(false)
        })
    })

    describe('renderGameState', () => {
        it('should update stats elements', async () => {
            // Stats elements must exist BEFORE initialize() so the renderer captures them
            const statsIds = [
                'current-questions',
                'current-correct',
                'current-score',
                'score',
                'time-remaining',
            ]
            const statsEls = statsIds.map(id => {
                const el = document.createElement('div')
                el.id = id
                document.body.appendChild(el)
                return el
            })

            // Create a fresh renderer so it captures the stats elements during initialize
            const freshRenderer = new QuickMathRenderer(config)
            await freshRenderer.initialize()

            const state = makeState({
                questionsAnswered: 5,
                correctAnswers: 4,
                score: 80,
                timeRemaining: 30,
            })
            freshRenderer.renderGameState(state)
            expect(
                document.getElementById('current-questions')?.textContent
            ).toBe('5')
            expect(
                document.getElementById('current-correct')?.textContent
            ).toBe('4')
            expect(document.getElementById('current-score')?.textContent).toBe(
                '80'
            )
            expect(document.getElementById('score')?.textContent).toBe('80')
            expect(document.getElementById('time-remaining')?.textContent).toBe(
                '30'
            )

            freshRenderer.cleanup()
            for (const el of statsEls) {
                el.parentNode?.removeChild(el)
            }
        })

        it('should disable input and button when game is not active', () => {
            const state = makeState({ isActive: false })
            renderer.renderGameState(state)
            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.disabled).toBe(true)
        })

        it('should not throw when stats elements are absent', () => {
            const state = makeState()
            expect(() => renderer.renderGameState(state)).not.toThrow()
        })
    })

    describe('showAnswerFeedback', () => {
        it('should add green border for correct answer', () => {
            vi.useFakeTimers()
            renderer.showAnswerFeedback(true)
            expect(answerInput.classList.contains('border-green-400')).toBe(
                true
            )
            expect(answerInput.classList.contains('border-2')).toBe(true)
            vi.runAllTimers()
            expect(answerInput.classList.contains('border-green-400')).toBe(
                false
            )
            vi.useRealTimers()
        })

        it('should add red border for incorrect answer', () => {
            vi.useFakeTimers()
            renderer.showAnswerFeedback(false)
            expect(answerInput.classList.contains('border-red-400')).toBe(true)
            vi.useRealTimers()
        })
    })

    describe('getAnswerValue / clearAnswer', () => {
        it('should return trimmed answer value', () => {
            answerInput.value = '  42  '
            expect(renderer.getAnswerValue()).toBe('42')
        })

        it('should return empty string when input is empty', () => {
            answerInput.value = ''
            expect(renderer.getAnswerValue()).toBe('')
        })

        it('should clear the answer input', () => {
            answerInput.value = '99'
            renderer.clearAnswer()
            expect(answerInput.value).toBe('')
        })
    })

    describe('getSubmitButton', () => {
        it('should return the submit button element', () => {
            expect(renderer.getSubmitButton()).toBe(submitBtn)
        })
    })

    describe('renderStats', () => {
        it('should update total-questions and accuracy elements', () => {
            const totalEl = document.createElement('div')
            totalEl.id = 'total-questions'
            const accuracyEl = document.createElement('div')
            accuracyEl.id = 'accuracy'
            document.body.appendChild(totalEl)
            document.body.appendChild(accuracyEl)

            const stats: QuickMathStats = {
                finalScore: 100,
                timeElapsed: 30,
                gameCompleted: true,
                totalQuestions: 10,
                correctAnswers: 8,
                accuracy: 80,
                averageResponseTime: 3,
                streak: 5,
                longestStreak: 5,
            }
            renderer.renderStats(stats)
            expect(totalEl.textContent).toBe('10')
            expect(accuracyEl.textContent).toBe('80%')
        })

        it('should not throw when stats elements are absent', () => {
            const stats: QuickMathStats = {
                finalScore: 0,
                timeElapsed: 0,
                gameCompleted: false,
                totalQuestions: 0,
                correctAnswers: 0,
                accuracy: 0,
                averageResponseTime: 0,
                streak: 0,
                longestStreak: 0,
            }
            expect(() => renderer.renderStats(stats)).not.toThrow()
        })
    })

    describe('clear', () => {
        it('should reset question element, disable inputs', () => {
            questionEl.textContent = 'Some question'
            answerInput.value = '5'
            answerInput.disabled = false
            submitBtn.disabled = false

            renderer.clear()

            expect(questionEl.textContent).toBe('Ready?')
            expect(answerInput.value).toBe('')
            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.disabled).toBe(true)
        })
    })

    describe('null element guard branches', () => {
        it('should return early from setupInputEvents/renderQuestion/showAnswerFeedback when elements are null (no initialize)', () => {
            // Create renderer WITHOUT calling initialize() - fields stay null
            const r = new QuickMathRenderer(config)
            // All methods should early-return without throwing
            expect(() => r.renderQuestion(makeQuestion())).not.toThrow()
            expect(() => r.showAnswerFeedback(true)).not.toThrow()
            expect(() => r.showAnswerFeedback(false)).not.toThrow()
            // render() is a no-op
            expect(() => r.render()).not.toThrow()
        })

        it('should handle resetInputStyling null guard via setTimeout callback', () => {
            vi.useFakeTimers()
            // showAnswerFeedback queues a setTimeout that calls resetInputStyling
            renderer.showAnswerFeedback(true)
            // Null out answerInput so resetInputStyling hits the null guard
            ;(renderer as any).answerInput = null
            // Advance time past the 500ms delay - should not throw
            expect(() => vi.runAllTimers()).not.toThrow()
            vi.useRealTimers()
        })

        it('should return early from setupInputEvents when answerInput is null', () => {
            // Access private method via cast to cover the null guard inside setupInputEvents
            const r = new QuickMathRenderer(config)
            // answerInput is null (not initialized)
            expect(() => (r as any).setupInputEvents()).not.toThrow()
        })
    })
})
