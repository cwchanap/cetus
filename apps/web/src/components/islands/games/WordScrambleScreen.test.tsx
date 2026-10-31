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

const { initWordScrambleGameFrameworkMock } = vi.hoisted(() => ({
  initWordScrambleGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/word-scramble/initFramework', () => ({
  initWordScrambleGameFramework: initWordScrambleGameFrameworkMock,
}))

import WordScrambleScreen from './WordScrambleScreen'

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
      // Word Scramble board state.
      currentChallenge: null,
      wordsUnscrambled: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      currentAnswer: '',
      wordHistory: [],
    } as BaseGameState
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 42,
      gameCompleted: this.state.isGameOver,
      totalWords: 5,
      correctAnswers: 4,
      incorrectAnswers: 1,
      accuracy: 80,
      averageTimePerWord: 5,
      longestWord: 'keyboard',
      shortestWord: 'hi',
      wordsUnscrambled: [],
    } as BaseGameStats
  }

  cleanup(): void {}
}

type WindowWithWordScrambleGame = Window & {
  wordScrambleGame?: { cleanup: () => void }
}

describe('WordScrambleScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>
  let endGameMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.WORD_SCRAMBLE, {
      duration: 60,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => {
      stubGame.reset()
      stubGame.start()
    })
    endGameMock = vi.fn(() => stubGame.end())
    initWordScrambleGameFrameworkMock.mockResolvedValue({
      game: stubGame,
      cleanup: cleanupMock,
      restart: restartMock,
      getState: () => stubGame.getState(),
      endGame: endGameMock,
    })
  })

  afterEach(() => {
    // Stops any timer interval a test started.
    stubGame?.destroy()
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { container } = render(<WordScrambleScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    for (const id of [
      'scrambled-word',
      'word-difficulty',
      'answer-input',
      'submit-answer',
      'skip-word',
      'current-words',
      'current-correct',
      'current-score',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    const host = container.querySelector('.p-8.w-full.max-w-lg')
    expect(host).not.toBeNull()

    await waitFor(() => {
      expect(initWordScrambleGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initWordScrambleGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithWordScrambleGame).wordScrambleGame
    ).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<WordScrambleScreen />)

    expect(container.querySelector('#scrambled-word')?.textContent).toBe(
      'READY?'
    )
    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(container.querySelector('#total-words')?.textContent).toBe('0')
    expect(container.querySelector('#accuracy')?.textContent).toBe('0%')
    expect(container.querySelector('#longest-word')?.textContent).toBe('None')
    expect(
      (container.querySelector('#answer-input') as HTMLInputElement).disabled
    ).toBe(true)
    expect(
      (container.querySelector('#submit-answer') as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      (container.querySelector('#skip-word') as HTMLButtonElement).disabled
    ).toBe(true)
    // Legacy GamePage props: no pause/reset buttons on Word Scramble.
    expect(container.querySelector('#pause-btn')).toBeNull()
    expect(container.querySelector('#reset-btn')).toBeNull()
  })

  it('starts the run through session actions and swaps start for end', async () => {
    const { container } = render(<WordScrambleScreen />)
    await waitFor(() => {
      expect(initWordScrambleGameFrameworkMock).toHaveBeenCalledTimes(1)
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

  it('projects score updates into the shared badge', async () => {
    const { container } = render(<WordScrambleScreen />)
    await waitFor(() => {
      expect(initWordScrambleGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    stubGame.addScore(20, 'word_solved')
    await waitFor(() => {
      expect(container.querySelector('#score')?.textContent).toBe('20')
    })
  })

  it('ends through the End Game button and opens the overlay with final stats', async () => {
    render(<WordScrambleScreen />)
    await waitFor(() => {
      expect(initWordScrambleGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(30, 'word_solved')

    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    expect(endGameMock).toHaveBeenCalled()
    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    // Word Scramble's overlay title is the frozen GamePage overlayTitle prop.
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      "TIME'S UP!"
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('30')
    expect(document.querySelector('#total-words')?.textContent).toBe('5')
    expect(document.querySelector('#accuracy')?.textContent).toBe('80%')
    expect(document.querySelector('#longest-word')?.textContent).toBe(
      'keyboard'
    )
  })

  it('replays from the overlay play-again button through the initializer restart', async () => {
    render(<WordScrambleScreen />)
    await waitFor(() => {
      expect(initWordScrambleGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isGameOver).toBe(true)
    })

    // Legacy play-again restarted immediately (reset + start).
    fireEvent.click(
      document.querySelector('#play-again-btn') as HTMLButtonElement
    )

    expect(restartMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(stubGame.getState().isGameOver).toBe(false)
      expect(stubGame.getState().score).toBe(0)
    })
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<WordScrambleScreen />)
    await waitFor(() => {
      expect(initWordScrambleGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithWordScrambleGame).wordScrambleGame
    ).toBeUndefined()
    // Session adapter (six events) and the shared forwarder's end listener
    // are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('score-update')).toBe(0)
  })
})
