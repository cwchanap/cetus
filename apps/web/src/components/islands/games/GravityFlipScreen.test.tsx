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
import type { GravityFlipOutcome } from '@cetus/games/gravity-flip/types'

const { initGravityFlipGameFrameworkMock } = vi.hoisted(() => ({
  initGravityFlipGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/gravity-flip/initFramework', () => ({
  initGravityFlipGameFramework: initGravityFlipGameFrameworkMock,
}))

import GravityFlipScreen from './GravityFlipScreen'

// Minimal portable BaseGame stub (same shape as the app-core tests): real
// lifecycle/event machinery, no DOM — the mocked initializer hands it to
// the island and the session adapter drives it for real.
class StubGame extends BaseGame<BaseGameState, BaseGameConfig, BaseGameStats> {
  stubStats: {
    outcome: GravityFlipOutcome
    distance: number
    starsCollected: number
    flips: number
  } = {
    outcome: 'collision',
    distance: 1234,
    starsCollected: 2,
    flips: 5,
  }

  createInitialState(): BaseGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      // Gravity Flip-projected fields the island's projector reads.
      outcome: 'playing',
      gravity: 'down',
      distance: 0,
      starsCollected: 0,
      flips: 0,
      worldSpeed: 220,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 33,
      gameCompleted: this.state.isGameOver,
      ...this.stubStats,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithGravityFlipGame = Window & {
  gravityFlipGame?: { cleanup: () => void }
}

type StubPatch = {
  gravity?: 'down' | 'up'
  distance?: number
  starsCollected?: number
  flips?: number
  worldSpeed?: number
}

function mutateState(game: StubGame, patch: StubPatch): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  Object.assign(state, patch)
  // GravityFlipGame announces HUD-only mutations through the shared
  // 'state-change' event (the session adapter refreshes on it).
  ;(
    game as unknown as {
      emit: (type: string, data?: unknown) => void
    }
  ).emit('state-change', { state: game.getState() })
}

describe('GravityFlipScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.GRAVITY_FLIP, {
      duration: 60,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    initGravityFlipGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      getGame: () => stubGame,
      getState: () => stubGame.getState(),
      cleanup: cleanupMock,
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<GravityFlipScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#gravity-flip-container')
    expect(host).not.toBeNull()
    for (const id of [
      'gravity-flip-canvas',
      'gravity-flip-status',
      'flip-btn',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledWith(host)
    expect((window as WindowWithGravityFlipGame).gravityFlipGame).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<GravityFlipScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(container.querySelector('#gravity-direction')?.textContent).toBe(
      'FLOOR ↓'
    )
    expect(container.querySelector('#distance-traveled')?.textContent).toBe('0')
    expect(container.querySelector('#stars-collected')?.textContent).toBe('0')
    expect(container.querySelector('#flip-count')?.textContent).toBe('0')
    // Pre-hydration world speed keeps the legacy em-dash placeholder.
    expect(container.querySelector('#world-speed')?.textContent).toBe('—')
    // Custom control card: start/reset pair plus the flip button, no end.
    expect(container.querySelector('#end-btn')).toBeNull()
    expect(container.querySelector('#pause-btn')).toBeNull()
    expect(container.querySelector('#start-btn')).not.toHaveStyle({
      display: 'none',
    })
    expect(container.querySelector('#flip-btn')).toHaveTextContent(
      'FLIP GRAVITY'
    )
  })

  it('starts the run through session actions and hides the start button', async () => {
    const { container } = render(<GravityFlipScreen />)
    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(container.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
  })

  it('projects state changes into the HUD badge spans', async () => {
    const { container } = render(<GravityFlipScreen />)
    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      gravity: 'up',
      distance: 1234.7,
      starsCollected: 3,
      flips: 7,
      worldSpeed: 155.4,
    })

    await waitFor(() => {
      expect(container.querySelector('#gravity-direction')?.textContent).toBe(
        'CEILING ↑'
      )
      expect(container.querySelector('#distance-traveled')?.textContent).toBe(
        '1234'
      )
      expect(container.querySelector('#stars-collected')?.textContent).toBe('3')
      expect(container.querySelector('#flip-count')?.textContent).toBe('7')
      // Same rounding as the legacy syncHud.
      expect(container.querySelector('#world-speed')?.textContent).toBe('155')
    })
  })

  it('Reset resets the session back to idle', async () => {
    const { container } = render(<GravityFlipScreen />)
    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(stubGame.getState().isActive).toBe(false)
    expect(stubGame.getState().gameStarted).toBe(false)
    await waitFor(() => {
      expect(container.querySelector('#start-btn')).not.toHaveStyle({
        display: 'none',
      })
    })
  })

  it('opens the overlay with GRAVITY LOST / Collision final stats on collision', async () => {
    render(<GravityFlipScreen />)
    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(420, 'star')
    await stubGame.end()

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'GRAVITY LOST'
    )
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Collision'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('420')
    expect(document.querySelector('#final-distance')?.textContent).toBe('1234')
    expect(document.querySelector('#final-stars')?.textContent).toBe('2')
    expect(document.querySelector('#final-flips')?.textContent).toBe('5')
  })

  it('renders RUN COMPLETE / Survived from a survived outcome', async () => {
    render(<GravityFlipScreen />)
    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.stubStats = {
      outcome: 'survived',
      distance: 9999,
      starsCollected: 12,
      flips: 30,
    }
    await stubGame.end()

    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'RUN COMPLETE'
    )
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Survived'
    )
    expect(document.querySelector('#final-stars')?.textContent).toBe('12')
  })

  it('Play Again immediately starts a fresh run (legacy auto-start)', async () => {
    render(<GravityFlipScreen />)
    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    await stubGame.end()
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })

    fireEvent.click(
      document.querySelector('#play-again-btn') as HTMLButtonElement
    )

    // BaseGame.start() clears the completed run and immediately starts it.
    await waitFor(() => {
      expect(stubGame.getState()).toMatchObject({
        isActive: true,
        isGameOver: false,
        gameStarted: true,
        gravity: 'down',
        flips: 0,
        distance: 0,
      })
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<GravityFlipScreen />)
    await waitFor(() => {
      expect(initGravityFlipGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithGravityFlipGame).gravityFlipGame
    ).toBeUndefined()
    // Session adapter (six events) and the initializer's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
