import { QuickMathGame } from './game'
import type { GameConfig, GameCallbacks, GameStats, GameState } from './types'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

let gameInstance: QuickMathGame | null = null
let gameCallbacks: GameCallbacks | null = null

export async function initQuickMathGame(externalCallbacks?: {
    onGameOver?: (finalScore: number, stats: GameStats) => void
}): Promise<void | {
    restart: () => void | undefined
    getState: () => GameState | undefined
    endGame: () => void | undefined
    callbacks: GameCallbacks
}> {
    // Game configuration
    const config: GameConfig = {
        gameDuration: 60, // 60 seconds
        pointsPerCorrectAnswer: 20,
        maxNumber: 999, // numbers up to 999
        operations: ['addition', 'subtraction'],
    }

    // Get DOM elements
    const scoreElement = document.getElementById('score')
    const timeElement = document.getElementById('time-remaining')
    const questionElement = document.getElementById('question')
    const answerInput = document.getElementById(
        'answer-input'
    ) as HTMLInputElement
    const submitButton = document.getElementById(
        'submit-answer'
    ) as HTMLButtonElement
    const startButton = document.getElementById(
        'start-btn'
    ) as HTMLButtonElement
    const gameOverOverlay = document.getElementById('game-over-overlay')
    const finalScoreElement = document.getElementById('final-score')
    const accuracyElement = document.getElementById('accuracy')
    const totalQuestionsElement = document.getElementById('total-questions')
    const playAgainButton = document.getElementById(
        'play-again-btn'
    ) as HTMLButtonElement

    // Session stats elements
    const currentQuestionsElement = document.getElementById('current-questions')
    const currentCorrectElement = document.getElementById('current-correct')
    const currentScoreElement = document.getElementById('current-score')

    if (
        !scoreElement ||
        !timeElement ||
        !questionElement ||
        !answerInput ||
        !submitButton ||
        !startButton ||
        !gameOverOverlay ||
        !finalScoreElement ||
        !accuracyElement ||
        !totalQuestionsElement ||
        !playAgainButton
    ) {
        return
    }

    // Game callbacks
    const callbacks: GameCallbacks = {
        onScoreUpdate: (score: number) => {
            scoreElement.textContent = score.toString()
            if (currentScoreElement) {
                currentScoreElement.textContent = score.toString()
            }
        },
        onTimeUpdate: (timeRemaining: number) => {
            timeElement.textContent = timeRemaining.toString()

            // Add warning color when time is running out
            if (timeRemaining <= 10) {
                timeElement.classList.add('text-red-400')
                timeElement.classList.remove('text-cyan-400')
            } else {
                timeElement.classList.add('text-cyan-400')
                timeElement.classList.remove('text-red-400')
            }
        },
        onQuestionUpdate: question => {
            questionElement.textContent = question.question
            answerInput.value = ''
            answerInput.focus()
        },
        onGameOver: async (finalScore, stats) => {
            finalScoreElement.textContent = finalScore.toString()
            accuracyElement.textContent = `${stats.accuracy.toFixed(1)}%`
            totalQuestionsElement.textContent = stats.totalQuestions.toString()

            gameOverOverlay.classList.remove('hidden')
            answerInput.disabled = true
            submitButton.disabled = true

            // Call external callback if provided
            if (externalCallbacks?.onGameOver) {
                await externalCallbacks.onGameOver(finalScore, stats)
            } else {
                // Fallback to original behavior
                saveScore(finalScore)
            }
        },
        onGameStart: () => {
            gameOverOverlay.classList.add('hidden')
            answerInput.disabled = false
            submitButton.disabled = false
            startButton.textContent = 'Playing...'
            startButton.disabled = true

            // Reset session stats
            if (currentQuestionsElement) {
                currentQuestionsElement.textContent = '0'
            }
            if (currentCorrectElement) {
                currentCorrectElement.textContent = '0'
            }
            if (currentScoreElement) {
                currentScoreElement.textContent = '0'
            }
        },
        onScoreUpload: (success: boolean) => {
            // Add visual feedback for score upload status
            const scoreStatus = document.createElement('div')
            scoreStatus.className = `text-sm mt-2 ${success ? 'text-green-400' : 'text-yellow-400'}`
            scoreStatus.textContent = success
                ? 'Score saved!'
                : 'Score not saved (offline?)'

            // Add the status message to the game over overlay
            const gameOverContent = gameOverOverlay.querySelector('.space-y-4')
            if (gameOverContent) {
                gameOverContent.appendChild(scoreStatus)

                // Remove the status message after 3 seconds
                setTimeout(() => {
                    if (scoreStatus.parentNode) {
                        scoreStatus.parentNode.removeChild(scoreStatus)
                    }
                }, 3000)
            }
        },
    }

    // Store callbacks for use in other functions
    gameCallbacks = callbacks

    // Initialize game
    gameInstance = new QuickMathGame(config, callbacks)

    const abortController = new AbortController()
    const { signal } = abortController

    // Set up event listeners
    const handleSubmit = () => {
        if (!gameInstance || !gameInstance.isGameActive()) {
            return
        }

        const answer = answerInput.value.trim()
        if (answer === '') {
            return
        }

        const isCorrect = gameInstance.submitAnswer(answer)

        // Update session stats
        const state = gameInstance.getState()
        if (currentQuestionsElement) {
            currentQuestionsElement.textContent =
                state.questionsAnswered.toString()
        }
        if (currentCorrectElement) {
            currentCorrectElement.textContent = state.correctAnswers.toString()
        }

        // Visual feedback
        if (isCorrect) {
            answerInput.classList.add('border-green-400')
            answerInput.classList.remove('border-red-400')
        } else {
            answerInput.classList.add('border-red-400')
            answerInput.classList.remove('border-green-400')
        }

        // Reset border color after a short delay
        setTimeout(() => {
            answerInput.classList.remove('border-green-400', 'border-red-400')
        }, 300)
    }

    const handleStart = () => {
        if (gameInstance) {
            gameInstance.startGame()
        }
    }

    const handlePlayAgain = () => {
        if (gameInstance) {
            gameInstance.startGame()
            startButton.textContent = 'Start Game'
            startButton.disabled = false
        }
    }

    // Event listeners
    submitButton.addEventListener('click', handleSubmit, { signal })
    startButton.addEventListener('click', handleStart, { signal })
    playAgainButton.addEventListener('click', handlePlayAgain, { signal })

    // Handle Enter key for submission
    answerInput.addEventListener(
        'keypress',
        e => {
            if (e.key === 'Enter') {
                handleSubmit()
            }
        },
        { signal }
    )

    // Handle input changes
    answerInput.addEventListener(
        'input',
        e => {
            const target = e.target as HTMLInputElement
            if (gameInstance) {
                gameInstance.updateCurrentAnswer(target.value)
            }
        },
        { signal }
    )

    // Only allow numeric input
    answerInput.addEventListener(
        'keydown',
        e => {
            // Allow backspace, delete, arrow keys, and numeric keys
            if (
                !/[0-9]/.test(e.key) &&
                ![
                    'Backspace',
                    'Delete',
                    'ArrowLeft',
                    'ArrowRight',
                    'Tab',
                    'Enter',
                ].includes(e.key)
            ) {
                e.preventDefault()
            }
        },
        { signal }
    )

    // Cleanup on page unload
    window.addEventListener(
        'beforeunload',
        () => {
            if (gameInstance) {
                gameInstance.destroy()
            }
        },
        { signal }
    )

    // Return game instance for external control
    return {
        restart: () => gameInstance?.startGame(),
        getState: () => gameInstance?.getState(),
        endGame: () => gameInstance?.endGame(),
        callbacks: callbacks,
        cleanup: () => {
            abortController.abort()
            gameInstance?.destroy()
        },
    }
}

async function saveScore(score: number): Promise<void> {
    await saveGameScore(
        GameID.QUICK_MATH,
        score,
        result => {
            // Handle newly earned achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                // Dispatch an event for achievement notifications
                window.dispatchEvent(
                    new CustomEvent('achievementsEarned', {
                        detail: { achievementIds: result.newAchievements },
                    })
                )
            }

            // Notify via callback if available
            if (gameCallbacks?.onScoreUpload) {
                gameCallbacks.onScoreUpload(true)
            }
        },
        (_error: string) => {
            // Notify via callback if available
            if (gameCallbacks?.onScoreUpload) {
                gameCallbacks.onScoreUpload(false)
            }
        },
        // Include achievement flags in gameData for in-game achievements
        gameInstance?.getAchievementFlags()
    )
}

export { gameInstance }
