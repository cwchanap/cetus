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

const { initPatternPulseGameFrameworkMock } = vi.hoisted(() => ({
  initPatternPulseGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/pattern-pulse/initFramework', () => ({
  initPatternPulseGameFramework: initPatternPulseGameFrameworkMock,
}))

import PatternPulseScreen from './PatternPulseScreen'

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
      // Pattern-Pulse-projected fields the island's projector reads.
      phase: 'idle',
      outcome: 'playing',
      sequence: [1, 2, 3],
      inputIndex: 0,
      activePad: null,
      feedback: 'none',
      completedRounds: 0,
      streak: 0,
      mistakes: 0,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 12,
      gameCompleted: this.state.isGameOver,
      outcome: 'mistakes',
      completedRounds: 0,
      longestSequence: 5,
      mistakes: 3,
      maxStreak: 2,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithPatternPulseGame = Window & {
  patternPulseGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<{
    phase: string
    outcome: string
    feedback: string
    sequence: number[]
    completedRounds: number
    streak: number
    mistakes: number
  }>
): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  Object.assign(state, patch)
  // The DOM-renderer games announce HUD-only mutations through the shared
  // 'state-change' event (the session adapter refreshes on it).
  ;(
    game as unknown as {
      emit: (type: string, data?: unknown) => void
    }
  ).emit('state-change', { state: game.getState() })
}

describe('PatternPulseScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.PATTERN_PULSE, {
      duration: 60,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => stubGame.reset())
    initPatternPulseGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      getGame: () => stubGame,
      cleanup: cleanupMock,
      restart: restartMock,
      getState: () => stubGame.getState(),
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<PatternPulseScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#pattern-pulse-container')
    expect(host).not.toBeNull()
    expect(container.querySelector('#pattern-pulse-board')).not.toBeNull()
    expect(container.querySelectorAll('[data-pattern-pad]')).toHaveLength(4)
    expect(container.querySelector('#pattern-status')).not.toBeNull()

    await waitFor(() => {
      expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithPatternPulseGame).patternPulseGame
    ).toBeDefined()
  })

  it('renders the idle HUD projection byte-equal to the legacy spans', async () => {
    const { container } = render(<PatternPulseScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(container.querySelector('#sequence-length')?.textContent).toBe('3')
    expect(container.querySelector('#completed-rounds')?.textContent).toBe('0')
    expect(container.querySelector('#streak')?.textContent).toBe('0')
    expect(container.querySelector('#mistakes')?.textContent).toBe('0')
    expect(container.querySelector('#pattern-status')?.textContent).toBe(
      'READY'
    )
  })

  it('starts the run through session actions; no end/pause buttons exist', async () => {
    const { container } = render(<PatternPulseScreen />)
    await waitFor(() => {
      expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(container.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
    expect(screen.getByRole('button', { name: 'Reset' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'End Game' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  it('projects sequence/round/streak/mistake mutations into the stats spans', async () => {
    const { container } = render(<PatternPulseScreen />)
    await waitFor(() => {
      expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      phase: 'input',
      sequence: [2, 0, 3, 3],
      completedRounds: 2,
      streak: 2,
      mistakes: 1,
    })

    await waitFor(() => {
      expect(container.querySelector('#sequence-length')?.textContent).toBe('4')
    })
    expect(container.querySelector('#completed-rounds')?.textContent).toBe('2')
    expect(container.querySelector('#streak')?.textContent).toBe('2')
    expect(container.querySelector('#mistakes')?.textContent).toBe('1')
    expect(container.querySelector('#pattern-status')?.textContent).toBe(
      'REPEAT'
    )
  })

  it('opens the overlay with the structured result stats after ending', async () => {
    render(<PatternPulseScreen />)
    await waitFor(() => {
      expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.end()

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'SIGNAL LOST!'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('0')
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Mistake Limit'
    )
    expect(document.querySelector('#final-rounds')?.textContent).toBe('0')
    expect(document.querySelector('#final-longest-sequence')?.textContent).toBe(
      '5'
    )
    expect(document.querySelector('#final-max-streak')?.textContent).toBe('2')
    expect(document.querySelector('#final-mistakes')?.textContent).toBe('3')
  })

  it('replays from the overlay play-again button through the initializer restart', async () => {
    render(<PatternPulseScreen />)
    await waitFor(() => {
      expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.end()
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    fireEvent.click(
      document.querySelector('#play-again-btn') as HTMLButtonElement
    )

    expect(restartMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(false)
      expect(stubGame.getState().isActive).toBe(false)
    })
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
    expect(document.querySelector('#pattern-status')?.textContent).toBe('READY')
  })

  it('resets through the Reset button back to the idle status', async () => {
    const { container } = render(<PatternPulseScreen />)
    await waitFor(() => {
      expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(restartMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(false)
      expect(stubGame.getState().gameStarted).toBe(false)
    })
    expect(container.querySelector('#pattern-status')?.textContent).toBe(
      'READY'
    )
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<PatternPulseScreen />)
    await waitFor(() => {
      expect(initPatternPulseGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithPatternPulseGame).patternPulseGame
    ).toBeUndefined()
    // Session adapter (six events + state-change) and the shared
    // forwarder's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
