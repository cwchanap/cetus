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

const { initPathNavigatorGameFrameworkMock } = vi.hoisted(() => ({
  initPathNavigatorGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/path-navigator/initFramework', () => ({
  initPathNavigatorGameFramework: initPathNavigatorGameFrameworkMock,
}))

import PathNavigatorScreen from './PathNavigatorScreen'

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
      // Path Navigator-projected fields the island's projector reads.
      currentLevel: 1,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 27,
      gameCompleted: this.state.isGameOver,
      levelsCompleted: 2,
      totalTime: 41.4,
      averageTimePerLevel: 20.7,
      pathViolations: 0,
      perfectLevels: 2,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithPathNavigatorGame = Window & {
  pathNavigatorGame?: { cleanup: () => void }
}

function mutateState(game: StubGame, level: number): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  state.currentLevel = level
  // PathNavigatorGame has no state-change event; the level badge advances
  // through the score-update refresh fired by completeLevel's addScore —
  // the same event the session adapter refreshes on.
  ;(
    game as unknown as {
      emit: (type: string, data?: unknown) => void
    }
  ).emit('score-update', { score: game.getState().score })
}

describe('PathNavigatorScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let endGameMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.PATH_NAVIGATOR, {
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    endGameMock = vi.fn(() => stubGame.end())
    initPathNavigatorGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      cleanup: cleanupMock,
      restart: () => stubGame.reset(),
      getState: () => stubGame.getState(),
      endGame: endGameMock,
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<PathNavigatorScreen />)

    // SSR/host markup keeps the frozen e2e selector.
    const host = container.querySelector('#path-navigator-container')
    expect(host).not.toBeNull()

    await waitFor(() => {
      expect(initPathNavigatorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initPathNavigatorGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithPathNavigatorGame).pathNavigatorGame
    ).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<PathNavigatorScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(container.querySelector('#level')?.textContent).toBe('1')
    // Legacy GamePage props: pause/reset hidden, start/end pair present.
    expect(container.querySelector('#pause-btn')).toBeNull()
    expect(container.querySelector('#reset-btn')).toBeNull()
    expect(container.querySelector('#start-btn')).not.toHaveStyle({
      display: 'none',
    })
    expect(container.querySelector('#end-btn')).toHaveStyle({
      display: 'none',
    })
  })

  it('starts the run through session actions and swaps start for end', async () => {
    const { container } = render(<PathNavigatorScreen />)
    await waitFor(() => {
      expect(initPathNavigatorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(container.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
    expect(screen.getByRole('button', { name: 'End Game' })).toBeVisible()
  })

  it('projects level progress into the session badge span', async () => {
    const { container } = render(<PathNavigatorScreen />)
    await waitFor(() => {
      expect(initPathNavigatorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, 3)

    await waitFor(() => {
      expect(container.querySelector('#level')?.textContent).toBe('3')
    })
  })

  it('ends through the #end-btn and opens the overlay with final stats', async () => {
    render(<PathNavigatorScreen />)
    await waitFor(() => {
      expect(initPathNavigatorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(300, 'level_complete')
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    expect(endGameMock).toHaveBeenCalled()
    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    // Frozen GamePage overlay props: GAME OVER title, default Play Again.
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'GAME OVER'
    )
    expect(
      document.querySelector<HTMLButtonElement>('#play-again-btn')
    ).toHaveTextContent('Play Again')
    expect(document.querySelector('#final-score')?.textContent).toBe('300')
    expect(document.querySelector('#levels-completed')?.textContent).toBe('2')
    expect(document.querySelector('#total-time')?.textContent).toBe('41')
  })

  it('replays from the overlay play-again button back to idle', async () => {
    const { container } = render(<PathNavigatorScreen />)
    await waitFor(() => {
      expect(initPathNavigatorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    // Legacy play-again returned to idle; it never auto-restarted.
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
    await waitFor(() => {
      expect(container.querySelector('#level')?.textContent).toBe('1')
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<PathNavigatorScreen />)
    await waitFor(() => {
      expect(initPathNavigatorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithPathNavigatorGame).pathNavigatorGame
    ).toBeUndefined()
    // Session adapter (six events) and the initializer's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('score-update')).toBe(0)
  })
})
