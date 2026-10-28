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
  PotionSorterDifficulty,
  PotionSorterStats,
} from '@cetus/games/potion-sorter/types'

const { initPotionSorterGameFrameworkMock } = vi.hoisted(() => ({
  initPotionSorterGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/potion-sorter/initFramework', () => ({
  initPotionSorterGameFramework: initPotionSorterGameFrameworkMock,
}))

import PotionSorterScreen from './PotionSorterScreen'

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
      // Potion-Sorter-projected fields the island's projector reads.
      difficulty: 'medium',
      movesMade: 0,
      undosUsed: 0,
      result: 'playing',
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
      solved: true,
      result: 'solved',
      movesMade: 10,
      undosUsed: 1,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithPotionSorterGame = Window & {
  potionSorterGame?: { cleanup: () => void }
}

function mutateState(
  game: StubGame,
  patch: Partial<{
    difficulty: PotionSorterDifficulty
    movesMade: number
    undosUsed: number
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

describe('PotionSorterScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.POTION_SORTER, {
      duration: 300,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => stubGame.reset())
    initPotionSorterGameFrameworkMock.mockResolvedValue({
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
    const { container } = render(<PotionSorterScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#potion-sorter-container')
    expect(host).not.toBeNull()
    expect(container.querySelector('#potion-sorter-board')).not.toBeNull()
    expect(container.querySelector('#potion-sorter-status')).not.toBeNull()
    for (const id of [
      'easy-btn',
      'medium-btn',
      'hard-btn',
      'undo-btn',
      'difficulty',
      'moves',
      'undos',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    // The undo button starts disabled with the dead-end flag cleared
    // (legacy static markup); the initializer re-syncs it after mounting.
    const undoButton = container.querySelector('#undo-btn') as HTMLButtonElement
    expect(undoButton.disabled).toBe(true)
    expect(undoButton.dataset.deadEnd).toBe('false')

    await waitFor(() => {
      expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithPotionSorterGame).potionSorterGame
    ).toBeDefined()
  })

  it('renders the idle HUD projection byte-equal to the legacy spans', async () => {
    const { container } = render(<PotionSorterScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('300')
    expect(container.querySelector('#difficulty')?.textContent).toBe('Medium')
    expect(container.querySelector('#moves')?.textContent).toBe('0')
    expect(container.querySelector('#undos')?.textContent).toBe('0')
  })

  it('starts the run through session actions; no end/pause buttons exist', async () => {
    const { container } = render(<PotionSorterScreen />)
    await waitFor(() => {
      expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('projects difficulty/move/undo mutations into the stats spans', async () => {
    const { container } = render(<PotionSorterScreen />)
    await waitFor(() => {
      expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      difficulty: 'easy',
      movesMade: 3,
      undosUsed: 2,
    })

    await waitFor(() => {
      expect(container.querySelector('#difficulty')?.textContent).toBe('Easy')
    })
    expect(container.querySelector('#moves')?.textContent).toBe('3')
    expect(container.querySelector('#undos')?.textContent).toBe('2')
  })

  it('opens the overlay with the structured result stats after ending', async () => {
    render(<PotionSorterScreen />)
    await waitFor(() => {
      expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(2500, 'solve')

    stubGame.end()

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'SOLVED!'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('2500')
    expect(document.querySelector('#final-outcome')?.textContent).toBe('Solved')
    expect(document.querySelector('#final-difficulty')?.textContent).toBe(
      'Easy'
    )
    expect(document.querySelector('#final-moves')?.textContent).toBe('10')
    expect(document.querySelector('#final-undos')?.textContent).toBe('1')
    expect(document.querySelector('#final-time')?.textContent).toBe('00:08')
  })

  it('replays from the overlay play-again button through the initializer restart', async () => {
    render(<PotionSorterScreen />)
    await waitFor(() => {
      expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledTimes(1)
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
    render(<PotionSorterScreen />)
    await waitFor(() => {
      expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledTimes(1)
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
    const { unmount } = render(<PotionSorterScreen />)
    await waitFor(() => {
      expect(initPotionSorterGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithPotionSorterGame).potionSorterGame
    ).toBeUndefined()
    // Session adapter (six events + state-change) and the shared
    // forwarder's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
