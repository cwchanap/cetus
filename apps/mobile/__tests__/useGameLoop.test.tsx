import React, { useState } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { BaseGame, type BaseGameConfig, type BaseGameState } from '@cetus/games'

import { useGameLoop } from '../src/games/canvas/useGameLoop'

let rafQueue: Array<{ id: number; cb: (time: number) => void }> = []
let nextRafId = 1
const appStateHandlers = new Set<(state: AppStateStatus) => void>()

const fireFrame = (time: number) => {
  const entry = rafQueue.shift()
  if (!entry) {
    throw new Error('no frame scheduled')
  }
  act(() => {
    entry.cb(time)
  })
}

const emitAppState = (state: AppStateStatus) => {
  act(() => {
    for (const handler of appStateHandlers) {
      handler(state)
    }
  })
}

interface LoopGameState extends BaseGameState {
  hazards: number[]
}

class LoopTestGame extends BaseGame<LoopGameState> {
  readonly deltas: number[] = []
  endDuringUpdate = false

  constructor(config: BaseGameConfig) {
    super(GameID.GRAVITY_FLIP, config, {}, { basePoints: 10 })
  }

  override createInitialState(): LoopGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      hazards: [],
    }
  }

  override update(deltaSeconds: number): void {
    this.deltas.push(deltaSeconds)
    this.state.hazards.push(this.state.hazards.length)
    if (this.endDuringUpdate) {
      this.endDuringUpdate = false
      void this.end()
    }
  }

  override render(): void {}
  override cleanup(): void {}
  override getGameStats() {
    return {
      finalScore: this.state.score,
      timeElapsed: 0,
      gameCompleted: true,
    }
  }
}

const submitScore = jest.fn(async () => ({ success: true }))
const createdGames: LoopTestGame[] = []

const makeGame = (pausable: boolean) => {
  const game = new LoopTestGame({
    duration: 90,
    pausable,
    resettable: true,
    submitScore,
    platform: 'ios',
  })
  createdGames.push(game)
  return game
}

const mountedScenes: LoopGameState[] = []

const LoopHarness = ({ game }: { game: LoopTestGame }) => {
  const [scene, setScene] = useState<LoopGameState | null>(null)
  useGameLoop(game, () => {
    const state = game.getState()
    const copy = { ...state, hazards: [...state.hazards] }
    mountedScenes.push(copy)
    setScene(copy)
  })
  return (
    <Text testID="scene-hazards">{scene?.hazards.join(',') ?? 'none'}</Text>
  )
}

const mount = (game: LoopTestGame) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  act(() => {
    tree = TestRenderer.create(<LoopHarness game={game} />)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  return tree
}

beforeEach(() => {
  rafQueue = []
  nextRafId = 1
  appStateHandlers.clear()
  mountedScenes.length = 0
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    return id
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => {
    rafQueue = rafQueue.filter(entry => entry.id !== id)
  })
  jest
    .mocked(AppState.addEventListener)
    .mockImplementation((_type, listener) => {
      appStateHandlers.add(listener)
      return { remove: () => appStateHandlers.delete(listener) }
    })
})

afterEach(() => {
  jest.restoreAllMocks()
  for (const game of createdGames.splice(0)) {
    game.destroy()
  }
})

describe('useGameLoop', () => {
  test('invokes onFrame once at mount and stays inert while the game is idle', () => {
    const game = makeGame(false)
    mount(game)

    expect(mountedScenes).toHaveLength(1)
    expect(mountedScenes[0].isActive).toBe(false)

    fireFrame(16)
    fireFrame(32)

    expect(game.deltas).toEqual([])
    expect(mountedScenes).toHaveLength(1)
  })

  test('steps the model with a zero first delta, then the real frame delta', () => {
    const game = makeGame(false)
    mount(game)
    act(() => {
      game.start()
    })

    fireFrame(100)
    fireFrame(116)
    fireFrame(132)

    expect(game.deltas).toEqual([0, 0.016, 0.016])
    expect(mountedScenes).toHaveLength(4)
    expect(mountedScenes.at(-1)?.hazards).toEqual([0, 1, 2])
  })

  test('clamps the delta at 0.1s while an ordinary 0.08s hitch passes through', () => {
    const game = makeGame(false)
    mount(game)
    act(() => {
      game.start()
    })

    fireFrame(100)
    fireFrame(180)
    fireFrame(500)
    fireFrame(490)

    expect(game.deltas).toEqual([0, 0.08, 0.1, 0])
  })

  test('pause skips updates and resume restarts timing from a zero delta', () => {
    const game = makeGame(true)
    mount(game)
    act(() => {
      game.start()
    })
    fireFrame(100)
    fireFrame(116)
    expect(game.deltas).toEqual([0, 0.016])

    act(() => {
      game.pause()
    })
    fireFrame(200)
    expect(mountedScenes.at(-1)?.isPaused).toBe(true)
    fireFrame(232)
    expect(game.deltas).toEqual([0, 0.016])
    expect(mountedScenes).toHaveLength(4)

    act(() => {
      game.resume()
    })
    fireFrame(300)
    fireFrame(316)
    expect(game.deltas).toEqual([0, 0.016, 0, 0.016])
  })

  test('a mid-run reset syncs the cleared scene without a model state-change', () => {
    const game = makeGame(false)
    mount(game)
    act(() => {
      game.start()
    })
    fireFrame(100)
    fireFrame(116)
    expect(mountedScenes.at(-1)?.hazards).toEqual([0, 1])

    act(() => {
      game.reset()
    })
    fireFrame(200)

    const scene = mountedScenes.at(-1)
    expect(scene?.isActive).toBe(false)
    expect(scene?.hazards).toEqual([])
    expect(game.deltas).toEqual([0, 0.016])
  })

  test('an update that ends the run still produces the final scene in the same frame', () => {
    const game = makeGame(false)
    mount(game)
    act(() => {
      game.start()
    })
    fireFrame(100)

    game.endDuringUpdate = true
    fireFrame(116)

    const scene = mountedScenes.at(-1)
    expect(scene?.isGameOver).toBe(true)
    expect(scene?.isActive).toBe(false)

    fireFrame(200)
    expect(game.deltas).toEqual([0, 0.016])
    expect(mountedScenes).toHaveLength(3)
  })

  test('start and replay transitions each re-sync the scene once', async () => {
    const game = makeGame(false)
    mount(game)
    act(() => {
      game.start()
    })
    fireFrame(100)
    await act(async () => {
      await game.end()
    })

    fireFrame(116)
    expect(mountedScenes.at(-1)?.isGameOver).toBe(true)
    const scenesAfterFinish = mountedScenes.length

    const previousRunId = game.getRunId()
    act(() => {
      game.start()
    })
    fireFrame(132)

    expect(game.getRunId()).toBeGreaterThan(previousRunId)
    const scene = mountedScenes.at(-1)
    expect(scene?.isActive).toBe(true)
    expect(scene?.isGameOver).toBe(false)
    expect(mountedScenes).toHaveLength(scenesAfterFinish + 1)
    expect(game.deltas).toEqual([0, 0])
  })

  test('a foreground return resets timing instead of stepping a stale delta', () => {
    const game = makeGame(false)
    mount(game)
    act(() => {
      game.start()
    })
    fireFrame(100)
    fireFrame(116)
    expect(game.deltas).toEqual([0, 0.016])

    emitAppState('background')
    emitAppState('active')
    fireFrame(5000)

    expect(game.deltas).toEqual([0, 0.016, 0])
  })

  test('keeps exactly one frame scheduled, ignores React re-renders and cancels on unmount', () => {
    const game = makeGame(false)
    const tree = mount(game)
    expect(rafQueue).toHaveLength(1)

    fireFrame(100)
    fireFrame(116)
    expect(rafQueue).toHaveLength(1)

    const scenesBefore = mountedScenes.length
    act(() => {
      tree.update(<LoopHarness game={game} />)
    })
    expect(rafQueue).toHaveLength(1)
    expect(mountedScenes).toHaveLength(scenesBefore)

    act(() => {
      tree.unmount()
    })
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(rafQueue).toHaveLength(0)
    expect(appStateHandlers.size).toBe(0)
  })
})
