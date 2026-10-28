import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initWordScrambleGameFramework } from './initFramework'
import {
    AchievementRarity,
    type AchievementNotification,
} from '@cetus/shared/achievements'

vi.mock('@/lib/services/scoreService', () => ({
    // Implementation-backed so vi.restoreAllMocks() in beforeEach restores
    // to a working default instead of an implementation-less mock.
    saveGameScore: vi.fn(async () => ({ success: true })),
    submitScore: vi.fn(async () => ({
        success: true,
        newAchievements: [],
    })),
}))

import { submitScore } from '@/lib/services/scoreService'

// HPA-393: React owns the shared start/end buttons, the overlay and its
// final stats, so the initializer no longer wires or writes them — that
// coverage moved to the WordScrambleScreen island test. The initializer
// keeps the board trio (scrambled word / input / submit), the skip button,
// the board-embedded session counters and the shared time badge's low-time
// tint. The board host is island-owned and unused here, so tests pass
// document.body.
function setupDOM() {
    document.body.innerHTML = `
        <div id="scrambled-word"></div>
        <input id="answer-input" type="text" disabled />
        <button id="submit-answer" disabled>Submit</button>
        <button id="skip-word" disabled>Skip</button>
        <span id="time-remaining">60</span>
        <span id="current-words">0</span>
        <span id="current-correct">0</span>
        <span id="current-score">0</span>
    `
}

async function startInitialized() {
    const instance = (await initWordScrambleGameFramework(
        document.body
    )) as NonNullable<Awaited<ReturnType<typeof initWordScrambleGameFramework>>>
    instance.game.start()
    return instance
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
            const result = await initWordScrambleGameFramework(document.body)
            expect(result).toBeUndefined()
        })

        it('should return undefined when answer-input is missing', async () => {
            document.getElementById('answer-input')!.remove()
            const result = await initWordScrambleGameFramework(document.body)
            expect(result).toBeUndefined()
        })

        it('should return undefined when submit-answer is missing', async () => {
            document.getElementById('submit-answer')!.remove()
            const result = await initWordScrambleGameFramework(document.body)
            expect(result).toBeUndefined()
        })

        it('should return game instance with all control methods', async () => {
            const instance = await initWordScrambleGameFramework(document.body)
            expect(instance).toBeDefined()
            expect(typeof instance!.restart).toBe('function')
            expect(typeof instance!.getState).toBe('function')
            expect(typeof instance!.endGame).toBe('function')
            expect(typeof instance!.cleanup).toBe('function')
        })

        it('should return game instance when optional elements are missing', async () => {
            document.getElementById('skip-word')!.remove()
            const instance = await initWordScrambleGameFramework(document.body)
            expect(instance).toBeDefined()
        })
    })

    describe('game flow', () => {
        it('starting the game shows the first scrambled challenge', async () => {
            const instance = await startInitialized()

            const state = instance!.getState()
            expect(state.isActive).toBe(true)
            expect(state.currentChallenge).not.toBe(null)

            const scrambledEl = document.getElementById('scrambled-word')!
            expect(scrambledEl.textContent).not.toBe('READY?')
            expect(scrambledEl.textContent!.length).toBeGreaterThan(0)
        })

        it('start should enable input and submit button', async () => {
            await startInitialized()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById('submit-answer')!

            expect(answerInput.disabled).toBe(false)
            expect(submitBtn.hasAttribute('disabled')).toBe(false)
        })

        it('submit button should submit answer when game is active', async () => {
            const instance = await startInitialized()

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
            const instance = (await initWordScrambleGameFramework(
                document.body
            ))!
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = 'test'

            document.getElementById('submit-answer')!.click()

            expect(instance!.getState().wordsUnscrambled).toBe(0)
        })

        it('skip button should skip challenge when game is active', async () => {
            const instance = await startInitialized()
            const firstChallenge = instance!.getState().currentChallenge

            document.getElementById('skip-word')!.click()

            const newState = instance!.getState()
            expect(newState.wordsUnscrambled).toBe(1)
            expect(newState.incorrectAnswers).toBe(1)
            expect(newState.currentChallenge?.id).not.toBe(firstChallenge?.id)
        })

        it('enter key should submit answer when game is active', async () => {
            const instance = await startInitialized()

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
            const instance = (await initWordScrambleGameFramework(
                document.body
            ))!
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value = 'abc'
            answerInput.dispatchEvent(new Event('input', { bubbles: true }))

            expect(instance!.game.getCurrentAnswer()).toBe('abc')
        })

        it('correct answer should add green border temporarily', async () => {
            const instance = await startInitialized()

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
            const instance = await startInitialized()

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
            const instance = await startInitialized()
            instance!.game['updateTime'](10)

            const el = document.getElementById('time-remaining')!
            expect(el.classList.contains('text-red-400')).toBe(true)
            expect(el.classList.contains('text-cyan-400')).toBe(false)
        })

        it('onChallengeUpdate should color easy words green', async () => {
            const instance = await startInitialized()
            ;(instance!.game['callbacks'] as any).onChallengeUpdate?.({
                id: 'c1',
                originalWord: 'cat',
                scrambledWord: 'tac',
                difficulty: 'easy',
                points: 10,
            })
            const el = document.getElementById('scrambled-word')!
            expect(el.classList.contains('text-green-400')).toBe(true)
        })

        it('end game should disable the input controls', async () => {
            const instance = await startInitialized()

            await instance!.endGame()

            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            const submitBtn = document.getElementById('submit-answer')!
            const skipBtn = document.getElementById('skip-word')!

            expect(answerInput.disabled).toBe(true)
            expect(submitBtn.hasAttribute('disabled')).toBe(true)
            expect(skipBtn.hasAttribute('disabled')).toBe(true)
        })

        it('restart should start a fresh game', async () => {
            const instance = await startInitialized()
            const answerInput = document.getElementById(
                'answer-input'
            ) as HTMLInputElement
            answerInput.value =
                instance!.getState().currentChallenge!.originalWord
            document.getElementById('submit-answer')!.click()
            expect(instance!.getState().wordsUnscrambled).toBe(1)

            instance!.restart()

            expect(instance!.getState().wordsUnscrambled).toBe(0)
            expect(instance!.getState().score).toBe(0)
            expect(instance!.getState().isActive).toBe(true)
        })

        it('cleanup should not throw', async () => {
            const instance = await initWordScrambleGameFramework(document.body)
            expect(() => instance!.cleanup()).not.toThrow()
        })

        it('should call showAchievementAward when achievements are earned', async () => {
            const wordMaster: AchievementNotification = {
                id: 'word_master',
                name: 'Word Master',
                description: 'Unscrambled many words',
                icon: '📖',
                rarity: AchievementRarity.RARE,
            }
            vi.mocked(submitScore).mockResolvedValueOnce({
                success: true,
                newAchievements: [wordMaster],
            })

            const showAchievementAward = vi.fn()
            vi.stubGlobal('showAchievementAward', showAchievementAward)

            const instance = await startInitialized()

            await instance!.endGame()

            expect(submitScore).toHaveBeenCalledTimes(1)
            expect(showAchievementAward).toHaveBeenCalledWith([wordMaster])

            vi.unstubAllGlobals()
        })

        it('should forward custom onEnd callback with the final score and stats', async () => {
            const onEnd = vi.fn()
            const instance = (await initWordScrambleGameFramework(
                document.body,
                {},
                { onEnd }
            ))!
            instance.game.start()
            await instance.endGame()
            expect(onEnd).toHaveBeenCalledWith(
                expect.any(Number),
                expect.objectContaining({ totalWords: expect.any(Number) })
            )
        })
    })

    describe('returned instance methods', () => {
        it('getState should return game state', async () => {
            const instance = await initWordScrambleGameFramework(document.body)
            const state = instance!.getState()
            expect(state).toBeDefined()
        })

        it('endGame should not throw', async () => {
            const instance = await initWordScrambleGameFramework(document.body)
            await expect(instance!.endGame()).resolves.not.toThrow()
        })
    })
})
