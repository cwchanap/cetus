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
import {
  ASTEROID_DRIFT_RULES,
  type AsteroidDriftOutcome,
} from '@cetus/games/asteroid-drift/types'

const { initAsteroidDriftGameFrameworkMock } = vi.hoisted(() => ({
  initAsteroidDriftGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/asteroid-drift/initFramework', () => ({
  initAsteroidDriftGameFramework: initAsteroidDriftGameFrameworkMock,
}))

import AsteroidDriftScreen from './AsteroidDriftScreen'

// Minimal portable BaseGame stub (same shape as the app-core tests): real
// lifecycle/event machinery, no DOM — the mocked initializer hands it to
// the island and the session adapter drives it for real.
class StubGame extends BaseGame<BaseGameState, BaseGameConfig, BaseGameStats> {
  stubStats = {
    outcome: 'collision' as AsteroidDriftOutcome,
    survivalSeconds: 12,
    orbsCollected: 2,
  }

  createInitialState(): BaseGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      // Asteroid Drift-projected fields the island's projector reads.
      outcome: 'playing',
      orbsCollected: 0,
      player: {
        x: ASTEROID_DRIFT_RULES.canvasWidth / 2,
        y: ASTEROID_DRIFT_RULES.canvasHeight / 2,
        velocityX: 0,
        velocityY: 0,
        radius: ASTEROID_DRIFT_RULES.playerRadius,
      },
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

type WindowWithAsteroidDriftGame = Window & {
  asteroidDriftGame?: { cleanup: () => void }
}

type StubPatch = {
  orbsCollected?: number
  velocityX?: number
  velocityY?: number
}

function mutateState(game: StubGame, patch: StubPatch): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  if (patch.velocityX !== undefined) {
    ;(state.player as Record<string, unknown>).velocityX = patch.velocityX
  }
  if (patch.velocityY !== undefined) {
    ;(state.player as Record<string, unknown>).velocityY = patch.velocityY
  }
  if (patch.orbsCollected !== undefined) {
    state.orbsCollected = patch.orbsCollected
  }
  // AsteroidDriftGame announces HUD-only mutations through the shared
  // 'state-change' event (the session adapter refreshes on it).
  ;(
    game as unknown as {
      emit: (type: string, data?: unknown) => void
    }
  ).emit('state-change', { state: game.getState() })
}

describe('AsteroidDriftScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.ASTEROID_DRIFT, {
      duration: ASTEROID_DRIFT_RULES.duration,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    initAsteroidDriftGameFrameworkMock.mockResolvedValue({
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
    const { container } = render(<AsteroidDriftScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#asteroid-drift-container')
    expect(host).not.toBeNull()
    for (const id of [
      'asteroid-drift-canvas',
      'asteroid-drift-status',
      'asteroid-drift-dpad',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithAsteroidDriftGame).asteroidDriftGame
    ).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<AsteroidDriftScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe(
      String(ASTEROID_DRIFT_RULES.duration)
    )
    expect(container.querySelector('#orbs-collected')?.textContent).toBe('0')
    expect(container.querySelector('#ship-speed')?.textContent).toBe('0')
    // Custom control card: start/reset pair, no end/pause buttons.
    expect(container.querySelector('#end-btn')).toBeNull()
    expect(container.querySelector('#pause-btn')).toBeNull()
    expect(container.querySelector('#start-btn')).not.toHaveStyle({
      display: 'none',
    })
    // The touch D-pad keeps its four data-direction buttons.
    const dpadButtons = container.querySelectorAll(
      '#asteroid-drift-dpad [data-direction]'
    )
    expect(dpadButtons).toHaveLength(4)
    for (const button of dpadButtons) {
      expect(button.getAttribute('aria-label')).toMatch(/^Thrust /)
      expect(button.getAttribute('tabindex')).toBe('-1')
    }
  })

  it('starts the run through session actions and hides the start button', async () => {
    const { container } = render(<AsteroidDriftScreen />)
    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(container.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
  })

  it('projects orbs and ship speed into the HUD badge spans', async () => {
    const { container } = render(<AsteroidDriftScreen />)
    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, { orbsCollected: 3, velocityX: 90, velocityY: 60 })

    await waitFor(() => {
      expect(container.querySelector('#orbs-collected')?.textContent).toBe('3')
      // Same hypot/round as the legacy syncHud: hypot(90, 60) = 108.16…
      expect(container.querySelector('#ship-speed')?.textContent).toBe('108')
    })
  })

  it('Reset resets the session back to idle', async () => {
    const { container } = render(<AsteroidDriftScreen />)
    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('opens the overlay with SHIP LOST / Collision final stats on collision', async () => {
    render(<AsteroidDriftScreen />)
    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(150, 'survival')
    await stubGame.end()

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'SHIP LOST'
    )
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Collision'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('150')
    expect(document.querySelector('#final-survival')?.textContent).toBe('12')
    expect(document.querySelector('#final-orbs')?.textContent).toBe('2')
  })

  it('renders DRIFT COMPLETE and DRIFT ENDED from survived/expired outcomes', async () => {
    render(<AsteroidDriftScreen />)
    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.stubStats = {
      outcome: 'survived',
      survivalSeconds: ASTEROID_DRIFT_RULES.duration,
      orbsCollected: 5,
    }
    await stubGame.end()

    await waitFor(() => {
      expect(document.querySelector('#game-over-title')?.textContent).toBe(
        'DRIFT COMPLETE'
      )
      expect(document.querySelector('#final-outcome')?.textContent).toBe(
        'Survived'
      )
    })

    stubGame.stubStats = {
      outcome: 'expired',
      survivalSeconds: 3,
      orbsCollected: 0,
    }
    mutateState(stubGame, { orbsCollected: 0 })
    await stubGame.start()
    await stubGame.end()

    await waitFor(() => {
      expect(document.querySelector('#game-over-title')?.textContent).toBe(
        'DRIFT ENDED'
      )
      expect(document.querySelector('#final-outcome')?.textContent).toBe(
        'Expired'
      )
      expect(document.querySelector('#final-survival')?.textContent).toBe('3')
    })
  })

  it('Play Again immediately starts a fresh run (legacy auto-start)', async () => {
    render(<AsteroidDriftScreen />)
    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
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
        outcome: 'playing',
        score: 0,
        orbsCollected: 0,
      })
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<AsteroidDriftScreen />)
    await waitFor(() => {
      expect(initAsteroidDriftGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithAsteroidDriftGame).asteroidDriftGame
    ).toBeUndefined()
    // Session adapter (six events) and the initializer's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
