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
import type {
  MineGridDifficulty,
  MineGridStats,
} from '@cetus/games/mine-grid/types'

const { initMineGridGameFrameworkMock } = vi.hoisted(() => ({
  initMineGridGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/mine-grid/initFramework', () => ({
  initMineGridGameFramework: initMineGridGameFrameworkMock,
}))

import MineGridScreen from './MineGridScreen'

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
      // Mine-Grid-projected fields the island's projector reads.
      difficulty: 'medium',
      flagsPlaced: 0,
      revealedSafeCells: 0,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 8,
      gameCompleted: false,
      difficulty: 'easy',
      cleared: false,
      result: 'mine',
      revealedSafeCells: 1,
      totalSafeCells: 56,
      flagsPlaced: 0,
      incorrectFlagActions: 1,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithMineGridGame = Window & {
  mineGridGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<{
    difficulty: MineGridDifficulty
    flagsPlaced: number
    revealedSafeCells: number
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

describe('MineGridScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.MINE_GRID, {
      duration: 300,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => stubGame.reset())
    initMineGridGameFrameworkMock.mockResolvedValue({
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
    const { container } = render(<MineGridScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#mine-grid-container')
    expect(host).not.toBeNull()
    expect(container.querySelector('#mine-grid-board')).not.toBeNull()
    for (const id of [
      'easy-btn',
      'medium-btn',
      'hard-btn',
      'reveal-mode-btn',
      'flag-mode-btn',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initMineGridGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initMineGridGameFrameworkMock).toHaveBeenCalledWith(host)
    expect((window as WindowWithMineGridGame).mineGridGame).toBeDefined()
  })

  it('renders the idle HUD projection byte-equal to the legacy spans', async () => {
    const { container } = render(<MineGridScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('300')
    expect(container.querySelector('#difficulty')?.textContent).toBe('Medium')
    expect(container.querySelector('#flags')?.textContent).toBe('0')
    expect(container.querySelector('#safe-progress')?.textContent).toBe(
      '0 / 85'
    )
  })

  it('starts the run through session actions; no end/pause buttons exist', async () => {
    const { container } = render(<MineGridScreen />)
    await waitFor(() => {
      expect(initMineGridGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('projects difficulty/flag/safe mutations into the stats spans', async () => {
    const { container } = render(<MineGridScreen />)
    await waitFor(() => {
      expect(initMineGridGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      difficulty: 'easy',
      flagsPlaced: 3,
      revealedSafeCells: 5,
    })

    await waitFor(() => {
      expect(container.querySelector('#difficulty')?.textContent).toBe('Easy')
    })
    expect(container.querySelector('#flags')?.textContent).toBe('3')
    expect(container.querySelector('#safe-progress')?.textContent).toBe(
      '5 / 56'
    )
  })

  it('opens the overlay with the structured result stats after ending', async () => {
    render(<MineGridScreen />)
    await waitFor(() => {
      expect(initMineGridGameFrameworkMock).toHaveBeenCalledTimes(1)
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
      'MINE DETONATED'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('0')
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Mine Detonated'
    )
    expect(document.querySelector('#final-difficulty')?.textContent).toBe(
      'Easy'
    )
    expect(document.querySelector('#final-time')?.textContent).toBe('00:08')
    expect(document.querySelector('#final-incorrect-flags')?.textContent).toBe(
      '1'
    )
  })

  it('replays from the overlay play-again button through the initializer restart', async () => {
    render(<MineGridScreen />)
    await waitFor(() => {
      expect(initMineGridGameFrameworkMock).toHaveBeenCalledTimes(1)
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
  })

  it('resets through the Reset button', async () => {
    render(<MineGridScreen />)
    await waitFor(() => {
      expect(initMineGridGameFrameworkMock).toHaveBeenCalledTimes(1)
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
    const { unmount } = render(<MineGridScreen />)
    await waitFor(() => {
      expect(initMineGridGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect((window as WindowWithMineGridGame).mineGridGame).toBeUndefined()
    // Session adapter (six events + state-change) and the shared
    // forwarder's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
