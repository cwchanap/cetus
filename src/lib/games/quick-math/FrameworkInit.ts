import {
    QuickMathFrameworkGame,
    type QuickMathConfig,
    type QuickMathCallbacks,
    type MathQuestion,
    type QuickMathStats,
} from './FrameworkGame'
import {
    QuickMathRenderer,
    type QuickMathRendererConfig,
} from './FrameworkRenderer'
import { GameID } from '@/lib/games'
import type { BaseGameCallbacks, BaseGameStats } from '@/lib/games/core/types'

// Default configuration for Quick Math
const DEFAULT_CONFIG: QuickMathConfig = {
    duration: 60, // 60 seconds
    achievementIntegration: true,
    pausable: false,
    resettable: true,
    pointsPerCorrectAnswer: 20,
    maxNumber: 999,
    operations: ['addition', 'subtraction'],
}

// Default renderer configuration
const DEFAULT_RENDERER_CONFIG: QuickMathRendererConfig = {
    type: 'dom',
    container: '#quick-math-container',
    questionContainer: '#question',
    answerInput: '#answer-input',
    submitButton: '#submit-answer',
}

export interface QuickMathFrameworkCallbacks extends BaseGameCallbacks {
    onQuestionUpdate?: (question: MathQuestion) => void
    onAnswerSubmit?: (
        correct: boolean,
        question: MathQuestion,
        answer: string
    ) => void
}

export async function initQuickMathFramework(
    customConfig?: Partial<QuickMathConfig>,
    customCallbacks?: QuickMathFrameworkCallbacks
): Promise<{
    game: QuickMathFrameworkGame
    renderer: QuickMathRenderer
    cleanup: () => void
}> {
    // Merge configurations
    const config: QuickMathConfig = { ...DEFAULT_CONFIG, ...customConfig }
    const rendererConfig = { ...DEFAULT_RENDERER_CONFIG }

    // Create renderer
    const renderer = new QuickMathRenderer(rendererConfig)
    await renderer.initialize()

    // Create game with enhanced callbacks
    const enhancedCallbacks: QuickMathCallbacks = {
        ...customCallbacks,
        onQuestionUpdate: (question: MathQuestion) => {
            renderer.renderQuestion(question)
            if (customCallbacks?.onQuestionUpdate) {
                customCallbacks.onQuestionUpdate(question)
            }
        },
        onAnswerSubmit: (
            correct: boolean,
            question: MathQuestion,
            answer: string
        ) => {
            if (customCallbacks?.onAnswerSubmit) {
                customCallbacks.onAnswerSubmit(correct, question, answer)
            }
        },
        onScoreUpdate: (score: number) => {
            if (customCallbacks?.onScoreUpdate) {
                customCallbacks.onScoreUpdate(score)
            }
        },
        onTimeUpdate: (timeRemaining: number) => {
            if (customCallbacks?.onTimeUpdate) {
                customCallbacks.onTimeUpdate(timeRemaining)
            }
        },
        onStart: () => {
            // Update button states
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            if (startBtn && endBtn) {
                startBtn.style.display = 'none'
                endBtn.style.display = 'inline-flex'
            }
            if (customCallbacks?.onStart) {
                customCallbacks.onStart()
            }
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            // Cast stats for rendering - the actual stats will be QuickMathStats from the game
            const gameStats = game.getGameStats()

            // Update button states
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            if (startBtn && endBtn) {
                startBtn.style.display = 'inline-flex'
                endBtn.style.display = 'none'
            }

            // Show game over overlay
            const gameOverOverlay = document.getElementById('game-over-overlay')
            if (gameOverOverlay) {
                gameOverOverlay.classList.remove('hidden')
            }

            // Update final score
            const finalScoreElement = document.getElementById('final-score')
            if (finalScoreElement) {
                finalScoreElement.textContent = finalScore.toString()
            }

            renderer.renderStats(gameStats)

            if (customCallbacks?.onEnd) {
                customCallbacks.onEnd(finalScore, stats)
            }
        },
    }

    // Create game
    const game = new QuickMathFrameworkGame(
        GameID.QUICK_MATH,
        config,
        enhancedCallbacks
    )

    // Set up Quick Math specific event handlers
    setupQuickMathEvents(game, renderer)

    // Set up standard button handlers
    setupStandardButtons(game)

    return {
        game,
        renderer,
        cleanup: () => {
            renderer.cleanup()
            game.destroy()
        },
    }
}

function setupQuickMathEvents(
    game: QuickMathFrameworkGame,
    renderer: QuickMathRenderer
): void {
    // Set up submit button handler
    const submitButton = renderer.getSubmitButton()
    if (submitButton) {
        submitButton.addEventListener('click', () => {
            const answer = renderer.getAnswerValue()
            if (answer && game.getState().isActive) {
                const isCorrect = game.submitAnswer(answer)
                renderer.showAnswerFeedback(isCorrect)
                renderer.clearAnswer()
            }
        })
    }

    // Listen to game events for rendering updates
    game.on('start', () => {
        renderer.renderGameState(game.getState())
    })

    game.on('score-update', () => {
        renderer.renderGameState(game.getState())
    })

    game.on('time-update', () => {
        renderer.renderGameState(game.getState())
    })

    game.on('end', () => {
        const stats = game.getGameStats()
        renderer.renderStats(stats)
    })
}

function setupStandardButtons(game: QuickMathFrameworkGame): void {
    // Start button
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            game.start()
        })
    }

    // End button
    const endBtn = document.getElementById('end-btn') as HTMLButtonElement
    if (endBtn) {
        endBtn.addEventListener('click', () => {
            game.end()
        })
    }

    // Play again button
    const playAgainBtn = document.getElementById(
        'play-again-btn'
    ) as HTMLButtonElement
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            // Hide game over overlay
            const gameOverOverlay = document.getElementById('game-over-overlay')
            if (gameOverOverlay) {
                gameOverOverlay.classList.add('hidden')
            }

            // Reset button states
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            if (startBtn && endBtn) {
                startBtn.style.display = 'inline-flex'
                endBtn.style.display = 'none'
            }

            game.reset()
        })
    }
}

// Export for backward compatibility
export { QuickMathFrameworkGame, QuickMathRenderer }
export type { QuickMathConfig, QuickMathCallbacks }
