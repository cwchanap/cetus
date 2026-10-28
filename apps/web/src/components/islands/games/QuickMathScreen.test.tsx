import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  BaseGame,
  type BaseGameConfig,
  type BaseGameState,
  type BaseGameStats,
} from '@cetus/games'
import { GameID } from '@cetus/shared/games'

const { initQuickMathFrameworkMock } = vi.hoisted(() => ({
  initQuickMathFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/quick-math/init', () => ({
  initQuickMathFramework: initQuickMathFrameworkMock,
}))

import QuickMathScreen from './QuickMathScreen'

// Minimal portable BaseGame stub (same shape as the app-core tests): real
// lifecycle/event machinery, no DOM — the mocked initializer hands it to the
// island and the session adapter drives it for real.
class StubGame extends BaseGame<BaseGameState, BaseGameConfig, BaseGameStats> {
  createInitialState(): BaseGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      // Quick Math board state.
      currentQuestion: null,
      questionsAnswered: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      currentAnswer: '',
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 42,
      gameCompleted: this.state.isGameOver,
      totalQuestions: 7,
      correctAnswers: 6,
      incorrectAnswers: 1,
      accuracy: 86,
      averageTimePerQuestion: 5,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithQuickMathGame = Window & {
  quickMathGame?: { cleanup: () => void }
}

describe('QuickMathScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.QUICK_MATH, {
      duration: 60,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    initQuickMathFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      cleanup: cleanupMock,
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<QuickMathScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#quick-math-container')
    expect(host).not.toBeNull()
    for (const id of [
      'question',
      'answer-input',
      'submit-answer',
      'current-questions',
      'current-correct',
      'current-score',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initQuickMathFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initQuickMathFrameworkMock).toHaveBeenCalledWith(host)
    expect((window as WindowWithQuickMathGame).quickMathGame).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<QuickMathScreen />)

    expect(container.querySelector('#question')?.textContent).toBe('Ready?')
    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(
      (container.querySelector('#answer-input') as HTMLInputElement).disabled
    ).toBe(true)
    expect(
      (container.querySelector('#submit-answer') as HTMLButtonElement).disabled
    ).toBe(true)
    // Legacy GamePage props: no pause/reset buttons on Quick Math.
    expect(container.querySelector('#pause-btn')).toBeNull()
    expect(container.querySelector('#reset-btn')).toBeNull()
  })

  it('starts the run through session actions and swaps start for end', async () => {
    const { container } = render(<QuickMathScreen />)
    // #start-btn gates on the session (disabled until the initializer is
    // wired) so an eager pre-hydration click is never silently lost.
    const startBtn = screen.getByRole('button', { name: 'Start Game' })
    expect(startBtn).toBeDisabled()
    await waitFor(() => {
      expect(initQuickMathFrameworkMock).toHaveBeenCalledTimes(1)
      expect(startBtn).toBeEnabled()
    })

    fireEvent.click(startBtn)

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(container.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
    expect(screen.getByRole('button', { name: 'End Game' })).toBeVisible()
  })

  it('projects score and time updates into the shared badges', async () => {
    const { container } = render(<QuickMathScreen />)
    await waitFor(() => {
      expect(initQuickMathFrameworkMock).toHaveBeenCalledTimes(1)
    })

    stubGame.addScore(20, 'correct_answer')
    await waitFor(() => {
      expect(container.querySelector('#score')?.textContent).toBe('20')
    })

    // The renderer no longer writes the shared badges (HPA-393); React
    // projects them from the session snapshot. The adapter snapshots
    // getState(), so mutate the state before emitting the event.
    const state = (
      stubGame as unknown as {
        state: Record<string, unknown>
      }
    ).state
    state.timeRemaining = 42
    ;(
      stubGame as unknown as {
        emit: (type: string, data?: unknown) => void
      }
    ).emit('time-update', { time: 42 })
    await waitFor(() => {
      expect(container.querySelector('#time-remaining')?.textContent).toBe('42')
    })
  })

  it('ends through the End Game button and opens the overlay with final stats', async () => {
    render(<QuickMathScreen />)
    await waitFor(() => {
      expect(initQuickMathFrameworkMock).toHaveBeenCalledTimes(1)
    })

    const startBtn = screen.getByRole('button', { name: 'Start Game' })
    await waitFor(() => {
      expect(startBtn).toBeEnabled()
    })
    fireEvent.click(startBtn)
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(40, 'correct_answer')

    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })
    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    // Quick Math's overlay title is the frozen GamePage overlayTitle prop.
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      "TIME'S UP!"
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('40')
    expect(document.querySelector('#total-questions')?.textContent).toBe('7')
    expect(document.querySelector('#accuracy')?.textContent).toBe('86%')
  })

  it('replays from the overlay play-again button back to idle', async () => {
    render(<QuickMathScreen />)
    await waitFor(() => {
      expect(initQuickMathFrameworkMock).toHaveBeenCalledTimes(1)
    })

    const startBtn = screen.getByRole('button', { name: 'Start Game' })
    await waitFor(() => {
      expect(startBtn).toBeEnabled()
    })
    fireEvent.click(startBtn)
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(20, 'correct_answer')
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    // Legacy play-again reset to idle; it never auto-restarted.
    fireEvent.click(
      document.querySelector('#play-again-btn') as HTMLButtonElement
    )

    expect(stubGame.getState().score).toBe(0)
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(false)
      expect(stubGame.getState().gameStarted).toBe(false)
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<QuickMathScreen />)
    await waitFor(() => {
      expect(initQuickMathFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect((window as WindowWithQuickMathGame).quickMathGame).toBeUndefined()
    // Session adapter (six events) and the shared forwarder's end listener
    // are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('score-update')).toBe(0)
  })
})
