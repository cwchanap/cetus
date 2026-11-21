import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import { BejeweledGame } from '@cetus/games/bejeweled/game'
import {
  JEWEL_COLORS,
  JEWEL_TYPES,
  type BejeweledAnimator,
  type BejeweledState,
  type JewelType,
} from '@cetus/games/bejeweled/types'
import { cloneGrid } from '@cetus/games/bejeweled/utils'

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
    RoundedRect: shape('RoundedRect'),
    Path: shape('Path'),
  }
})

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'
import { cssColor } from '../src/games/canvas/cssColor'

const submitScore = jest.mocked(api.submitScore)

const createdGames: BejeweledGame[] = []
const originalEntry = NATIVE_GAMES[GameID.BEJEWELED]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Bejeweled registry port missing')
  }
  NATIVE_GAMES[GameID.BEJEWELED] = {
    port: {
      ...originalPort,
      createGame: deps => {
        // The real catalog constructor takes its GameID first.
        const game = new BejeweledGame(
          GameID.BEJEWELED,
          { submitScore: deps.submitScore, platform: deps.platform },
          {}
        )
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.BEJEWELED] = originalEntry
})

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-bejeweled',
  name: 'Chain Reaction',
  description: 'Reach a three-gem chain',
  icon: '💎',
  rarity: AchievementRarity.RARE,
}

// Must match the board's logical cell size and the fired canvas layout
// (320×640) so pan begins map to the intended cells.
const CELL = 40
// The 320-wide logical board letterboxes into the 640-high measured canvas:
// scale 1 with a 160 top offset.
const CANVAS_OFFSET_Y = 160

const SHAPES: JewelType[] = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan']

const BASE_GRID = (): Array<Array<JewelType | null>> =>
  Array.from({ length: 8 }, (_, row) =>
    Array.from(
      { length: 8 },
      (_, col) => SHAPES[(row + col * 2) % SHAPES.length]
    )
  )

/** Row 3 has red, ?, red; the red above column 1 makes the up-swap clear.
 *  The purple below column 1 keeps the horizontal (3,0)↔(3,1) pair invalid,
 *  so a swipe must not silently swap the selected neighbour instead. */
const VALID_SWAP_GRID = (): Array<Array<JewelType | null>> => {
  const grid = BASE_GRID()
  grid[3][0] = 'red'
  grid[3][1] = 'blue'
  grid[3][2] = 'red'
  grid[2][1] = 'red'
  grid[4][1] = 'purple'
  return grid
}

const trees: Array<TestRenderer.ReactTestRenderer> = []

const drain = async (ms = 25) => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms))
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

const testText = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): string => {
  // jest-expo renders each Text twice (wrapper + host), so scope to Text
  // nodes like the other pilots do.
  const node = tree.root.findAll(
    candidate => candidate.type === Text && candidate.props.testID === testID
  )[0]
  if (!node) {
    throw new Error(`no Text with testID ${testID}`)
  }
  return scalarText(node.props.children as React.ReactNode)
}

/** GameCanvas draws nothing until it measures itself. */
const fireLayouts = (tree: TestRenderer.ReactTestRenderer) => {
  const hosts = tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => typeof node.props.onLayout === 'function')
  expect(hosts.length).toBeGreaterThan(0)
  act(() => {
    for (const host of hosts) {
      host.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 640 } },
      })
    }
  })
}

const shapes = (
  tree: TestRenderer.ReactTestRenderer,
  name: string
): Array<Record<string, unknown>> =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => node.props.testID === `skia-${name}`)
    .map(node => node.props)

/** Gems draw at CELL - 10; base cells/overlays use other widths. */
const gemShapes = (tree: TestRenderer.ReactTestRenderer) =>
  shapes(tree, 'RoundedRect').filter(props => props.width === CELL - 10)

const strokeColors = (tree: TestRenderer.ReactTestRenderer): string[] =>
  shapes(tree, 'RoundedRect')
    .filter(props => props.style === 'stroke')
    .map(props => String(props.color))

const clearOverlays = (tree: TestRenderer.ReactTestRenderer) =>
  shapes(tree, 'RoundedRect').filter(
    props => props.color === 'rgba(255, 255, 255, 0.55)'
  )

/** Pressable cell control: the node that both carries the testID and the
 *  press handler (the rendered host View has no onPress). */
const cellNode = (
  tree: TestRenderer.ReactTestRenderer,
  row: number,
  col: number
) => {
  const matches = tree.root.findAll(
    node =>
      node.props.testID === `bejeweled-cell-${row}-${col}` &&
      typeof node.props.onPress === 'function'
  )
  if (matches.length === 0) {
    throw new Error(`no cell control for row ${row} column ${col}`)
  }
  return matches[0]
}

const tapCell = async (
  tree: TestRenderer.ReactTestRenderer,
  row: number,
  col: number
) => {
  const cell = cellNode(tree, row, col)
  await act(async () => {
    cell.props.onPress()
  })
}

const boardSummary = (tree: TestRenderer.ReactTestRenderer): string =>
  String(
    tree.root.findAll(
      node =>
        node.props.testID === 'bejeweled-status' &&
        typeof node.props.accessibilityLabel === 'string'
    )[0]?.props.accessibilityLabel
  )

const panHandlers = (
  tree: TestRenderer.ReactTestRenderer
): Record<string, (event: unknown, success?: boolean) => void> =>
  tree.root.findByType(GestureDetector).props.gesture.handlers

const cellX = (col: number) => col * CELL + CELL / 2
const cellY = (row: number) => CANVAS_OFFSET_Y + row * CELL + CELL / 2

const beginSwipeAt = (
  tree: TestRenderer.ReactTestRenderer,
  x: number,
  y: number
) => {
  act(() => {
    panHandlers(tree).onBegin({ x, y })
  })
}

const beginSwipe = (
  tree: TestRenderer.ReactTestRenderer,
  row: number,
  col: number
) => beginSwipeAt(tree, cellX(col), cellY(row))

const endSwipe = (
  tree: TestRenderer.ReactTestRenderer,
  translationX: number,
  translationY: number,
  success = true
) => {
  act(() => {
    panHandlers(tree).onFinalize({ translationX, translationY }, success)
  })
}

/** Explicit mutable-state access for crafted boards, mirroring the portable
 *  model tests: swap/match rules stay in @cetus/games, only the fixture is
 *  written directly. */
const liveState = (game: BejeweledGame): BejeweledState =>
  (game as unknown as { state: BejeweledState }).state

const setGrid = (game: BejeweledGame, grid: Array<Array<JewelType | null>>) => {
  act(() => {
    liveState(game).grid = grid
    ;(game as unknown as { emitStateChange: () => void }).emitStateChange()
  })
}

const waitFor = async (
  game: BejeweledGame,
  predicate: (state: BejeweledState) => boolean,
  timeoutMs = 8000
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await drain()
    if (predicate(game.getState())) {
      return game.getState()
    }
  }
  throw new Error(
    `waitFor timed out (moves ${game.getState().movesMade}, animating ${game.getState().isAnimating})`
  )
}

const waitUntil = async (predicate: () => boolean, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await drain()
    if (predicate()) {
      return
    }
  }
  throw new Error('waitUntil timed out')
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
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

describe('Bejeweled pilot — board', () => {
  test('renders the idle 8 by 8 board with disabled, labelled cell controls', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)

    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(testText(tree, 'bejeweled-moves')).toBe('Moves 0')
    expect(testText(tree, 'bejeweled-status')).toBe('Waiting to start')
    expect(tree.root.findByProps({ testID: 'bejeweled-scroll' })).toBeTruthy()

    const gems = gemShapes(tree)
    expect(gems).toHaveLength(64)
    const validColors = new Set(
      JEWEL_TYPES.map(type => cssColor(JEWEL_COLORS[type]))
    )
    for (const gem of gems) {
      expect(validColors.has(String(gem.color))).toBe(true)
    }

    const cell = cellNode(tree, 0, 0)
    expect(cell.props.disabled).toBe(true)
    expect(cell.props.accessibilityLabel).toMatch(/^Row 1, column 1, \w+ gem$/)
    expect(boardSummary(tree)).toContain('Bejeweled board, 8 by 8.')
    expect(boardSummary(tree)).toContain('Moves 0.')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })

  test('tapping two adjacent gems selects and swaps them through clickCell', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())

    const origin = cellNode(tree, 3, 1)
    expect(origin.props.disabled).toBe(false)
    expect(origin.props.accessibilityLabel).toBe('Row 4, column 2, blue gem')

    await tapCell(tree, 3, 1)
    expect(game.getState().selected).toEqual({ row: 3, col: 1 })
    expect(testText(tree, 'bejeweled-status')).toBe('Selected row 4 column 2')
    expect(cellNode(tree, 3, 1).props.accessibilityState.selected).toBe(true)
    expect(boardSummary(tree)).toContain('Selected row 4 column 2.')

    await tapCell(tree, 2, 1)
    // The board draws its own swap-pair ring while the model awaits it.
    expect(strokeColors(tree)).toContain(cssColor(0x4dfff2))

    await waitFor(game, state => !state.isAnimating && state.movesMade === 1)
    const state = game.getState()
    expect(state.selected).toBeNull()
    expect(state.grid.flat().every(jewel => jewel !== null)).toBe(true)
    expect(state.score).toBeGreaterThanOrEqual(30)
    expect(testText(tree, 'bejeweled-moves')).toBe('Moves 1')
    expect(testText(tree, 'bejeweled-status')).toBe('Select two adjacent gems')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('an invalid swap animates back, refuses input while animating and never scores', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const grid = BASE_GRID()
    setGrid(game, grid)
    const before = cloneGrid(grid)

    await tapCell(tree, 5, 5)
    await tapCell(tree, 5, 6)
    expect(game.getState().isAnimating).toBe(true)

    // The cells are disabled while the model animates; a stale press is
    // still refused by the model's own isAnimating guard.
    const stale = cellNode(tree, 0, 0)
    expect(stale.props.disabled).toBe(true)
    await act(async () => {
      stale.props.onPress()
    })
    expect(game.getState().selected).toEqual({ row: 5, col: 5 })

    // The model's swap-back feedback is the amber ring.
    await waitUntil(() => strokeColors(tree).includes(cssColor(0xffc24a)))
    await waitFor(game, state => !state.isAnimating)

    expect(game.getState().movesMade).toBe(0)
    expect(game.getState().score).toBe(0)
    expect(game.getState().selected).toEqual({ row: 5, col: 6 })
    expect(game.getState().grid).toEqual(before)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('an adjacent swipe swaps once; cancelled, duplicate and edge gestures do nothing', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    const scroll = tree.root.findByProps({
      handlerType: 'NativeViewGestureHandler',
    })
    const detector = tree.root.findByType(GestureDetector)
    expect(detector.props.gesture.config.blocksHandlers).toContain(
      scroll.props.handlerTag
    )

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())

    // A cancelled pan (scroll or system takeover) commits nothing.
    beginSwipe(tree, 3, 1)
    endSwipe(tree, 0, -CELL, false)
    expect(game.getState().selected).toBeNull()
    expect(game.getState().movesMade).toBe(0)

    // Selecting the origin first, then swiping up, must swap origin↔above
    // instead of deselecting it.
    await tapCell(tree, 3, 1)
    beginSwipe(tree, 3, 1)
    endSwipe(tree, 0, -CELL)
    // The duplicate final callback of one gesture must not move twice.
    endSwipe(tree, 0, -CELL)

    await waitFor(game, state => !state.isAnimating && state.movesMade === 1)
    expect(game.getState().movesMade).toBe(1)

    // Before any new animation: an edge swipe pointing off-board and a
    // begin outside the logical grid both stay no-ops.
    beginSwipe(tree, 7, 7)
    endSwipe(tree, CELL, 0)
    beginSwipeAt(tree, 400, 400)
    endSwipe(tree, 0, -CELL)
    expect(game.getState().movesMade).toBe(1)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a swipe from a cell next to the previous selection swaps the intended pair', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())

    // Select (3,0) so its right neighbour (3,1) is the swipe origin. The
    // old path would immediately swap selection↔origin and ignore the
    // intended upward pair.
    await tapCell(tree, 3, 0)
    expect(game.getState().selected).toEqual({ row: 3, col: 0 })

    beginSwipe(tree, 3, 1)
    endSwipe(tree, 0, -CELL)

    // The stale selection was deselected first, so the model is animating
    // the origin→target pair and the selection sits on the origin.
    expect(game.getState().isAnimating).toBe(true)
    expect(game.getState().selected).toEqual({ row: 3, col: 1 })

    await waitFor(game, state => !state.isAnimating && state.movesMade === 1)
    expect(game.getState().movesMade).toBe(1)
    expect(game.getState().selected).toBeNull()
    expect(game.getState().score).toBeGreaterThanOrEqual(30)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a cascade is owned by the model and the board announces each chain step', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())

    // First refill (row 0, columns 0-2) is three green gems: a real
    // cascade. The second refill breaks the chain with three distinct
    // colors so the model settles.
    const rolls = [0.4, 0.4, 0.4, 0, 0.2, 0.5]
    jest.spyOn(Math, 'random').mockImplementation(() => rolls.shift() ?? 0.2)

    await tapCell(tree, 3, 1)
    await tapCell(tree, 2, 1)

    await waitFor(game, state => state.combo === 2)
    expect(testText(tree, 'bejeweled-status')).toBe('Chain ×2')
    expect(clearOverlays(tree).length).toBeGreaterThan(0)

    await waitFor(game, state => !state.isAnimating)
    const stats = game.getGameStats()
    expect(game.getState().movesMade).toBe(1)
    expect(game.getState().score).toBe(90)
    expect(stats.maxCombo).toBe(2)
    expect(stats.totalMatches).toBe(2)
    expect(stats.largestMatch).toBe(3)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('reset during animation cancels the stale visuals and never scores', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())
    await tapCell(tree, 3, 1)
    await tapCell(tree, 2, 1)
    expect(game.getState().isAnimating).toBe(true)
    expect(strokeColors(tree).length).toBeGreaterThan(0)

    await press(tree, 'Reset game')

    const reset = game.getState()
    expect(reset.isActive).toBe(false)
    expect(reset.isAnimating).toBe(false)
    expect(reset.movesMade).toBe(0)
    expect(reset.score).toBe(0)
    // The stale swap ring is dropped on the reset's run change, even though
    // the animator's promise has not settled yet.
    expect(strokeColors(tree)).toHaveLength(0)
    expect(clearOverlays(tree)).toHaveLength(0)
    expect(testText(tree, 'bejeweled-status')).toBe('Waiting to start')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()

    // Let the pending animation resolve: the model's run check discards it.
    await drain(400)
    expect(game.getState().isAnimating).toBe(false)
    expect(game.getState().movesMade).toBe(0)
    expect(game.getState().score).toBe(0)
    expect(strokeColors(tree)).toHaveLength(0)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('pausing mid-animation suspends the swap chain until resume', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())
    await tapCell(tree, 3, 1)
    await tapCell(tree, 2, 1)
    expect(game.getState().isAnimating).toBe(true)

    await press(tree, 'Pause game')
    expect(game.getState().isPaused).toBe(true)
    const frozen = cloneGrid(game.getState().grid)
    const scoreAtPause = game.getState().score

    // Well past the swap and clear display windows: the countdown is
    // frozen, so the grid and score must be too — the pending animator
    // waits hold until resume instead of completing behind the pause.
    await drain(600)
    expect(game.getState().isAnimating).toBe(true)
    expect(game.getState().grid).toEqual(frozen)
    expect(game.getState().score).toBe(scoreAtPause)

    await press(tree, 'Resume game')
    await waitFor(game, state => !state.isAnimating)
    expect(game.getState().movesMade).toBe(1)
    expect(game.getState().score).toBeGreaterThanOrEqual(30)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a reset while paused settles the suspended swap wait', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())
    await tapCell(tree, 3, 1)
    await tapCell(tree, 2, 1)
    expect(game.getState().isAnimating).toBe(true)

    await press(tree, 'Pause game')
    await press(tree, 'Reset game')
    expect(game.getState().isAnimating).toBe(false)
    expect(game.getState().movesMade).toBe(0)

    // The suspended wait settles on the run change instead of hanging;
    // letting it resolve must not commit the stale run's swap.
    await drain(400)
    expect(game.getState().isAnimating).toBe(false)
    expect(game.getState().movesMade).toBe(0)
    expect(game.getState().score).toBe(0)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('fits the board to available height and scrolls when space is tight', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const scroll = tree.root.findByType(ScrollView)
    const setViewport = (width: number, height: number) => {
      act(() => {
        scroll.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width, height } },
        })
      })
    }
    const boardSize = () =>
      StyleSheet.flatten(
        tree.root.findByProps({ testID: 'bejeweled-board' }).props.style
      ).width as number

    setViewport(390, 800)
    expect(boardSize()).toBe(358)

    setViewport(390, 400)
    expect(boardSize()).toBe(250)

    // Below the static reserve the board keeps a usable floor and the
    // ScrollView carries the overflow (for example enlarged text).
    setViewport(390, 250)
    expect(boardSize()).toBe(160)
  })
})

describe('Bejeweled pilot — run result', () => {
  test('finishing posts one score with the model stats and shows saved rewards', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())
    await tapCell(tree, 3, 1)
    await tapCell(tree, 2, 1)
    await waitFor(game, state => !state.isAnimating && state.movesMade === 1)
    const score = game.getState().score

    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [ACHIEVEMENT],
    })
    await act(async () => {
      await game.end()
    })
    await drain(50)

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.BEJEWELED,
        platform: 'ios',
        score,
        gameData: expect.objectContaining({
          movesMade: 1,
          maxCombo: expect.any(Number),
          totalMatches: expect.any(Number),
          largestMatch: 3,
        }),
      })
    )
    expect(testText(tree, 'final-score')).toBe(String(score))
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(tree.root.findByProps({ testID: 'reward-banner' })).toBeTruthy()
    expect(
      tree.root.findAll(
        node =>
          node.type === Text &&
          scalarText(node.props.children).includes('Chain Reaction')
      ).length
    ).toBeGreaterThan(0)

    // A finished run's late Replay starts clean and never re-posts.
    await press(tree, 'Play again')
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().movesMade).toBe(0)
    expect(game.getState().score).toBe(0)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('unmount detaches the animator, settles its pending waits and destroys the game', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BEJEWELED} />)
    fireLayouts(tree)
    const game = createdGames[0]
    const destroy = jest.spyOn(game, 'destroy')
    const animatorRef = game as unknown as {
      animator?: BejeweledAnimator
    }

    await press(tree, 'Start game')
    setGrid(game, VALID_SWAP_GRID())
    await tapCell(tree, 3, 1)
    await tapCell(tree, 2, 1)
    expect(game.getState().isAnimating).toBe(true)

    const boardAnimator = animatorRef.animator
    expect(boardAnimator).toBeDefined()
    await act(async () => {
      tree.unmount()
    })

    expect(destroy).toHaveBeenCalled()
    const inert = animatorRef.animator
    expect(inert).toBeDefined()
    expect(inert).not.toBe(boardAnimator)
    // The replacement animator never blocks the model's await chain.
    await expect(
      inert?.animateSwap(
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        game.getState(),
        500
      )
    ).resolves.toBeUndefined()
    expect(game.getTimerStatus().isRunning).toBe(false)
  })
})
