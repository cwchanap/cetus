import {
    QuickMathFrameworkGame,
    DEFAULT_QUICK_MATH_CONFIG,
    type QuickMathConfig,
    type QuickMathCallbacks,
    type MathQuestion,
} from '@cetus/games/quick-math/game'
import { QuickMathRenderer, type QuickMathRendererConfig } from './renderer'
import { GameID } from '@cetus/shared/games'
import type { BaseGameCallbacks } from '@cetus/games/core/types'
import { forwardBaseGameResults } from '@/lib/games/core/notificationForwarder'
import { submitScore } from '@/lib/services/scoreService'

// Default renderer configuration (the container selector is derived from
// the island-passed host element; the rest are frozen page ids).
const DEFAULT_RENDERER_CONFIG: Omit<QuickMathRendererConfig, 'container'> = {
    type: 'dom',
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

export interface QuickMathInitResult {
    game: QuickMathFrameworkGame
    renderer: QuickMathRenderer
    cleanup: () => void
}

export async function initQuickMathFramework(
    // The island-owned board host (#quick-math-container); the renderer
    // resolves it by the same frozen id (HPA-393).
    container: HTMLElement,
    customConfig?: Partial<QuickMathConfig>,
    customCallbacks?: QuickMathFrameworkCallbacks
): Promise<QuickMathInitResult> {
    // Merge configurations
    const config: QuickMathConfig = {
        ...DEFAULT_QUICK_MATH_CONFIG,
        ...customConfig,
        submitScore: customConfig?.submitScore ?? submitScore,
    }
    const rendererConfig: QuickMathRendererConfig = {
        ...DEFAULT_RENDERER_CONFIG,
        container: `#${CSS.escape(container.id)}`,
    }

    // Create renderer
    const renderer = new QuickMathRenderer(rendererConfig)
    await renderer.initialize()

    // React owns the HUD buttons/overlay (HPA-393): the only callback wiring
    // kept here is the question renderer feed; everything else passes
    // through to the caller untouched.
    const callbacks: QuickMathCallbacks = {
        ...customCallbacks,
        onQuestionUpdate: (question: MathQuestion) => {
            renderer.renderQuestion(question)
            customCallbacks?.onQuestionUpdate?.(question)
        },
    }

    // Create game
    const game = new QuickMathFrameworkGame(
        GameID.QUICK_MATH,
        config,
        callbacks
    )

    // Set up Quick Math specific event handlers (submit button + render
    // listeners; board-embedded session counters stay renderer-written).
    setupQuickMathEvents(game, renderer)

    // One shared 'end' listener forwarding structured results to the global
    // toasts (HPA-393); Quick Math had no legacy bridge, so this is the
    // standard single toast owner wiring.
    const removeForwarder = forwardBaseGameResults(game)

    return {
        game,
        renderer,
        cleanup: () => {
            removeForwarder()
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
        renderer.renderGameState(game.getState())
    })
}

// Export for backward compatibility
export { QuickMathFrameworkGame, QuickMathRenderer }
export type { QuickMathConfig, QuickMathCallbacks }
