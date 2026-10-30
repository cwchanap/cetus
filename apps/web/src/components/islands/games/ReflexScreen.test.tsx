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

const { initReflexGameFrameworkMock } = vi.hoisted(() => ({
  initReflexGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/reflex/initFramework', () => ({
  initReflexGameFramework: initReflexGameFrameworkMock,
}))

import ReflexScreen from './ReflexScreen'

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
      // Reflex state fields the island's projector reads.
      objects: [],
      grid: [],
      totalClicks: 0,
      correctClicks: 0,
      incorrectClicks: 0,
      coinsCollected: 0,
      bombsHit: 0,
      missedCoins: 0,
      gameHistory: [],
      needsRedraw: false,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 42,
      gameCompleted: this.state.isGameOver,
      // Divergent accuracy (70%) vs coins/totalClicks (50%): the overlay
      // must show stats.accuracy (Task 1.5 bug contract).
      totalClicks: 10,
      correctClicks: 7,
      incorrectClicks: 3,
      accuracy: 70,
      coinsCollected: 5,
      bombsHit: 3,
      missedCoins: 0,
      averageReactionTime: 840,
      objectsSpawned: 10,
      gameHistory: [],
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithReflexGame = Window & {
  reflexGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<
    Pick<
      StubState,
      'coinsCollected' | 'bombsHit' | 'correctClicks' | 'totalClicks'
    >
  >
): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  Object.assign(state, patch)
  // ReflexGame announces HUD-only mutations through the shared
  // 'state-change' event (the session adapter refreshes on it).
  ;(
    game as unknown as {
      emit: (type: string, data?: unknown) => void
    }
  ).emit('state-change', { state: game.getState() })
}

type StubState = {
  coinsCollected: number
  bombsHit: number
  correctClicks: number
  totalClicks: number
}

describe('ReflexScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let endGameMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.REFLEX, {
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    endGameMock = vi.fn(() => stubGame.end())
    initReflexGameFrameworkMock.mockResolvedValue({
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
    const { container } = render(<ReflexScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#game-canvas-container')
    expect(host).not.toBeNull()
    for (const id of ['game-status', 'game-error', 'game-error-message']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initReflexGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initReflexGameFrameworkMock).toHaveBeenCalledWith(host)
    expect((window as WindowWithReflexGame).reflexGame).toBeDefined()
  })

  it('surfaces a renderer init failure through the game error surface', async () => {
    initReflexGameFrameworkMock.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<ReflexScreen />)

      // Legacy behavior: the #game-error surface reveals the failure
      // instead of the board staying blank.
      await waitFor(() => {
        expect(document.querySelector('#game-error')).toHaveStyle({
          display: 'flex',
        })
      })
      expect(
        document.querySelector('#game-error-message')?.textContent
      ).toContain('failed to initialize')
      // No session, no debug handle: the board stays inert.
      expect((window as WindowWithReflexGame).reflexGame).toBeUndefined()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<ReflexScreen />)

    // The #game-status pre-start overlay stays hidden by default.
    expect(container.querySelector('#game-status')).toHaveClass('hidden')
    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(container.querySelector('#coins-collected')?.textContent).toBe('0')
    expect(container.querySelector('#bombs-hit')?.textContent).toBe('0')
    expect(container.querySelector('#accuracy')?.textContent).toBe('0%')
    // Custom control card: #stop-btn replaces #end-btn (frozen deviation).
    expect(container.querySelector('#end-btn')).toBeNull()
    expect(container.querySelector('#stop-btn')).toHaveStyle({
      display: 'none',
    })
    const startBtn = container.querySelector('#start-btn')
    expect(startBtn).not.toHaveStyle({ display: 'none' })
  })

  it('starts the run through session actions and swaps start for stop', async () => {
    const { container } = render(<ReflexScreen />)
    await waitFor(() => {
      expect(initReflexGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('projects click results into the session card spans', async () => {
    const { container } = render(<ReflexScreen />)
    await waitFor(() => {
      expect(initReflexGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      coinsCollected: 3,
      bombsHit: 1,
      correctClicks: 3,
      totalClicks: 4,
    })

    await waitFor(() => {
      expect(container.querySelector('#coins-collected')?.textContent).toBe('3')
      expect(container.querySelector('#bombs-hit')?.textContent).toBe('1')
      expect(container.querySelector('#accuracy')?.textContent).toBe('75%')
    })
  })

  it('stops through the #stop-btn and opens the overlay with final stats', async () => {
    render(<ReflexScreen />)
    await waitFor(() => {
      expect(initReflexGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(35, 'coin')

    // Reflex ends through #stop-btn, not #end-btn.
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    expect(endGameMock).toHaveBeenCalled()
    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    // Frozen GamePage overlay props: TIME'S UP! title, Close button.
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      "TIME'S UP!"
    )
    expect(
      document.querySelector<HTMLButtonElement>('#play-again-btn')
    ).toHaveTextContent('Close')
    expect(document.querySelector('#final-score')?.textContent).toBe('35')
    // stats.accuracy (70%), not coins/totalClicks (50%) — Task 1.5 contract.
    expect(document.querySelector('#final-coins')?.textContent).toBe('5')
    expect(document.querySelector('#final-bombs')?.textContent).toBe('3')
    expect(document.querySelector('#final-accuracy')?.textContent).toBe('70%')
    expect(document.querySelector('#avg-reaction')?.textContent).toBe('840ms')
  })

  it('replays from the overlay Close button back to idle', async () => {
    render(<ReflexScreen />)
    await waitFor(() => {
      expect(initReflexGameFrameworkMock).toHaveBeenCalledTimes(1)
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
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<ReflexScreen />)
    await waitFor(() => {
      expect(initReflexGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect((window as WindowWithReflexGame).reflexGame).toBeUndefined()
    // Session adapter (six events + state-change) and the shared
    // forwarder's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
