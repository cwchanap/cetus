import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initQuickMathFramework } from './init'
import { submitScore } from '@/lib/services/scoreService'

vi.mock('@/lib/services/scoreService', () => ({
    submitScore: vi
        .fn()
        .mockResolvedValue({ success: true, newAchievements: [] }),
    saveGameScore: vi
        .fn()
        .mockResolvedValue({ success: true, newAchievements: [] }),
}))

// HPA-393: React owns the shared start/end buttons, the overlay and its
// final stats, so the initializer no longer wires or writes them — that
// coverage moved to the QuickMathScreen island test. The initializer keeps
// the board host, question/input/submit trio and the board-embedded
// session counters.
function setupDOM() {
    document.body.replaceChildren()

    const container = document.createElement('div')
    container.id = 'quick-math-container'

    const question = document.createElement('div')
    question.id = 'question'
    question.textContent = '5 + 3 = ?'
    container.appendChild(question)

    const answerInput = document.createElement('input')
    answerInput.id = 'answer-input'
    answerInput.type = 'text'
    answerInput.disabled = true
    container.appendChild(answerInput)

    const submitBtn = document.createElement('button')
    submitBtn.id = 'submit-answer'
    submitBtn.textContent = 'Submit'
    submitBtn.disabled = true
    container.appendChild(submitBtn)

    document.body.appendChild(container)

    const currentQuestions = document.createElement('span')
    currentQuestions.id = 'current-questions'
    currentQuestions.textContent = '0'
    document.body.appendChild(currentQuestions)

    const currentCorrect = document.createElement('span')
    currentCorrect.id = 'current-correct'
    currentCorrect.textContent = '0'
    document.body.appendChild(currentCorrect)

    const currentScore = document.createElement('span')
    currentScore.id = 'current-score'
    currentScore.textContent = '0'
    document.body.appendChild(currentScore)
}

function getContainer(): HTMLElement {
    return document.getElementById('quick-math-container')!
}

describe('initQuickMathFramework', () => {
    beforeEach(() => {
        setupDOM()
        vi.useFakeTimers()
        // restoreAllMocks clears module-mock implementations
        vi.mocked(submitScore).mockResolvedValue({
            success: true,
            newAchievements: [],
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllTimers()
        vi.useRealTimers()
        document.body.replaceChildren()
    })

    describe('initialization', () => {
        it('should return game, renderer, and cleanup', async () => {
            const result = await initQuickMathFramework(getContainer())
            expect(result).toBeDefined()
            expect(result.game).toBeDefined()
            expect(result.renderer).toBeDefined()
            expect(typeof result.cleanup).toBe('function')
        })

        it('should return a QuickMathFrameworkGame instance', async () => {
            const result = await initQuickMathFramework(getContainer())
            expect(result.game).toBeDefined()
            expect(typeof result.game.start).toBe('function')
            expect(typeof result.game.end).toBe('function')
            expect(typeof result.game.reset).toBe('function')
            expect(typeof result.game.getState).toBe('function')
        })

        it('should merge custom config', async () => {
            const result = await initQuickMathFramework(getContainer(), {
                pointsPerCorrectAnswer: 50,
            })
            expect(result.game).toBeDefined()
        })

        it('should call cleanup without errors', async () => {
            const result = await initQuickMathFramework(getContainer())
            expect(() => result.cleanup()).not.toThrow()
        })

        it('should throw if container element is detached', async () => {
            const container = getContainer()
            container.remove()
            await expect(initQuickMathFramework(container)).rejects.toThrow(
                'Container element not found'
            )
        })

        it('should throw if question element is missing', async () => {
            document.getElementById('question')!.remove()
            await expect(
                initQuickMathFramework(getContainer())
            ).rejects.toThrow()
        })

        it('should throw if answer-input element is missing', async () => {
            document.getElementById('answer-input')!.remove()
            await expect(
                initQuickMathFramework(getContainer())
            ).rejects.toThrow()
        })

        it('should throw if submit-answer element is missing', async () => {
            document.getElementById('submit-answer')!.remove()
            await expect(
                initQuickMathFramework(getContainer())
            ).rejects.toThrow()
        })
    })

    describe('question rendering', () => {
        it('should render the generated question and enable the input on start', async () => {
            const result = await initQuickMathFramework(getContainer())
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById(
                'submit-answer'
            ) as HTMLButtonElement

            expect(answerInput.disabled).toBe(true)
            result.game.start()

            // onQuestionUpdate feeds the renderer: question text + enabled input.
            const questionText =
                document.getElementById('question')!.textContent ?? ''
            expect(questionText).toMatch(/\d+\s*[+-]\s*\d+/)
            expect(answerInput.disabled).toBe(false)
            expect(submitBtn.disabled).toBe(false)
        })

        it('should disable input and button when the game ends', async () => {
            const result = await initQuickMathFramework(getContainer())
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById(
                'submit-answer'
            ) as HTMLButtonElement

            result.game.start()
            expect(answerInput.disabled).toBe(false)

            await result.game.end()

            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.disabled).toBe(true)
        })

        it('should update the board session counters on score events', async () => {
            const result = await initQuickMathFramework(getContainer())
            result.game.start()
            const state = result.game.getState()
            const question = state.currentQuestion
            expect(question).not.toBeNull()
            result.game.submitAnswer(String(question!.answer))

            expect(
                document.getElementById('current-questions')!.textContent
            ).toBe('1')
            expect(
                document.getElementById('current-correct')!.textContent
            ).toBe('1')
            expect(document.getElementById('current-score')!.textContent).toBe(
                '20'
            )
        })
    })

    describe('custom callbacks', () => {
        it('should invoke custom onStart callback', async () => {
            const onStart = vi.fn()
            const result = await initQuickMathFramework(
                getContainer(),
                {},
                { onStart }
            )
            result.game.start()
            expect(onStart).toHaveBeenCalled()
        })

        it('should invoke custom onScoreUpdate callback when correct answer submitted', async () => {
            const onScoreUpdate = vi.fn()
            const result = await initQuickMathFramework(
                getContainer(),
                {},
                { onScoreUpdate }
            )
            result.game.start()
            const state = result.game.getState()
            const question = state.currentQuestion
            expect(question).not.toBeNull()
            result.game.submitAnswer(String(question!.answer))
            expect(onScoreUpdate).toHaveBeenCalled()
        })

        it('should invoke custom onTimeUpdate callback', async () => {
            const onTimeUpdate = vi.fn()
            const result = await initQuickMathFramework(
                getContainer(),
                {},
                { onTimeUpdate }
            )
            result.game.start()
            vi.advanceTimersByTime(1000)
            expect(onTimeUpdate).toHaveBeenCalled()
        })

        it('should invoke custom onQuestionUpdate callback when game starts', async () => {
            const onQuestionUpdate = vi.fn()
            const result = await initQuickMathFramework(
                getContainer(),
                {},
                { onQuestionUpdate }
            )
            result.game.start()
            expect(onQuestionUpdate).toHaveBeenCalledTimes(1)
            expect(onQuestionUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ question: expect.any(String) })
            )
        })

        it('should invoke custom onAnswerSubmit callback when answer submitted', async () => {
            const onAnswerSubmit = vi.fn()
            const result = await initQuickMathFramework(
                getContainer(),
                {},
                { onAnswerSubmit }
            )
            result.game.start()
            const state = result.game.getState()
            const question = state.currentQuestion
            expect(question).not.toBeNull()
            result.game.submitAnswer(String(question!.answer))
            expect(onAnswerSubmit).toHaveBeenCalledWith(
                true,
                question,
                String(question!.answer)
            )
        })

        it('should call custom onEnd callback', async () => {
            const onEnd = vi.fn()
            const result = await initQuickMathFramework(
                getContainer(),
                {},
                { onEnd }
            )
            result.game.start()
            await result.game.end()
            expect(onEnd).toHaveBeenCalled()
        })
    })

    describe('submit button in setupQuickMathEvents', () => {
        it('should call game.submitAnswer when submit is clicked with active game', async () => {
            const result = await initQuickMathFramework(getContainer())
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            result.game.start()
            answerInput.value = '8'
            const submitBtn = document.getElementById('submit-answer')!
            const submitSpy = vi.spyOn(result.game, 'submitAnswer')
            submitBtn.click()
            expect(submitSpy).toHaveBeenCalledWith('8')
        })

        it('should not call game.submitAnswer when input is empty', async () => {
            const result = await initQuickMathFramework(getContainer())
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            result.game.start()
            answerInput.value = ''
            const submitSpy = vi.spyOn(result.game, 'submitAnswer')
            document.getElementById('submit-answer')!.click()
            expect(submitSpy).not.toHaveBeenCalled()
        })

        it('should not call game.submitAnswer when game is not active', async () => {
            const result = await initQuickMathFramework(getContainer())
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = '8'
            const submitSpy = vi.spyOn(result.game, 'submitAnswer')
            document.getElementById('submit-answer')!.click()
            expect(submitSpy).not.toHaveBeenCalled()
        })
    })
})
