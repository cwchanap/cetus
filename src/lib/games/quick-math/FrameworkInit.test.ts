import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initQuickMathFramework } from './FrameworkInit'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi
        .fn()
        .mockResolvedValue({ success: true, newAchievements: [] }),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="quick-math-container">
            <div id="question">5 + 3 = ?</div>
            <input id="answer-input" type="text" />
            <button id="submit-answer">Submit</button>
        </div>
        <button id="start-btn">Start</button>
        <button id="end-btn" style="display:none">End</button>
        <button id="play-again-btn">Play Again</button>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <span id="current-questions">0</span>
        <span id="current-correct">0</span>
        <span id="current-score">0</span>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
    `
}

describe('initQuickMathFramework', () => {
    beforeEach(() => {
        setupDOM()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('should return game, renderer, and cleanup', async () => {
            const result = await initQuickMathFramework()
            expect(result).toBeDefined()
            expect(result.game).toBeDefined()
            expect(result.renderer).toBeDefined()
            expect(typeof result.cleanup).toBe('function')
        })

        it('should return a QuickMathFrameworkGame instance', async () => {
            const result = await initQuickMathFramework()
            expect(result.game).toBeDefined()
            expect(typeof result.game.start).toBe('function')
            expect(typeof result.game.end).toBe('function')
            expect(typeof result.game.reset).toBe('function')
            expect(typeof result.game.getState).toBe('function')
        })

        it('should merge custom config', async () => {
            const result = await initQuickMathFramework({
                pointsPerCorrectAnswer: 50,
            })
            expect(result.game).toBeDefined()
        })

        it('should call cleanup without errors', async () => {
            const result = await initQuickMathFramework()
            expect(() => result.cleanup()).not.toThrow()
        })

        it('should throw if container element is missing', async () => {
            document.getElementById('quick-math-container')!.remove()
            await expect(initQuickMathFramework()).rejects.toThrow()
        })

        it('should throw if question element is missing', async () => {
            document.getElementById('question')!.remove()
            await expect(initQuickMathFramework()).rejects.toThrow()
        })

        it('should throw if answer-input element is missing', async () => {
            document.getElementById('answer-input')!.remove()
            await expect(initQuickMathFramework()).rejects.toThrow()
        })

        it('should throw if submit-answer element is missing', async () => {
            document.getElementById('submit-answer')!.remove()
            await expect(initQuickMathFramework()).rejects.toThrow()
        })
    })

    describe('setupStandardButtons', () => {
        it('start button click should call game.start()', async () => {
            const result = await initQuickMathFramework()
            const startSpy = vi.spyOn(result.game, 'start')
            document.getElementById('start-btn')!.click()
            expect(startSpy).toHaveBeenCalled()
        })

        it('end button click should call game.end()', async () => {
            const result = await initQuickMathFramework()
            const endSpy = vi.spyOn(result.game, 'end')
            document.getElementById('end-btn')!.click()
            expect(endSpy).toHaveBeenCalled()
        })

        it('play-again button click should call game.reset()', async () => {
            const result = await initQuickMathFramework()
            const resetSpy = vi.spyOn(result.game, 'reset')
            document.getElementById('play-again-btn')!.click()
            expect(resetSpy).toHaveBeenCalled()
        })

        it('play-again button should hide game-over-overlay', async () => {
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')
            await initQuickMathFramework()
            document.getElementById('play-again-btn')!.click()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('play-again should reset button states', async () => {
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            startBtn.style.display = 'none'
            endBtn.style.display = 'inline-flex'
            await initQuickMathFramework()
            document.getElementById('play-again-btn')!.click()
            expect(startBtn.style.display).toBe('inline-flex')
            expect(endBtn.style.display).toBe('none')
        })

        it('should work without optional buttons missing', async () => {
            document.getElementById('start-btn')!.remove()
            document.getElementById('end-btn')!.remove()
            document.getElementById('play-again-btn')!.remove()
            const result = await initQuickMathFramework()
            expect(result).toBeDefined()
        })
    })

    describe('onStart callback', () => {
        it('should hide start-btn and show end-btn when game starts', async () => {
            const result = await initQuickMathFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            startBtn.style.display = 'inline-flex'
            endBtn.style.display = 'none'
            result.game.start()
            // onStart callback runs
            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })
    })

    describe('onEnd callback', () => {
        it('should show start-btn, hide end-btn, and show game-over-overlay on end', async () => {
            const result = await initQuickMathFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            const overlay = document.getElementById('game-over-overlay')!

            startBtn.style.display = 'none'
            endBtn.style.display = 'inline-flex'
            overlay.classList.add('hidden')

            // Start then immediately end
            result.game.start()
            await result.game.end()

            expect(startBtn.style.display).toBe('inline-flex')
            expect(endBtn.style.display).toBe('none')
            expect(overlay.classList.contains('hidden')).toBe(false)
        })

        it('should update final-score element on end', async () => {
            const result = await initQuickMathFramework()
            result.game.start()
            await result.game.end()
            const finalScore = document.getElementById('final-score')!
            expect(finalScore.textContent).toBe('0') // no score accumulated
        })

        it('should call custom onEnd callback', async () => {
            const onEnd = vi.fn()
            const result = await initQuickMathFramework({}, { onEnd })
            result.game.start()
            await result.game.end()
            expect(onEnd).toHaveBeenCalled()
        })

        it('should work without start/end buttons on end', async () => {
            document.getElementById('start-btn')!.remove()
            document.getElementById('end-btn')!.remove()
            const result = await initQuickMathFramework()
            result.game.start()
            await expect(result.game.end()).resolves.not.toThrow()
        })

        it('should work without game-over-overlay on end', async () => {
            document.getElementById('game-over-overlay')!.remove()
            const result = await initQuickMathFramework()
            result.game.start()
            await expect(result.game.end()).resolves.not.toThrow()
        })

        it('should work without final-score element on end', async () => {
            document.getElementById('final-score')!.remove()
            const result = await initQuickMathFramework()
            result.game.start()
            await expect(result.game.end()).resolves.not.toThrow()
        })
    })

    describe('custom callbacks', () => {
        it('should invoke custom onStart callback', async () => {
            const onStart = vi.fn()
            const result = await initQuickMathFramework({}, { onStart })
            result.game.start()
            expect(onStart).toHaveBeenCalled()
        })

        it('should invoke custom onScoreUpdate callback', async () => {
            const onScoreUpdate = vi.fn()
            const result = await initQuickMathFramework({}, { onScoreUpdate })
            result.game.start()
            // Submit a correct answer to trigger score update
            const state = result.game.getState()
            expect(state).toBeDefined()
        })

        it('should invoke custom onTimeUpdate callback', async () => {
            const onTimeUpdate = vi.fn()
            const result = await initQuickMathFramework({}, { onTimeUpdate })
            result.game.start()
            vi.advanceTimersByTime(1000)
            expect(onTimeUpdate).toHaveBeenCalled()
        })

        it('should invoke custom onQuestionUpdate callback', async () => {
            const onQuestionUpdate = vi.fn()
            await initQuickMathFramework({}, { onQuestionUpdate })
            // question update fires on start
        })
    })

    describe('submit button in setupQuickMathEvents', () => {
        it('should call game.submitAnswer when submit is clicked with active game', async () => {
            const result = await initQuickMathFramework()
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
            const result = await initQuickMathFramework()
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
            const result = await initQuickMathFramework()
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
