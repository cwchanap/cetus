import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initWordScrambleGameFramework } from './initFramework'
import type { WordScrambleStats } from './frameworkTypes'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="scrambled-word"></div>
        <input id="answer-input" type="text" disabled />
        <button id="submit-answer" disabled>Submit</button>
        <button id="skip-word" disabled>Skip</button>
        <button id="start-btn">Start</button>
        <button id="end-btn" style="display: none;">End</button>
        <button id="play-again-btn">Play Again</button>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <span id="current-words">0</span>
        <span id="current-correct">0</span>
        <span id="current-score">0</span>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <span id="total-words">0</span>
        <span id="accuracy">0%</span>
        <span id="longest-word">None</span>
    `
}

function makeStats(
    overrides: Partial<WordScrambleStats> = {}
): WordScrambleStats {
    return {
        finalScore: 100,
        timeElapsed: 60,
        gameCompleted: true,
        totalWords: 5,
        correctAnswers: 4,
        incorrectAnswers: 1,
        accuracy: 80,
        averageTimePerWord: 5,
        longestWord: 'hello',
        shortestWord: 'hi',
        wordsUnscrambled: [
            {
                word: 'hello',
                scrambled: 'lleho',
                userAnswer: 'hello',
                correct: true,
                timeToAnswer: 3,
            },
        ],
        ...overrides,
    }
}

describe('initWordScrambleGameFramework', () => {
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

    describe('initialization', () => {
        it('should return undefined when scrambled-word element is missing', async () => {
            document.getElementById('scrambled-word')!.remove()
            const result = await initWordScrambleGameFramework()
            expect(result).toBeUndefined()
        })

        it('should return undefined when answer-input is missing', async () => {
            document.getElementById('answer-input')!.remove()
            const result = await initWordScrambleGameFramework()
            expect(result).toBeUndefined()
        })

        it('should return undefined when submit-answer is missing', async () => {
            document.getElementById('submit-answer')!.remove()
            const result = await initWordScrambleGameFramework()
            expect(result).toBeUndefined()
        })

        it('should return undefined when start-btn is missing', async () => {
            document.getElementById('start-btn')!.remove()
            const result = await initWordScrambleGameFramework()
            expect(result).toBeUndefined()
        })

        it('should return game instance with all control methods', async () => {
            const instance = await initWordScrambleGameFramework()
            expect(instance).toBeDefined()
            expect(typeof instance!.restart).toBe('function')
            expect(typeof instance!.getState).toBe('function')
            expect(typeof instance!.endGame).toBe('function')
            expect(typeof instance!.cleanup).toBe('function')
        })

        it('should return game instance when optional elements are missing', async () => {
            document.getElementById('skip-word')!.remove()
            document.getElementById('play-again-btn')!.remove()
            document.getElementById('score')!.remove()
            document.getElementById('time-remaining')!.remove()
            const instance = await initWordScrambleGameFramework()
            expect(instance).toBeDefined()
        })
    })

    describe('game flow', () => {
        it('start button click should start the game and show challenge', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            const state = instance!.getState()
            expect(state.isActive).toBe(true)
            expect(state.currentChallenge).not.toBe(null)

            const scrambledEl = document.getElementById('scrambled-word')!
            expect(scrambledEl.textContent).not.toBe('READY?')
            expect(scrambledEl.textContent!.length).toBeGreaterThan(0)
        })

        it('start should enable input and submit button', async () => {
            await initWordScrambleGameFramework()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById('submit-answer')!

            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.hasAttribute('disabled')).toBe(true)

            document.getElementById('start-btn')!.click()

            expect(answerInput.disabled).toBe(false)
            expect(submitBtn.hasAttribute('disabled')).toBe(false)
        })

        it('start should hide start button and show end button', async () => {
            await initWordScrambleGameFramework()
            const startBtn = document.getElementById('start-btn')!
            const endBtn = document.getElementById('end-btn')!

            document.getElementById('start-btn')!.click()

            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })

        it('submit button should submit answer when game is active', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            const state = instance!.getState()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = state.currentChallenge!.originalWord

            document.getElementById('submit-answer')!.click()

            const newState = instance!.getState()
            expect(newState.wordsUnscrambled).toBe(1)
        })

        it('submit should not work when game is not active', async () => {
            const instance = await initWordScrambleGameFramework()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = 'test'

            document.getElementById('submit-answer')!.click()

            expect(instance!.getState().wordsUnscrambled).toBe(0)
        })

        it('skip button should skip challenge when game is active', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()
            const firstChallenge = instance!.getState().currentChallenge

            document.getElementById('skip-word')!.click()

            const newState = instance!.getState()
            expect(newState.wordsUnscrambled).toBe(1)
            expect(newState.incorrectAnswers).toBe(1)
            expect(newState.currentChallenge?.id).not.toBe(firstChallenge?.id)
        })

        it('enter key should submit answer when game is active', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            const state = instance!.getState()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = state.currentChallenge!.originalWord
            answerInput.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            )

            expect(instance!.getState().wordsUnscrambled).toBe(1)
        })

        it('input event should update current answer', async () => {
            const instance = await initWordScrambleGameFramework()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = 'abc'
            answerInput.dispatchEvent(new Event('input', { bubbles: true }))

            expect(instance!.game.getCurrentAnswer()).toBe('abc')
        })

        it('correct answer should add green border temporarily', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const state = instance!.getState()
            answerInput.value = state.currentChallenge!.originalWord
            document.getElementById('submit-answer')!.click()

            expect(answerInput.classList.contains('border-green-400')).toBe(
                true
            )
            vi.advanceTimersByTime(600)
            expect(answerInput.classList.contains('border-green-400')).toBe(
                false
            )
        })

        it('incorrect answer should add red border temporarily', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = 'wronganswer'
            document.getElementById('submit-answer')!.click()

            expect(answerInput.classList.contains('border-red-400')).toBe(true)
            vi.advanceTimersByTime(600)
            expect(answerInput.classList.contains('border-red-400')).toBe(false)
        })

        it('onTimeUpdate should add red class when time <= 10', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()
            instance.game['updateTime'](10)

            const el = document.getElementById('time-remaining')!
            expect(el.classList.contains('text-red-400')).toBe(true)
            expect(el.classList.contains('text-cyan-400')).toBe(false)
        })

        it('onChallengeUpdate should color easy words green', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            instance.game['callbacks'].onChallengeUpdate?.({
                id: 'c1',
                originalWord: 'cat',
                scrambledWord: 'tac',
                difficulty: 'easy',
                points: 10,
            })
            const el = document.getElementById('scrambled-word')!
            expect(el.classList.contains('text-green-400')).toBe(true)
        })

        it('end game should disable controls and show overlay', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            await instance.endGame()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById('submit-answer')!
            const overlay = document.getElementById('game-over-overlay')!

            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.hasAttribute('disabled')).toBe(true)
            expect(overlay.classList.contains('hidden')).toBe(false)
        })

        it('end game should update final stats elements', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            const game = instance.game
            ;(game as any).state.wordHistory = [
                {
                    word: 'keyboard',
                    scrambled: 'keyboard',
                    userAnswer: 'keyboard',
                    correct: true,
                    timeToAnswer: 3,
                },
            ]
            ;(game as any).state.wordsUnscrambled = 1
            ;(game as any).state.correctAnswers = 1
            ;(game as any).state.incorrectAnswers = 0

            await instance.endGame()

            expect(document.getElementById('final-score')!.textContent).toBe(
                game.getState().score.toString()
            )
            expect(document.getElementById('total-words')!.textContent).toBe(
                '1'
            )
            expect(document.getElementById('longest-word')!.textContent).toBe(
                'keyboard'
            )
        })

        it('restart should start a fresh game', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value =
                instance.getState().currentChallenge!.originalWord
            document.getElementById('submit-answer')!.click()
            expect(instance.getState().wordsUnscrambled).toBe(1)

            instance.restart()

            expect(instance.getState().wordsUnscrambled).toBe(0)
            expect(instance.getState().score).toBe(0)
            expect(instance.getState().isActive).toBe(true)
        })

        it('cleanup should not throw', async () => {
            const instance = await initWordScrambleGameFramework()
            expect(() => instance!.cleanup()).not.toThrow()
        })

        it('play-again button should restart the game', async () => {
            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value =
                instance.getState().currentChallenge!.originalWord
            document.getElementById('submit-answer')!.click()
            expect(instance.getState().wordsUnscrambled).toBe(1)

            document.getElementById('play-again-btn')!.click()

            expect(instance.getState().wordsUnscrambled).toBe(0)
            expect(instance.getState().isActive).toBe(true)
        })

        it('should call showAchievementAward when achievements are earned', async () => {
            const fetchSpy = vi
                .spyOn(globalThis, 'fetch')
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        newAchievements: ['word_master'],
                    }),
                } as Response)

            const showAchievementAward = vi.fn()
            vi.stubGlobal('showAchievementAward', showAchievementAward)

            const instance = await initWordScrambleGameFramework()
            document.getElementById('start-btn')!.click()

            await instance!.endGame()

            expect(fetchSpy).toHaveBeenCalled()
            expect(showAchievementAward).toHaveBeenCalledWith(['word_master'])

            fetchSpy.mockRestore()
            vi.unstubAllGlobals()
        })
    })

    describe('returned instance methods', () => {
        it('getState should return game state', async () => {
            const instance = await initWordScrambleGameFramework()
            const state = instance!.getState()
            expect(state).toBeDefined()
        })

        it('endGame should not throw', async () => {
            const instance = await initWordScrambleGameFramework()
            await expect(instance!.endGame()).resolves.not.toThrow()
        })
    })
})
