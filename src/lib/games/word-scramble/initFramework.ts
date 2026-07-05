import {
    WordScrambleGame,
    DEFAULT_WORD_SCRAMBLE_CONFIG,
} from './WordScrambleGame'
import type {
    WordScrambleConfig,
    WordScrambleStats,
    WordScrambleCallbacks,
} from './frameworkTypes'
import type { BaseGameStats, ChallengeUpdates } from '@/lib/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'

interface AchievementNotification {
    id: string
    name: string
    description: string
    icon: string
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

declare global {
    interface Window {
        showAchievementAward?: (achievements: AchievementNotification[]) => void
    }
}

export interface WordScrambleInitResult {
    game: WordScrambleGame
    cleanup: () => void
    restart: () => void
    getState: () => ReturnType<WordScrambleGame['getState']>
    endGame: () => Promise<void>
}

export async function initWordScrambleGameFramework(
    customConfig?: Partial<WordScrambleConfig>,
    customCallbacks?: WordScrambleCallbacks
): Promise<WordScrambleInitResult | undefined> {
    const scrambledWordElement = document.getElementById('scrambled-word')
    const answerInput = document.getElementById(
        'answer-input'
    ) as HTMLInputElement | null
    const submitButton = document.getElementById('submit-answer')
    const startButton = document.getElementById('start-btn')

    if (
        !scrambledWordElement ||
        !answerInput ||
        !submitButton ||
        !startButton
    ) {
        handleGameError(
            new DOMElementNotFoundError('word-scramble required elements'),
            'WordScramble'
        )
        return undefined
    }

    const config: WordScrambleConfig = {
        ...DEFAULT_WORD_SCRAMBLE_CONFIG,
        ...customConfig,
    }

    const skipButton = document.getElementById('skip-word')
    const endButton = document.getElementById('end-btn')
    const scoreElement = document.getElementById('score')
    const timeRemainingElement = document.getElementById('time-remaining')
    const currentWordsElement = document.getElementById('current-words')
    const currentCorrectElement = document.getElementById('current-correct')
    const currentScoreElement = document.getElementById('current-score')
    const gameOverOverlay = document.getElementById('game-over-overlay')
    const finalScoreElement = document.getElementById('final-score')
    const totalWordsElement = document.getElementById('total-words')
    const accuracyElement = document.getElementById('accuracy')
    const longestWordElement = document.getElementById('longest-word')

    const enhancedCallbacks: WordScrambleCallbacks = {
        ...customCallbacks,
        onScoreUpdate: (score: number) => {
            if (scoreElement) {
                scoreElement.textContent = score.toString()
            }
            if (currentScoreElement) {
                currentScoreElement.textContent = score.toString()
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: (timeRemaining: number) => {
            if (timeRemainingElement) {
                timeRemainingElement.textContent = timeRemaining.toString()
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
            if (startButton) {
                startButton.style.display = 'none'
            }
            if (endButton) {
                endButton.style.display = 'inline-flex'
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
            if (gameOverOverlay) {
                gameOverOverlay.classList.add('hidden')
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
            if (startButton) {
                startButton.style.display = 'inline-flex'
            }
            if (endButton) {
                endButton.style.display = 'none'
            }

            const wordStats = stats as WordScrambleStats
            if (finalScoreElement) {
                finalScoreElement.textContent = finalScore.toString()
            }
            if (totalWordsElement) {
                totalWordsElement.textContent = wordStats.totalWords.toString()
            }
            if (accuracyElement) {
                accuracyElement.textContent = `${Math.round(wordStats.accuracy)}%`
            }
            if (longestWordElement) {
                longestWordElement.textContent = wordStats.longestWord || 'None'
            }
            if (gameOverOverlay) {
                gameOverOverlay.classList.remove('hidden')
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

    const onGameEnd = (event: unknown) => {
        const data = (event as { data: unknown }).data as {
            newAchievements?: AchievementNotification[]
            challengeUpdates?: ChallengeUpdates
        }
        if (data?.newAchievements && data.newAchievements.length > 0) {
            if (
                typeof window !== 'undefined' &&
                typeof window.showAchievementAward === 'function'
            ) {
                window.showAchievementAward(data.newAchievements)
            }
        }
        if (data?.challengeUpdates?.completedChallenges?.length) {
            if (
                typeof window !== 'undefined' &&
                typeof window.showChallengeComplete === 'function'
            ) {
                window.showChallengeComplete(data.challengeUpdates)
            }
        }
    }
    game.on('end', onGameEnd)

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
            game.off('end', onGameEnd)
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
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    const skipBtn = document.getElementById('skip-word')
    const playAgainBtn = document.getElementById('play-again-btn')

    const startHandler = () => {
        game.reset()
        game.start()
    }

    const endHandler = () => {
        void game.end()
    }

    const skipHandler = () => {
        if (game.getState().isActive) {
            game.skipCurrentChallenge()
        }
    }

    const playAgainHandler = () => {
        game.reset()
        game.start()
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

    startBtn?.addEventListener('click', startHandler)
    endBtn?.addEventListener('click', endHandler)
    skipBtn?.addEventListener('click', skipHandler)
    playAgainBtn?.addEventListener('click', playAgainHandler)
    submitButton.addEventListener('click', submitHandler)
    answerInput.addEventListener('keydown', enterKeyHandler)
    answerInput.addEventListener('input', inputHandler)

    return () => {
        startBtn?.removeEventListener('click', startHandler)
        endBtn?.removeEventListener('click', endHandler)
        skipBtn?.removeEventListener('click', skipHandler)
        playAgainBtn?.removeEventListener('click', playAgainHandler)
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
