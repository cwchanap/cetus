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
import type { SudokuState } from '@cetus/games/sudoku/frameworkTypes'

const { initSudokuGameFrameworkMock } = vi.hoisted(() => ({
  initSudokuGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/sudoku/initFramework', () => ({
  initSudokuGameFramework: initSudokuGameFrameworkMock,
}))

import SudokuScreen from './SudokuScreen'

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
      // Sudoku-projected fields the island's projector reads.
      difficulty: 'medium',
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 95,
      gameCompleted: false,
      difficulty: 'easy',
      mistakes: 0,
      isComplete: false,
      cellsFilled: 3,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithSudokuGame = Window & {
  sudokuGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<Pick<SudokuState, 'difficulty'>>
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

describe('SudokuScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>
  let endGameMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.SUDOKU, {
      duration: Number.MAX_SAFE_INTEGER,
      pausable: true,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => stubGame.reset())
    endGameMock = vi.fn(() => stubGame.end())
    initSudokuGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      cleanup: cleanupMock,
      restart: restartMock,
      getState: () => stubGame.getState(),
      endGame: endGameMock,
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<SudokuScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#sudoku-container')
    expect(host).not.toBeNull()
    for (const id of [
      'easy-btn',
      'medium-btn',
      'hard-btn',
      'game-time',
      'difficulty',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initSudokuGameFrameworkMock).toHaveBeenCalledWith(host)
    expect((window as WindowWithSudokuGame).sudokuGame).toBeDefined()
  })

  it('renders the idle HUD projection byte-equal to the legacy spans', async () => {
    const { container } = render(<SudokuScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    // No shared time badge — Sudoku shows its own elapsed #game-time span.
    expect(container.querySelector('#time-remaining')).toBeNull()
    expect(container.querySelector('#game-time')?.textContent).toBe('00:00')
    expect(container.querySelector('#difficulty')?.textContent).toBe('Medium')
  })

  it('starts the run through session actions and swaps start for end', async () => {
    const { container } = render(<SudokuScreen />)
    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(container.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
    expect(screen.getByRole('button', { name: 'End Game' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible()
  })

  it('pauses and resumes through the pause button label swap', async () => {
    render(<SudokuScreen />)
    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => {
      expect(stubGame.getState().isPaused).toBe(true)
    })
    expect(screen.getByRole('button', { name: 'Resume' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => {
      expect(stubGame.getState().isPaused).toBe(false)
    })
  })

  it('projects difficulty mutations into the stats span', async () => {
    const { container } = render(<SudokuScreen />)
    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, { difficulty: 'hard' })

    await waitFor(() => {
      expect(container.querySelector('#difficulty')?.textContent).toBe('Hard')
    })
  })

  it('ends through the End Game button and opens the overlay with final stats', async () => {
    render(<SudokuScreen />)
    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(120, 'placement')

    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    expect(endGameMock).toHaveBeenCalled()
    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    // Sudoku's overlay replays through #restart-btn (frozen GamePage prop).
    expect(
      document.querySelector<HTMLButtonElement>('#restart-btn')
    ).not.toBeNull()
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'GAME OVER'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('120')
    expect(document.querySelector('#final-time')?.textContent).toBe('01:35')
    expect(document.querySelector('#final-difficulty')?.textContent).toBe(
      'Easy'
    )
  })

  it('replays from the overlay restart button through the initializer restart', async () => {
    render(<SudokuScreen />)
    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.end()
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    fireEvent.click(document.querySelector('#restart-btn') as HTMLButtonElement)

    expect(restartMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(false)
      expect(stubGame.getState().isActive).toBe(false)
    })
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('resets through the Reset button', async () => {
    render(<SudokuScreen />)
    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
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
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<SudokuScreen />)
    await waitFor(() => {
      expect(initSudokuGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect((window as WindowWithSudokuGame).sudokuGame).toBeUndefined()
    // Session adapter (six events + state-change) and the shared
    // forwarder's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
