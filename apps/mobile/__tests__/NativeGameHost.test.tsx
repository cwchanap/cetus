import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Platform, Pressable, Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import type { ScoreData } from '@cetus/shared/scores'
import { BaseGame, type BaseGameConfig, type BaseGameState } from '@cetus/games'

jest.mock('../src/lib/api', () => ({
  api: {
    submitScore: jest.fn(),
  },
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

// Wrap the two host seams whose cleanup ORDER is the contract under test;
// each wrapper delegates to the real implementation. The `mock` prefix is
// required by babel-plugin-jest-hoist (the factory runs before imports).
const mockCleanupOrder: string[] = []
jest.mock('@cetus/app-core', () => {
  const actual =
    jest.requireActual<typeof import('@cetus/app-core')>('@cetus/app-core')
  return {
    ...actual,
    forwardBaseGameResults: (game: unknown, handlers: unknown) => {
      const remove = actual.forwardBaseGameResults(
        game as Parameters<typeof actual.forwardBaseGameResults>[0],
        handlers as Parameters<typeof actual.forwardBaseGameResults>[1]
      )
      return () => {
        mockCleanupOrder.push('forwarder-removed')
        remove()
      }
    },
    createBaseGameSession: (
      game: Parameters<typeof actual.createBaseGameSession>[0],
      project: Parameters<typeof actual.createBaseGameSession>[1]
    ) => {
      const session = actual.createBaseGameSession(game, project)
      const dispose = session.dispose.bind(session)
      ;(session as { dispose: () => void }).dispose = () => {
        mockCleanupOrder.push('session-disposed')
        dispose()
      }
      return session
    },
  }
})

import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import {
  NATIVE_GAMES,
  type NativeGameHostDeps,
  type NativeGamePort,
  type NativeGameViewProps,
} from '../src/games/registry'

const submitScore = jest.mocked(api.submitScore)

// --- minimal concrete @cetus/games fixture ---------------------------------

interface TestGameState extends BaseGameState {
  board: number[]
}

class TestNativeGame extends BaseGame<TestGameState> {
  constructor(config: BaseGameConfig) {
    super(GameID.QUICK_MATH, config, {}, { basePoints: 10 })
  }

  override createInitialState(): TestGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      board: [1, 2, 3],
    }
  }

  override update(): void {}
  override render(): void {}
  override cleanup(): void {}

  override getGameStats() {
    return {
      finalScore: this.state.score,
      timeElapsed: this.config.duration - this.state.timeRemaining,
      gameCompleted: true,
    }
  }

  /** Visible-state mutation that emits the shared state-change event. */
  flipBoardCell(index: number): void {
    this.state.board[index] += 1
    this.emit('state-change', { state: this.getState() })
  }
}

let capturedDeps: NativeGameHostDeps | undefined
const createdGames: TestNativeGame[] = []

const TestBoardView = ({ projected }: NativeGameViewProps) => (
  <Text testID="native-board">{(projected.board as number[]).join(',')}</Text>
)

// Board whose input handler drives the HOST-created instance through the
// per-instance `game` binding — the Chromatic-Tide chooseColor shape.
const InteractiveBoardView = ({ projected, game }: NativeGameViewProps) => (
  <>
    <Text testID="native-board">{(projected.board as number[]).join(',')}</Text>
    <Pressable
      accessibilityLabel="Flip first cell"
      onPress={() => (game as TestNativeGame).flipBoardCell(0)}
    >
      <Text>Flip</Text>
    </Pressable>
  </>
)

const testPort: NativeGamePort = {
  createGame(deps) {
    capturedDeps = deps
    const game = new TestNativeGame({
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: deps.submitScore,
      platform: deps.platform,
    })
    createdGames.push(game)
    return game
  },
  project: state => ({ board: [...(state as TestGameState).board] }),
  view: TestBoardView,
}

// Fill the Stage 2/3 seam with a real port for this file only; each Jest
// file gets a fresh module registry, so the production map is untouched.
const originalEntry = NATIVE_GAMES[GameID.QUICK_MATH]
beforeAll(() => {
  NATIVE_GAMES[GameID.QUICK_MATH] = { port: testPort }
})
afterAll(() => {
  NATIVE_GAMES[GameID.QUICK_MATH] = originalEntry
})

const drain = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25))
  })
}

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  await drain()
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  return tree
}

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    button.props.onPress()
  })
}

const scalarText = (children: React.ReactNode): string => {
  if (Array.isArray(children)) {
    return children.map(scalarText).join('')
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  return ''
}

const renderedText = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => scalarText(node.props.children))
    .join('\n')

beforeEach(() => {
  submitScore.mockReset()
  capturedDeps = undefined
  createdGames.length = 0
  mockCleanupOrder.length = 0
})

describe('NativeGameHost — session wiring', () => {
  test('creates the concrete game once with the api submitter and Platform.OS', async () => {
    await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    expect(createdGames).toHaveLength(1)
    expect(capturedDeps?.platform).toBe(Platform.OS)
    expect(capturedDeps?.platform).toBe('ios')

    const scoreData: ScoreData = { gameId: GameID.QUICK_MATH, score: 5 }
    const submit = capturedDeps?.submitScore
    expect(submit).toBeDefined()
    if (submit) {
      await submit(scoreData)
    }
    expect(submitScore).toHaveBeenCalledWith(scoreData)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('renders the shared chrome and the ported view with the projection', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(
      tree.root.findByProps({ testID: 'native-board' }).props.children
    ).toBe('1,2,3')
  })

  test('start/pause/reset flow through the session actions', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    expect(createdGames[0].getTimerStatus().isRunning).toBe(true)

    await press(tree, 'Pause game')
    expect(createdGames[0].getState().isPaused).toBe(true)

    await press(tree, 'Resume game')
    expect(createdGames[0].getState().isPaused).toBe(false)

    await press(tree, 'Reset game')
    expect(createdGames[0].getState().isActive).toBe(false)
  })
})

describe('NativeGameHost — Platform.OS score submitter contract', () => {
  test('a completed run submits once through api.submitScore with the OS platform, on ios and android', async () => {
    submitScore.mockResolvedValue({ success: true })
    const originalOS = Platform.OS
    try {
      // The single submitter-contract test drives a completed run per OS
      // label: Platform.OS must flow into ScoreData.platform verbatim.
      for (const os of ['ios', 'android'] as const) {
        Platform.OS = os
        submitScore.mockClear()
        createdGames.length = 0
        const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

        await press(tree, 'Start game')
        await act(async () => {
          createdGames[0].addScore(25, 'run')
        })
        await act(async () => {
          await createdGames[0].end()
        })
        await drain()

        expect(submitScore).toHaveBeenCalledTimes(1)
        expect(submitScore).toHaveBeenCalledWith(
          expect.objectContaining({
            gameId: GameID.QUICK_MATH,
            platform: os,
            score: 25,
          })
        )
        expect(renderedText(tree)).toContain('Score saved')
        // Replay restarts the run through the same single session.
        await press(tree, 'Play again')
        expect(createdGames[0].getState().isActive).toBe(true)
        // Stop the live timer and drop this OS's host before the next one.
        await act(async () => {
          createdGames[0].pause()
        })
        await act(async () => {
          tree.unmount()
        })
      }
    } finally {
      Platform.OS = originalOS
    }
  })

  test('provisional pending result shows before the save settles', async () => {
    let releaseSave: ((value: { success: boolean }) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    // Fire-and-forget: the awaited save lives INSIDE end(), so the
    // provisional result must surface before the deferred save settles.
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()

    expect(renderedText(tree)).toContain('Saving score…')

    await act(async () => {
      releaseSave?.({ success: true })
    })
    await drain()
    expect(renderedText(tree)).toContain('Score saved')
  })

  test('a failed save reports unconfirmed with its public code, never fake-saved', async () => {
    submitScore.mockResolvedValue({ success: false, code: 'NETWORK_ERROR' })
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    const rendered = renderedText(tree)
    // The network message stays honest: the request may have committed.
    expect(rendered).toContain('may still have been saved')
    expect(rendered).not.toContain('Score saved')
    // Never auto-retried.
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('NativeGameHost — reward banner', () => {
  test('forwards committed rewards into one banner after the structured end', async () => {
    submitScore.mockResolvedValue({ success: true })
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    await act(async () => {
      createdGames[0].emit('end', {
        score: 10,
        stats: { finalScore: 10, timeElapsed: 1, gameCompleted: true },
        runId: createdGames[0].getRunId(),
        save: { success: true },
        newAchievements: [
          {
            id: 'ach-1',
            name: 'Deep Thinker',
            description: 'd',
            icon: '🧠',
            rarity: 'rare',
          },
        ],
        challengeUpdates: {
          completedChallenges: [
            {
              id: 'ch-1',
              name: 'Daily drill',
              description: 'd',
              icon: '🎯',
              xpReward: 10,
            },
          ],
          xpEarned: 10,
          levelUp: false,
        },
      })
    })
    await drain()

    // jest-expo's View mock matches its own props on both the wrapper and
    // host fiber, so count the rendered text instead: one delivery means
    // each reward name appears exactly once in the tree.
    const rendered = renderedText(tree)
    expect(rendered.match(/Deep Thinker/g)).toHaveLength(1)
    expect(rendered.match(/Daily drill/g)).toHaveLength(1)
    expect(rendered).toContain('Achievement unlocked')
    expect(rendered).toContain('Challenge complete')
    // Stop the live timer so no tick lands after the test ends.
    await act(async () => {
      createdGames[0].pause()
    })
  })

  test('the bare timer end never produces a banner', async () => {
    submitScore.mockResolvedValue({ success: true })
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await act(async () => {
      createdGames[0].emit('end')
    })
    await drain()

    expect(renderedText(tree)).not.toContain('Achievement unlocked')
    expect(renderedText(tree)).not.toContain('Challenge complete')
  })
})

describe('NativeGameHost — cleanup order', () => {
  test('unmount removes the forwarder, disposes the session, then destroys the game', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
    const game = createdGames[0]
    const originalDestroy = game.destroy.bind(game)
    const destroySpy = jest.spyOn(game, 'destroy').mockImplementation(() => {
      mockCleanupOrder.push('game-destroyed')
      originalDestroy()
    })
    expect(destroySpy).not.toHaveBeenCalled()
    expect(mockCleanupOrder).toEqual([])

    await act(async () => {
      tree.unmount()
    })

    expect(mockCleanupOrder).toEqual([
      'forwarder-removed',
      'session-disposed',
      'game-destroyed',
    ])
    expect(destroySpy).toHaveBeenCalledTimes(1)
    // The destroyed game's timer is stopped with it.
    expect(createdGames[0].getTimerStatus().isRunning).toBe(false)
  })

  test('timer stops on unmount mid-run', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
    await press(tree, 'Start game')
    expect(createdGames[0].getTimerStatus().isRunning).toBe(true)

    await act(async () => {
      tree.unmount()
    })

    expect(createdGames[0].getTimerStatus().isRunning).toBe(false)
  })

  test('a route exit while the save is in flight tears down cleanly and never re-submits', async () => {
    let releaseSave: ((value: { success: boolean }) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    const game = createdGames[0]
    const originalDestroy = game.destroy.bind(game)
    jest.spyOn(game, 'destroy').mockImplementation(() => {
      mockCleanupOrder.push('game-destroyed')
      originalDestroy()
    })
    await act(async () => {
      void game.end()
    })
    await drain()
    expect(renderedText(tree)).toContain('Saving score…')

    // Leaving the route mid-save runs the full teardown in order…
    await act(async () => {
      tree.unmount()
    })
    expect(mockCleanupOrder).toEqual([
      'forwarder-removed',
      'session-disposed',
      'game-destroyed',
    ])

    // …and the in-flight save resolving afterwards reaches no removed
    // listener (the destroyed game emits to nobody) and never retries.
    await act(async () => {
      releaseSave?.({ success: true })
    })
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('NativeGameHost — per-instance board binding', () => {
  test('a board view drives the host-created game through its game prop', async () => {
    const original = NATIVE_GAMES[GameID.MINE_GRID]
    NATIVE_GAMES[GameID.MINE_GRID] = {
      port: { ...testPort, view: InteractiveBoardView },
    }
    try {
      const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
      expect(
        tree.root.findByProps({ testID: 'native-board' }).props.children
      ).toBe('1,2,3')

      // The binding is exactly the instance the host constructed.
      const board = tree.root.findByType(InteractiveBoardView)
      expect(board.props.game).toBe(createdGames[0])

      // Board input -> model command -> state-change -> new projection.
      await press(tree, 'Flip first cell')
      expect(
        tree.root.findByProps({ testID: 'native-board' }).props.children
      ).toBe('2,2,3')
      expect(createdGames[0].getState().board).toEqual([2, 2, 3])
    } finally {
      NATIVE_GAMES[GameID.MINE_GRID] = original
    }
  })

  test('a production entry without a board view runs a live session behind the placeholder board', async () => {
    // No production entry is viewless anymore; blank the pilot's view to
    // keep guarding the honest placeholder for future ports.
    const original = NATIVE_GAMES[GameID.CHROMATIC_TIDE]
    NATIVE_GAMES[GameID.CHROMATIC_TIDE] = original?.port
      ? { port: { ...original.port, view: undefined } }
      : {}
    try {
      const tree = await render(
        <NativeGameHost gameId={GameID.CHROMATIC_TIDE} />
      )

      // The chrome is fully live: the run can start, save and earn rewards.
      expect(
        tree.root.findByProps({ accessibilityLabel: 'Start game' })
      ).toBeTruthy()
      expect(renderedText(tree).toLowerCase()).toContain('native board')
      expect(submitScore).not.toHaveBeenCalled()
    } finally {
      NATIVE_GAMES[GameID.CHROMATIC_TIDE] = original
    }
  })
})

describe('NativeGameHost — placeholder entries', () => {
  test('portless entries render an honest arriving notice with no session or saves', async () => {
    const original = NATIVE_GAMES[GameID.CHROMATIC_TIDE]
    NATIVE_GAMES[GameID.CHROMATIC_TIDE] = {}
    try {
      const tree = await render(
        <NativeGameHost gameId={GameID.CHROMATIC_TIDE} />
      )

      const rendered = renderedText(tree)
      expect(rendered.toLowerCase()).toContain('native board')
      expect(
        tree.root.findAllByProps({ accessibilityLabel: 'Start game' })
      ).toHaveLength(0)
      expect(createdGames).toHaveLength(0)
      expect(submitScore).not.toHaveBeenCalled()
    } finally {
      NATIVE_GAMES[GameID.CHROMATIC_TIDE] = original
    }
  })
})
