import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import type { LeaderboardResponse } from '@cetus/shared/api-dto'
import { toIceSlideUtcDateKey } from '@cetus/games/ice-slide/daily'
import { slide, cloneGrid } from '@cetus/games/ice-slide/physics'
import type {
  CellType,
  Direction,
  GridPosition,
  IceSlideState,
} from '@cetus/games/ice-slide/types'

jest.mock('../src/lib/api', () => mockApiModule)

const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react')
  return {
    useRouter: () => ({
      push: mockPush,
      replace: jest.fn(),
      canGoBack: jest.fn(),
    }),
    // Stand-in for the navigator's focus effect: mount/unmount only.
    useFocusEffect: (callback: () => void | (() => void)) => {
      mockReact.useEffect(callback, [callback])
    },
  }
})

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
import { IceSlideBoard } from '../src/games/boards/IceSlideBoard'
import type { IceSlideController } from '../src/games/ice-slide/controller'

const submitScore = jest.mocked(api.submitScore)
const getLeaderboard = jest.mocked(api.getLeaderboard)
const mockCreateScoreSubmitter = jest.mocked(createScoreSubmitter)

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-ice-slide',
  name: 'Frost Walker',
  description: 'Clear an Expedition stage',
  icon: '🧊',
  rarity: AchievementRarity.RARE,
}

const DIRECTION_DELTA: Record<Direction, { row: number; col: number }> = {
  N: { row: -1, col: 0 },
  E: { row: 0, col: 1 },
  S: { row: 1, col: 0 },
  W: { row: 0, col: -1 },
}
const DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W']

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
  await drain()
}

/** Press without draining, to prove the UI refreshed synchronously. */
const pressSync = (
  tree: TestRenderer.ReactTestRenderer,
  label: string
): void => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  act(() => {
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

const testText = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): string => {
  const nodes = tree.root.findAllByProps({ testID })
  const node = nodes[nodes.length - 1]
  return scalarText(node.props.children as React.ReactNode)
}

const controllerOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByType(IceSlideBoard).props.binding as IceSlideController

const gameOf = (tree: TestRenderer.ReactTestRenderer) => {
  const game = controllerOf(tree).getGame()
  if (!game) {
    throw new Error('no live Ice Slide model')
  }
  return game
}

const boardLabel = (tree: TestRenderer.ReactTestRenderer): string => {
  const board = tree.root.findAllByProps({ testID: 'ice-board' })
  const node = board[board.length - 1]
  return String(node.props.accessibilityLabel)
}

const cursorCopy = (player: { row: number; col: number }): string =>
  `You at row ${player.row + 1}, column ${player.col + 1}.`

/** Breadth-first fall-free route to the goal from the live stage. */
function findRoute(current: IceSlideState): Direction[] {
  const key = (position: GridPosition) => `${position.row},${position.col}`
  const queue: Array<{
    pos: GridPosition
    path: Direction[]
    grid: CellType[][]
  }> = [
    {
      pos: current.player,
      path: [],
      grid: current.grid.map(row => [...row]),
    },
  ]
  const seen = new Set([key(current.player)])
  let cursor = 0
  while (cursor < queue.length) {
    const node = queue[cursor]
    cursor += 1
    for (const direction of DIRECTIONS) {
      const nextGrid = node.grid.map(row => [...row])
      const outcome = slide(nextGrid, node.pos, DIRECTION_DELTA[direction])
      if (outcome.kind !== 'moved') {
        continue
      }
      const positionKey = key(outcome.end)
      if (seen.has(positionKey)) {
        continue
      }
      seen.add(positionKey)
      const path = [...node.path, direction]
      if (outcome.reachedGoal) {
        return path
      }
      queue.push({ pos: outcome.end, path, grid: nextGrid })
    }
    if (seen.size > 50_000) {
      break
    }
  }
  throw new Error('no route to the goal in this stage')
}

const clearStage = (
  tree: TestRenderer.ReactTestRenderer,
  game = gameOf(tree)
) => {
  act(() => {
    for (const direction of findRoute(game.getState())) {
      game.move(direction)
    }
  })
}

/** A moved, non-goal slide (keeps the Expedition undo snapshot alive). */
const nonGoalDirection = (current: IceSlideState): Direction => {
  for (const direction of DIRECTIONS) {
    const nextGrid = cloneGrid(current.grid)
    const outcome = slide(nextGrid, current.player, DIRECTION_DELTA[direction])
    if (outcome.kind === 'moved' && !outcome.reachedGoal) {
      return direction
    }
  }
  throw new Error('no non-goal slide in this stage')
}

const panHandlers = (tree: TestRenderer.ReactTestRenderer) => {
  const detector = tree.root.findByType(GestureDetector)
  return detector.props.gesture.handlers as Record<
    string,
    (
      event: { translationX?: number; translationY?: number },
      success?: boolean
    ) => void
  >
}

const swipe = (
  tree: TestRenderer.ReactTestRenderer,
  translation: { x: number; y: number },
  success = true
) => {
  const handler = panHandlers(tree).onFinalize
  if (typeof handler !== 'function') {
    throw new Error('pan gesture is missing onFinalize')
  }
  act(() => {
    handler(
      { translationX: translation.x, translationY: translation.y },
      success
    )
  })
}

const scopedDailyLeaderboard = (
  competitionKey: string
): LeaderboardResponse => ({
  gameId: GameID.ICE_SLIDE,
  gameName: 'Ice Slide',
  viewerAuthenticated: false,
  leaderboard: [
    {
      rank: 1,
      name: 'Frost Pilot',
      username: 'frost',
      image: null,
      score: 1234,
      created_at: '2026-08-12T10:00:00.000Z',
      mode: 'daily',
      competitionKey,
      rulesetVersion: 1,
      elapsedSeconds: 120,
      totalMoves: 18,
      isCurrentUser: false,
    },
  ],
})

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  getLeaderboard.mockReset()
  getLeaderboard.mockResolvedValue(scopedDailyLeaderboard('run'))
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

describe('Ice Slide pilot — idle state and accessibility', () => {
  test('idle projects the mode chooser and model-truthful disabled controls', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)

    expect(controllerOf(tree).getGame()).toBeNull()
    expect(testText(tree, 'ice-mode')).toBe('Campaign')
    expect(testText(tree, 'ice-stage')).toBe('Stage –')
    expect(testText(tree, 'ice-moves')).toBe('Moves 0')
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(renderedText(tree)).toContain(
      'The ice field appears when you start a run.'
    )

    for (const mode of ['campaign', 'daily', 'expedition']) {
      const button = tree.root.findByProps({
        accessibilityLabel: `Select mode ${mode}`,
      })
      expect(button.props.disabled).toBe(false)
      expect(button.props.accessibilityState).toMatchObject({
        disabled: false,
        selected: mode === 'campaign',
      })
    }
    for (const label of [
      'Slide north',
      'Slide west',
      'Slide south',
      'Slide east',
    ]) {
      const button = tree.root.findByProps({ accessibilityLabel: label })
      expect(button.props.disabled).toBe(true)
      expect(button.props.accessibilityState?.disabled).toBe(true)
    }
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Undo last move' }).props
        .disabled
    ).toBe(true)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Reset level' }).props
        .disabled
    ).toBe(true)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Stop run' })
    ).toHaveLength(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Pause game' })
    ).toHaveLength(0)
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Ice Slide pilot — Campaign start, moves and stop', () => {
  test('Start renders the campaign stage and a labelled move clears stage 1', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Start game')

    const game = gameOf(tree)
    expect(game.getState().mode).toBe('campaign')
    expect(game.getState().status).toBe('playing')
    expect(testText(tree, 'ice-stage')).toBe('Stage 1 / 8 · First Frost')
    expect(testText(tree, 'ice-moves')).toBe('Moves 0 · Par 1')
    expect(testText(tree, 'game-time')).toBe('0:00')
    // The Skia grid colours are described textually for screen readers.
    expect(boardLabel(tree)).toBe(
      'Ice Slide board: stage 1 of 8, First Frost. You at row 2, column 2. Goal at row 4, column 2. 0 moves, 0 crystals remaining.'
    )
    expect(testText(tree, 'ice-board-row-0')).toBe(
      'Row 1: wall at columns 1, 2, 3, 4 and 5.'
    )
    expect(testText(tree, 'ice-board-row-1')).toBe(
      'Row 2: wall at columns 1 and 5; you at column 2; ice at columns 3 and 4.'
    )
    expect(testText(tree, 'ice-board-row-3')).toBe(
      'Row 4: wall at columns 1 and 5; goal at column 2; ice at columns 3 and 4.'
    )
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Slide south' }).props
        .disabled
    ).toBe(false)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Select mode campaign' })
        .props.disabled
    ).toBe(true)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Stop run' })
    ).toBeTruthy()

    await press(tree, 'Slide south')
    expect(game.getState().levelIndex).toBe(1)
    expect(game.getState().score).toBeGreaterThan(0)
    expect(testText(tree, 'ice-stage')).toBe('Stage 2 / 8 · Corner Pocket')
    expect(boardLabel(tree)).toContain('stage 2 of 8, Corner Pocket.')
    expect(testText(tree, 'ice-board-row-0')).toBe(
      'Row 1: wall at columns 1, 2, 3, 4, 5 and 6.'
    )
    expect(renderedText(tree)).toContain(`Score ${game.getState().score}`)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a completed swipe slides once and a cancelled swipe does nothing', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Start game')
    const game = gameOf(tree)

    swipe(tree, { x: 12, y: 12 }, false)
    expect(game.getState().levelIndex).toBe(0)
    expect(game.getState().moves).toBe(0)

    // Below the swipe threshold: not a move either.
    swipe(tree, { x: 0, y: 8 })
    expect(game.getState().moves).toBe(0)

    // Downward swipe on First Frost clears it in one slide.
    swipe(tree, { x: 0, y: 96 })
    expect(game.getState().levelIndex).toBe(1)
    expect(game.getState().moves).toBe(1)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a zero-score Stop returns to idle with a cleared result and no POST', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Start game')
    await press(tree, 'Stop run')

    expect(controllerOf(tree).getGame()).toBeNull()
    expect(renderedText(tree)).toContain('idle')
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(renderedText(tree)).toContain('Score 0')
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a positive-score Stop saves once with unscoped campaign data', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Start game')
    await press(tree, 'Slide south')
    const game = gameOf(tree)
    const score = game.getState().score
    const gameData = game.getGameData()

    await press(tree, 'Stop run')

    expect(submitScore).toHaveBeenCalledTimes(1)
    const payload = submitScore.mock.calls[0][0]
    expect(payload).toMatchObject({
      gameId: GameID.ICE_SLIDE,
      score,
      platform: 'ios',
      gameData,
    })
    expect(payload.context).toBeUndefined()
    expect(testText(tree, 'final-score')).toBe(String(score))
    expect(testText(tree, 'result-outcome')).toBe('Run ended')
    expect(testText(tree, 'result-save-status')).toBe('Saving score…')

    await act(async () => {
      releaseSave?.({ success: true })
    })
    await drain()
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('Play again clears a pending result while a late award still forwards', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(
      <NativeGameHost gameId={GameID.ICE_SLIDE} settledUserId="user-1" />
    )
    expect(mockCreateScoreSubmitter).toHaveBeenCalledWith('user-1')
    await press(tree, 'Start game')
    await press(tree, 'Slide south')
    await press(tree, 'Stop run')
    expect(testText(tree, 'result-save-status')).toBe('Saving score…')

    await press(tree, 'Play again')
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(renderedText(tree)).toContain('Score 0')
    expect(testText(tree, 'game-time')).toBe('0:00')

    await act(async () => {
      releaseSave?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    expect(tree.root.findAllByProps({ testID: 'result-outcome' })).toHaveLength(
      0
    )
    expect(renderedText(tree).match(/Frost Walker/g)).toHaveLength(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('Ice Slide pilot — Daily mode and leaderboard', () => {
  test('Daily shows the UTC date and queries the run-keyed leaderboard', async () => {
    const dateKey = toIceSlideUtcDateKey(new Date())
    const competitionKey = `ice-slide:daily:${dateKey}:g1:r1`
    getLeaderboard.mockResolvedValue(scopedDailyLeaderboard(competitionKey))
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)

    await press(tree, 'Select mode daily')
    expect(testText(tree, 'ice-mode')).toBe('Daily')
    expect(testText(tree, 'ice-daily-date')).toBe(`Daily run · ${dateKey} UTC`)
    expect(renderedText(tree)).toContain('Frost Pilot')
    expect(getLeaderboard).toHaveBeenCalledTimes(1)
    expect(getLeaderboard).toHaveBeenCalledWith(
      {
        gameId: GameID.ICE_SLIDE,
        mode: 'daily',
        competitionKey,
        limit: 10,
      },
      expect.objectContaining({ signal: expect.anything() })
    )

    await press(tree, 'Start game')
    expect(gameOf(tree).getState().mode).toBe('daily')
    expect(gameOf(tree).getState().runKey).toBe(competitionKey)
    expect(renderedText(tree)).toContain('Stage 1 / 5')
    expect(testText(tree, 'ice-objectives')).toContain('Bonus:')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('Daily early Stop never saves and clears the result', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Select mode daily')
    await press(tree, 'Start game')
    clearStage(tree)
    expect(gameOf(tree).getState().score).toBeGreaterThan(0)

    await press(tree, 'Stop run')
    expect(controllerOf(tree).getGame()).toBeNull()
    expect(submitScore).not.toHaveBeenCalled()
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(renderedText(tree)).toContain('idle')
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(renderedText(tree)).toContain('Score 0')
  })

  test('empty and error leaderboard states retry through the shared kit', async () => {
    getLeaderboard.mockResolvedValueOnce({
      gameId: GameID.ICE_SLIDE,
      gameName: 'Ice Slide',
      viewerAuthenticated: false,
      leaderboard: [],
    })
    const emptyTree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(emptyTree, 'Select mode daily')
    expect(renderedText(emptyTree)).toContain('No scores yet')
    getLeaderboard.mockRejectedValueOnce(new Error('boom'))
    await press(emptyTree, 'Select mode campaign')
    await press(emptyTree, 'Select mode daily')
    await drain()
    expect(
      emptyTree.root.findByProps({ testID: 'leaderboard-error' })
    ).toBeTruthy()
    getLeaderboard.mockResolvedValue(
      scopedDailyLeaderboard('ice-slide:daily:run:g1:r1')
    )
    await press(emptyTree, 'Retry loading the leaderboard')
    expect(renderedText(emptyTree)).toContain('Frost Pilot')
    await unmount(emptyTree)
  })

  test('a failed leaderboard refresh keeps the stale board and shows error with retry', async () => {
    const appStateHandlers = new Set<(state: AppStateStatus) => void>()
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateHandlers.add(listener as (state: AppStateStatus) => void)
        return {
          remove: () =>
            appStateHandlers.delete(
              listener as (state: AppStateStatus) => void
            ),
        } as never
      })
    const refocus = () => {
      act(() => {
        for (const handler of appStateHandlers) {
          handler('active')
        }
      })
    }

    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Select mode daily')
    expect(renderedText(tree)).toContain('Frost Pilot')

    // Refetch-on-focus fails: the last good board stays, and the error with
    // its retry must be visible next to it instead of silently replacing it.
    getLeaderboard.mockRejectedValueOnce(new Error('boom'))
    refocus()
    await drain()

    expect(renderedText(tree)).toContain('Frost Pilot')
    expect(tree.root.findByProps({ testID: 'leaderboard-error' })).toBeTruthy()
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Retry loading the leaderboard',
      })
    ).toBeTruthy()

    await press(tree, 'Retry loading the leaderboard')
    expect(renderedText(tree)).toContain('Frost Pilot')
    expect(
      tree.root.findAllByProps({ testID: 'leaderboard-error' })
    ).toHaveLength(0)
  })
})

describe('Ice Slide pilot — no-callback Reset refresh', () => {
  test('Reset level republishes the start cursor synchronously', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Start game')
    const game = gameOf(tree)
    const start = { ...game.getState().start }

    await press(tree, 'Slide east')
    expect(game.getState().player).not.toEqual(start)

    pressSync(tree, 'Reset level')
    // No drain: the controller wrapper published before returning.
    expect(game.getState().player).toEqual(start)
    expect(game.getState().resets).toBe(1)
    expect(boardLabel(tree)).toContain(cursorCopy(start))
    expect(testText(tree, `ice-board-row-${start.row}`)).toContain(
      `you at column ${start.col + 1}`
    )
    expect(testText(tree, 'ice-moves')).toContain('Moves 1 · Par 1')
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Ice Slide pilot — Expedition route, Undo and refresh', () => {
  test('safe route grants a charge, Undo refreshes the cursor synchronously', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ICE_SLIDE} />)
    await press(tree, 'Select mode expedition')
    await press(tree, 'Start game')
    const game = gameOf(tree)
    expect(game.getState().mode).toBe('expedition')
    const seed = controllerOf(tree).getProjection().seed
    expect(seed).toMatch(/^[0-9a-f]{32}$/)
    expect(testText(tree, 'ice-seed')).toBe(`Seed ${seed}`)

    clearStage(tree)
    clearStage(tree)
    expect(game.getState().levelIndex).toBe(2)
    expect(game.getState().pendingRouteChoiceAfterStage).toBe(2)
    expect(tree.root.findByProps({ testID: 'ice-route-choice' })).toBeTruthy()
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Slide north' }).props
        .disabled
    ).toBe(true)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Reset level' }).props
        .disabled
    ).toBe(true)

    await press(tree, 'Choose safe route')
    expect(
      tree.root.findAllByProps({ testID: 'ice-route-choice' })
    ).toHaveLength(0)
    expect(game.getState().undoChargesAvailable).toBe(1)
    expect(renderedText(tree)).toContain('Undo (1)')

    const start = { ...game.getState().player }
    const direction = nonGoalDirection(game.getState())
    const directionLabel = {
      N: 'Slide north',
      E: 'Slide east',
      S: 'Slide south',
      W: 'Slide west',
    }[direction]
    await press(tree, directionLabel)
    expect(game.getState().player).not.toEqual(start)
    const movesAfterMove = game.getState().moves
    expect(boardLabel(tree)).toContain(cursorCopy(game.getState().player))
    expect(
      testText(tree, `ice-board-row-${game.getState().player.row}`)
    ).toContain('you at column')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Undo last move' }).props
        .disabled
    ).toBe(false)

    pressSync(tree, 'Undo last move')
    // No drain: the wrapper published synchronously.
    expect(game.getState().player).toEqual(start)
    expect(game.getState().moves).toBe(movesAfterMove)
    expect(game.getState().undoChargesAvailable).toBe(0)
    expect(boardLabel(tree)).toContain(cursorCopy(start))
    expect(testText(tree, `ice-board-row-${start.row}`)).toContain(
      `you at column ${start.col + 1}`
    )
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Undo last move' }).props
        .disabled
    ).toBe(true)
    expect(submitScore).not.toHaveBeenCalled()
  })
})
