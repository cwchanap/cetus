import { WordScrambleGame } from './game'
import type { GameConfig, GameCallbacks, GameStats } from './types'
import { submitScore } from '@/lib/score-client'
import { GameID } from '@/lib/games'

// Game configuration
const GAME_CONFIG: GameConfig = {
    gameDuration: 60, // 60 seconds
    pointsPerWord: {
        easy: 10,
        medium: 20,
        hard: 30,
    },
    wordCategories: ['general'],
    minWordLength: 3,
    maxWordLength: 12,
}

let gameInstance: WordScrambleGame | null = null

export async function initWordScrambleGame(): Promise<void> {
    // Get DOM elements
    const scrambledWordElement = document.getElementById('scrambled-word')
    const answerInput = document.getElementById(
        'answer-input'
    ) as HTMLInputElement
    const submitButton = document.getElementById('submit-answer')
    const skipButton = document.getElementById('skip-word')
    const startButton = document.getElementById('start-btn')
    const playAgainButton = document.getElementById('play-again-btn')

    // Score and timer elements
    const scoreElement = document.getElementById('score')
    const timeRemainingElement = document.getElementById('time-remaining')

    // Stats elements
    const currentWordsElement = document.getElementById('current-words')
    const currentCorrectElement = document.getElementById('current-correct')
    const currentScoreElement = document.getElementById('current-score')

    // Game over elements
    const gameOverOverlay = document.getElementById('game-over-overlay')
    const finalScoreElement = document.getElementById('final-score')
    const totalWordsElement = document.getElementById('total-words')
    const accuracyElement = document.getElementById('accuracy')
    const longestWordElement = document.getElementById('longest-word')

    if (
        !scrambledWordElement ||
        !answerInput ||
        !submitButton ||
        !startButton
    ) {
        return
    }

    // Game callbacks
    const callbacks: GameCallbacks = {
        onScoreUpdate: (score: number) => {
            if (scoreElement) {
                scoreElement.textContent = score.toString()
            }
            if (currentScoreElement) {
                currentScoreElement.textContent = score.toString()
            }
        },

        onTimeUpdate: (timeRemaining: number) => {
            if (timeRemainingElement) {
                timeRemainingElement.textContent = timeRemaining.toString()

                // Add visual warning when time is low
                if (timeRemaining <= 10) {
                    timeRemainingElement.classList.add('text-red-400')
                    timeRemainingElement.classList.remove('text-cyan-400')
                } else {
                    timeRemainingElement.classList.add('text-cyan-400')
                    timeRemainingElement.classList.remove('text-red-400')
                }
            }
        },

        onChallengeUpdate: challenge => {
            if (scrambledWordElement) {
                scrambledWordElement.textContent =
                    challenge.scrambledWord.toUpperCase()

                // Add difficulty color coding
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

            // Clear input and focus
            if (answerInput) {
                answerInput.value = ''
                answerInput.focus()
            }
        },

        onGameStart: () => {
            // Enable game controls
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

            // Hide start button
            if (startButton) {
                startButton.style.display = 'none'
            }

            // Reset stats
            if (currentWordsElement) {
                currentWordsElement.textContent = '0'
            }
            if (currentCorrectElement) {
                currentCorrectElement.textContent = '0'
            }
            if (currentScoreElement) {
                currentScoreElement.textContent = '0'
            }

            // Hide game over overlay
            if (gameOverOverlay) {
                gameOverOverlay.classList.add('hidden')
            }
        },

        onCorrectAnswer: (word: string) => {
            // Update stats
            if (gameInstance) {
                const state = gameInstance.getState()
                if (currentWordsElement) {
                    currentWordsElement.textContent =
                        state.wordsUnscrambled.toString()
                }
                if (currentCorrectElement) {
                    currentCorrectElement.textContent =
                        state.correctAnswers.toString()
                }
            }

            // Visual feedback
            if (answerInput) {
                answerInput.classList.add('border-green-400')
                setTimeout(() => {
                    answerInput.classList.remove('border-green-400')
                }, 500)
            }
        },

        onIncorrectAnswer: (word: string, userAnswer: string) => {
            // Update stats
            if (gameInstance) {
                const state = gameInstance.getState()
                if (currentWordsElement) {
                    currentWordsElement.textContent =
                        state.wordsUnscrambled.toString()
                }
            }

            // Visual feedback
            if (answerInput) {
                answerInput.classList.add('border-red-400')
                setTimeout(() => {
                    answerInput.classList.remove('border-red-400')
                }, 500)
            }
        },

        onGameOver: async (finalScore: number, stats: GameStats) => {
            // Disable game controls
            if (answerInput) {
                answerInput.disabled = true
            }
            if (submitButton) {
                submitButton.setAttribute('disabled', 'true')
            }
            if (skipButton) {
                skipButton.setAttribute('disabled', 'true')
            }

            // Show start button again
            if (startButton) {
                startButton.style.display = 'block'
            }

            // Update final stats
            if (finalScoreElement) {
                finalScoreElement.textContent = finalScore.toString()
            }
            if (totalWordsElement) {
                totalWordsElement.textContent = stats.totalWords.toString()
            }
            if (accuracyElement) {
                accuracyElement.textContent = `${Math.round(stats.accuracy)}%`
            }
            if (longestWordElement) {
                longestWordElement.textContent = stats.longestWord || 'None'
            }

            // Show game over overlay
            if (gameOverOverlay) {
                gameOverOverlay.classList.remove('hidden')
            }

            // Upload score
            try {
                const success = await submitScore({
                    gameId: GameID.WORD_SCRAMBLE,
                    score: finalScore,
                })
                callbacks.onScoreUpload?.(success)
            } catch (error) {
                callbacks.onScoreUpload?.(false)
            }
        },

        onScoreUpload: (success: boolean) => {
            // Score upload completed
        },
    }

    // Initialize game instance
    gameInstance = new WordScrambleGame(GAME_CONFIG, callbacks)

    // Event listeners
    if (startButton) {
        startButton.addEventListener('click', () => {
            gameInstance?.startGame()
        })
    }

    if (submitButton) {
        submitButton.addEventListener('click', () => {
            if (answerInput && gameInstance?.isGameActive()) {
                gameInstance.submitAnswer(answerInput.value)
            }
        })
    }

    if (skipButton) {
        skipButton.addEventListener('click', () => {
            if (gameInstance?.isGameActive()) {
                gameInstance.skipCurrentChallenge()
            }
        })
    }

    if (playAgainButton) {
        playAgainButton.addEventListener('click', () => {
            gameInstance?.startGame()
        })
    }

    // Enter key to submit answer
    if (answerInput) {
        answerInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && gameInstance?.isGameActive()) {
                gameInstance.submitAnswer(answerInput.value)
            }
        })

        // Update current answer as user types
        answerInput.addEventListener('input', e => {
            if (gameInstance) {
                gameInstance.updateCurrentAnswer(
                    (e.target as HTMLInputElement).value
                )
            }
        })
    }

    // Cleanup function
    window.addEventListener('beforeunload', () => {
        gameInstance?.destroy()
    })
}
