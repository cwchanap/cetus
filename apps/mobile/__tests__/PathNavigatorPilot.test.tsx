import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, type AppStateStatus } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import {
  GAME_LEVELS,
  PathNavigatorGame,
} from '@cetus/games/path-navigator/PathNavigatorGame'
import * as sharedUtils from '@cetus/games/shared/utils'

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
    Circle: shape('Circle'),
    Path: shape('Path'),
  }
})

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'

const submitScore = jest.mocked(api.submitScore)

const createdGames: PathNavigatorGame[] = []
const originalEntry = NATIVE_GAMES[GameID.PATH_NAVIGATOR]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Path Navigator registry port missing')
  }
  NATIVE_GAMES[GameID.PATH_NAVIGATOR] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new PathNavigatorGame({
          submitScore: deps.submitScore,
          platform: deps.platform,
        })
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.PATH_NAVIGATOR] = originalEntry
})

const appStateHandlers = new Set<(state: AppStateStatus) => void>()
let now = 1_000_000

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
): string =>
  scalarText(
    tree.root.findByProps({ testID }).props.children as React.ReactNode
  )

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 400,
  height = 300
) => {
  const layoutHosts = tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => typeof node.props.onLayout === 'function')
  if (layoutHosts.length === 0) {
    throw new Error('no onLayout host found')
  }
  act(() => {
    for (const host of layoutHosts) {
      host.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width, height } },
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

const panHandlers = (tree: TestRenderer.ReactTestRenderer) => {
  const detector = tree.root.findByType(GestureDetector)
  return detector.props.gesture.handlers as Record<
    string,
    (event: { x?: number; y?: number }) => void
  >
}

const panBegin = (
  tree: TestRenderer.ReactTestRenderer,
  x: number,
  y: number
) => {
  act(() => {
    panHandlers(tree).onBegin({ x, y })
  })
}

const panMove = (
  tree: TestRenderer.ReactTestRenderer,
  x: number,
  y: number
) => {
  act(() => {
    panHandlers(tree).onUpdate({ x, y })
  })
}

const panRelease = (tree: TestRenderer.ReactTestRenderer) => {
  act(() => {
    panHandlers(tree).onFinalize({})
  })
}

let formatTimeSpy: jest.SpyInstance

beforeEach(() => {
  formatTimeSpy = jest.spyOn(sharedUtils, 'formatTime')
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
  appStateHandlers.clear()
  now = 1_000_000
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 1)
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {})
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  jest
    .mocked(AppState.addEventListener)
    .mockImplementation((_type, listener) => {
      appStateHandlers.add(listener)
      return { remove: () => appStateHandlers.delete(listener) }
    })
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
  jest.restoreAllMocks()
})

const CURSOR_RADIUS = 8

// The board is laid out at 400×300 for the 800×600 logical arena, so a
// view coordinate (vx, vy) lands on the game point (2·vx, 2·vy).
const cursorCircle = (tree: TestRenderer.ReactTestRenderer) => {
  const circle = shapes(tree, 'Circle').find(props => props.r === CURSOR_RADIUS)
  if (!circle) {
    throw new Error('no navigator cursor circle found')
  }
  return circle
}

const level1Start = GAME_LEVELS[0].path.startPoint
const level1End = GAME_LEVELS[0].path.endPoint
const level2Start = GAME_LEVELS[1].path.startPoint

describe('Path Navigator pilot — board', () => {
  test('renders the authored path, start/goal markers, the cursor and the level HUD', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)

    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(testText(tree, 'path-level')).toBe(`Level 1 / ${GAME_LEVELS.length}`)

    const circles = shapes(tree, 'Circle')
    // Start marker (cyan, r15) and goal marker (green, r15).
    expect(
      circles.find(
        props => props.r === 15 && props.color === 'rgb(0, 255, 255)'
      )
    ).toMatchObject({ cx: level1Start.x, cy: level1Start.y })
    expect(
      circles.find(props => props.r === 15 && props.color === 'rgb(0, 255, 0)')
    ).toMatchObject({ cx: level1End.x, cy: level1End.y })

    // Level 1 draws its single straight segment; the cursor sits on start.
    expect(shapes(tree, 'Path').length).toBeGreaterThanOrEqual(1)
    expect(cursorCircle(tree)).toMatchObject({
      cx: level1Start.x,
      cy: level1Start.y,
    })
  })

  test('the pan gesture is pinned to the JS thread', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)

    const detector = tree.root.findByType(GestureDetector)
    expect(detector.props.gesture.config.runOnJS).toBe(true)
  })

  test('a drag from the start moves the live cursor through letterboxed coordinates', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    panBegin(tree, 25, 150)
    panMove(tree, 200, 150)

    expect(game.getState().cursor.x).toBe(400)
    expect(game.getState().cursor.y).toBe(300)
    expect(cursorCircle(tree)).toMatchObject({ cx: 400, cy: 300 })
    panRelease(tree)
  })

  test('a pan beginning off the start zone never reaches the model', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]
    const updatePlayerPosition = jest.spyOn(game, 'updatePlayerPosition')

    await press(tree, 'Start game')
    panBegin(tree, 200, 30)
    panMove(tree, 210, 40)
    panRelease(tree)

    expect(updatePlayerPosition).not.toHaveBeenCalled()
    expect(game.getState().cursor.x).toBe(level1Start.x)
    expect(game.getState().cursor.y).toBe(level1Start.y)
  })

  test('a touch landing in the letterbox margin is ignored', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    // 500×300 letterboxes 800×600 at scale 0.5 with a 50px left margin.
    fireLayout(tree, 500, 300)
    const game = createdGames[0]
    const updatePlayerPosition = jest.spyOn(game, 'updatePlayerPosition')

    await press(tree, 'Start game')
    panBegin(tree, 20, 150)
    panMove(tree, 30, 150)
    panRelease(tree)

    expect(updatePlayerPosition).not.toHaveBeenCalled()
    expect(game.getState().cursor.x).toBe(level1Start.x)
  })

  test('live cursor samples never rerender the host chrome and no frame loop runs', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const rendersAfterStart = formatTimeSpy.mock.calls.length

    panBegin(tree, 25, 150)
    for (let i = 0; i < 30; i++) {
      panMove(tree, 25 + i, 150)
    }
    panRelease(tree)

    expect(formatTimeSpy.mock.calls.length).toBe(rendersAfterStart)
    expect(jest.mocked(global.requestAnimationFrame)).not.toHaveBeenCalled()
    expect(game.getState().cursor.x).toBe(108)
    expect(cursorCircle(tree)).toMatchObject({ cx: 108, cy: 300 })
  })

  test('a finger held across the level transition cannot fail the next level', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]
    const updatePlayerPosition = jest.spyOn(game, 'updatePlayerPosition')

    await press(tree, 'Start game')
    panBegin(tree, 25, 150)
    panMove(tree, 200, 150)
    panMove(tree, 375, 150)

    expect(game.getState().currentLevel).toBe(2)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(3)
    expect(testText(tree, 'path-level')).toBe(`Level 2 / ${GAME_LEVELS.length}`)
    expect(cursorCircle(tree)).toMatchObject({
      cx: level2Start.x,
      cy: level2Start.y,
    })

    // The still-held finger's continuing samples stay out of level 2 —
    // (400,500) is well off the curved path and would fail if forwarded.
    panMove(tree, 390, 160)
    panMove(tree, 200, 250)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(3)
    expect(game.getState().currentLevel).toBe(2)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().cursor.x).toBe(level2Start.x)
    expect(game.getState().cursor.y).toBe(level2Start.y)
    panRelease(tree)
  })

  test('a fresh pan rearms only inside the next level start zone', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]
    const updatePlayerPosition = jest.spyOn(game, 'updatePlayerPosition')

    await press(tree, 'Start game')
    panBegin(tree, 25, 150)
    panMove(tree, 375, 150)
    panRelease(tree)
    expect(game.getState().currentLevel).toBe(2)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)

    // Off-zone re-entry stays ignored.
    panBegin(tree, 200, 30)
    panMove(tree, 210, 40)
    panRelease(tree)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)

    // Inside the level-2 start buffer (start is (50,150) → view (25,75)).
    panBegin(tree, 30, 75)
    panMove(tree, 35, 80)
    panRelease(tree)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(4)
    expect(game.getState().cursor.x).toBe(70)
    expect(game.getState().cursor.y).toBe(160)
    expect(game.getState().isGameOver).toBe(false)
    expect(cursorCircle(tree)).toMatchObject({ cx: 70, cy: 160 })
  })

  test('release disarms: samples after onFinalize are ignored until a new pan', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]
    const updatePlayerPosition = jest.spyOn(game, 'updatePlayerPosition')

    await press(tree, 'Start game')
    panBegin(tree, 25, 150)
    panMove(tree, 200, 150)
    panRelease(tree)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)

    // A stale update stream (cancelled/interrupted finger) is ignored.
    panMove(tree, 210, 150)
    panMove(tree, 220, 150)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)

    panBegin(tree, 25, 150)
    panMove(tree, 200, 150)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(4)
    panRelease(tree)
  })

  test('paused samples are refused and the board disarms until a fresh pan', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]
    const updatePlayerPosition = jest.spyOn(game, 'updatePlayerPosition')

    await press(tree, 'Start game')
    panBegin(tree, 25, 150)
    panMove(tree, 200, 150)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)

    await press(tree, 'Pause game')
    panMove(tree, 250, 150)
    panMove(tree, 300, 150)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)
    expect(game.getState().cursor.x).toBe(400)

    await press(tree, 'Resume game')
    panMove(tree, 250, 150)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)
    panRelease(tree)
  })

  test('an off-path drag fails the run once and shows the result sheet', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]
    const updatePlayerPosition = jest.spyOn(game, 'updatePlayerPosition')

    await press(tree, 'Start game')
    panBegin(tree, 25, 150)
    panMove(tree, 200, 30)
    await drain()

    expect(game.getState().isGameOver).toBe(true)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)

    // The finger is still down; further samples stay disarmed.
    panMove(tree, 220, 150)
    expect(updatePlayerPosition).toHaveBeenCalledTimes(2)

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.PATH_NAVIGATOR,
        platform: 'ios',
      })
    )
    expect(testText(tree, 'result-outcome')).toBe('Off path')
    panRelease(tree)
  })
})

describe('Path Navigator pilot — completion and replay', () => {
  test('clearing all four levels posts the score once and labels the outcome Cleared', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    for (let level = 0; level < GAME_LEVELS.length; level++) {
      const start = GAME_LEVELS[level].path.startPoint
      const end = GAME_LEVELS[level].path.endPoint
      panBegin(tree, start.x / 2, start.y / 2)
      panMove(tree, end.x / 2, end.y / 2)
      panRelease(tree)
    }
    await drain()

    const state = game.getState()
    expect(state.isGameWon).toBe(true)
    expect(state.isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(testText(tree, 'result-outcome')).toBe('Cleared')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })

  test('a replay starts a fresh run and the old one saves only once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATH_NAVIGATOR} />)
    fireLayout(tree)

    await press(tree, 'Start game')
    panBegin(tree, 25, 150)
    panMove(tree, 200, 30)
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    expect(testText(tree, 'path-level')).toBe(`Level 1 / ${GAME_LEVELS.length}`)
    expect(cursorCircle(tree)).toMatchObject({
      cx: level1Start.x,
      cy: level1Start.y,
    })
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})
