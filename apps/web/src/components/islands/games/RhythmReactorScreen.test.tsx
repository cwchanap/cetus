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
  RHYTHM_REACTOR_RULES,
  type RhythmReactorJudgment,
} from '@cetus/games/rhythm-reactor/types'

const { initRhythmReactorGameFrameworkMock } = vi.hoisted(() => ({
  initRhythmReactorGameFrameworkMock: vi.fn(),
}))

vi.mock('@/lib/games/rhythm-reactor/initFramework', () => ({
  initRhythmReactorGameFramework: initRhythmReactorGameFrameworkMock,
}))

import RhythmReactorScreen from './RhythmReactorScreen'

// Minimal portable BaseGame stub (same shape as the app-core tests): real
// lifecycle/event machinery, no DOM — the mocked initializer hands it to
// the island and the session adapter drives it for real.
class StubGame extends BaseGame<BaseGameState, BaseGameConfig, BaseGameStats> {
  stubStats = {
    hits: 7,
    misses: 3,
    strayPresses: 2,
    perfectHits: 4,
    goodHits: 3,
    maxCombo: 5,
    accuracy: 83.333,
    finalStability: 74,
  }

  createInitialState(): BaseGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      // Rhythm Reactor-projected fields the island's projector reads.
      elapsedSeconds: 0,
      perfectHits: 0,
      goodHits: 0,
      misses: 0,
      strayPresses: 0,
      combo: 0,
      maxCombo: 0,
      stability: RHYTHM_REACTOR_RULES.initialStability,
      lastJudgment: null,
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

type WindowWithRhythmReactorGame = Window & {
  rhythmReactorGame?: { cleanup: () => void }
}

type StubPatch = {
  perfectHits?: number
  goodHits?: number
  combo?: number
  stability?: number
  lastJudgment?: RhythmReactorJudgment | null
}

function mutateState(game: StubGame, patch: StubPatch): void {
  const state = (
    game as unknown as {
      state: Record<string, unknown>
    }
  ).state
  Object.assign(state, patch)
  // RhythmReactorGame announces HUD-only mutations through the shared
  // 'state-change' event (the session adapter refreshes on it).
  ;(
    game as unknown as {
      emit: (type: string, data?: unknown) => void
    }
  ).emit('state-change', { state: game.getState() })
}

describe('RhythmReactorScreen', () => {
  let stubGame: StubGame
  let cleanupMock: ReturnType<typeof vi.fn>
  let restartMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    stubGame = new StubGame(GameID.RHYTHM_REACTOR, {
      duration: RHYTHM_REACTOR_RULES.duration,
      pausable: false,
      resettable: true,
      submitScore: vi.fn(async () => ({ success: true })),
    })
    cleanupMock = vi.fn()
    restartMock = vi.fn(() => {
      // Mirror the real restart(): re-sync bespoke lane controls after the
      // eventless reset (here: nothing bespoke to restore beyond reset).
      stubGame.reset()
    })
    initRhythmReactorGameFrameworkMock.mockResolvedValue({
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
    const { container } = render(<RhythmReactorScreen />)

    // SSR/host markup keeps the frozen e2e selectors.
    const host = container.querySelector('#rhythm-reactor-container')
    expect(host).not.toBeNull()
    for (const id of [
      'rhythm-reactor-canvas',
      'rhythm-reactor-status',
      'rhythm-reactor-controls',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    await waitFor(() => {
      expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })
    expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledWith(host)
    expect(
      (window as WindowWithRhythmReactorGame).rhythmReactorGame
    ).toBeDefined()
  })

  it('renders the idle HUD byte-equal to the legacy route', () => {
    const { container } = render(<RhythmReactorScreen />)

    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe(
      String(RHYTHM_REACTOR_RULES.duration)
    )
    expect(container.querySelector('#rhythm-reactor-combo')?.textContent).toBe(
      '0'
    )
    expect(container.querySelector('#rhythm-reactor-hits')?.textContent).toBe(
      '0'
    )
    expect(
      container.querySelector('#rhythm-reactor-judgment')?.textContent
    ).toBe('READY')
    expect(
      container.querySelector('#rhythm-reactor-stability')?.textContent
    ).toBe(String(RHYTHM_REACTOR_RULES.initialStability))
    // Custom control card: start/reset pair, no end/pause buttons.
    expect(container.querySelector('#end-btn')).toBeNull()
    expect(container.querySelector('#pause-btn')).toBeNull()
    expect(container.querySelector('#start-btn')).not.toHaveStyle({
      display: 'none',
    })
    // Pre-hydration lane copy: four disabled lane buttons.
    const lanes = container.querySelectorAll(
      '#rhythm-reactor-controls [data-rhythm-lane]'
    )
    expect(lanes).toHaveLength(4)
    expect([...lanes].map(lane => lane.textContent)).toEqual([
      'Lane 1 · D',
      'Lane 2 · F',
      'Lane 3 · J',
      'Lane 4 · K',
    ])
    for (const lane of lanes) {
      expect(lane).toBeDisabled()
    }
  })

  it('starts the run through session actions and hides the start button', async () => {
    const { container } = render(<RhythmReactorScreen />)
    await waitFor(() => {
      expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
      expect(container.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
  })

  it('projects combo, hits, judgment, and stability into the HUD spans', async () => {
    const { container } = render(<RhythmReactorScreen />)
    await waitFor(() => {
      expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    mutateState(stubGame, {
      perfectHits: 3,
      goodHits: 2,
      combo: 5,
      stability: 64,
      lastJudgment: 'perfect',
    })

    await waitFor(() => {
      expect(
        container.querySelector('#rhythm-reactor-combo')?.textContent
      ).toBe('5')
      expect(container.querySelector('#rhythm-reactor-hits')?.textContent).toBe(
        '5'
      )
      expect(
        container.querySelector('#rhythm-reactor-judgment')?.textContent
      ).toBe('PERFECT')
      expect(
        container.querySelector('#rhythm-reactor-stability')?.textContent
      ).toBe('64')
    })
  })

  it('Reset resets the session and re-syncs the bespoke lane controls', async () => {
    const { container } = render(<RhythmReactorScreen />)
    await waitFor(() => {
      expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    mutateState(stubGame, { combo: 2, lastJudgment: 'good' })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(stubGame.getState().isActive).toBe(false)
    expect(stubGame.getState().gameStarted).toBe(false)
    expect(restartMock).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(container.querySelector('#start-btn')).not.toHaveStyle({
        display: 'none',
      })
      // Reset restores the idle judgment (legacy READY sync).
      expect(
        container.querySelector('#rhythm-reactor-judgment')?.textContent
      ).toBe('READY')
    })
  })

  it('opens the overlay with RHYTHM RUN COMPLETE and every final stat', async () => {
    render(<RhythmReactorScreen />)
    await waitFor(() => {
      expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => {
      expect(stubGame.getState().isActive).toBe(true)
    })
    stubGame.addScore(730, 'perfect')
    await stubGame.end()

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    // The legacy route shipped a static overlay title; its end handler
    // never rewrote #game-over-title.
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'RHYTHM RUN COMPLETE'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('730')
    expect(document.querySelector('#final-hits')?.textContent).toBe('7')
    expect(document.querySelector('#final-misses')?.textContent).toBe('3')
    expect(document.querySelector('#final-stray-presses')?.textContent).toBe(
      '2'
    )
    expect(document.querySelector('#final-perfect')?.textContent).toBe('4')
    expect(document.querySelector('#final-good')?.textContent).toBe('3')
    expect(document.querySelector('#final-max-combo')?.textContent).toBe('5')
    // One-decimal accuracy (legacy syncHud formatting).
    expect(document.querySelector('#final-accuracy')?.textContent).toBe('83.3%')
    expect(document.querySelector('#final-stability')?.textContent).toBe('74')
  })

  it('Play Again immediately starts a fresh run (legacy auto-start)', async () => {
    render(<RhythmReactorScreen />)
    await waitFor(() => {
      expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledTimes(1)
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
      })
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
  })

  it('cleans up listeners, debug handle and initializer on unmount', async () => {
    const { unmount } = render(<RhythmReactorScreen />)
    await waitFor(() => {
      expect(initRhythmReactorGameFrameworkMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithRhythmReactorGame).rhythmReactorGame
    ).toBeUndefined()
    // Session adapter (six events) and the initializer's end listener are gone.
    expect(stubGame.listenerCount('start')).toBe(0)
    expect(stubGame.listenerCount('end')).toBe(0)
    expect(stubGame.listenerCount('state-change')).toBe(0)
  })
})
