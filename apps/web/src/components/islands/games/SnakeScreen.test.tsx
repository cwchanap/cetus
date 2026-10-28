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

const { initSnakeGameFrameworkMock } = vi.hoisted(() => ({
  initSnakeGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/snake/initFramework', () => ({
  initSnakeGameFramework: initSnakeGameFrameworkMock,
}))

import SnakeScreen from './SnakeScreen'

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
      // Snake-projected fields the island's projector reads.
      snake: [],
      foodsEaten: 0,
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 12,
      gameCompleted: this.state.isGameOver,
      maxLength: 7,
      foodsEaten: 4,
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithSnakeGame = Window & {
  snakeGame?: { cleanup: () => void }
}

describe('SnakeScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.SNAKE, {
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    initSnakeGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      renderer: {},
      cleanup: cleanupMock,
      restart: () => stubGame.reset(),
      getState: () => stubGame.getState(),
      endGame: () => stubGame.end(),
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<SnakeScreen />)

    // SSR/host markup keeps the frozen e2e selector.
    const host = container.querySelector('#snake-container')
    expect(host).not.toBeNull()

    await waitFor(() => {
      expect(initSnakeGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initSnakeGameFrameworkMock).toHaveBeenCalledWith(host)
    expect((window as WindowWithSnakeGame).snakeGame).toBeDefined()
  })

  it('starts the run through session actions and swaps start for end', async () => {
    const { container } = render(<SnakeScreen />)
    await waitFor(() => {
      expect(initSnakeGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('opens the overlay with the structured result stats after ending', async () => {
    render(<SnakeScreen />)
    await waitFor(() => {
      expect(initSnakeGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(5, 'test')
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#final-score')?.textContent).toBe('5')
    expect(document.querySelector('#final-length')?.textContent).toBe('7')
    expect(document.querySelector('#final-foods')?.textContent).toBe('4')
    expect(document.querySelector('#final-time')?.textContent).toBe('12s')
  })

  it('replays from the overlay play-again button', async () => {
    render(<SnakeScreen />)
    await waitFor(() => {
      expect(initSnakeGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    fireEvent.click(
      document.querySelector('#play-again-btn') as HTMLButtonElement
    )

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    expect(stubGame.getState().isGameOver).toBe(false)
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<SnakeScreen />)
    await waitFor(() => {
      expect(initSnakeGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect((window as WindowWithSnakeGame).snakeGame).toBeUndefined()
    // Session adapter (six events) and the initializer's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('score-update')).toBe(0)
  })
})
