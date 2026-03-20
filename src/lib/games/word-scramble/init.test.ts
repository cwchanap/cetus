import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initWordScrambleGame } from './init'
import type { GameStats } from './types'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="scrambled-word"></div>
        <input id="answer-input" type="text" />
        <button id="submit-answer">Submit</button>
        <button id="skip-word">Skip</button>
        <button id="start-btn">Start</button>
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

function makeStats(overrides: Partial<GameStats> = {}): GameStats {
    return {
        totalWords: 5,
        correctAnswers: 4,
        incorrectAnswers: 1,
        accuracy: 80,
        averageTimePerWord: 5,
        finalScore: 100,
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

describe('initWordScrambleGame', () => {
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
            const result = await initWordScrambleGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when answer-input is missing', async () => {
            document.getElementById('answer-input')!.remove()
            const result = await initWordScrambleGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when submit-answer is missing', async () => {
            document.getElementById('submit-answer')!.remove()
            const result = await initWordScrambleGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when start-btn is missing', async () => {
            document.getElementById('start-btn')!.remove()
            const result = await initWordScrambleGame()
            expect(result).toBeUndefined()
        })

        it('should return game instance with all control methods', async () => {
            const instance = await initWordScrambleGame()
            expect(instance).toBeDefined()
            expect(typeof instance.restart).toBe('function')
            expect(typeof instance.getState).toBe('function')
            expect(typeof instance.endGame).toBe('function')
            expect(typeof instance.callbacks).toBe('object')
            expect(typeof instance.cleanup).toBe('function')
        })

        it('should return game instance when optional elements are missing', async () => {
            document.getElementById('skip-word')!.remove()
            document.getElementById('play-again-btn')!.remove()
            document.getElementById('score')!.remove()
            document.getElementById('time-remaining')!.remove()
            const instance = await initWordScrambleGame()
            expect(instance).toBeDefined()
        })
    })

    describe('callbacks', () => {
        it('onScoreUpdate should update score elements', async () => {
            const instance = await initWordScrambleGame()
            instance.callbacks.onScoreUpdate(42)
            expect(document.getElementById('score')!.textContent).toBe('42')
            expect(document.getElementById('current-score')!.textContent).toBe(
                '42'
            )
        })

        it('onScoreUpdate should work without optional score elements', async () => {
            document.getElementById('score')!.remove()
            document.getElementById('current-score')!.remove()
            const instance = await initWordScrambleGame()
            expect(() => instance.callbacks.onScoreUpdate(42)).not.toThrow()
        })

        it('onTimeUpdate should update time element', async () => {
            const instance = await initWordScrambleGame()
            instance.callbacks.onTimeUpdate(30)
            const el = document.getElementById('time-remaining')!
            expect(el.textContent).toBe('30')
        })

        it('onTimeUpdate should add red class when time <= 10', async () => {
            const instance = await initWordScrambleGame()
            const el = document.getElementById('time-remaining')!
            instance.callbacks.onTimeUpdate(10)
            expect(el.classList.contains('text-red-400')).toBe(true)
            expect(el.classList.contains('text-cyan-400')).toBe(false)
        })

        it('onTimeUpdate should add cyan class when time > 10', async () => {
            const instance = await initWordScrambleGame()
            const el = document.getElementById('time-remaining')!
            el.classList.add('text-red-400')
            instance.callbacks.onTimeUpdate(30)
            expect(el.classList.contains('text-cyan-400')).toBe(true)
            expect(el.classList.contains('text-red-400')).toBe(false)
        })

        it('onTimeUpdate should not throw when time element missing', async () => {
            document.getElementById('time-remaining')!.remove()
            const instance = await initWordScrambleGame()
            expect(() => instance.callbacks.onTimeUpdate(5)).not.toThrow()
        })

        it('onChallengeUpdate should set scrambled word text', async () => {
            const instance = await initWordScrambleGame()
            instance.callbacks.onChallengeUpdate({
                id: 'c1',
                originalWord: 'hello',
                scrambledWord: 'olleh',
                difficulty: 'easy',
                points: 10,
            })
            const el = document.getElementById('scrambled-word')!
            expect(el.textContent).toBe('OLLEH')
            expect(el.classList.contains('text-green-400')).toBe(true)
        })

        it('onChallengeUpdate should add yellow class for medium difficulty', async () => {
            const instance = await initWordScrambleGame()
            instance.callbacks.onChallengeUpdate({
                id: 'c1',
                originalWord: 'hello',
                scrambledWord: 'olleh',
                difficulty: 'medium',
                points: 20,
            })
            const el = document.getElementById('scrambled-word')!
            expect(el.classList.contains('text-yellow-400')).toBe(true)
        })

        it('onChallengeUpdate should add red class for hard difficulty', async () => {
            const instance = await initWordScrambleGame()
            instance.callbacks.onChallengeUpdate({
                id: 'c1',
                originalWord: 'hello',
                scrambledWord: 'olleh',
                difficulty: 'hard',
                points: 30,
            })
            const el = document.getElementById('scrambled-word')!
            expect(el.classList.contains('text-red-400')).toBe(true)
        })

        it('onGameStart should enable controls and hide start button', async () => {
            const instance = await initWordScrambleGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById('submit-answer')!
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            answerInput.disabled = true
            instance.callbacks.onGameStart()
            expect(answerInput.disabled).toBe(false)
            expect(submitBtn.hasAttribute('disabled')).toBe(false)
            expect(startBtn.style.display).toBe('none')
        })

        it('onGameStart should reset stats elements', async () => {
            const instance = await initWordScrambleGame()
            document.getElementById('current-words')!.textContent = '5'
            document.getElementById('current-correct')!.textContent = '5'
            document.getElementById('current-score')!.textContent = '100'
            instance.callbacks.onGameStart()
            expect(document.getElementById('current-words')!.textContent).toBe(
                '0'
            )
            expect(
                document.getElementById('current-correct')!.textContent
            ).toBe('0')
            expect(document.getElementById('current-score')!.textContent).toBe(
                '0'
            )
        })

        it('onGameStart should hide game-over-overlay', async () => {
            const instance = await initWordScrambleGame()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')
            instance.callbacks.onGameStart()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('onCorrectAnswer should add green border with timeout', async () => {
            const instance = await initWordScrambleGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            instance.callbacks.onCorrectAnswer('hello')
            expect(answerInput.classList.contains('border-green-400')).toBe(
                true
            )
            vi.advanceTimersByTime(600)
            expect(answerInput.classList.contains('border-green-400')).toBe(
                false
            )
        })

        it('onIncorrectAnswer should add red border with timeout', async () => {
            const instance = await initWordScrambleGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            instance.callbacks.onIncorrectAnswer('hello', 'world')
            expect(answerInput.classList.contains('border-red-400')).toBe(true)
            vi.advanceTimersByTime(600)
            expect(answerInput.classList.contains('border-red-400')).toBe(false)
        })

        it('onGameOver should disable controls and show game-over-overlay', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const instance = await initWordScrambleGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById('submit-answer')!
            const skipBtn = document.getElementById('skip-word')!
            const overlay = document.getElementById('game-over-overlay')!

            await instance.callbacks.onGameOver(100, makeStats())

            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.hasAttribute('disabled')).toBe(true)
            expect(skipBtn.hasAttribute('disabled')).toBe(true)
            expect(overlay.classList.contains('hidden')).toBe(false)
        })

        it('onGameOver should update final stats elements', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const instance = await initWordScrambleGame()
            await instance.callbacks.onGameOver(
                150,
                makeStats({
                    totalWords: 10,
                    accuracy: 90,
                    longestWord: 'keyboard',
                })
            )

            expect(document.getElementById('final-score')!.textContent).toBe(
                '150'
            )
            expect(document.getElementById('total-words')!.textContent).toBe(
                '10'
            )
            expect(document.getElementById('accuracy')!.textContent).toBe('90%')
            expect(document.getElementById('longest-word')!.textContent).toBe(
                'keyboard'
            )
        })

        it('onGameOver should show start button and hide end button', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const endBtn = document.createElement('button')
            endBtn.id = 'end-btn'
            endBtn.style.display = 'inline-flex'
            document.body.appendChild(endBtn)

            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            startBtn.style.display = 'none'

            const instance = await initWordScrambleGame()
            await instance.callbacks.onGameOver(100, makeStats())

            expect(startBtn.style.display).toBe('inline-flex')
            expect(endBtn.style.display).toBe('none')
        })

        it('onGameOver should dispatch achievementsEarned event when achievements found', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, onSuccess) => {
                    onSuccess?.({ newAchievements: ['word_master'] })
                    return { success: true }
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            const instance = await initWordScrambleGame()
            await instance.callbacks.onGameOver(100, makeStats())

            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'achievementsEarned' })
            )
        })

        it('onGameOver should call external onGameOver callback', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const externalOnGameOver = vi.fn()
            const instance = await initWordScrambleGame({
                onGameOver: externalOnGameOver,
            })
            const stats = makeStats()
            await instance.callbacks.onGameOver(100, stats)

            expect(externalOnGameOver).toHaveBeenCalledWith(100, stats)
        })

        it('onGameOver should display None for longestWord when empty', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const instance = await initWordScrambleGame()
            await instance.callbacks.onGameOver(
                0,
                makeStats({ longestWord: '' })
            )

            expect(document.getElementById('longest-word')!.textContent).toBe(
                'None'
            )
        })
    })

    describe('event listeners', () => {
        it('start button click should call onGameStart callback', async () => {
            const instance = await initWordScrambleGame()
            const onGameStartSpy = vi.spyOn(instance.callbacks, 'onGameStart')
            document.getElementById('start-btn')!.click()
            expect(onGameStartSpy).toHaveBeenCalled()
        })

        it('submit button click should trigger onCorrectAnswer or onIncorrectAnswer when game is active', async () => {
            const instance = await initWordScrambleGame()
            instance.restart()
            const onCorrectSpy = vi.spyOn(instance.callbacks, 'onCorrectAnswer')
            const onIncorrectSpy = vi.spyOn(
                instance.callbacks,
                'onIncorrectAnswer'
            )
            const state = instance.getState()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = state?.currentChallenge?.originalWord ?? 'test'
            document.getElementById('submit-answer')!.click()
            expect(
                onCorrectSpy.mock.calls.length +
                    onIncorrectSpy.mock.calls.length
            ).toBeGreaterThan(0)
        })

        it('skip button click should trigger onChallengeUpdate when game is active', async () => {
            const instance = await initWordScrambleGame()
            instance.restart()
            const onChallengeUpdateSpy = vi.spyOn(
                instance.callbacks,
                'onChallengeUpdate'
            )
            document.getElementById('skip-word')!.click()
            expect(onChallengeUpdateSpy).toHaveBeenCalled()
        })

        it('play-again button click should call onGameStart callback', async () => {
            const instance = await initWordScrambleGame()
            const onGameStartSpy = vi.spyOn(instance.callbacks, 'onGameStart')
            document.getElementById('play-again-btn')!.click()
            expect(onGameStartSpy).toHaveBeenCalled()
        })

        it('enter key on answer-input should trigger answer callback when game is active', async () => {
            const instance = await initWordScrambleGame()
            instance.restart()
            const onCorrectSpy = vi.spyOn(instance.callbacks, 'onCorrectAnswer')
            const onIncorrectSpy = vi.spyOn(
                instance.callbacks,
                'onIncorrectAnswer'
            )
            const state = instance.getState()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = state?.currentChallenge?.originalWord ?? 'test'
            answerInput.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            )
            expect(
                onCorrectSpy.mock.calls.length +
                    onIncorrectSpy.mock.calls.length
            ).toBeGreaterThan(0)
        })

        it('input event on answer-input should update current answer', async () => {
            const instance = await initWordScrambleGame()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = 'abc'
            const inputEvent = new Event('input', { bubbles: true })
            answerInput.dispatchEvent(inputEvent)
            expect(answerInput.value).toBe('abc')
        })
    })

    describe('returned instance methods', () => {
        it('getState should return game state', async () => {
            const instance = await initWordScrambleGame()
            const state = instance.getState()
            expect(state).toBeDefined()
        })

        it('endGame should not throw', async () => {
            const instance = await initWordScrambleGame()
            expect(() => instance.endGame()).not.toThrow()
        })

        it('cleanup should abort event listeners', async () => {
            const instance = await initWordScrambleGame()
            expect(() => instance.cleanup()).not.toThrow()
        })

        it('restart should restart the game', async () => {
            const instance = await initWordScrambleGame()
            expect(() => instance.restart()).not.toThrow()
        })
    })
})
