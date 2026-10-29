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
  SIGNAL_SWITCH_RULES,
  type SignalSwitchSignal,
} from '@cetus/games/signal-switch/types'

const { initSignalSwitchGameFrameworkMock } = vi.hoisted(() => ({
  initSignalSwitchGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/signal-switch/initFramework', () => ({
  initSignalSwitchGameFramework: initSignalSwitchGameFrameworkMock,
}))

import SignalSwitchScreen from './SignalSwitchScreen'

// Minimal portable BaseGame stub (same shape as the app-core tests): real
// lifecycle/event machinery, no DOM — the mocked initializer hands it to
// the island and the session adapter drives it for real.
class StubGame extends BaseGame<BaseGameState, BaseGameConfig, BaseGameStats> {
  stubStats = {
    outcome: 'systems-failed',
    safePasses: 2,
    crashes: 3,
    maxCombo: 2,
    integrityRemaining: 0,
  }

  createInitialState(): BaseGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      // Signal Switch-projected fields the island's projector reads.
      outcome: 'playing',
      activeLaneCount: 2,
      gateSignals: ['cyan', 'cyan', 'cyan', 'cyan'],
      drones: [],
      integrity: 3,
      safePasses: 0,
      crashes: 0,
      combo: 0,
      maxCombo: 0,
      droneSpeed: 140,
      spawnInterval: 3.2,
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

type WindowWithSignalSwitchGame = Window & {
  signalSwitchGame?: { cleanup: () => void }
}

type StubPatch = {
  integrity?: number
  combo?: number
  safePasses?: number
  activeLaneCount?: number
  droneSpeed?: number
  gateSignals?: SignalSwitchSignal[]
}

function mutateState(game: StubGame, patch: StubPatch): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  Object.assign(state, patch)
  // SignalSwitchGame announces HUD-only mutations through the shared
  // 'state-change' event (the session adapter refreshes on it).
  ;(
    game as unknown as {
      emit: (type: string, data?: unknown) => void
    }
  ).emit('state-change', { state: game.getState() })
}

describe('SignalSwitchScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.SIGNAL_SWITCH, {
      duration: SIGNAL_SWITCH_RULES.duration,
      pausable: true,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => {
      // Mirror the real restart(): re-sync bespoke gate controls after the
      // eventless reset (here: reset gates back to cyan).
      stubGame.reset()
      mutateState(stubGame, {
        gateSignals: ['cyan', 'cyan', 'cyan', 'cyan'],
      })
    })
    initSignalSwitchGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      getGame: () => stubGame,
      getState: () => stubGame.getState(),
      restart: restartMock,
      cleanup: cleanupMock,
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<SignalSwitchScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#signal-switch-container')
    expect(host).not.toBeNull()
    for (const id of [
      'signal-switch-canvas',
      'signal-switch-status',
      'gate-controls',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithSignalSwitchGame).signalSwitchGame
    ).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<SignalSwitchScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe(
      String(SIGNAL_SWITCH_RULES.duration)
    )
    expect(
      container.querySelector('#signal-switch-integrity')?.textContent
    ).toBe(String(SIGNAL_SWITCH_RULES.startingIntegrity))
    expect(container.querySelector('#signal-switch-combo')?.textContent).toBe(
      '0'
    )
    expect(
      container.querySelector('#signal-switch-safe-passes')?.textContent
    ).toBe('0')
    expect(container.querySelector('#signal-switch-lanes')?.textContent).toBe(
      '2 / 4'
    )
    expect(container.querySelector('#signal-switch-speed')?.textContent).toBe(
      String(SIGNAL_SWITCH_RULES.initialDroneSpeed)
    )
    // Custom control card: start/reset pair, no end button.
    expect(container.querySelector('#end-btn')).toBeNull()
    expect(container.querySelector('#start-btn')).not.toHaveStyle({
      display: 'none',
    })
    // Pre-hydration gate copy: deterministic Cyan gates, disabled.
    const gates = container.querySelectorAll(
      '#gate-controls [data-signal-lane]'
    )
    expect(gates).toHaveLength(4)
    expect([...gates].map(gate => gate.textContent)).toEqual([
      'Lane 1: ● Cyan',
      'Lane 2: ● Cyan',
      'Lane 3: ● Cyan',
      'Lane 4: ● Cyan',
    ])
    for (const gate of gates) {
      expect(gate).toBeDisabled()
    }
  })

  it('starts the run through session actions and hides the start button', async () => {
    const { container } = render(<SignalSwitchScreen />)
    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
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
    const { container } = render(<SignalSwitchScreen />)
    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      integrity: 2,
      combo: 2,
      safePasses: 3,
      activeLaneCount: 3,
      droneSpeed: 155.4,
    })

    await waitFor(() => {
      expect(
        container.querySelector('#signal-switch-integrity')?.textContent
      ).toBe('2')
      expect(container.querySelector('#signal-switch-combo')?.textContent).toBe(
        '2'
      )
      expect(
        container.querySelector('#signal-switch-safe-passes')?.textContent
      ).toBe('3')
      expect(container.querySelector('#signal-switch-lanes')?.textContent).toBe(
        '3 / 4'
      )
      // Same rounding as the legacy syncHud.
      expect(container.querySelector('#signal-switch-speed')?.textContent).toBe(
        '155'
      )
    })
  })

  it('Reset resets the session and re-syncs the bespoke gate controls', async () => {
    const { container } = render(<SignalSwitchScreen />)
    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    mutateState(stubGame, {
      gateSignals: ['magenta', 'cyan', 'cyan', 'cyan'],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(stubGame.getState().isActive).toBe(false)
    expect(stubGame.getState().gameStarted).toBe(false)
    expect(restartMock).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(container.querySelector('#start-btn')).not.toHaveStyle({
        display: 'none',
      })
    })
  })

  it('opens the overlay with SIGNAL LOST final stats on systems failure', async () => {
    render(<SignalSwitchScreen />)
    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(260, 'safe-pass')
    await stubGame.end()

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'SIGNAL LOST'
    )
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Systems failed'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('260')
    expect(document.querySelector('#final-safe-passes')?.textContent).toBe('2')
    expect(document.querySelector('#final-crashes')?.textContent).toBe('3')
    expect(document.querySelector('#final-max-combo')?.textContent).toBe('2')
    expect(document.querySelector('#final-integrity')?.textContent).toBe('0')
  })

  it('renders SHIFT COMPLETE / Survived from a survived outcome', async () => {
    render(<SignalSwitchScreen />)
    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.stubStats = {
      outcome: 'survived',
      safePasses: 12,
      crashes: 0,
      maxCombo: 5,
      integrityRemaining: 3,
    }
    await stubGame.end()

    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'SHIFT COMPLETE'
    )
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Survived'
    )
    expect(document.querySelector('#final-integrity')?.textContent).toBe('3')
  })

  it('Play Again immediately starts a fresh run (legacy auto-start)', async () => {
    render(<SignalSwitchScreen />)
    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(200, 'safe-pass')
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
      })
      expect(stubGame.getState().score).toBe(0)
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<SignalSwitchScreen />)
    await waitFor(() => {
      expect(initSignalSwitchGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithSignalSwitchGame).signalSwitchGame
    ).toBeUndefined()
    // Session adapter (six events) and the initializer's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
