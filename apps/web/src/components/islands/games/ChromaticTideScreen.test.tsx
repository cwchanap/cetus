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
  ChromaticTideState,
  ChromaticTideStats,
} from '@cetus/games/chromatic-tide/types'

const { initChromaticTideGameFrameworkMock } = vi.hoisted(() => ({
  initChromaticTideGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/chromatic-tide/initFramework', () => ({
  initChromaticTideGameFramework: initChromaticTideGameFrameworkMock,
}))

import ChromaticTideScreen from './ChromaticTideScreen'

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
      // Chromatic-Tide-projected fields the island's projector reads.
      outcome: 'playing',
      movesUsed: 0,
      capturedCells: 143,
      initialCapturedCells: 143,
      territoryColor: 'teal',
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 12,
      gameCompleted: false,
      outcome: 'cleared',
      movesUsed: 1,
      capturedCells: 144,
      initialCapturedCells: 143,
      secondsRemaining: 78,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithChromaticTideGame = Window & {
  chromaticTideGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<Pick<ChromaticTideState, 'movesUsed' | 'capturedCells'>>
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

describe('ChromaticTideScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.CHROMATIC_TIDE, {
      duration: 90,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    initChromaticTideGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      getGame: () => stubGame,
      cleanup: cleanupMock,
      getState: () => stubGame.getState(),
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<ChromaticTideScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#chromatic-tide-container')
    expect(host).not.toBeNull()
    expect(container.querySelector('#chromatic-tide-board')).not.toBeNull()
    const status = container.querySelector('#chromatic-tide-status')
    expect(status).not.toBeNull()
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(container.querySelector('#chromatic-tide-colors')).not.toBeNull()
    // Five color controls, disabled until a run starts (legacy static state;
    // the initializer keeps managing disabled/aria-pressed).
    const colorButtons = container.querySelectorAll('[data-tide-color]')
    expect(colorButtons).toHaveLength(5)
    for (const button of colorButtons) {
      expect(button).toBeDisabled()
    }

    await waitFor(() => {
      expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithChromaticTideGame).chromaticTideGame
    ).toBeDefined()
  })

  it('renders the idle HUD projection byte-equal to the legacy spans', async () => {
    const { container } = render(<ChromaticTideScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('90')
    expect(container.querySelector('#moves')?.textContent).toBe('0')
    // Idle SSR matches the legacy static '0 / 144' literal.
    expect(container.querySelector('#captured')?.textContent).toBe('0 / 144')
  })

  it('starts the run through session actions; no end/pause buttons exist', async () => {
    const { container } = render(<ChromaticTideScreen />)
    await waitFor(() => {
      expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('projects move/capture mutations into the stats spans', async () => {
    const { container } = render(<ChromaticTideScreen />)
    await waitFor(() => {
      expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, { movesUsed: 1, capturedCells: 144 })

    await waitFor(() => {
      expect(container.querySelector('#moves')?.textContent).toBe('1')
    })
    expect(container.querySelector('#captured')?.textContent).toBe('144 / 144')
  })

  it('opens the overlay with the structured result stats after ending', async () => {
    render(<ChromaticTideScreen />)
    await waitFor(() => {
      expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(2645, 'clear')

    stubGame.end()

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'TIDE COMPLETE!'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('2645')
    expect(document.querySelector('#final-outcome')?.textContent).toBe(
      'Cleared'
    )
    expect(document.querySelector('#final-moves')?.textContent).toBe('1')
    expect(document.querySelector('#final-captured')?.textContent).toBe(
      '144 / 144'
    )
    expect(document.querySelector('#final-time')?.textContent).toBe('00:12')
  })

  it('replays from the overlay play-again button through a single session reset', async () => {
    render(<ChromaticTideScreen />)
    await waitFor(() => {
      expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.end()
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    const resetSpy = vi.spyOn(stubGame, 'reset')
    fireEvent.click(
      document.querySelector('#play-again-btn') as HTMLButtonElement
    )

    // A single reset: the game's onGameReset state-change re-renders the
    // fresh board; a second reset would deal a hidden replacement board.
    expect(resetSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(false)
      expect(stubGame.getState().isActive).toBe(false)
    })
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('resets through the Reset button', async () => {
    render(<ChromaticTideScreen />)
    await waitFor(() => {
      expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })

    const resetSpy = vi.spyOn(stubGame, 'reset')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(resetSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(false)
      expect(stubGame.getState().gameStarted).toBe(false)
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<ChromaticTideScreen />)
    await waitFor(() => {
      expect(initChromaticTideGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithChromaticTideGame).chromaticTideGame
    ).toBeUndefined()
    // Session adapter (six events + state-change) and the shared
    // forwarder's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
