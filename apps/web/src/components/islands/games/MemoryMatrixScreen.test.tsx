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

const { initMemoryMatrixGameFrameworkMock } = vi.hoisted(() => ({
  initMemoryMatrixGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/memory-matrix/initFramework', () => ({
  initMemoryMatrixGameFramework: initMemoryMatrixGameFrameworkMock,
}))

import MemoryMatrixScreen from './MemoryMatrixScreen'

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
      // Memory-Matrix-projected fields the island's projector reads.
      matchedPairs: 0,
      totalPairs: 24,
      accuracy: 0,
      matchesFound: 0,
      totalAttempts: 0,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 12,
      gameCompleted: this.state.isGameOver,
      matchesFound: 2,
      totalAttempts: 4,
      accuracy: 50,
      gameWon: false,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithMemoryMatrixGame = Window & {
  memoryMatrixGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<{
    matchedPairs: number
    totalPairs: number
    accuracy: number
    matchesFound: number
    totalAttempts: number
  }>
): void {
  const state = (
    game as unknown as {
      state: Record<string, number>
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

describe('MemoryMatrixScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.MEMORY_MATRIX, {
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => stubGame.reset())
    initMemoryMatrixGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      cleanup: cleanupMock,
      restart: restartMock,
      getState: () => stubGame.getState(),
      endGame: () => stubGame.end(),
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<MemoryMatrixScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#memory-matrix-container')
    expect(host).not.toBeNull()
    expect(container.querySelector('#memory-board')).not.toBeNull()

    await waitFor(() => {
      expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithMemoryMatrixGame).memoryMatrixGame
    ).toBeDefined()
  })

  it('renders the idle HUD projection byte-equal to the legacy spans', async () => {
    const { container } = render(<MemoryMatrixScreen />)

    expect(container.querySelector('#game-score')?.textContent).toBe('0')
    expect(container.querySelector('#game-time')?.textContent).toBe('1:00')
    expect(container.querySelector('#game-pairs')?.textContent).toBe('0/24')
    expect(container.querySelector('#game-accuracy')?.textContent).toBe('0%')
    expect(container.querySelector('#pairs-found')?.textContent).toBe('0')
    expect(container.querySelector('#total-attempts')?.textContent).toBe('0')
  })

  it('starts the run through session actions and swaps start for end', async () => {
    const { container } = render(<MemoryMatrixScreen />)
    await waitFor(() => {
      expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('projects HUD-only state-change mutations into the stats spans', async () => {
    const { container } = render(<MemoryMatrixScreen />)
    await waitFor(() => {
      expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      matchedPairs: 2,
      accuracy: 50,
      matchesFound: 2,
      totalAttempts: 4,
    })
    stubGame.addScore(200, 'test')

    await waitFor(() => {
      expect(container.querySelector('#game-score')?.textContent).toBe('200')
    })
    expect(container.querySelector('#game-pairs')?.textContent).toBe('2/24')
    expect(container.querySelector('#game-accuracy')?.textContent).toBe('50%')
    expect(container.querySelector('#pairs-found')?.textContent).toBe('2')
    expect(container.querySelector('#total-attempts')?.textContent).toBe('4')
  })

  it('opens the overlay with the structured result stats after ending', async () => {
    render(<MemoryMatrixScreen />)
    await waitFor(() => {
      expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(300, 'test')
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      "TIME'S UP!"
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('300')
    expect(document.querySelector('#final-pairs')?.textContent).toBe('2/24')
    expect(document.querySelector('#final-accuracy')?.textContent).toBe('50%')
    expect(document.querySelector('#final-time')?.textContent).toBe('60s')
    expect(document.querySelector('#final-attempts')?.textContent).toBe('4')
  })

  it('replays from the overlay play-again button through one session reset', async () => {
    render(<MemoryMatrixScreen />)
    await waitFor(() => {
      expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    const resetSpy = vi.spyOn(stubGame, 'reset')
    fireEvent.click(
      document.querySelector('#play-again-btn') as HTMLButtonElement
    )

    // One reset per click: restart()+actions.reset() used to reset twice.
    expect(resetSpy).toHaveBeenCalledTimes(1)
    expect(restartMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(false)
      expect(stubGame.getState().isActive).toBe(false)
    })
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('resets through the Reset button with one reset per click', async () => {
    render(<MemoryMatrixScreen />)
    await waitFor(() => {
      expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })

    const resetSpy = vi.spyOn(stubGame, 'reset')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    // One reset per click: restart()+actions.reset() used to reset twice.
    expect(resetSpy).toHaveBeenCalledTimes(1)
    expect(restartMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(false)
      expect(stubGame.getState().gameStarted).toBe(false)
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<MemoryMatrixScreen />)
    await waitFor(() => {
      expect(initMemoryMatrixGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithMemoryMatrixGame).memoryMatrixGame
    ).toBeUndefined()
    // Session adapter (six events + state-change) and the shared
    // forwarder's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('score-update')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
