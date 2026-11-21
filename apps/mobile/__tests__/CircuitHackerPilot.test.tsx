import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet, Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import { CircuitHackerGame } from '@cetus/games/circuit-hacker/game'
import { DIFFICULTY_CONFIGS } from '@cetus/games/circuit-hacker/utils'

jest.mock('../src/lib/api', () => mockApiModule)

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

jest.mock('@shopify/react-native-skia', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react')
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native')
  const shape = (name: string) => (props: Record<string, unknown>) =>
    mockReact.createElement(
      MockView,
      { ...props, testID: `skia-${name}` },
      props.children as React.ReactNode
    )
  return {
    Canvas: (props: { children?: React.ReactNode; style?: unknown }) =>
      mockReact.createElement(
        MockView,
        { testID: 'skia-Canvas' },
        props.children
      ),
    Group: shape('Group'),
    Rect: shape('Rect'),
    Circle: shape('Circle'),
    Path: shape('Path'),
  }
})

import * as mockApiModule from '../src/test/mockApiModule'
import { api, createScoreSubmitter } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { CircuitHackerBoard } from '../src/games/boards/CircuitHackerBoard'
import type { CircuitHackerController } from '../src/games/circuit-hacker/controller'

const submitScore = jest.mocked(api.submitScore)
const mockCreateScoreSubmitter = jest.mocked(createScoreSubmitter)

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-circuit',
  name: 'Circuit Master',
  description: 'Power every core',
  icon: '🔌',
  rarity: AchievementRarity.RARE,
}

const trees: Array<TestRenderer.ReactTestRenderer> = []

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
  trees.push(tree)
  return tree
}

const unmount = async (tree: TestRenderer.ReactTestRenderer) => {
  const index = trees.indexOf(tree)
  if (index >= 0) {
    trees.splice(index, 1)
  }
  await act(async () => {
    tree.unmount()
  })
}

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    button.props.onPress()
  })
}

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 360,
  height = 360
) => {
  // Every measured host gets the same viewport: the outer ScrollView sizes
  // the board and GameCanvas draws only after its own layout.
  const layoutHosts = tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => typeof node.props.onLayout === 'function')
  if (layoutHosts.length === 0) {
    throw new Error('no onLayout host found')
  }
  act(() => {
    for (const layoutHost of layoutHosts) {
      layoutHost.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width, height } },
      })
    }
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

const testText = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): string => {
  const nodes = tree.root.findAllByProps({ testID })
  const node = nodes[nodes.length - 1]
  return scalarText(node.props.children as React.ReactNode)
}

const controllerOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByType(CircuitHackerBoard).props
    .binding as CircuitHackerController

/** Drives the production `rotateTile` path to the model's own solution. */
const solveBoard = (controller: CircuitHackerController) => {
  const game = controller.getGame() as CircuitHackerGame
  const solution = (
    game as unknown as {
      puzzle: { solutionOrientations: number[][] }
    }
  ).puzzle.solutionOrientations
  const state = game.getState()
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const tile = state.grid[row][col]
      if (tile.locked) {
        continue
      }
      while (
        !game.getState().solved &&
        tile.orientation !== solution[row][col]
      ) {
        controller.rotateTile(row, col)
      }
      if (game.getState().solved) {
        return
      }
    }
  }
  throw new Error('board was not solved by the generated solution')
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  mockCreateScoreSubmitter.mockReset()
  mockCreateScoreSubmitter.mockResolvedValue(async data =>
    api.submitScore(data)
  )
  mockPush.mockReset()
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
  jest.restoreAllMocks()
})

describe('Circuit Hacker pilot — pre-run selection and board', () => {
  test('idle shows the difficulty selector and an empty, lazy board with no Pause', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)

    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const button = tree.root.findByProps({
        accessibilityLabel: `Select difficulty ${difficulty}`,
      })
      expect(button.props.disabled).toBe(false)
      expect(button.props.accessibilityState?.selected).toBe(
        difficulty === 'medium'
      )
    }
    expect(testText(tree, 'circuit-difficulty')).toBe('Medium')
    expect(testText(tree, 'circuit-core-count')).toBe('Cores 0 / 0')
    expect(controllerOf(tree).getGame()).toBeNull()
    expect(cellTargets(tree).size).toBe(0)

    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Pause game' })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Resume game' })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Reset game' })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Stop run' })
    ).toHaveLength(0)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })

  test('the pre-run selection builds the model lazily on Start with that difficulty and locks the selector while running', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    const controller = controllerOf(tree)

    await press(tree, 'Select difficulty expert')
    expect(controller.getDifficulty()).toBe('expert')
    expect(testText(tree, 'circuit-difficulty')).toBe('Expert')
    expect(controller.getGame()).toBeNull()
    expect(testText(tree, 'game-time')).toBe(
      formatTestTime(DIFFICULTY_CONFIGS.expert.duration)
    )

    await press(tree, 'Start game')

    const game = controller.getGame()
    expect(game).not.toBeNull()
    expect(game?.getState().grid).toHaveLength(DIFFICULTY_CONFIGS.expert.rows)
    expect(game?.getState().grid[0]).toHaveLength(
      DIFFICULTY_CONFIGS.expert.cols
    )
    expect(cellTargets(tree).size).toBe(
      DIFFICULTY_CONFIGS.expert.rows * DIFFICULTY_CONFIGS.expert.cols
    )

    const easy = tree.root.findByProps({
      accessibilityLabel: 'Select difficulty easy',
    })
    expect(easy.props.disabled).toBe(true)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Stop run' })
    ).toBeTruthy()

    // The live projection is a copied, serializable snapshots (no refs).
    const projected = controller.getProjection()
    expect(projected.phase).toBe('running')
    expect(JSON.parse(JSON.stringify(projected))).toEqual(projected)
  })

  test('tap-to-rotate turns a free tile, locked tiles stay disabled, and power updates', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')
    await press(tree, 'Start game')

    fireLayout(tree)
    const game = controller.getGame() as CircuitHackerGame
    const state = game.getState()
    const source = state.sourcePos
    const sourceButton = tree.root.findByProps({
      accessibilityLabel: `Rotate tile row ${source.row + 1} column ${source.col + 1}`,
    })
    expect(sourceButton.props.disabled).toBe(true)
    // The Skia shapes are invisible to screen readers: the tile's type,
    // connectors and lock/power state must be spoken on the cell.
    expect(sourceButton.props.accessibilityHint).toContain('Power source')
    expect(sourceButton.props.accessibilityHint).toContain('locked')
    expect(sourceButton.props.accessibilityValue?.text).toBe('Powered, locked')

    let target: { row: number; col: number } | null = null
    for (let row = 0; row < state.rows && !target; row++) {
      for (let col = 0; col < state.cols; col++) {
        // A cross keeps the same connectors under rotation; choose a wire
        // whose spoken directions must change after the tap.
        if (
          !state.grid[row][col].locked &&
          state.grid[row][col].type !== 'cross'
        ) {
          target = { row, col }
          break
        }
      }
    }
    expect(target).not.toBeNull()
    if (!target) {
      return
    }
    const before = state.grid[target.row][target.col].orientation
    const hintOf = (row: number, col: number): string =>
      tree.root.findAllByProps({
        accessibilityLabel: `Rotate tile row ${row + 1} column ${col + 1}`,
      })[0].props.accessibilityHint as string
    const beforeHint = hintOf(target.row, target.col)
    expect(beforeHint).toContain('connectors')

    await press(
      tree,
      `Rotate tile row ${target.row + 1} column ${target.col + 1}`
    )

    expect(game.getState().grid[target.row][target.col].orientation).toBe(
      (before + 1) % 4
    )
    expect(game.getState().rotationsUsed).toBe(1)
    expect(testText(tree, 'circuit-rotations')).toBe('Rotations 1')
    // The accessible description follows the new orientation.
    const afterHint = hintOf(target.row, target.col)
    expect(afterHint).not.toBe(beforeHint)
    expect(afterHint).toContain('connectors')
    expect(
      tree.root.findAllByProps({ testID: 'skia-Rect' }).length
    ).toBeGreaterThan(0)
    expect(
      tree.root.findAllByProps({ testID: 'skia-Circle' }).length
    ).toBeGreaterThan(0)

    // Replaying the same tap rotates again (one rotation per tap).
    await press(
      tree,
      `Rotate tile row ${target.row + 1} column ${target.col + 1}`
    )
    expect(game.getState().rotationsUsed).toBe(2)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('fits the square board to available height and scrolls when space is tight', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    const scroll = tree.root.findByProps({ testID: 'circuit-scroll' })
    const setViewport = (width: number, height: number) => {
      act(() => {
        scroll.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width, height } },
        })
      })
    }
    const boardSize = () =>
      StyleSheet.flatten(
        tree.root.findByProps({ testID: 'circuit-board' }).props.style
      ).width as number

    setViewport(390, 900)
    expect(boardSize()).toBe(358)

    // The instructions and two difficulty rows take the same viewport, so a
    // short screen shrinks the board instead of pushing Stop out of reach.
    setViewport(390, 500)
    expect(boardSize()).toBe(260)

    // Below the static reserve the board keeps a usable floor and the
    // ScrollView carries the overflow (for example enlarged text).
    setViewport(390, 300)
    expect(boardSize()).toBe(160)
  })
})

describe('Circuit Hacker pilot — score contract', () => {
  test('solving posts once with the exact payload, pending → saved, and labels Solved', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.CIRCUIT_HACKER} settledUserId="user-1" />
    )
    expect(mockCreateScoreSubmitter).toHaveBeenCalledWith('user-1')
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')
    await press(tree, 'Start game')

    await act(async () => {
      solveBoard(controller)
    })
    await drain()

    const stats = (controller.getGame() as CircuitHackerGame).getStats()
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith({
      gameId: GameID.CIRCUIT_HACKER,
      score: stats.finalScore,
      platform: 'ios',
      gameData: {
        difficulty: 'easy',
        secondsRemaining: stats.secondsRemaining,
        rotationsUsed: stats.rotationsUsed,
        solved: true,
      },
    })
    expect(testText(tree, 'result-save-status')).toBe('Saving score…')
    expect(testText(tree, 'result-outcome')).toBe('Solved')

    await act(async () => {
      releaseSave?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(testText(tree, 'result-outcome')).toBe('Solved')
    expect(renderedText(tree).match(/Circuit Master/g)).toHaveLength(1)
  })

  test('manual stop and timeout finish locally with no score POST and no save status', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')
    await press(tree, 'Start game')

    await press(tree, 'Stop run')
    await drain()

    expect(controller.getGame()?.getState().isGameOver).toBe(true)
    expect(submitScore).not.toHaveBeenCalled()
    expect(testText(tree, 'result-outcome')).toBe('Not solved')
    expect(
      tree.root.findAllByProps({ testID: 'result-save-status' })
    ).toHaveLength(0)

    // The model-owned timeout takes the same no-save path (the countdown
    // itself is covered by the portable model suite).
    await press(tree, 'Play again')
    const game = controller.getGame() as CircuitHackerGame
    await act(async () => {
      ;(game as unknown as { fail: (reason: 'timeout') => void }).fail(
        'timeout'
      )
    })
    await drain()

    expect(submitScore).not.toHaveBeenCalled()
    expect(testText(tree, 'result-outcome')).toBe('Not solved')
    expect(
      tree.root.findAllByProps({ testID: 'result-save-status' })
    ).toHaveLength(0)
  })

  test('Replay starts a fresh run with the selected difficulty and resets score/time/result', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty hard')
    await press(tree, 'Start game')

    const game = controller.getGame() as CircuitHackerGame
    await act(async () => {
      solveBoard(controller)
    })
    await drain()
    expect(renderedText(tree)).toContain('Run complete')
    expect(testText(tree, 'final-score')).not.toBe('0')

    await press(tree, 'Select difficulty easy')
    expect(controller.getDifficulty()).toBe('easy')
    expect(testText(tree, 'game-time')).toBe(
      formatTestTime(DIFFICULTY_CONFIGS.easy.duration)
    )
    await press(tree, 'Play again')

    const next = controller.getGame()
    expect(next).not.toBe(game)
    expect(next?.getState().grid).toHaveLength(DIFFICULTY_CONFIGS.easy.rows)
    expect(testText(tree, 'game-time')).toBe(
      formatTestTime(DIFFICULTY_CONFIGS.easy.duration)
    )
    expect(renderedText(tree)).toContain('Score 0')
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(tree.root.findAllByProps({ testID: 'result-outcome' })).toHaveLength(
      0
    )
  })
})

describe('Circuit Hacker pilot — identity, stale saves and teardown', () => {
  test('guest hosts post with the OS platform and never send credentials', async () => {
    submitScore.mockResolvedValue({ success: true })
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    expect(mockCreateScoreSubmitter).toHaveBeenCalledWith(null)
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')
    await press(tree, 'Start game')
    await act(async () => {
      solveBoard(controller)
    })
    await drain()

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.CIRCUIT_HACKER,
        platform: 'ios',
        gameData: expect.objectContaining({ solved: true }),
      })
    )
  })

  test('a stale save never overwrites a new run result but its same-account rewards still forward once', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.CIRCUIT_HACKER} settledUserId="user-1" />
    )
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')
    await press(tree, 'Start game')
    await act(async () => {
      solveBoard(controller)
    })
    await drain()
    expect(testText(tree, 'result-save-status')).toBe('Saving score…')

    // Replay before the save settles: the new run owns the result sheet.
    await press(tree, 'Play again')
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(renderedText(tree)).toContain('Score 0')

    await act(async () => {
      releaseSave?.({
        success: true,
        newAchievements: [ACHIEVEMENT],
      })
    })
    await drain()

    // The stale score/result never lands on the new run…
    expect(tree.root.findAllByProps({ testID: 'result-outcome' })).toHaveLength(
      0
    )
    expect(tree.root.findAllByProps({ testID: 'final-score' })).toHaveLength(0)
    // …but the committed award still forwards, exactly once.
    expect(renderedText(tree).match(/Circuit Master/g)).toHaveLength(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('unmount cleans the model timer/listeners and a late save reaches no new host', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const cleanupSpy = jest.spyOn(CircuitHackerGame.prototype, 'cleanup')
    const treeA = await render(
      <NativeGameHost gameId={GameID.CIRCUIT_HACKER} settledUserId="user-a" />
    )
    const controller = controllerOf(treeA)
    await press(treeA, 'Select difficulty easy')
    await press(treeA, 'Start game')
    await act(async () => {
      solveBoard(controller)
    })
    await drain()
    expect(testText(treeA, 'result-save-status')).toBe('Saving score…')

    await unmount(treeA)
    expect(cleanupSpy).toHaveBeenCalled()

    const treeB = await render(
      <NativeGameHost gameId={GameID.CIRCUIT_HACKER} settledUserId="user-b" />
    )
    await act(async () => {
      releaseSave?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    expect(renderedText(treeB)).not.toContain('Circuit Master')
    expect(
      treeB.root.findAllByProps({ testID: 'result-outcome' })
    ).toHaveLength(0)
    expect(
      treeB.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })
})

const cellTargets = (tree: TestRenderer.ReactTestRenderer): Set<string> =>
  new Set(
    tree.root
      .findAll(
        node =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Rotate tile row ')
      )
      .map(node => node.props.accessibilityLabel as string)
  )

/** Local mirror of the chrome's `formatTime` for assertions. */
function formatTestTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

describe('Circuit Hacker pilot — start failure recovery', () => {
  test('a puzzle-generation failure is caught, cleaned up and recoverable without a POST', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')

    const cleanup = jest.spyOn(CircuitHackerGame.prototype, 'cleanup')
    jest
      .spyOn(CircuitHackerGame.prototype, 'startGame')
      .mockImplementationOnce(() => {
        throw new Error('generation exhausted')
      })

    await press(tree, 'Start game')

    expect(controller.getGame()).toBeNull()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(testText(tree, 'circuit-start-error')).toContain(
      'Unable to start the circuit board'
    )
    expect(renderedText(tree)).toContain('generation exhausted')
    expect(submitScore).not.toHaveBeenCalled()
    // Recoverable: the idle Start control is back and no result sheet shows.
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(tree.root.findAllByProps({ testID: 'result-outcome' })).toHaveLength(
      0
    )

    // Retry after generation succeeds: a real run, same no-POST contract.
    await press(tree, 'Start game')
    expect(controller.getGame()).not.toBeNull()
    expect(
      tree.root.findAllByProps({ testID: 'circuit-start-error' })
    ).toHaveLength(0)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a start failure during Replay clears the previous finished result', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CIRCUIT_HACKER} />)
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')
    await press(tree, 'Start game')
    await press(tree, 'Stop run')
    await drain()
    expect(renderedText(tree)).toContain('Run complete')

    jest
      .spyOn(CircuitHackerGame.prototype, 'startGame')
      .mockImplementationOnce(() => {
        throw new Error('generation exhausted')
      })

    await press(tree, 'Play again')

    const rendered = renderedText(tree)
    expect(controller.getGame()).toBeNull()
    expect(rendered).not.toContain('Run complete')
    expect(rendered).toContain('Score 0')
    expect(tree.root.findAllByProps({ testID: 'result-outcome' })).toHaveLength(
      0
    )
    expect(tree.root.findAllByProps({ testID: 'final-score' })).toHaveLength(0)
    expect(testText(tree, 'circuit-start-error')).toContain(
      'Unable to start the circuit board'
    )
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Circuit Hacker pilot — failed Replay vs pending save', () => {
  test('a pending previous save cannot resurrect its result after a failed Replay, but its award still forwards', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.CIRCUIT_HACKER} settledUserId="user-1" />
    )
    const controller = controllerOf(tree)
    await press(tree, 'Select difficulty easy')
    await press(tree, 'Start game')
    await act(async () => {
      solveBoard(controller)
    })
    await drain()
    expect(testText(tree, 'result-save-status')).toBe('Saving score…')

    // Replay fails BEFORE onGameStart → no beginRun for the new run.
    jest
      .spyOn(CircuitHackerGame.prototype, 'startGame')
      .mockImplementationOnce(() => {
        throw new Error('generation exhausted')
      })
    await press(tree, 'Play again')
    expect(controller.getGame()).toBeNull()
    expect(testText(tree, 'circuit-start-error')).toContain(
      'Unable to start the circuit board'
    )

    // The old save now succeeds. Its run was invalidated by the recovery
    // idle transition, so it must not restore the finished result …
    await act(async () => {
      releaseSave?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    const rendered = renderedText(tree)
    expect(rendered).not.toContain('Score saved')
    expect(rendered).not.toContain('Run complete')
    expect(tree.root.findAllByProps({ testID: 'result-outcome' })).toHaveLength(
      0
    )
    expect(tree.root.findAllByProps({ testID: 'final-score' })).toHaveLength(0)
    expect(testText(tree, 'circuit-start-error')).toContain(
      'Unable to start the circuit board'
    )
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    // … while the committed award still reaches the banner exactly once.
    expect(rendered.match(/Circuit Master/g)).toHaveLength(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})
