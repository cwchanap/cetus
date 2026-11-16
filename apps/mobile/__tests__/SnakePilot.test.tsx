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
import { SnakeGame } from '@cetus/games/snake/SnakeGame'
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

// Skia → host-View stubs that forward every prop, so assertions read the
// board's geometry/color arguments off rendered elements (host-tag filter
// skips jest-expo's doubled wrapper nodes).
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

const createdGames: SnakeGame[] = []
const originalEntry = NATIVE_GAMES[GameID.SNAKE]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Snake registry port missing')
  }
  // Production port (view, projector) with only instance capture added;
  // createGame still injects the host deps.
  NATIVE_GAMES[GameID.SNAKE] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new SnakeGame({
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
  NATIVE_GAMES[GameID.SNAKE] = originalEntry
})

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-snake',
  name: 'Serpent',
  description: 'Eat ten foods',
  icon: '🐍',
  rarity: AchievementRarity.RARE,
}

let rafQueue: Array<{ id: number; cb: (time: number) => void }> = []
let nextRafId = 1
const appStateHandlers = new Set<(state: AppStateStatus) => void>()
let now = 1_000_000

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
): string =>
  scalarText(
    tree.root.findByProps({ testID }).props.children as React.ReactNode
  )

/** GameCanvas only mounts Skia children after measuring — fire the layout. */
const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 500,
  height = 500
) => {
  const layoutHost = tree.root
    .findAll(node => typeof node.type === 'string')
    .find(node => typeof node.props.onLayout === 'function')
  if (!layoutHost) {
    throw new Error('no onLayout host found')
  }
  act(() => {
    layoutHost.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    })
  })
}

/** Current rendered Skia-shape props by component name (host-tag filter). */
const shapes = (
  tree: TestRenderer.ReactTestRenderer,
  name: string
): Array<Record<string, unknown>> =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => node.props.testID === `skia-${name}`)
    .map(node => node.props)

/** Fires the board's pan gesture end-callback with fake translations. */
const swipe = (
  tree: TestRenderer.ReactTestRenderer,
  translationX: number,
  translationY: number
) => {
  const detector = tree.root.findByType(GestureDetector)
  act(() => {
    detector.props.gesture.handlers.onEnd({ translationX, translationY })
  })
}

let formatTimeSpy: jest.SpyInstance

beforeEach(() => {
  formatTimeSpy = jest.spyOn(sharedUtils, 'formatTime')
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
  rafQueue = []
  nextRafId = 1
  appStateHandlers.clear()
  now = 1_000_000
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    return id
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => {
    rafQueue = rafQueue.filter(entry => entry.id !== id)
  })
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

// Food script: Math.random pairs for generateFoodPosition — the first food
// lands two cells right of the head ((12,10) on the 20×20 grid), later
// calls fall back to 0.5.
const seedFoodRolls = (...rolls: number[]) => {
  const queue = [...rolls]
  jest.spyOn(Math, 'random').mockImplementation(() => queue.shift() ?? 0.5)
}

const CELL = 25
const PAD = 2
const segRect = (x: number, y: number) => ({
  x: x * CELL + PAD,
  y: y * CELL + PAD,
})

describe('Snake pilot — board', () => {
  test('renders the 20×20 board with the three starting segments and HUD', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)

    // Idle clock renders the model's seconds — not milliseconds-as-seconds.
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(testText(tree, 'snake-length')).toBe('Length 3')
    expect(testText(tree, 'snake-foods')).toBe('Food 0')

    const segments = shapes(tree, 'RoundedRect').filter(
      props => props.style !== 'stroke'
    )
    expect(segments).toHaveLength(3)
    expect(segments[0]).toMatchObject({
      ...segRect(10, 10),
      width: CELL - PAD * 2,
      height: CELL - PAD * 2,
    })
    expect(segments[2]).toMatchObject(segRect(8, 10))

    // No food until the run starts.
    expect(shapes(tree, 'Circle')).toHaveLength(0)
  })

  test('start keeps 1:00 before the first timer tick and the first frame draws food', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)
    seedFoodRolls(0.61, 0.51)

    await press(tree, 'Start game')
    expect(testText(tree, 'game-time')).toBe('1:00')

    fireFrame(16)

    const state = createdGames[0].getState()
    expect(state.needsRedraw).toBe(false)
    const food = shapes(tree, 'Circle').find(props => props.style !== 'stroke')
    expect(food).toMatchObject({
      cx: 12 * CELL + CELL / 2,
      cy: 10 * CELL + CELL / 2,
    })
  })

  test('a swipe calls changeDirection on the live game and the model still rejects reversals', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)
    seedFoodRolls(0.61, 0.51)
    const game = createdGames[0]
    const changeDirection = jest.spyOn(game, 'changeDirection')

    await press(tree, 'Start game')
    now += 160
    fireFrame(16)

    // Reversal: direction is right, so a left swipe is rejected by the model.
    swipe(tree, -50, 0)
    expect(changeDirection).toHaveBeenLastCalledWith('left')
    expect(game.getState().nextDirection).toBe('right')

    swipe(tree, 0, -50)
    expect(changeDirection).toHaveBeenLastCalledWith('up')
    expect(game.getState().nextDirection).toBe('up')

    now += 160
    fireFrame(32)
    const head = game.getHead()
    expect({ x: head.x, y: head.y }).toEqual({ x: 11, y: 9 })
    const segments = shapes(tree, 'RoundedRect').filter(
      props => props.style !== 'stroke'
    )
    expect(segments[0]).toMatchObject(segRect(11, 9))
  })

  test('eating food grows the snake and refreshes the HUD projection', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)
    seedFoodRolls(0.61, 0.51)
    const game = createdGames[0]

    await press(tree, 'Start game')
    now += 160
    fireFrame(16)
    now += 160
    fireFrame(32)

    const state = game.getState()
    expect(state.foodsEaten).toBe(1)
    expect(state.snake).toHaveLength(4)
    expect(testText(tree, 'snake-length')).toBe('Length 4')
    expect(testText(tree, 'snake-foods')).toBe('Food 1')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a mid-run reset returns to a fresh idle board without saving', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)
    seedFoodRolls(0.61, 0.51)

    await press(tree, 'Start game')
    now += 160
    fireFrame(16)
    now += 160
    fireFrame(32)

    await press(tree, 'Reset game')
    fireFrame(48)

    expect(testText(tree, 'snake-length')).toBe('Length 3')
    expect(testText(tree, 'snake-foods')).toBe('Food 0')
    expect(testText(tree, 'game-time')).toBe('1:00')
    // The eaten food is gone and no stale scene survives the reset.
    expect(shapes(tree, 'Circle')).toHaveLength(0)
    const segments = shapes(tree, 'RoundedRect').filter(
      props => props.style !== 'stroke'
    )
    expect(segments).toHaveLength(3)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a wall collision ends the run, posts once and shows the result sheet', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)
    seedFoodRolls(0.61, 0.51)

    await press(tree, 'Start game')
    // Drive right into the wall: the head starts at x=10, so 10 moves hit it.
    for (let i = 0; i < 12; i++) {
      now += 160
      fireFrame(16 * (i + 1))
    }
    await drain()

    const game = createdGames[0]
    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.SNAKE,
        platform: 'ios',
        gameData: expect.objectContaining({
          foodsEaten: 1,
          maxLength: 4,
        }),
      })
    )
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(tree.root.findByProps({ testID: 'final-score' })).toBeTruthy()
  })

  test('unchanged HUD values across 60 frames never rerender the chrome', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)
    seedFoodRolls(0.61, 0.51)

    await press(tree, 'Start game')
    now += 160
    fireFrame(16)
    const rendersAfterStart = formatTimeSpy.mock.calls.length

    // 60 frames without a move interval crossing: the scene stays put and
    // the HUD projection is value-stable, so the session never notifies.
    for (let i = 0; i < 60; i++) {
      fireFrame(32 + 16 * i)
    }
    expect(formatTimeSpy.mock.calls.length).toBe(rendersAfterStart)

    // A real move still propagates through the normal refresh path; the
    // head already stepped to x=11 on the first running frame and eats the
    // scripted food at (12,10) here.
    now += 160
    fireFrame(32 + 16 * 60)
    expect(createdGames[0].getHead().x).toBe(12)
    expect(createdGames[0].getState().foodsEaten).toBe(1)
  })
})

describe('Snake pilot — Stage-1 save contract', () => {
  test('a provisional pending result becomes server-confirmed saved', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)

    await press(tree, 'Start game')
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toBe('Saving score…')

    await act(async () => {
      releaseSave?.({ success: true })
    })
    await drain()
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('NETWORK_ERROR stays honest about a possibly-committed request and never re-POSTs', async () => {
    submitScore.mockResolvedValue({ success: false, code: 'NETWORK_ERROR' })
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toBe(
      'Score not confirmed — the connection failed. It may still have been saved.'
    )
    expect(renderedText(tree)).not.toContain('Score saved')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a 401 shows the sign-in CTA for future scores only', async () => {
    submitScore.mockResolvedValue({
      success: false,
      code: 'UNAUTHENTICATED',
    })
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toBe(
      'Score not saved — you are signed out.'
    )

    await press(tree, 'Sign in to save future scores')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/games/snake/play' },
    })
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a successful save routes rewards into one banner without duplicating them', async () => {
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [ACHIEVEMENT],
    })
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(tree.root.findByProps({ testID: 'reward-banner' })).toBeTruthy()
    expect(renderedText(tree).match(/Serpent/g)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Achievement unlocked')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })
})

describe('Snake pilot — lifecycle', () => {
  test('a replay starts a fresh run and the old one saves only once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    fireLayout(tree)
    seedFoodRolls(0.61, 0.51)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    expect(testText(tree, 'snake-length')).toBe('Length 3')
    expect(testText(tree, 'snake-foods')).toBe('Food 0')
    expect(testText(tree, 'game-time')).toBe('1:00')
  })

  test('backgrounding pauses the pausable snake run and unmount destroys the game', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SNAKE} />)
    const game = createdGames[0]
    const destroy = jest.spyOn(game, 'destroy')

    await press(tree, 'Start game')
    emitAppState('background')
    expect(game.getState().isPaused).toBe(true)

    emitAppState('active')
    await press(tree, 'Resume game')
    expect(game.getState().isPaused).toBe(false)

    await unmount(tree)
    expect(destroy).toHaveBeenCalled()
    expect(rafQueue).toHaveLength(0)
    expect(appStateHandlers.size).toBe(0)
  })

  test('a new-account remount drops the previous account reward banner', async () => {
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [ACHIEVEMENT],
    })
    const treeA = await render(<NativeGameHost gameId={GameID.SNAKE} />)

    await press(treeA, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    expect(renderedText(treeA).match(/Serpent/g)).toHaveLength(1)

    await unmount(treeA)
    const treeB = await render(<NativeGameHost gameId={GameID.SNAKE} />)

    expect(treeB.root.findAllByProps({ testID: 'reward-banner' })).toHaveLength(
      0
    )
    expect(renderedText(treeB)).not.toContain('Serpent')
    expect(createdGames).toHaveLength(2)
    expect(
      treeB.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })
})
