import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BaseGame,
  type BaseGameConfig,
  type BaseGameState,
  type BaseGameStats,
} from '@cetus/games'
import { GameID } from '@cetus/shared/games'
import { createBaseGameSession } from './createBaseGameSession'
import type { GameSession } from './types'
import { useGameSession } from './useGameSession'

// Minimal portable BaseGame stub: real lifecycle/event machinery, no DOM.
class StubGame extends BaseGame<BaseGameState, BaseGameConfig, BaseGameStats> {
  createInitialState(): BaseGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
    }
  }

  update(): void {}

  render(): void {}

  getGameStats(): BaseGameStats {
    return {
      finalScore: this.state.score,
      timeElapsed: 0,
      gameCompleted: this.state.isGameOver,
    }
  }

  cleanup(): void {}
}

function createStubGame(
  configOverrides: Partial<BaseGameConfig> = {}
): StubGame {
  return new StubGame(GameID.SNAKE, {
    duration: 60,
    pausable: true,
    resettable: true,
    submitScore: vi.fn(async () => ({ success: true })),
    ...configOverrides,
  })
}

const idleSnapshot = {
  status: 'idle',
  score: 0,
  timeRemaining: 60,
  projected: 0,
  result: null,
}

describe('useGameSession', () => {
  let game: StubGame

  afterEach(() => {
    // Stops any timer interval the test started.
    game?.destroy()
  })

  it('returns the idle snapshot with actions and capabilities', () => {
    game = createStubGame()
    const session = createBaseGameSession(game, state => state.score)

    const { result } = renderHook(() => useGameSession(session))

    expect(result.current.snapshot).toEqual(idleSnapshot)
    expect(result.current.capabilities).toEqual({
      pausable: true,
      resettable: true,
    })
    for (const action of [
      result.current.actions.start,
      result.current.actions.pause,
      result.current.actions.resume,
      result.current.actions.reset,
    ]) {
      expect(action).toBeTypeOf('function')
    }
  })

  it('drives snapshot updates through the start/pause/resume/reset cycle', () => {
    game = createStubGame()
    const session = createBaseGameSession(game, state => state.score)
    const { result } = renderHook(() => useGameSession(session))

    act(() => result.current.actions.start())
    expect(result.current.snapshot.status).toBe('running')

    act(() => result.current.actions.pause())
    expect(result.current.snapshot.status).toBe('paused')

    act(() => result.current.actions.resume())
    expect(result.current.snapshot.status).toBe('running')

    act(() => result.current.actions.reset())
    expect(result.current.snapshot).toEqual(idleSnapshot)
  })

  it('surfaces the structured end result without resubmitting', async () => {
    const submitScore = vi.fn(async () => ({ success: true }))
    game = createStubGame({ submitScore })
    const session = createBaseGameSession(game, state => state.score)
    const { result } = renderHook(() => useGameSession(session))

    act(() => result.current.actions.start())
    act(() => game.addScore(7, 'test'))
    await act(async () => {
      await game.end()
    })

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(result.current.snapshot.status).toBe('finished')
    expect(result.current.snapshot.result?.score).toBe(7)
  })

  it('keeps the snapshot reference stable across no-op re-renders', () => {
    game = createStubGame()
    const session = createBaseGameSession(game, state => state.score)
    const { result, rerender } = renderHook(() => useGameSession(session))

    const first = result.current.snapshot
    rerender()
    rerender()

    expect(result.current.snapshot).toBe(first)
  })

  it('unsubscribes from the session on unmount', () => {
    game = createStubGame()
    const session = createBaseGameSession(game, state => state.score)
    let activeSubscriptions = 0
    const counted: GameSession<number> = {
      ...session,
      subscribe: onStoreChange => {
        activeSubscriptions++
        const unsubscribe = session.subscribe(onStoreChange)
        return () => {
          activeSubscriptions--
          unsubscribe()
        }
      },
    }

    const { unmount } = renderHook(() => useGameSession(counted))
    expect(activeSubscriptions).toBe(1)

    unmount()
    expect(activeSubscriptions).toBe(0)
  })
})
