import {
    WordScrambleGame,
    DEFAULT_WORD_SCRAMBLE_CONFIG,
} from '@cetus/games/word-scramble/WordScrambleGame'
import type {
    WordScrambleConfig,
    WordScrambleCallbacks,
} from '@cetus/games/word-scramble/frameworkTypes'
import type { BaseGameStats } from '@cetus/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@cetus/games/core/errors'

import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

export interface WordScrambleInitResult {
    game: WordScrambleGame
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<WordScrambleGame['getState']>
    endGame: () => Promise<void>
}

export async function initWordScrambleGameFramework(
    // The island-owned board host (HPA-393). Every interactive element is
    // resolved by its frozen page id, so the host itself is unused here.
    _container: HTMLElement,
    customConfig?: Partial<WordScrambleConfig>,
    customCallbacks?: WordScrambleCallbacks
): Promise<WordScrambleInitResult | undefined> {
    const scrambledWordElement = document.getElementById('scrambled-word')
    const answerInput = document.getElementById(
        'answer-input'
    ) as HTMLInputElement | null
    const submitButton = document.getElementById('submit-answer')

    if (!scrambledWordElement || !answerInput || !submitButton) {
        handleGameError(
            new DOMElementNotFoundError('word-scramble required elements'),
            'WordScramble'
        )
        return undefined
    }

    const config: WordScrambleConfig = {
        ...DEFAULT_WORD_SCRAMBLE_CONFIG,
        ...customConfig,
        submitScore: customConfig?.submitScore ?? submitScore,
    }

    const skipButton = document.getElementById('skip-word')
    const timeRemainingElement = document.getElementById('time-remaining')
    const currentWordsElement = document.getElementById('current-words')
    const currentCorrectElement = document.getElementById('current-correct')
    const currentScoreElement = document.getElementById('current-score')

    // React owns the HUD badges, shared buttons and overlay (HPA-393): the
    // callbacks keep only the bespoke board/input writers — the scrambled
    // word + difficulty tint, input enable/disable + focus, the
    // board-embedded session counters and the shared badge's low-time tint.
    const enhancedCallbacks: WordScrambleCallbacks = {
        ...customCallbacks,
        onScoreUpdate: (score: number) => {
            if (currentScoreElement) {
                currentScoreElement.textContent = score.toString()
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: (timeRemaining: number) => {
            if (timeRemainingElement) {
                if (timeRemaining <= 10) {
                    timeRemainingElement.classList.add('text-red-400')
                    timeRemainingElement.classList.remove('text-cyan-400')
                } else {
                    timeRemainingElement.classList.add('text-cyan-400')
                    timeRemainingElement.classList.remove('text-red-400')
                }
            }
            customCallbacks?.onTimeUpdate?.(timeRemaining)
        },
        onChallengeUpdate: challenge => {
            if (scrambledWordElement) {
                scrambledWordElement.textContent =
                    challenge.scrambledWord.toUpperCase()
                scrambledWordElement.className =
                    scrambledWordElement.className.replace(
                        /text-(green|yellow|red)-400/g,
                        ''
                    )
                switch (challenge.difficulty) {
                    case 'easy':
                        scrambledWordElement.classList.add('text-green-400')
                        break
                    case 'medium':
                        scrambledWordElement.classList.add('text-yellow-400')
                        break
                    case 'hard':
                        scrambledWordElement.classList.add('text-red-400')
                        break
                }
            }
            if (answerInput) {
                answerInput.value = ''
                answerInput.focus()
            }
            customCallbacks?.onChallengeUpdate?.(challenge)
        },
        onStart: () => {
            if (answerInput) {
                answerInput.disabled = false
                answerInput.focus()
            }
            if (submitButton) {
                submitButton.removeAttribute('disabled')
            }
            if (skipButton) {
                skipButton.removeAttribute('disabled')
            }
            if (currentWordsElement) {
                currentWordsElement.textContent = '0'
            }
            if (currentCorrectElement) {
                currentCorrectElement.textContent = '0'
            }
            if (currentScoreElement) {
                currentScoreElement.textContent = '0'
            }
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            if (answerInput) {
                answerInput.disabled = true
            }
            if (submitButton) {
                submitButton.setAttribute('disabled', 'true')
            }
            if (skipButton) {
                skipButton.setAttribute('disabled', 'true')
            }
            customCallbacks?.onEnd?.(finalScore, stats)
        },
        onCorrectAnswer: (_word: string) => {
            const state = game.getState()
            if (currentWordsElement) {
                currentWordsElement.textContent =
                    state.wordsUnscrambled.toString()
            }
            if (currentCorrectElement) {
                currentCorrectElement.textContent =
                    state.correctAnswers.toString()
            }
            if (answerInput) {
                answerInput.classList.add('border-green-400')
                setTimeout(() => {
                    answerInput.classList.remove('border-green-400')
                }, 500)
            }
            customCallbacks?.onCorrectAnswer?.(_word)
        },
        onIncorrectAnswer: (_word: string, _userAnswer: string) => {
            const state = game.getState()
            if (currentWordsElement) {
                currentWordsElement.textContent =
                    state.wordsUnscrambled.toString()
            }
            if (answerInput) {
                answerInput.classList.add('border-red-400')
                setTimeout(() => {
                    answerInput.classList.remove('border-red-400')
                }, 500)
            }
            customCallbacks?.onIncorrectAnswer?.(_word, _userAnswer)
        },
    }

    const game = new WordScrambleGame(config, enhancedCallbacks)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); replaces the former per-game toast bridge.
    const removeForwarder = forwardBaseGameResults(game)

    const cleanupButtonHandlers = setupButtonHandlers(
        game,
        answerInput,
        submitButton
    )
    const cleanupUnloadWarning = setupUnloadWarning(game)

    return {
        game,
        cleanup: () => {
            cleanupButtonHandlers()
            cleanupUnloadWarning()
            removeForwarder()
            game.destroy()
        },
        restart: () => {
            game.reset()
            game.start()
        },
        getState: () => game.getState(),
        endGame: () => game.end(),
    }
}

function setupButtonHandlers(
    game: WordScrambleGame,
    answerInput: HTMLInputElement,
    submitButton: HTMLElement
): () => void {
    const skipBtn = document.getElementById('skip-word')

    const skipHandler = () => {
        if (game.getState().isActive) {
            game.skipCurrentChallenge()
        }
    }

    const submitHandler = () => {
        if (game.getState().isActive) {
            game.submitAnswer(answerInput.value)
        }
    }

    const enterKeyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && game.getState().isActive) {
            game.submitAnswer(answerInput.value)
        }
    }

    const inputHandler = (e: Event) => {
        game.updateCurrentAnswer((e.target as HTMLInputElement).value)
    }

    skipBtn?.addEventListener('click', skipHandler)
    submitButton.addEventListener('click', submitHandler)
    answerInput.addEventListener('keydown', enterKeyHandler)
    answerInput.addEventListener('input', inputHandler)

    return () => {
        skipBtn?.removeEventListener('click', skipHandler)
        submitButton.removeEventListener('click', submitHandler)
        answerInput.removeEventListener('keydown', enterKeyHandler)
        answerInput.removeEventListener('input', inputHandler)
    }
}

function setupUnloadWarning(game: WordScrambleGame): () => void {
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        const state = game.getState()
        if (state.gameStarted && !state.isGameOver) {
            e.preventDefault()
            const message =
                'You have a game in progress. Are you sure you want to leave?'
            e.returnValue = message
            return message
        }
    }

    window.addEventListener('beforeunload', beforeUnloadHandler)

    return () => {
        window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
}
