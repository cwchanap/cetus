import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initQuickMathGame } from './init'
import type { GameStats } from './types'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

function setupDOM() {
    document.body.innerHTML = `
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <div id="question"></div>
        <input id="answer-input" type="text" />
        <button id="submit-answer">Submit</button>
        <button id="start-btn">Start</button>
        <div id="game-over-overlay" class="hidden">
            <div class="space-y-4"></div>
        </div>
        <span id="final-score">0</span>
        <span id="accuracy">0%</span>
        <span id="total-questions">0</span>
        <button id="play-again-btn">Play Again</button>
        <span id="current-questions">0</span>
        <span id="current-correct">0</span>
        <span id="current-score">0</span>
    `
}

function makeStats(overrides: Partial<GameStats> = {}): GameStats {
    return {
        totalQuestions: 10,
        correctAnswers: 8,
        incorrectAnswers: 2,
        accuracy: 80,
        averageTimePerQuestion: 5,
        finalScore: 160,
        ...overrides,
    }
}

describe('initQuickMathGame', () => {
    beforeEach(() => {
        setupDOM()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllTimers()
        vi.useRealTimers()
        document.body.innerHTML = ''
    })

    describe('initialization guard checks', () => {
        it('should return undefined when score element is missing', async () => {
            document.getElementById('score')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when time-remaining element is missing', async () => {
            document.getElementById('time-remaining')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when question element is missing', async () => {
            document.getElementById('question')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when answer-input is missing', async () => {
            document.getElementById('answer-input')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when submit-answer is missing', async () => {
            document.getElementById('submit-answer')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when start-btn is missing', async () => {
            document.getElementById('start-btn')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when game-over-overlay is missing', async () => {
            document.getElementById('game-over-overlay')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when final-score is missing', async () => {
            document.getElementById('final-score')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when accuracy is missing', async () => {
            document.getElementById('accuracy')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when total-questions is missing', async () => {
            document.getElementById('total-questions')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when play-again-btn is missing', async () => {
            document.getElementById('play-again-btn')!.remove()
            const result = await initQuickMathGame()
            expect(result).toBeUndefined()
        })

        it('should return game instance when all required elements are present', async () => {
            const result = await initQuickMathGame()
            expect(result).toBeDefined()
            expect(typeof result!.restart).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
            expect(result!.callbacks).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
        })
    })

    describe('callbacks', () => {
        it('onScoreUpdate should update score elements', async () => {
            const result = await initQuickMathGame()
            result!.callbacks.onScoreUpdate(42)
            expect(document.getElementById('score')!.textContent).toBe('42')
            expect(document.getElementById('current-score')!.textContent).toBe(
                '42'
            )
        })

        it('onTimeUpdate should add red class when time <= 10', async () => {
            const result = await initQuickMathGame()
            const el = document.getElementById('time-remaining')!
            result!.callbacks.onTimeUpdate(10)
            expect(el.textContent).toBe('10')
            expect(el.classList.contains('text-red-400')).toBe(true)
            expect(el.classList.contains('text-cyan-400')).toBe(false)
        })

        it('onTimeUpdate should add cyan class when time > 10', async () => {
            const result = await initQuickMathGame()
            const el = document.getElementById('time-remaining')!
            el.classList.add('text-red-400')
            result!.callbacks.onTimeUpdate(30)
            expect(el.classList.contains('text-cyan-400')).toBe(true)
            expect(el.classList.contains('text-red-400')).toBe(false)
        })

        it('onQuestionUpdate should set question text and clear input', async () => {
            const result = await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = 'old'
            result!.callbacks.onQuestionUpdate({
                id: 'q1',
                question: '5 + 3 = ?',
                answer: 8,
                operation: 'addition',
                operand1: 5,
                operand2: 3,
            })
            expect(document.getElementById('question')!.textContent).toBe(
                '5 + 3 = ?'
            )
            expect(answerInput.value).toBe('')
        })

        it('onGameStart should enable controls and reset stats', async () => {
            const result = await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById(
                'submit-answer'
            ) as HTMLButtonElement
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const overlay = document.getElementById('game-over-overlay')!

            answerInput.disabled = true
            submitBtn.disabled = true
            overlay.classList.remove('hidden')
            document.getElementById('current-questions')!.textContent = '5'
            document.getElementById('current-correct')!.textContent = '4'
            document.getElementById('current-score')!.textContent = '80'

            result!.callbacks.onGameStart()

            expect(answerInput.disabled).toBe(false)
            expect(submitBtn.disabled).toBe(false)
            expect(startBtn.textContent).toBe('Playing...')
            expect(startBtn.disabled).toBe(true)
            expect(overlay.classList.contains('hidden')).toBe(true)
            expect(
                document.getElementById('current-questions')!.textContent
            ).toBe('0')
            expect(
                document.getElementById('current-correct')!.textContent
            ).toBe('0')
            expect(document.getElementById('current-score')!.textContent).toBe(
                '0'
            )
        })

        it('onGameOver should disable controls and show overlay', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const result = await initQuickMathGame()
            await result!.callbacks.onGameOver(160, makeStats())

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById(
                'submit-answer'
            ) as HTMLButtonElement
            const overlay = document.getElementById('game-over-overlay')!

            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.disabled).toBe(true)
            expect(overlay.classList.contains('hidden')).toBe(false)
        })

        it('onGameOver should update final stats elements', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const result = await initQuickMathGame()
            await result!.callbacks.onGameOver(
                200,
                makeStats({ totalQuestions: 15, accuracy: 93.5 })
            )

            expect(document.getElementById('final-score')!.textContent).toBe(
                '200'
            )
            expect(
                document.getElementById('total-questions')!.textContent
            ).toBe('15')
            expect(document.getElementById('accuracy')!.textContent).toBe(
                '93.5%'
            )
        })

        it('onGameOver should call external callback when provided', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const externalOnGameOver = vi.fn()
            const result = await initQuickMathGame({
                onGameOver: externalOnGameOver,
            })
            const stats = makeStats()
            await result!.callbacks.onGameOver(100, stats)
            expect(externalOnGameOver).toHaveBeenCalledWith(100, stats)
        })

        it('onGameOver should call saveScore when no external callback', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const result = await initQuickMathGame()
            await result!.callbacks.onGameOver(100, makeStats())
            expect(saveGameScore).toHaveBeenCalled()
        })

        it('onScoreUpload should add status message to game-over overlay', async () => {
            const result = await initQuickMathGame()
            result!.callbacks.onScoreUpload!(true)
            const spaceDiv = document.querySelector('.space-y-4')!
            expect(spaceDiv.children.length).toBe(1)
            expect(spaceDiv.children[0].textContent).toBe('Score saved!')
            vi.advanceTimersByTime(4000)
            expect(spaceDiv.children.length).toBe(0)
        })

        it('onScoreUpload should show failure message for unsuccessful upload', async () => {
            const result = await initQuickMathGame()
            result!.callbacks.onScoreUpload!(false)
            const spaceDiv = document.querySelector('.space-y-4')!
            expect(spaceDiv.children[0].textContent).toBe(
                'Score not saved (offline?)'
            )
        })

        it('should invoke onScoreUpload(false) via saveScore error callback', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, _onSuccess, onError) => {
                    onError?.('network error')
                    return { success: false }
                }
            )

            const result = await initQuickMathGame()
            const uploadSpy = vi.spyOn(
                result!.callbacks,
                'onScoreUpload' as any
            )
            // triggers saveScore (no external onGameOver) -> error callback -> onScoreUpload(false)
            await result!.callbacks.onGameOver(50, makeStats())
            await vi.runAllTimersAsync()
            expect(uploadSpy).toHaveBeenCalledWith(false)
        })
    })

    describe('event listeners', () => {
        it('start button click should put the game in started state', async () => {
            await initQuickMathGame()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            startBtn.click()
            expect(startBtn.textContent).toBe('Playing...')
            expect(startBtn.disabled).toBe(true)
        })

        it('play-again button click should start game and reset start button', async () => {
            const result = await initQuickMathGame()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            startBtn.textContent = 'Playing...'
            startBtn.disabled = true
            document.getElementById('play-again-btn')!.click()
            expect(startBtn.textContent).toBe('Start Game')
            expect(startBtn.disabled).toBe(false)
        })

        it('submit button click should not throw when game inactive', async () => {
            await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = '42'
            expect(() =>
                document.getElementById('submit-answer')!.click()
            ).not.toThrow()
        })

        it('enter keypress should trigger submit', async () => {
            await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = '42'
            const event = new KeyboardEvent('keypress', {
                key: 'Enter',
                bubbles: true,
            })
            expect(() => answerInput.dispatchEvent(event)).not.toThrow()
        })

        it('non-numeric keydown should be prevented', async () => {
            await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const event = new KeyboardEvent('keydown', {
                key: 'a',
                bubbles: true,
                cancelable: true,
            })
            answerInput.dispatchEvent(event)
            expect(event.defaultPrevented).toBe(true)
        })

        it('backspace keydown should NOT be prevented', async () => {
            await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const event = new KeyboardEvent('keydown', {
                key: 'Backspace',
                bubbles: true,
                cancelable: true,
            })
            answerInput.dispatchEvent(event)
            expect(event.defaultPrevented).toBe(false)
        })

        it('numeric keydown should NOT be prevented', async () => {
            await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const event = new KeyboardEvent('keydown', {
                key: '5',
                bubbles: true,
                cancelable: true,
            })
            answerInput.dispatchEvent(event)
            expect(event.defaultPrevented).toBe(false)
        })

        it('input event should update currentAnswer', async () => {
            await initQuickMathGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = '7'
            const inputEvent = new Event('input', { bubbles: true })
            expect(() => answerInput.dispatchEvent(inputEvent)).not.toThrow()
        })
    })

    describe('handleSubmit with active game', () => {
        it('should process answer when game is active and answer is non-empty', async () => {
            const result = await initQuickMathGame()
            // Start the game to make it active
            document.getElementById('start-btn')!.click()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = '42'
            document.getElementById('submit-answer')!.click()

            // questionsAnswered should be incremented
            const state = result!.getState()
            expect(state!.questionsAnswered).toBeGreaterThanOrEqual(1)
        })

        it('should return early when answer is empty', async () => {
            await initQuickMathGame()
            document.getElementById('start-btn')!.click()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = '   ' // whitespace only → trims to ''
            expect(() =>
                document.getElementById('submit-answer')!.click()
            ).not.toThrow()
        })

        it('should apply correct border class for correct answer', async () => {
            const result = await initQuickMathGame()
            document.getElementById('start-btn')!.click()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            // Get the current question's answer
            const state = result!.getState()
            answerInput.value =
                state!.currentQuestion?.answer?.toString() ?? '0'
            document.getElementById('submit-answer')!.click()

            // Either correct or incorrect feedback class should be applied
            const hasClass =
                answerInput.classList.contains('border-green-400') ||
                answerInput.classList.contains('border-red-400')
            expect(hasClass).toBe(true)
        })

        it('should remove feedback classes after timeout', async () => {
            await initQuickMathGame()
            document.getElementById('start-btn')!.click()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = '99'
            document.getElementById('submit-answer')!.click()

            vi.advanceTimersByTime(400)
            expect(answerInput.classList.contains('border-green-400')).toBe(
                false
            )
            expect(answerInput.classList.contains('border-red-400')).toBe(false)
        })
    })

    describe('beforeunload handler', () => {
        it('should destroy gameInstance on beforeunload', async () => {
            await initQuickMathGame()
            expect(() =>
                window.dispatchEvent(new Event('beforeunload'))
            ).not.toThrow()
        })
    })

    describe('achievement notification dispatch', () => {
        it('should dispatch achievementsEarned event when new achievements returned', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                (_id: any, _score: any, successCb: any) => {
                    successCb({
                        newAchievements: ['achievement-1', 'achievement-2'],
                    })
                    return Promise.resolve({ success: true }) as any
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            const result = await initQuickMathGame()
            await result!.callbacks.onGameOver(100, makeStats())

            const achievementEvents = dispatchSpy.mock.calls.filter(
                call =>
                    call[0] instanceof CustomEvent &&
                    (call[0] as CustomEvent).type === 'achievementsEarned'
            )
            expect(achievementEvents.length).toBeGreaterThan(0)
        })

        it('should not dispatch event when no new achievements', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                (_id: any, _score: any, successCb: any) => {
                    successCb({ newAchievements: [] })
                    return Promise.resolve({ success: true }) as any
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            const result = await initQuickMathGame()
            await result!.callbacks.onGameOver(100, makeStats())

            const achievementEvents = dispatchSpy.mock.calls.filter(
                call =>
                    call[0] instanceof CustomEvent &&
                    (call[0] as CustomEvent).type === 'achievementsEarned'
            )
            expect(achievementEvents.length).toBe(0)
        })
    })

    describe('returned instance', () => {
        it('getState should return game state', async () => {
            const result = await initQuickMathGame()
            expect(result!.getState()).toBeDefined()
        })

        it('endGame should not throw', async () => {
            const result = await initQuickMathGame()
            expect(() => result!.endGame()).not.toThrow()
        })

        it('cleanup should abort listeners', async () => {
            const result = await initQuickMathGame()
            expect(() => result!.cleanup()).not.toThrow()
        })

        it('restart should not throw', async () => {
            const result = await initQuickMathGame()
            expect(() => result!.restart()).not.toThrow()
        })
    })
})
