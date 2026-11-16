import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, type AppStateStatus } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import { EvaderGame } from '@cetus/games/evader/EvaderGame'
import type { EvaderState } from '@cetus/games/evader/frameworkTypes'
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

const createdGames: EvaderGame[] = []
const originalEntry = NATIVE_GAMES[GameID.EVADER]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Evader registry port missing')
  }
  NATIVE_GAMES[GameID.EVADER] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new EvaderGame({
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
  NATIVE_GAMES[GameID.EVADER] = originalEntry
})

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

const testText = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): string =>
  scalarText(
    tree.root.findByProps({ testID }).props.children as React.ReactNode
  )

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 500,
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

type DpadDirection = 'up' | 'down' | 'left' | 'right'

interface DpadTouch {
  id: number
  x: number
  y: number
  absoluteX: number
  absoluteY: number
}

interface DpadTouchEvent {
  changedTouches: DpadTouch[]
  allTouches: DpadTouch[]
}

const dpadTouch = (id: number, x = 20, y = 20): DpadTouch => ({
  id,
  x,
  y,
  absoluteX: x,
  absoluteY: y,
})

const dpadButton = (
  tree: TestRenderer.ReactTestRenderer,
  direction: DpadDirection
) => {
  const button = tree.root
    .findAll(node => node.props.testID === `dpad-${direction}`)
    .find(node => typeof node.props.onAccessibilityAction === 'function')
  if (!button) {
    throw new Error(`no held D-pad button for ${direction}`)
  }
  return button
}

const dpadGesture = (
  tree: TestRenderer.ReactTestRenderer,
  direction: DpadDirection
) => {
  const detector = tree.root
    .findAllByType(GestureDetector)
    .find(
      node =>
        node.findAll(child => child.props.testID === `dpad-${direction}`)
          .length > 0
    )
  if (!detector) {
    throw new Error(`no gesture detector wrapping dpad-${direction}`)
  }
  return detector.props.gesture.handlers as Record<
    string,
    (event: DpadTouchEvent) => void
  >
}

const fireTouches = (
  tree: TestRenderer.ReactTestRenderer,
  direction: DpadDirection,
  handler: string,
  event: DpadTouchEvent
) => {
  const handlers = dpadGesture(tree, direction)
  const callback = handlers[handler]
  if (typeof callback !== 'function') {
    throw new Error(`dpad-${direction} gesture is missing ${handler}`)
  }
  act(() => {
    callback(event)
  })
}

const touchDown = (
  tree: TestRenderer.ReactTestRenderer,
  direction: DpadDirection,
  touchId: number
) => {
  const touch = dpadTouch(touchId)
  fireTouches(tree, direction, 'onTouchesDown', {
    changedTouches: [touch],
    allTouches: [touch],
  })
}

const touchMove = (
  tree: TestRenderer.ReactTestRenderer,
  direction: DpadDirection,
  touchId: number,
  x: number,
  y: number
) => {
  const touch = dpadTouch(touchId, x, y)
  fireTouches(tree, direction, 'onTouchesMove', {
    changedTouches: [touch],
    allTouches: [touch],
  })
}

const touchUp = (
  tree: TestRenderer.ReactTestRenderer,
  direction: DpadDirection,
  touchId: number
) => {
  fireTouches(tree, direction, 'onTouchesUp', {
    changedTouches: [dpadTouch(touchId)],
    allTouches: [],
  })
}

const touchCancel = (
  tree: TestRenderer.ReactTestRenderer,
  direction: DpadDirection,
  touchId: number
) => {
  fireTouches(tree, direction, 'onTouchesCancelled', {
    changedTouches: [dpadTouch(touchId)],
    allTouches: [],
  })
}

const activate = async (button: TestRenderer.ReactTestInstance) => {
  await act(async () => {
    button.props.onAccessibilityAction({
      nativeEvent: { actionName: 'activate' },
    })
  })
}

const pressButton = async (button: TestRenderer.ReactTestInstance) => {
  await act(async () => {
    button.props.onPress()
  })
}

const tapAccessibility = async (button: TestRenderer.ReactTestInstance) => {
  await act(async () => {
    button.props.onAccessibilityTap()
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

const PLAYER_SIZE = 40

const internalState = (game: EvaderGame): EvaderState =>
  (game as unknown as { state: EvaderState }).state

const playerRect = (tree: TestRenderer.ReactTestRenderer) => {
  const rect = shapes(tree, 'RoundedRect').find(
    props => props.width === PLAYER_SIZE && props.style !== 'stroke'
  )
  if (!rect) {
    throw new Error('no evader player rect found')
  }
  return rect
}

describe('Evader pilot — board', () => {
  test('renders the arena, the player at the left edge and the coins/bombs HUD', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)

    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(testText(tree, 'evader-coins')).toBe('Coins 0')
    expect(testText(tree, 'evader-bombs')).toBe('Bombs 0')
    expect(playerRect(tree)).toMatchObject({
      x: 0,
      y: 150 - PLAYER_SIZE / 2,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
    })
  })

  test('the shared HeldDpad exposes four labelled directions', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)

    const labels: Array<[DpadDirection, string]> = [
      ['up', 'Move up'],
      ['down', 'Move down'],
      ['left', 'Move left'],
      ['right', 'Move right'],
    ]
    for (const [direction, label] of labels) {
      expect(dpadButton(tree, direction).props.accessibilityLabel).toBe(label)
    }
  })

  test('a D-pad touch reaches the model as a touch Arrow-key and lifting it releases', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    const pressKey = jest.spyOn(game, 'pressKey')
    const releaseKey = jest.spyOn(game, 'releaseKey')

    await press(tree, 'Start game')
    const handlers = dpadGesture(tree, 'up')
    expect(typeof handlers.onTouchesDown).toBe('function')
    expect(typeof handlers.onTouchesUp).toBe('function')

    touchDown(tree, 'up', 1)
    expect(pressKey).toHaveBeenCalledWith('ArrowUp', 'touch')
    expect(game.pressedKeys.has('up')).toBe(true)

    touchUp(tree, 'up', 1)
    expect(releaseKey).toHaveBeenCalledWith('ArrowUp', 'touch')
    expect(game.pressedKeys.size).toBe(0)
  })

  test('two simultaneous fingers on different directions both hold and release independently', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    touchDown(tree, 'up', 1)
    touchDown(tree, 'right', 2)
    expect(game.pressedKeys.has('up')).toBe(true)
    expect(game.pressedKeys.has('right')).toBe(true)

    fireFrame(16)
    fireFrame(116)

    expect(game.getState().player.x).toBeCloseTo(20 + 30, 5)
    expect(game.getState().player.y).toBeCloseTo(150 - 30, 5)
    expect(playerRect(tree)).toMatchObject({
      x: 50 - PLAYER_SIZE / 2,
      y: 120 - PLAYER_SIZE / 2,
    })

    touchUp(tree, 'up', 1)
    expect(game.pressedKeys.has('up')).toBe(false)
    expect(game.pressedKeys.has('right')).toBe(true)

    fireFrame(216)
    expect(game.getState().player.x).toBeCloseTo(80, 5)
    expect(game.getState().player.y).toBeCloseTo(120, 5)

    touchUp(tree, 'right', 2)
    expect(game.pressedKeys.size).toBe(0)
  })

  test('two fingers on one direction keep it held until the second finger lifts', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    const pressKey = jest.spyOn(game, 'pressKey')

    await press(tree, 'Start game')
    touchDown(tree, 'up', 1)
    touchDown(tree, 'up', 2)
    expect(pressKey).toHaveBeenCalledTimes(1)

    touchUp(tree, 'up', 1)
    expect(game.pressedKeys.has('up')).toBe(true)

    touchUp(tree, 'up', 2)
    expect(game.pressedKeys.size).toBe(0)
  })

  test('a finger sliding off its button releases the direction', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseKey = jest.spyOn(game, 'releaseKey')

    await press(tree, 'Start game')
    touchDown(tree, 'down', 1)
    expect(game.pressedKeys.has('down')).toBe(true)

    touchMove(tree, 'down', 1, -4, 10)
    expect(releaseKey).toHaveBeenCalledWith('ArrowDown', 'touch')
    expect(game.pressedKeys.size).toBe(0)

    fireFrame(16)
    fireFrame(116)
    expect(game.getState().player.y).toBe(150)
  })

  test('a cancelled touch releases the direction', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseKey = jest.spyOn(game, 'releaseKey')

    await press(tree, 'Start game')
    touchDown(tree, 'left', 3)
    expect(game.pressedKeys.has('left')).toBe(true)

    touchCancel(tree, 'left', 3)
    expect(releaseKey).toHaveBeenCalledWith('ArrowLeft', 'touch')
    expect(game.pressedKeys.size).toBe(0)
  })

  test('accessibility activation toggles a held direction and announces the checked state', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const button = dpadButton(tree, 'up')
    expect(button.props.accessibilityState).toMatchObject({ checked: false })
    expect(typeof button.props.onAccessibilityAction).toBe('function')
    expect(typeof button.props.onPress).toBe('function')

    await activate(button)
    expect(game.pressedKeys.has('up')).toBe(true)
    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: true,
    })

    fireFrame(16)
    fireFrame(116)
    expect(game.getState().player.y).toBeLessThan(150)

    await activate(dpadButton(tree, 'up'))
    expect(game.pressedKeys.size).toBe(0)
    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: false,
    })
  })

  test('default accessibility activation toggles a held direction and announces checked', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const button = dpadButton(tree, 'up')
    expect(typeof button.props.onAccessibilityTap).toBe('function')

    await tapAccessibility(button)
    expect(game.pressedKeys.has('up')).toBe(true)
    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: true,
    })

    fireFrame(16)
    fireFrame(116)
    expect(game.getState().player.y).toBeLessThan(150)

    await tapAccessibility(dpadButton(tree, 'up'))
    expect(game.pressedKeys.size).toBe(0)
    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: false,
    })
  })

  test('default accessibility activation toggles immediately after an ordinary tap releases', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    touchDown(tree, 'down', 7)
    touchUp(tree, 'down', 7)
    expect(game.pressedKeys.size).toBe(0)

    await tapAccessibility(dpadButton(tree, 'down'))
    expect(game.pressedKeys.has('down')).toBe(true)

    await tapAccessibility(dpadButton(tree, 'down'))
    expect(game.pressedKeys.size).toBe(0)
  })

  test('an accessibility click toggles hold without a physical touch', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await pressButton(dpadButton(tree, 'right'))
    expect(game.pressedKeys.has('right')).toBe(true)

    await pressButton(dpadButton(tree, 'right'))
    expect(game.pressedKeys.size).toBe(0)
  })

  test('an assistive activation while idle does not latch — one activation after start holds', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true,
    })
    await activate(dpadButton(tree, 'up'))
    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: false,
    })
    expect(game.pressedKeys.size).toBe(0)

    await press(tree, 'Start game')
    fireFrame(16)
    await activate(dpadButton(tree, 'up'))
    expect(game.pressedKeys.has('up')).toBe(true)
    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: true,
      disabled: false,
    })
  })

  test('a physical touch while idle does not carry into the started run', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    touchDown(tree, 'right', 1)
    expect(game.pressedKeys.size).toBe(0)
    expect(dpadButton(tree, 'right').props.accessibilityState).toMatchObject({
      checked: false,
    })

    await press(tree, 'Start game')
    fireFrame(16)
    expect(game.pressedKeys.size).toBe(0)
    touchUp(tree, 'right', 1)
    expect(game.pressedKeys.size).toBe(0)

    touchDown(tree, 'right', 2)
    expect(game.pressedKeys.has('right')).toBe(true)
  })

  test('an assistive hold releases itself when the run ends underneath it', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseKey = jest.spyOn(game, 'releaseKey')

    await press(tree, 'Start game')
    fireFrame(16)
    await activate(dpadButton(tree, 'left'))
    expect(game.pressedKeys.has('left')).toBe(true)

    await act(async () => {
      await game.end()
    })
    await drain()
    fireFrame(32)
    expect(dpadButton(tree, 'left').props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true,
    })
    expect(releaseKey).toHaveBeenCalledWith('ArrowLeft', 'touch')

    await activate(dpadButton(tree, 'left'))
    expect(game.pressedKeys.size).toBe(0)

    await press(tree, 'Play again')
    fireFrame(48)
    await activate(dpadButton(tree, 'left'))
    expect(game.pressedKeys.has('left')).toBe(true)
  })

  test('an ordinary tap does not latch the direction after the finger lifts', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    touchDown(tree, 'down', 7)
    touchUp(tree, 'down', 7)
    expect(game.pressedKeys.size).toBe(0)

    await pressButton(dpadButton(tree, 'down'))
    expect(game.pressedKeys.size).toBe(0)

    fireFrame(16)
    fireFrame(116)
    expect(game.getState().player.y).toBe(150)
  })

  test('the player clamps at the arena edges instead of leaving', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    touchDown(tree, 'left', 1)
    fireFrame(16)
    fireFrame(116)
    expect(game.getState().player.x).toBe(PLAYER_SIZE / 2)
    touchUp(tree, 'left', 1)

    touchDown(tree, 'up', 2)
    for (let i = 0; i < 8; i++) {
      fireFrame(216 + 100 * i)
    }
    expect(game.getState().player.y).toBe(PLAYER_SIZE / 2)
    touchUp(tree, 'up', 2)
  })

  test('a held direction released by blur does not move the player', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseKey = jest.spyOn(game, 'releaseKey')

    await press(tree, 'Start game')
    touchDown(tree, 'down', 1)
    expect(game.pressedKeys.has('down')).toBe(true)

    act(() => {
      dpadButton(tree, 'down').props.onBlur?.()
    })
    expect(releaseKey).toHaveBeenCalledWith('ArrowDown', 'touch')
    expect(game.pressedKeys.size).toBe(0)

    fireFrame(16)
    fireFrame(116)
    expect(game.getState().player.y).toBe(150)
  })

  test('unmounting with a held direction releases the touch key before teardown', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseKey = jest.spyOn(game, 'releaseKey')

    await press(tree, 'Start game')
    touchDown(tree, 'right', 1)
    expect(game.pressedKeys.has('right')).toBe(true)

    await unmount(tree)
    expect(releaseKey).toHaveBeenCalledWith('ArrowRight', 'touch')
  })

  test('a spawned object slides left each frame and a coin collision refreshes the HUD', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]
    jest.spyOn(Math, 'random').mockReturnValue(0.3)

    await press(tree, 'Start game')
    game.spawnRandomObject()
    const spawned = game.getState().objects.at(-1)
    expect(spawned).toMatchObject({ x: 800 })

    fireFrame(16)
    fireFrame(32)
    const live = game.getState().objects.at(-1)
    expect(live).toBeDefined()
    expect(live && live.x).toBeCloseTo(800 - 200 * 0.016, 5)

    const objects = internalState(game).objects
    objects[0].x = 45
    objects[0].y = 150
    fireFrame(48)

    expect(game.getState().coinsCollected).toBe(1)
    expect(game.getState().score).toBe(100)
    expect(testText(tree, 'evader-coins')).toBe('Coins 1')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('unchanged HUD values across 60 frames never rerender the chrome', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)

    await press(tree, 'Start game')
    fireFrame(16)
    const rendersAfterStart = formatTimeSpy.mock.calls.length

    for (let i = 0; i < 60; i++) {
      fireFrame(32 + 16 * i)
    }
    expect(formatTimeSpy.mock.calls.length).toBe(rendersAfterStart)

    internalState(createdGames[0]).objects.push({
      id: 'pilot-coin',
      type: 'coin',
      x: 45,
      y: 150,
      speed: 200,
      spawnTime: now,
    })
    fireFrame(2000)
    expect(createdGames[0].getState().coinsCollected).toBe(1)
    expect(testText(tree, 'evader-coins')).toBe('Coins 1')
    expect(formatTimeSpy.mock.calls.length).toBeGreaterThan(rendersAfterStart)
  })

  test('a paused run refuses to move a held player', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    touchDown(tree, 'right', 1)
    await press(tree, 'Pause game')
    fireFrame(16)
    fireFrame(116)
    expect(game.getState().player.x).toBe(20)

    await press(tree, 'Resume game')
    fireFrame(216)
    fireFrame(316)
    expect(game.getState().player.x).toBeGreaterThan(20)
    touchUp(tree, 'right', 1)
  })

  test('backgrounding pauses the run and unmount destroys the game', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
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
})

describe('Evader pilot — save contract and replay', () => {
  test('a finished run posts the score once and shows the result sheet', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.EVADER,
        platform: 'ios',
        gameData: expect.objectContaining({
          coinsCollected: 0,
          bombsHit: 0,
        }),
      })
    )
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(tree.root.findByProps({ testID: 'final-score' })).toBeTruthy()
  })

  test('a replay starts a fresh run and the old one saves only once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)
    fireLayout(tree)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    expect(testText(tree, 'evader-coins')).toBe('Coins 0')
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(playerRect(tree)).toMatchObject({
      x: 0,
      y: 150 - PLAYER_SIZE / 2,
    })
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a stalled save stays pending and never re-POSTs', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.EVADER} />)

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
})
