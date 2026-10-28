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

const { initEvaderGameFrameworkMock } = vi.hoisted(() => ({
  initEvaderGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/evader/initFramework', () => ({
  initEvaderGameFramework: initEvaderGameFrameworkMock,
}))

import EvaderScreen from './EvaderScreen'

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
      // Evader-projected fields the island's projector reads.
      coinsCollected: 0,
      bombsHit: 0,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 33,
      gameCompleted: this.state.isGameOver,
      coinsCollected: 4,
      bombsHit: 2,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithEvaderGame = Window & {
  evaderGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<Pick<StubState, 'coinsCollected' | 'bombsHit'>>
): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  Object.assign(state, patch)
  // EvaderGame announces HUD-only mutations through the shared
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
}

describe('EvaderScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let endGameMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.EVADER, {
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    endGameMock = vi.fn(() => stubGame.end())
    initEvaderGameFrameworkMock.mockResolvedValue({
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
    const { container } = render(<EvaderScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#game-canvas-container')
    expect(host).not.toBeNull()
    for (const id of [
      'game-status',
      'game-error',
      'game-error-title',
      'game-error-message',
      'dpad',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initEvaderGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initEvaderGameFrameworkMock).toHaveBeenCalledWith(host)
    expect((window as WindowWithEvaderGame).evaderGame).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<EvaderScreen />)

    // The #game-status pre-start overlay stays hidden by default.
    expect(container.querySelector('#game-status')).toHaveClass('hidden')
    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(container.querySelector('#coins-collected')?.textContent).toBe('0')
    expect(container.querySelector('#bombs-hit')?.textContent).toBe('0')
    // Custom control card: #stop-btn replaces #end-btn (frozen deviation).
    expect(container.querySelector('#end-btn')).toBeNull()
    expect(container.querySelector('#stop-btn')).toHaveStyle({
      display: 'none',
    })
    const startBtn = container.querySelector('#start-btn')
    expect(startBtn).not.toHaveStyle({ display: 'none' })
    // The touch D-pad keeps its four data-key buttons.
    expect(container.querySelectorAll('#dpad [data-key]')).toHaveLength(4)
  })

  it('starts the run through session actions and swaps start for stop', async () => {
    const { container } = render(<EvaderScreen />)
    await waitFor(() => {
      expect(initEvaderGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('projects coin/bomb collisions into the session card spans', async () => {
    const { container } = render(<EvaderScreen />)
    await waitFor(() => {
      expect(initEvaderGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, { coinsCollected: 3, bombsHit: 1 })

    await waitFor(() => {
      expect(container.querySelector('#coins-collected')?.textContent).toBe('3')
      expect(container.querySelector('#bombs-hit')?.textContent).toBe('1')
    })
  })

  it('stops through the #stop-btn and opens the overlay with final stats', async () => {
    render(<EvaderScreen />)
    await waitFor(() => {
      expect(initEvaderGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(100, 'coin')

    // Evader ends through #stop-btn, not #end-btn.
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
    expect(document.querySelector('#final-score')?.textContent).toBe('100')
    expect(document.querySelector('#final-coins')?.textContent).toBe('4')
    expect(document.querySelector('#final-bombs')?.textContent).toBe('2')
  })

  it('closes the overlay via the Close button back to idle', async () => {
    render(<EvaderScreen />)
    await waitFor(() => {
      expect(initEvaderGameFrameworkMock).toHaveBeenCalledTimes(1)
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
    const { unmount } = render(<EvaderScreen />)
    await waitFor(() => {
      expect(initEvaderGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect((window as WindowWithEvaderGame).evaderGame).toBeUndefined()
    // Session adapter (six events) and the initializer's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('score-update')).toBe(0)
  })
})
