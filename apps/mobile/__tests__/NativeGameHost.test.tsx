import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import {
  AppState,
  Platform,
  Pressable,
  Text,
  type AppStateStatus,
} from 'react-native'
import { GameID } from '@cetus/shared/games'
import type { ScoreData, ScoreSubmissionResult } from '@cetus/shared/scores'
import { AchievementRarity } from '@cetus/shared/achievements'
import { BaseGame, type BaseGameConfig, type BaseGameState } from '@cetus/games'

jest.mock('../src/lib/api', () => mockApiModule)

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
    createHandleSession: (config: never) => {
      const bundle = actual.createHandleSession(config)
      const dispose = bundle.session.dispose.bind(bundle.session)
      ;(bundle.session as { dispose: () => void }).dispose = () => {
        mockCleanupOrder.push('handle-session-disposed')
        dispose()
      }
      return bundle
    },
  }
})

import * as mockApiModule from '../src/test/mockApiModule'
import { api, createScoreSubmitter } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import {
  createBaseGameRuntime,
  createHandleGameRuntime,
} from '../src/games/runtime'
import {
  NATIVE_GAMES,
  type NativeGameHostDeps,
  type NativeGamePort,
  type NativeGameViewProps,
  type NativeHandleBindingContext,
  type NativeHandleGameViewProps,
  type NativeHandlePort,
} from '../src/games/registry'

const submitScore = jest.mocked(api.submitScore)
const mockCreateScoreSubmitter = jest.mocked(createScoreSubmitter)

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

const nonPausableTestPort: NativeGamePort = {
  ...testPort,
  createGame(deps) {
    capturedDeps = deps
    const game = new TestNativeGame({
      duration: 60,
      pausable: false,
      resettable: true,
      submitScore: deps.submitScore,
      platform: deps.platform,
    })
    createdGames.push(game)
    return game
  },
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
  mockCreateScoreSubmitter.mockReset()
  mockCreateScoreSubmitter.mockResolvedValue(async data =>
    api.submitScore(data)
  )
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

  test("a new run clears the previous run's banner before delivering its own rewards", async () => {
    // Run 1's committed save carries one achievement AND one challenge.
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [
        {
          id: 'ach-1',
          name: 'Deep Thinker',
          description: 'd',
          icon: '🧠',
          rarity: AchievementRarity.RARE,
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
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    expect(renderedText(tree)).toContain('Deep Thinker')
    expect(renderedText(tree)).toContain('Daily drill')

    // Replay: the new run's start clears run 1's already-delivered banner.
    await press(tree, 'Play again')
    expect(renderedText(tree)).not.toContain('Deep Thinker')
    expect(renderedText(tree)).not.toContain('Daily drill')

    // Run 2's committed save carries an achievement only: the old
    // challenge must not be resurrected or merged into the new run's
    // banner.
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [
        {
          id: 'ach-2',
          name: 'Comeback Kid',
          description: 'd',
          icon: '⚡',
          rarity: AchievementRarity.COMMON,
        },
      ],
    })
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    const rendered = renderedText(tree)
    expect(rendered).toContain('Comeback Kid')
    expect(rendered).not.toContain('Daily drill')
    expect(rendered.match(/Comeback Kid/g)).toHaveLength(1)
    // Stop the live timer so no tick lands after the test ends.
    await act(async () => {
      createdGames[0].pause()
    })
  })

  test('a late same-account save after replay still delivers its rewards exactly once', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    // Run 1 ends while its save is still in flight.
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()

    // Quick replay before the save settles: the run-1 banner is cleared
    // by the new run's start — nothing stale shows mid-flight.
    await press(tree, 'Play again')
    expect(renderedText(tree)).not.toContain('Achievement unlocked')
    expect(renderedText(tree)).not.toContain('Challenge complete')

    // The slow save resolves AFTER run 2 started. Its committed rewards
    // still deliver — exactly once — through the same forwarder.
    await act(async () => {
      releaseSave?.({
        success: true,
        newAchievements: [
          {
            id: 'ach-1',
            name: 'Deep Thinker',
            description: 'd',
            icon: '🧠',
            rarity: AchievementRarity.RARE,
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
    const rendered = renderedText(tree)
    expect(rendered.match(/Deep Thinker/g)).toHaveLength(1)
    expect(rendered.match(/Daily drill/g)).toHaveLength(1)

    // Stop run 2's live timer so no tick lands after the test ends.
    await act(async () => {
      createdGames[0].pause()
    })
  })

  test('merges late old-run awards with new-run awards on the same banner without dropping either', async () => {
    const pendingSaves: Array<(value: ScoreSubmissionResult) => void> = []
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          pendingSaves.push(resolve)
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)

    await press(tree, 'Start game')
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()

    // Quick replay starts run 2 while run 1's save is still in flight.
    await press(tree, 'Play again')
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()

    // Run 1's late save settles with an achievement + challenge.
    await act(async () => {
      pendingSaves[0]?.({
        success: true,
        newAchievements: [
          {
            id: 'ach-1',
            name: 'Deep Thinker',
            description: 'd',
            icon: '🧠',
            rarity: AchievementRarity.RARE,
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

    // Run 2's save settles with its own achievement + challenge: both sets remain.
    await act(async () => {
      pendingSaves[1]?.({
        success: true,
        newAchievements: [
          {
            id: 'ach-2',
            name: 'Comeback Kid',
            description: 'd',
            icon: '⚡',
            rarity: AchievementRarity.COMMON,
          },
        ],
        challengeUpdates: {
          completedChallenges: [
            {
              id: 'ch-2',
              name: 'Double streak',
              description: 'd',
              icon: '🔥',
              xpReward: 20,
            },
          ],
          xpEarned: 20,
          levelUp: false,
        },
      })
    })
    await drain()

    const rendered = renderedText(tree)
    expect(rendered).toContain('Deep Thinker')
    expect(rendered).toContain('Comeback Kid')
    expect(rendered).toContain('Daily drill')
    expect(rendered).toContain('Double streak')
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

describe('NativeGameHost — pending credential binding', () => {
  test('shows a truthful loading state and no Start control until the binding settles', async () => {
    type SubmitterFn = (data: ScoreData) => Promise<{ success: boolean }>
    let releaseBinding: ((value: SubmitterFn) => void) | undefined
    mockCreateScoreSubmitter.mockImplementation(
      () =>
        new Promise<SubmitterFn>(resolve => {
          releaseBinding = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-1" />
    )

    // While the verification roundtrip is pending the Start control must
    // NOT render (it would sit enabled doing nothing for up to ~15s), and
    // the loading state must say so truthfully.
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Start game' })
    ).toHaveLength(0)
    // jest-expo duplicates testID across wrapper + host nodes; presence is
    // the assertion, not the exact count.
    expect(
      tree.root.findAllByProps({ testID: 'host-binding' }).length
    ).toBeGreaterThan(0)
    expect(renderedText(tree)).toContain('Preparing game')

    // Binding settles → the host is live and Start appears.
    await act(async () => {
      releaseBinding?.(async (data: ScoreData) => api.submitScore(data))
    })
    await drain()
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(tree.root.findAllByProps({ testID: 'host-binding' })).toHaveLength(0)
    await act(async () => {
      tree.unmount()
    })
  })
  test('unmount while the binding is pending resolves into no game', async () => {
    type SubmitterFn = (data: ScoreData) => Promise<{ success: boolean }>
    let releaseBinding: ((value: SubmitterFn) => void) | undefined
    mockCreateScoreSubmitter.mockImplementation(
      () =>
        new Promise<SubmitterFn>(resolve => {
          releaseBinding = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-1" />
    )
    await act(async () => {
      tree.unmount()
    })
    await act(async () => {
      releaseBinding?.(async (data: ScoreData) => api.submitScore(data))
    })
    await drain()
    // The cancelled mount never creates a game and never binds deps.
    expect(createdGames).toHaveLength(0)
    expect(capturedDeps).toBeUndefined()
  })

  test('an identity replacement while pending keeps only the latest host', async () => {
    type SubmitterFn = (data: ScoreData) => Promise<{ success: boolean }>
    const resolvers: Array<(value: SubmitterFn) => void> = []
    mockCreateScoreSubmitter.mockImplementation(
      () =>
        new Promise<SubmitterFn>(resolve => {
          resolvers.push(resolve)
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-1" />
    )
    await act(async () => {
      tree.update(
        <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-2" />
      )
    })
    // Resolve the abandoned first binding after the replacement: the
    // cancelled effect must not create a game for it.
    await act(async () => {
      resolvers[0]?.(async (data: ScoreData) => api.submitScore(data))
    })
    await drain()
    expect(createdGames).toHaveLength(0)
    // Resolve the live second binding: exactly one game, bound to user-2.
    await act(async () => {
      resolvers[1]?.(async (data: ScoreData) => api.submitScore(data))
    })
    await drain()
    expect(createdGames).toHaveLength(1)
    expect(mockCreateScoreSubmitter).toHaveBeenLastCalledWith('user-2')
    await act(async () => {
      tree.unmount()
    })
  })
})

describe('NativeGameHost — identity-bound score submitter', () => {
  test('binds the score submitter to the settled identity and saves through the bound fn', async () => {
    submitScore.mockResolvedValue({ success: true })
    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-1" />
    )

    expect(mockCreateScoreSubmitter).toHaveBeenCalledTimes(1)
    expect(mockCreateScoreSubmitter).toHaveBeenCalledWith('user-1')

    // The game's submitter is the BOUND function: it routes to the mocked
    // api.submitScore (same assertion surface as every other suite).
    const scoreData: ScoreData = { gameId: GameID.QUICK_MATH, score: 7 }
    const submit = capturedDeps?.submitScore
    expect(submit).toBeDefined()
    if (submit) {
      await submit(scoreData)
    }
    expect(submitScore).toHaveBeenCalledWith(scoreData)
    await act(async () => {
      tree.unmount()
    })
  })

  test('a settled-identity change rebinds the credential and swaps the game', async () => {
    submitScore.mockResolvedValue({ success: true })
    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-1" />
    )
    const firstGame = createdGames[0]
    const destroySpy = jest.spyOn(firstGame, 'destroy')

    await act(async () => {
      tree.update(
        <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-2" />
      )
    })
    await drain()

    expect(mockCreateScoreSubmitter).toHaveBeenLastCalledWith('user-2')
    expect(createdGames).toHaveLength(2)
    expect(createdGames[1]).not.toBe(firstGame)
    // The replaced instance was torn down: forwarder, session, then the
    // game itself (its timer stopped with it).
    expect(mockCleanupOrder).toEqual(['forwarder-removed', 'session-disposed'])
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(firstGame.getTimerStatus().isRunning).toBe(false)
    await act(async () => {
      tree.unmount()
    })
  })

  test('an unkeyed identity rebind exposes no old game, board or banner while the new binding is pending', async () => {
    submitScore.mockResolvedValue({ success: true })
    type SubmitterFn = (data: ScoreData) => Promise<{ success: boolean }>
    const resolvers: Array<(value: SubmitterFn) => void> = []
    mockCreateScoreSubmitter.mockImplementation(
      () =>
        new Promise<SubmitterFn>(resolve => {
          resolvers.push(resolve)
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-a" />
    )
    await act(async () => {
      resolvers[0]?.(async (data: ScoreData) => api.submitScore(data))
    })
    await drain()

    // Run 1 leaves a delivered banner and a live interactive board.
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
      })
    })
    await drain()
    expect(renderedText(tree)).toContain('Deep Thinker')

    const firstGame = createdGames[0]
    const destroySpy = jest.spyOn(firstGame, 'destroy')

    // An unkeyed caller can swap the settled identity without a remount
    // (production remounts via a keyed route). While the NEXT binding is
    // in flight, the destroyed game's UI must not linger: no old board,
    // no old banner, no enabled controls — only the truthful loading
    // state, exactly like a first mount before its binding settles.
    await act(async () => {
      tree.update(
        <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-b" />
      )
    })

    expect(mockCleanupOrder).toEqual(['forwarder-removed', 'session-disposed'])
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(firstGame.getTimerStatus().isRunning).toBe(false)
    expect(renderedText(tree)).not.toContain('Deep Thinker')
    expect(tree.root.findAllByProps({ testID: 'native-board' })).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Start game' })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ testID: 'host-binding' }).length
    ).toBeGreaterThan(0)

    // The live binding settles: exactly one fresh game, still no old banner.
    await act(async () => {
      resolvers[1]?.(async (data: ScoreData) => api.submitScore(data))
    })
    await drain()
    expect(createdGames).toHaveLength(2)
    expect(mockCreateScoreSubmitter).toHaveBeenLastCalledWith('user-b')
    expect(renderedText(tree)).not.toContain('Deep Thinker')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    await act(async () => {
      tree.unmount()
    })
  })
})

describe('NativeGameHost — setup error recovery & board memoization', () => {
  test('setup errors clear the spinner, render an error, and allow retrying setup', async () => {
    mockCreateScoreSubmitter.mockRejectedValueOnce(new Error('storage boom'))
    const tree = await render(
      <NativeGameHost gameId={GameID.QUICK_MATH} settledUserId="user-1" />
    )

    expect(tree.root.findAllByProps({ testID: 'host-binding' })).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Preparing game')
    expect(renderedText(tree)).toContain('Unable to prepare game')

    mockCreateScoreSubmitter.mockResolvedValueOnce(async data =>
      api.submitScore(data)
    )
    await press(tree, 'Try again')
    await drain()

    expect(renderedText(tree)).not.toContain('Unable to prepare game')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    await act(async () => {
      tree.unmount()
    })
  })

  test('BoardView is memoized and skips re-rendering on clock-only timer ticks', async () => {
    let boardRenderCount = 0
    const CountingBoard = ({ projected }: NativeGameViewProps) => {
      boardRenderCount++
      return (
        <Text testID="native-board">
          {(projected.board as number[]).join(',')}
        </Text>
      )
    }
    const original = NATIVE_GAMES[GameID.QUICK_MATH]
    NATIVE_GAMES[GameID.QUICK_MATH] = {
      port: { ...testPort, view: CountingBoard },
    }
    try {
      const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
      await press(tree, 'Start game')
      const rendersAfterStart = boardRenderCount

      // Advance past one 1-second timer tick; timeRemaining updates in the
      // chrome HUD, while the unchanged projected snapshot keeps the
      // memoized board render count flat.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 1150))
      })
      expect(boardRenderCount).toBe(rendersAfterStart)

      await act(async () => {
        createdGames[0].pause()
        tree.unmount()
      })
    } finally {
      NATIVE_GAMES[GameID.QUICK_MATH] = original
    }
  })
})

describe('NativeGameHost — app background policy', () => {
  const appStateHandlers = new Set<(state: AppStateStatus) => void>()

  const emitAppState = async (state: AppStateStatus) => {
    await act(async () => {
      for (const handler of appStateHandlers) {
        handler(state)
      }
    })
  }

  beforeEach(() => {
    appStateHandlers.clear()
    jest
      .mocked(AppState.addEventListener)
      .mockImplementation((_type, listener) => {
        appStateHandlers.add(listener)
        return { remove: () => appStateHandlers.delete(listener) }
      })
  })

  afterEach(() => {
    jest
      .mocked(AppState.addEventListener)
      .mockImplementation(() => ({ remove: jest.fn() }))
  })

  test('a pausable game gets exactly one pause when the app leaves active, with no auto-resume', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
    expect(appStateHandlers.size).toBe(1)

    await press(tree, 'Start game')
    const pauseSpy = jest.spyOn(createdGames[0], 'pause')
    const resumeSpy = jest.spyOn(createdGames[0], 'resume')

    await emitAppState('active')
    await emitAppState('inactive')
    await emitAppState('background')
    expect(pauseSpy).toHaveBeenCalledTimes(1)
    expect(createdGames[0].getState().isPaused).toBe(true)

    await emitAppState('active')
    expect(resumeSpy).not.toHaveBeenCalled()
    expect(createdGames[0].getState().isPaused).toBe(true)

    await emitAppState('background')
    expect(pauseSpy).toHaveBeenCalledTimes(2)

    await act(async () => {
      tree.unmount()
    })
    expect(appStateHandlers.size).toBe(0)
  })

  test('a non-pausable game is never paused or fake-resumed on background/foreground', async () => {
    const original = NATIVE_GAMES[GameID.QUICK_MATH]
    NATIVE_GAMES[GameID.QUICK_MATH] = { port: nonPausableTestPort }
    try {
      const tree = await render(<NativeGameHost gameId={GameID.QUICK_MATH} />)
      expect(appStateHandlers.size).toBe(1)
      await press(tree, 'Start game')
      const pauseSpy = jest.spyOn(createdGames[0], 'pause')
      const resumeSpy = jest.spyOn(createdGames[0], 'resume')

      await emitAppState('background')
      expect(pauseSpy).not.toHaveBeenCalled()
      expect(createdGames[0].getState().isPaused).toBe(false)
      expect(createdGames[0].getState().isActive).toBe(true)

      await emitAppState('active')
      expect(resumeSpy).not.toHaveBeenCalled()
      expect(createdGames[0].getState().isPaused).toBe(false)

      await act(async () => {
        tree.unmount()
      })
    } finally {
      NATIVE_GAMES[GameID.QUICK_MATH] = original
    }
  })
})

// --- handle-variant fixture: same host, same chrome, same submitter ---------

let capturedHandleContext: NativeHandleBindingContext | undefined
let capturedHandleBinding: unknown
const handleTeardown: string[] = []

const HandleBoardView = ({ projected }: NativeHandleGameViewProps) => (
  <Text testID="handle-board">
    {(projected.board as number[] | undefined)?.join(',') ?? ''}
  </Text>
)

const handlePort: NativeHandlePort = {
  gameId: GameID.CIRCUIT_HACKER,
  initialSnapshot: {
    status: 'idle',
    score: 0,
    timeRemaining: 120,
    projected: { board: [1, 2, 3] },
    result: null,
  },
  createBinding(context) {
    capturedHandleContext = context
    capturedHandleBinding = {
      start: () => context.results.beginRun(120),
      cleanup: () => handleTeardown.push('binding-cleanup'),
    }
    return capturedHandleBinding as { start: () => void; cleanup: () => void }
  },
  resultOutcomeLabel: result =>
    (result.stats as { outcome?: string }).outcome ?? null,
  view: HandleBoardView,
}

describe('NativeGameHost — handle variant shares the one host', () => {
  const original = NATIVE_GAMES[GameID.CIRCUIT_HACKER]

  beforeAll(() => {
    NATIVE_GAMES[GameID.CIRCUIT_HACKER] = { handlePort }
  })
  afterAll(() => {
    NATIVE_GAMES[GameID.CIRCUIT_HACKER] = original
  })
  beforeEach(() => {
    capturedHandleContext = undefined
    capturedHandleBinding = undefined
    handleTeardown.length = 0
  })

  test('binds ONE identity-bound submitter, starts through the binding and renders its board', async () => {
    submitScore.mockResolvedValue({ success: true })
    const tree = await render(
      <NativeGameHost gameId={GameID.CIRCUIT_HACKER} settledUserId="user-h" />
    )

    expect(mockCreateScoreSubmitter).toHaveBeenCalledTimes(1)
    expect(mockCreateScoreSubmitter).toHaveBeenCalledWith('user-h')
    expect(
      tree.root.findByProps({ testID: 'handle-board' }).props.children
    ).toBe('1,2,3')
    expect(tree.root.findByType(HandleBoardView).props.binding).toBe(
      capturedHandleBinding
    )
    // No fabricated Pause for a model with no pause API.
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Pause game' })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Reset game' })
    ).toHaveLength(0)

    await press(tree, 'Start game')
    expect(tree.root.findByProps({ testID: 'handle-board' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Stop run' })
    ).toHaveLength(0)

    await act(async () => {
      tree.unmount()
    })
  })

  test('a handle score finish uses the same pending/saved chrome and one reward banner', async () => {
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [
        {
          id: 'handle-ach',
          name: 'Handle Hero',
          description: 'd',
          icon: '🔌',
          rarity: AchievementRarity.RARE,
        },
      ],
    })
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    await press(tree, 'Start game')

    const stats = { finalScore: 42, timeElapsed: 1, gameCompleted: true }
    await act(async () => {
      capturedHandleContext?.results.finishAndSave({
        score: 42,
        stats,
        gameData: { solved: true },
      })
    })
    await drain()

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.CIRCUIT_HACKER,
        score: 42,
        platform: Platform.OS,
        gameData: { solved: true },
      })
    )
    expect(renderedText(tree)).toContain('Score saved')
    expect(renderedText(tree).match(/Handle Hero/g)).toHaveLength(1)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Play again' })
    ).toBeTruthy()
  })

  test('handle teardown disposes the session then cleans the binding', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    await press(tree, 'Start game')

    await act(async () => {
      tree.unmount()
    })

    expect(mockCleanupOrder).toEqual(['handle-session-disposed'])
    expect(handleTeardown).toEqual(['binding-cleanup'])
  })

  test('a late same-account handle save never overwrites the new run but forwards its awards once', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    await press(tree, 'Start game')

    await act(async () => {
      capturedHandleContext?.results.finishAndSave({
        score: 42,
        stats: { finalScore: 42, timeElapsed: 1, gameCompleted: true },
        gameData: { solved: true },
      })
    })
    await drain()
    expect(renderedText(tree)).toContain('Saving score…')

    // Replay starts the next run while the old save is in flight.
    await press(tree, 'Play again')
    expect(renderedText(tree)).not.toContain('Saving score…')

    await act(async () => {
      releaseSave?.({
        success: true,
        newAchievements: [
          {
            id: 'late-handle',
            name: 'Late Handle',
            description: 'd',
            icon: '⚡',
            rarity: AchievementRarity.COMMON,
          },
        ],
      })
    })
    await drain()

    const rendered = renderedText(tree)
    expect(rendered).not.toContain('Score saved')
    expect(rendered).not.toContain('Run complete')
    expect(rendered.match(/Late Handle/g)).toHaveLength(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('NativeGameHost — runtime producers', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('both producers dispose idempotently: cleanup runs exactly once', () => {
    const deps = {
      submitScore: async () => ({ success: true as const }),
      platform: 'ios' as const,
    }
    const destroy = jest.spyOn(TestNativeGame.prototype, 'destroy')
    const baseRuntime = createBaseGameRuntime(testPort, deps)
    baseRuntime.dispose()
    baseRuntime.dispose()
    expect(destroy).toHaveBeenCalledTimes(1)

    const cleanup = jest.fn()
    const handleRuntime = createHandleGameRuntime(
      {
        ...handlePort,
        createBinding: () => ({ start: () => {}, cleanup }),
      },
      deps
    )
    handleRuntime.dispose()
    handleRuntime.dispose()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

describe('NativeGameHost — producer setup rollback', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('a throwing projector destroys the already-created game exactly once', () => {
    const destroy = jest.spyOn(TestNativeGame.prototype, 'destroy')
    const brokenPort: NativeGamePort = {
      ...testPort,
      createProjector: () => {
        throw new Error('projector boom')
      },
    }

    expect(() =>
      createBaseGameRuntime(brokenPort, {
        submitScore: async () => ({ success: true as const }),
        platform: 'ios',
      })
    ).toThrow('projector boom')
    expect(createdGames).toHaveLength(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('a throwing initial projection (inside the session) also rolls the game back', () => {
    const destroy = jest.spyOn(TestNativeGame.prototype, 'destroy')
    const brokenPort: NativeGamePort = {
      ...testPort,
      project: () => {
        throw new Error('project boom')
      },
    }

    expect(() =>
      createBaseGameRuntime(brokenPort, {
        submitScore: async () => ({ success: true as const }),
        platform: 'ios',
      })
    ).toThrow('project boom')
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
