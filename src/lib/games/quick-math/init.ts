import { QuickMathGame } from './game'
import type { GameConfig, GameCallbacks } from './types'
import { submitScore } from '../../score-client'

let gameInstance: QuickMathGame | null = null
let gameCallbacks: GameCallbacks | null = null

export async function initQuickMathGame(): Promise<void> {
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
    const submitButton = document.getElementById('submit-answer')
    const startButton = document.getElementById('start-btn')
    const gameOverOverlay = document.getElementById('game-over-overlay')
    const finalScoreElement = document.getElementById('final-score')
    const accuracyElement = document.getElementById('accuracy')
    const totalQuestionsElement = document.getElementById('total-questions')
    const playAgainButton = document.getElementById('play-again-btn')

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
        console.error('Required DOM elements not found')
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
        onGameOver: (finalScore, stats) => {
            finalScoreElement.textContent = finalScore.toString()
            accuracyElement.textContent = `${stats.accuracy.toFixed(1)}%`
            totalQuestionsElement.textContent = stats.totalQuestions.toString()

            gameOverOverlay.classList.remove('hidden')
            answerInput.disabled = true
            submitButton.disabled = true

            // Save score to backend
            saveScore(finalScore)
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
    submitButton.addEventListener('click', handleSubmit)
    startButton.addEventListener('click', handleStart)
    playAgainButton.addEventListener('click', handlePlayAgain)

    // Handle Enter key for submission
    answerInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            handleSubmit()
        }
    })

    // Handle input changes
    answerInput.addEventListener('input', e => {
        const target = e.target as HTMLInputElement
        if (gameInstance) {
            gameInstance.updateCurrentAnswer(target.value)
        }
    })

    // Only allow numeric input
    answerInput.addEventListener('keydown', e => {
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
    })

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (gameInstance) {
            gameInstance.destroy()
        }
    })
}

async function saveScore(score: number): Promise<void> {
    try {
        const success = await submitScore({
            gameId: 'quick_math',
            score: score,
        })

        if (success) {
            console.log('Score saved successfully!')
        } else {
            console.warn('Failed to save score')
        }

        // Notify via callback if available
        if (gameCallbacks?.onScoreUpload) {
            gameCallbacks.onScoreUpload(success)
        }
    } catch (error) {
        console.warn('Error saving score:', error)

        // Notify via callback if available
        if (gameCallbacks?.onScoreUpload) {
            gameCallbacks.onScoreUpload(false)
        }
    }
}

export { gameInstance }
