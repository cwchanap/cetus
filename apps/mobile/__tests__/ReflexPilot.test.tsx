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
import { ReflexGame } from '@cetus/games/reflex/ReflexGame'
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

const createdGames: ReflexGame[] = []
const originalEntry = NATIVE_GAMES[GameID.REFLEX]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Reflex registry port missing')
  }
  NATIVE_GAMES[GameID.REFLEX] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new ReflexGame({
          submitScore: deps.submitScore,
          platform: deps.platform,
          spawnInterval: 0.4,
          objectLifetime: 60,
        })
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.REFLEX] = originalEntry
})

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-reflex',
  name: 'Quick Hands',
  description: 'Collect twenty coins',
  icon: '⚡',
  rarity: AchievementRarity.RARE,
}

const appStateHandlers = new Set<(state: AppStateStatus) => void>()

const emitAppState = (state: AppStateStatus) => {
  act(() => {
    for (const handler of appStateHandlers) {
      handler(state)
    }
  })
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

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 480,
  height = 480
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

const tap = (tree: TestRenderer.ReactTestRenderer, x: number, y: number) => {
  const detector = tree.root.findByType(GestureDetector)
  act(() => {
    detector.props.gesture.handlers.onEnd({ x, y })
  })
}

const spawn = (game: ReflexGame) => {
  act(() => {
    game.spawnRandomObject()
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

describe('Reflex pilot — board', () => {
  test('renders the 12×12 grid and HUD counters with no objects while idle', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)

    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(testText(tree, 'reflex-coins')).toBe('Coins 0')
    expect(testText(tree, 'reflex-bombs')).toBe('Bombs 0')
    expect(testText(tree, 'reflex-accuracy')).toBe('Accuracy 0%')

    const hint = tree.root.findByProps({ testID: 'reflex-hint' })
    expect(hint.props.accessibilityLabel).toBe(
      'Reflex board: 0 targets on a 12 by 12 grid. Tap coins before they fade — avoid the bombs.'
    )
    expect(shapes(tree, 'Rect').length).toBeGreaterThan(0)
    expect(shapes(tree, 'Path').length).toBeGreaterThan(0)
    expect(shapes(tree, 'Circle')).toHaveLength(0)

    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })

  test('the tap gesture is pinned to the JS thread', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)

    const detector = tree.root.findByType(GestureDetector)
    expect(detector.props.gesture.config.runOnJS).toBe(true)
  })

  test('the model-owned spawn interval feeds objects into the projected board', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    expect(game.getActiveObjects()).toHaveLength(0)

    await drain(450)
    expect(game.getActiveObjects().length).toBeGreaterThan(0)
    expect(shapes(tree, 'Circle').length).toBeGreaterThan(0)
    expect(testText(tree, 'reflex-coins')).toBe('Coins 0')
  })

  test('tapping a spawned coin maps through the letterbox to handleCellClick and scores', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)
    const game = createdGames[0]
    const handleCellClick = jest.spyOn(game, 'handleCellClick')
    jest.spyOn(Math, 'random').mockReturnValue(0.5)

    await press(tree, 'Start game')
    spawn(game)
    const target = game.getActiveObjects()[0]
    expect(target.type).toBe('coin')

    tap(tree, target.cell.col * 40 + 20, target.cell.row * 40 + 20)

    expect(handleCellClick).toHaveBeenCalledWith(
      target.cell.row,
      target.cell.col
    )
    expect(game.getState().score).toBe(10)
    expect(game.getState().coinsCollected).toBe(1)
    expect(game.getActiveObjects()).toHaveLength(0)
    expect(testText(tree, 'reflex-coins')).toBe('Coins 1')
    expect(testText(tree, 'reflex-accuracy')).toBe('Accuracy 100%')
    expect(shapes(tree, 'Circle')).toHaveLength(0)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a spawned coin exposes an actionable target bound to handleCellClick', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)
    const game = createdGames[0]
    const handleCellClick = jest.spyOn(game, 'handleCellClick')
    jest.spyOn(Math, 'random').mockReturnValue(0.5)

    await press(tree, 'Start game')
    spawn(game)
    const target = game.getActiveObjects()[0]

    const control = tree.root.findByProps({
      accessibilityLabel: `Coin at row ${target.cell.row + 1} column ${target.cell.col + 1}`,
    })
    expect(control.props.accessibilityRole).toBe('button')

    await act(async () => {
      control.props.onAccessibilityAction({
        nativeEvent: { actionName: 'activate' },
      })
    })

    expect(handleCellClick).toHaveBeenCalledWith(
      target.cell.row,
      target.cell.col
    )
    expect(game.getState().coinsCollected).toBe(1)
    expect(game.getActiveObjects()).toHaveLength(0)
  })

  test('taps in the letterbox margin, past the grid edge and on empty cells behave', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree, 560, 480)
    const game = createdGames[0]
    const handleCellClick = jest.spyOn(game, 'handleCellClick')

    await press(tree, 'Start game')

    tap(tree, 20, 240)
    tap(tree, 40 + 480, 240)
    expect(handleCellClick).not.toHaveBeenCalled()
    expect(game.getState().totalClicks).toBe(0)

    tap(tree, 40 + 20, 20)
    expect(handleCellClick).toHaveBeenCalledWith(0, 0)
    expect(game.getState().totalClicks).toBe(1)
    expect(game.getState().correctClicks).toBe(0)
    expect(game.getState().score).toBe(0)
    expect(testText(tree, 'reflex-accuracy')).toBe('Accuracy 0%')
  })

  test('a hit followed by an empty-cell tap drops the projected accuracy on that same click', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)
    const game = createdGames[0]
    jest.spyOn(Math, 'random').mockReturnValue(0.5)

    await press(tree, 'Start game')
    spawn(game)
    const target = game.getActiveObjects()[0]
    tap(tree, target.cell.col * 40 + 20, target.cell.row * 40 + 20)
    expect(testText(tree, 'reflex-accuracy')).toBe('Accuracy 100%')

    tap(tree, target.cell.col * 40 + 20, target.cell.row * 40 + 20)
    expect(game.getState().totalClicks).toBe(2)
    expect(game.getState().correctClicks).toBe(1)
    expect(testText(tree, 'reflex-accuracy')).toBe('Accuracy 50%')
  })

  test('a bomb tap costs points and counts as an incorrect click', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)
    const game = createdGames[0]
    jest.spyOn(Math, 'random').mockReturnValue(0.95)

    await press(tree, 'Start game')
    spawn(game)
    const target = game.getActiveObjects()[0]
    expect(target.type).toBe('bomb')

    tap(tree, target.cell.col * 40 + 20, target.cell.row * 40 + 20)

    expect(game.getState().bombsHit).toBe(1)
    expect(game.getState().incorrectClicks).toBe(1)
    expect(game.getState().score).toBe(0)
    expect(testText(tree, 'reflex-bombs')).toBe('Bombs 1')
  })

  test('60 no-op updates never rerender the chrome; spawn and click notify once each', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    spawn(game)
    const rendersAfterSpawn = formatTimeSpy.mock.calls.length

    act(() => {
      for (let i = 0; i < 60; i++) {
        game.update(1 / 60)
      }
    })
    expect(formatTimeSpy.mock.calls.length).toBe(rendersAfterSpawn)

    spawn(game)
    expect(formatTimeSpy.mock.calls.length).toBe(rendersAfterSpawn + 1)

    const target = game.getActiveObjects()[0]
    act(() => {
      game.handleCellClick(target.cell.row, target.cell.col)
    })
    expect(formatTimeSpy.mock.calls.length).toBe(rendersAfterSpawn + 2)
  })

  test('finishing posts the score once and shows the result sheet', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)
    const game = createdGames[0]
    jest.spyOn(Math, 'random').mockReturnValue(0.5)

    await press(tree, 'Start game')
    spawn(game)
    const target = game.getActiveObjects()[0]
    act(() => {
      game.handleCellClick(target.cell.row, target.cell.col)
    })
    await act(async () => {
      await game.end()
    })
    await drain()

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.REFLEX,
        platform: 'ios',
        gameData: expect.objectContaining({
          coinsCollected: 1,
          bombsHit: 0,
          missedCoins: 0,
          accuracy: 100,
          totalClicks: 1,
        }),
      })
    )
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(tree.root.findByProps({ testID: 'final-score' })).toBeTruthy()
  })
})

describe('Reflex pilot — Stage-1 save contract', () => {
  test('a provisional pending result becomes server-confirmed saved', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)

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
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)

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

  test('a successful save routes rewards into one banner without duplicating them', async () => {
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [ACHIEVEMENT],
    })
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(tree.root.findByProps({ testID: 'reward-banner' })).toBeTruthy()
    expect(renderedText(tree).match(/Quick Hands/g)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Achievement unlocked')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })
})

describe('Reflex pilot — lifecycle', () => {
  test('a replay starts a fresh run and the old one saves only once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
    fireLayout(tree)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    expect(testText(tree, 'reflex-coins')).toBe('Coins 0')
    expect(testText(tree, 'reflex-bombs')).toBe('Bombs 0')
    expect(testText(tree, 'reflex-accuracy')).toBe('Accuracy 0%')
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(createdGames[0].getState().isActive).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('backgrounding pauses the pausable run and unmount destroys the game', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.REFLEX} />)
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
    expect(appStateHandlers.size).toBe(0)
  })

  test('a stale save resolving after an account switch delivers nothing to the new host', async () => {
    const pendingSaves: Array<(value: ScoreSubmissionResult) => void> = []
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          pendingSaves.push(resolve)
        })
    )
    const treeA = await render(
      <NativeGameHost gameId={GameID.REFLEX} settledUserId="user-a" />
    )

    await press(treeA, 'Start game')
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()
    expect(renderedText(treeA)).toContain('Saving score…')

    await unmount(treeA)
    const treeB = await render(
      <NativeGameHost gameId={GameID.REFLEX} settledUserId="user-b" />
    )

    await act(async () => {
      pendingSaves[0]?.({ success: true, newAchievements: [ACHIEVEMENT] })
    })
    await drain()

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(createdGames).toHaveLength(2)
    expect(treeB.root.findAllByProps({ testID: 'reward-banner' })).toHaveLength(
      0
    )
    expect(treeB.root.findAllByProps({ testID: 'final-score' })).toHaveLength(0)
    expect(renderedText(treeB)).not.toContain('Quick Hands')
    expect(renderedText(treeB)).not.toContain('Score saved')
    expect(
      treeB.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })
})
