import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import { ACHIEVEMENTS } from '@cetus/shared/achievements'
import { AsteroidDriftGame } from '@cetus/games/asteroid-drift/AsteroidDriftGame'
import {
  createAsteroidDriftConfig,
  type AsteroidDriftConfig,
  type AsteroidDriftGameData,
  type AsteroidDriftState,
} from '@cetus/games/asteroid-drift/types'
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
    Circle: shape('Circle'),
    Path: shape('Path'),
  }
})

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'

const submitScore = jest.mocked(api.submitScore)

let modelOverrides: Partial<AsteroidDriftConfig> = {}

const createdGames: AsteroidDriftGame[] = []
const originalEntry = NATIVE_GAMES[GameID.ASTEROID_DRIFT]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Asteroid Drift registry port missing')
  }
  NATIVE_GAMES[GameID.ASTEROID_DRIFT] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new AsteroidDriftGame({
          ...createAsteroidDriftConfig({
            rng: () => 0,
            ...modelOverrides,
          }),
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
  NATIVE_GAMES[GameID.ASTEROID_DRIFT] = originalEntry
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

const renderedText = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => scalarText(node.props.children))
    .join('\n')

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

let formatTimeSpy: jest.SpyInstance

beforeEach(() => {
  formatTimeSpy = jest.spyOn(sharedUtils, 'formatTime')
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  modelOverrides = {}
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

const internalState = (game: AsteroidDriftGame): AsteroidDriftState =>
  (game as unknown as { state: AsteroidDriftState }).state

const shipShape = (tree: TestRenderer.ReactTestRenderer) => {
  const ship = shapes(tree, 'Path').find(props => props.color === '#22d3ee')
  if (!ship) {
    throw new Error('no asteroid drift ship path found')
  }
  return ship
}

const shipSpeed = (game: AsteroidDriftGame): number => {
  const player = game.getState().player
  return Math.hypot(player.velocityX, player.velocityY)
}

describe('Asteroid Drift pilot — board', () => {
  test('renders the arena, the centered ship, one asteroid and the orbs/speed HUD', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)

    expect(testText(tree, 'game-time')).toBe('1:30')
    expect(testText(tree, 'asteroid-orbs')).toBe('Orbs 0')
    expect(testText(tree, 'asteroid-speed')).toBe('Speed 0')
    expect(
      tree.root.findAll(
        node =>
          typeof node.type === 'string' &&
          node.props.testID === 'asteroid-board'
      )
    ).toHaveLength(1)
    expect(shipShape(tree).path).toBe(
      'M416 240L392 226.14359353944897L392 253.85640646055103Z'
    )
    expect(
      shapes(tree, 'Circle').some(
        props =>
          props.color === '#334155' && props.cx === 866 && props.cy === 240
      )
    ).toBe(false)

    await press(tree, 'Start game')
    fireFrame(16)
    expect(
      shapes(tree, 'Circle').some(
        props =>
          props.color === '#334155' && props.cx === 866 && props.cy === 240
      )
    ).toBe(true)
  })

  test('the shared HeldDpad exposes four labelled directions', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
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

  test('a D-pad touch reaches the model as a touch direction and lifting it releases', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]
    const pressDirection = jest.spyOn(game, 'pressDirection')
    const releaseDirection = jest.spyOn(game, 'releaseDirection')

    await press(tree, 'Start game')
    touchDown(tree, 'up', 1)
    expect(pressDirection).toHaveBeenCalledWith('up', 'touch')
    expect(game.pressedDirections.has('up')).toBe(true)

    touchUp(tree, 'up', 1)
    expect(releaseDirection).toHaveBeenCalledWith('up', 'touch')
    expect(game.pressedDirections.size).toBe(0)
  })

  test('a diagonal hold thrusts diagonally and the ship coasts on inertia after release', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    touchDown(tree, 'up', 1)
    touchDown(tree, 'right', 2)
    fireFrame(16)
    fireFrame(116)
    fireFrame(216)

    const pushedX = game.getState().player.x
    const pushedY = game.getState().player.y
    expect(pushedX).toBeGreaterThan(400)
    expect(pushedY).toBeLessThan(240)
    const thrustSpeed = shipSpeed(game)
    expect(thrustSpeed).toBeGreaterThan(0)
    expect(thrustSpeed).toBeLessThanOrEqual(300)

    touchUp(tree, 'up', 1)
    touchUp(tree, 'right', 2)
    fireFrame(316)
    fireFrame(416)

    const coasting = game.getState().player
    expect(coasting.x).toBeGreaterThan(pushedX)
    expect(coasting.y).toBeLessThan(pushedY)
    expect(shipSpeed(game)).toBeLessThan(thrustSpeed)
  })

  test('a cancelled touch releases the direction', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseDirection = jest.spyOn(game, 'releaseDirection')

    await press(tree, 'Start game')
    touchDown(tree, 'left', 3)
    expect(game.pressedDirections.has('left')).toBe(true)

    touchCancel(tree, 'left', 3)
    expect(releaseDirection).toHaveBeenCalledWith('left', 'touch')
    expect(game.pressedDirections.size).toBe(0)
  })

  test('a held direction released by blur releases the touch direction', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseDirection = jest.spyOn(game, 'releaseDirection')

    await press(tree, 'Start game')
    touchDown(tree, 'down', 1)
    expect(game.pressedDirections.has('down')).toBe(true)

    act(() => {
      dpadButton(tree, 'down').props.onBlur?.()
    })
    expect(releaseDirection).toHaveBeenCalledWith('down', 'touch')
    expect(game.pressedDirections.size).toBe(0)
  })

  test('unmounting with a held direction releases the touch direction', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseDirection = jest.spyOn(game, 'releaseDirection')

    await press(tree, 'Start game')
    touchDown(tree, 'right', 1)
    expect(game.pressedDirections.has('right')).toBe(true)

    await unmount(tree)
    expect(releaseDirection).toHaveBeenCalledWith('right', 'touch')
  })

  test('an assistive activation while idle does not latch — one activation after start thrusts', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
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
    expect(game.pressedDirections.size).toBe(0)

    await press(tree, 'Start game')
    fireFrame(16)
    await activate(dpadButton(tree, 'up'))
    expect(game.pressedDirections.has('up')).toBe(true)
    expect(dpadButton(tree, 'up').props.accessibilityState).toMatchObject({
      checked: true,
      disabled: false,
    })

    fireFrame(116)
    fireFrame(216)
    expect(game.getState().player.y).toBeLessThan(240)

    await activate(dpadButton(tree, 'up'))
    expect(game.pressedDirections.size).toBe(0)
  })

  test('a physical touch while idle does not carry into the started run', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    touchDown(tree, 'right', 1)
    expect(game.pressedDirections.size).toBe(0)
    expect(dpadButton(tree, 'right').props.accessibilityState).toMatchObject({
      checked: false,
    })

    await press(tree, 'Start game')
    fireFrame(16)
    expect(game.pressedDirections.size).toBe(0)
    touchUp(tree, 'right', 1)

    touchDown(tree, 'right', 2)
    expect(game.pressedDirections.has('right')).toBe(true)
  })

  test('an assistive hold releases itself when the run ends underneath it', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]
    const releaseDirection = jest.spyOn(game, 'releaseDirection')

    await press(tree, 'Start game')
    fireFrame(16)
    await activate(dpadButton(tree, 'left'))
    expect(game.pressedDirections.has('left')).toBe(true)

    await act(async () => {
      await game.end()
    })
    await drain()
    fireFrame(32)
    expect(dpadButton(tree, 'left').props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true,
    })
    expect(releaseDirection).toHaveBeenCalledWith('left', 'touch')

    await activate(dpadButton(tree, 'left'))
    expect(game.pressedDirections.size).toBe(0)

    await press(tree, 'Play again')
    fireFrame(48)
    await activate(dpadButton(tree, 'left'))
    expect(game.pressedDirections.has('left')).toBe(true)
  })

  test('a mid-run Reset returns the ship to the centered idle scene', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    touchDown(tree, 'right', 1)
    fireFrame(16)
    fireFrame(116)
    touchUp(tree, 'right', 1)
    expect(game.getState().player.x).toBeGreaterThan(400)

    await press(tree, 'Reset game')
    fireFrame(216)
    expect(game.getState()).toMatchObject({
      isActive: false,
      gameStarted: false,
      outcome: 'playing',
    })
    expect(game.getState().player.x).toBe(400)
    expect(game.getState().asteroids).toHaveLength(0)
    expect(shipShape(tree).path).toBe(
      'M416 240L392 226.14359353944897L392 253.85640646055103Z'
    )
    expect(testText(tree, 'asteroid-speed')).toBe('Speed 0')
  })

  test('a collision ends the run with the Collision label and one score POST', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const intro = internalState(game).asteroids[0]
    intro.x = game.getState().player.x
    intro.y = game.getState().player.y
    fireFrame(16)
    fireFrame(116)
    await drain()

    expect(game.getState()).toMatchObject({
      outcome: 'collision',
      isGameOver: true,
    })
    expect(testText(tree, 'result-outcome')).toBe('Collision')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.ASTEROID_DRIFT,
        platform: 'ios',
        gameData: expect.objectContaining({ survivedFullRun: false }),
      })
    )
  })

  test('unchanged HUD values across 60 moving frames never rerender the chrome', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    const rendersAfterStart = formatTimeSpy.mock.calls.length

    for (let i = 0; i < 60; i++) {
      fireFrame(32 + 16 * i)
    }
    expect(formatTimeSpy.mock.calls.length).toBe(rendersAfterStart)
    expect(game.getState().asteroids[0].x).toBeLessThan(866)

    for (let i = 0; i < 10; i++) {
      fireFrame(992 + 16 * i)
    }
    expect(game.getState().score).toBeGreaterThan(0)
    expect(formatTimeSpy.mock.calls.length).toBeGreaterThan(rendersAfterStart)
  })

  test('backgrounding stops the frame loop without pausing the non-pausable run', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    fireFrame(116)
    const asteroidX = game.getState().asteroids[0].x

    emitAppState('background')
    expect(game.getState().isPaused).toBe(false)
    fireFrame(216)
    fireFrame(316)
    expect(game.getState().asteroids[0].x).toBe(asteroidX)
    expect(game.getState().isActive).toBe(true)

    emitAppState('active')
    fireFrame(416)
    fireFrame(516)
    expect(game.getState().asteroids[0].x).toBeLessThan(asteroidX)
  })

  test('unmount destroys the game, the loop and the listeners', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    const destroy = jest.spyOn(createdGames[0], 'destroy')

    await unmount(tree)
    expect(destroy).toHaveBeenCalled()
    expect(rafQueue).toHaveLength(0)
    expect(appStateHandlers.size).toBe(0)
  })
})

describe('Asteroid Drift pilot — run outcomes and save contract', () => {
  test('an uninterrupted run survives the full 90 seconds and posts survivedFullRun once', async () => {
    modelOverrides = { maxAsteroids: 0, orbSpawnInterval: 1e6 }
    jest.useFakeTimers({
      doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
    try {
      let tree: TestRenderer.ReactTestRenderer | undefined
      await act(async () => {
        tree = TestRenderer.create(
          <NativeGameHost gameId={GameID.ASTEROID_DRIFT} />
        )
        jest.advanceTimersByTime(50)
      })
      if (!tree) {
        throw new Error('TestRenderer.create returned nothing')
      }
      trees.push(tree)
      const game = createdGames[0]
      fireLayout(tree)

      await press(tree, 'Start game')
      internalState(game).asteroids[0].x = -10_000

      for (let i = 0; i < 905; i++) {
        fireFrame(1_000 + i * 100)
      }
      expect(game.getState().isActive).toBe(true)
      expect(game.getState().asteroids).toHaveLength(0)

      await act(async () => {
        jest.advanceTimersByTime(91_000)
        for (let i = 0; i < 10; i++) {
          await Promise.resolve()
        }
      })

      expect(game.getState()).toMatchObject({
        outcome: 'survived',
        isGameOver: true,
      })
      expect(game.getGameStats()).toMatchObject({
        outcome: 'survived',
        survivalSeconds: 90,
      })
      expect(testText(tree, 'result-outcome')).toBe('Survived')
      expect(testText(tree, 'final-score')).toBe('900')
      expect(testText(tree, 'result-save-status')).toBe('Score saved')
      expect(submitScore).toHaveBeenCalledTimes(1)
      expect(submitScore).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: GameID.ASTEROID_DRIFT,
          platform: 'ios',
          gameData: {
            survivalSeconds: 90,
            orbsCollected: 0,
            survivedFullRun: true,
          },
        })
      )
    } finally {
      jest.useRealTimers()
    }
  })

  test('a backgrounded run that falls behind the wall clock ends expired, still one POST', async () => {
    jest.useFakeTimers({
      doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
    try {
      let tree: TestRenderer.ReactTestRenderer | undefined
      await act(async () => {
        tree = TestRenderer.create(
          <NativeGameHost gameId={GameID.ASTEROID_DRIFT} />
        )
        jest.advanceTimersByTime(50)
      })
      if (!tree) {
        throw new Error('TestRenderer.create returned nothing')
      }
      trees.push(tree)
      const game = createdGames[0]
      fireLayout(tree)

      await press(tree, 'Start game')
      fireFrame(100)
      fireFrame(200)
      expect(game.getState().asteroids[0].x).toBeLessThan(866)

      emitAppState('background')
      expect(game.getState().isPaused).toBe(false)

      await act(async () => {
        jest.advanceTimersByTime(91_000)
        for (let i = 0; i < 10; i++) {
          await Promise.resolve()
        }
      })

      expect(game.getState()).toMatchObject({
        outcome: 'expired',
        isGameOver: true,
      })
      expect(testText(tree, 'result-outcome')).toBe('Expired')
      expect(testText(tree, 'result-save-status')).toBe('Score saved')
      expect(submitScore).toHaveBeenCalledTimes(1)
      expect(submitScore).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: GameID.ASTEROID_DRIFT,
          gameData: expect.objectContaining({
            survivedFullRun: false,
            survivalSeconds: 0,
          }),
        })
      )
    } finally {
      jest.useRealTimers()
    }
  })

  test('a replay starts a fresh run and the old one saves only once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const intro = internalState(game).asteroids[0]
    intro.x = game.getState().player.x
    intro.y = game.getState().player.y
    fireFrame(16)
    fireFrame(116)
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    fireFrame(216)
    expect(testText(tree, 'asteroid-orbs')).toBe('Orbs 0')
    expect(testText(tree, 'game-time')).toBe('1:30')
    expect(shipShape(tree).path).toBe(
      'M416 240L392 226.14359353944897L392 253.85640646055103Z'
    )
    expect(game.getState().asteroids).toHaveLength(1)
    expect(
      shapes(tree, 'Circle').some(
        props =>
          props.color === '#334155' && props.cx === 866 && props.cy === 240
      )
    ).toBe(true)
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
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)

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

  test('a qualifying 10-orb run satisfies the shipped achievement predicates and delivers one reward', async () => {
    modelOverrides = { maxAsteroids: 0, orbSpawnInterval: 1, orbLifetime: 30 }
    jest.useFakeTimers({
      doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
    try {
      let tree: TestRenderer.ReactTestRenderer | undefined
      await act(async () => {
        tree = TestRenderer.create(
          <NativeGameHost gameId={GameID.ASTEROID_DRIFT} />
        )
        jest.advanceTimersByTime(50)
      })
      if (!tree) {
        throw new Error('TestRenderer.create returned nothing')
      }
      trees.push(tree)
      const game = createdGames[0]
      fireLayout(tree)

      const deepSpaceAce = ACHIEVEMENTS.find(
        achievement => achievement.id === 'asteroid_drift_deep_space_ace'
      )
      if (!deepSpaceAce) {
        throw new Error('asteroid_drift_deep_space_ace definition missing')
      }
      submitScore.mockResolvedValue({
        success: true,
        newAchievements: [
          {
            id: deepSpaceAce.id,
            name: deepSpaceAce.name,
            description: deepSpaceAce.description,
            icon: deepSpaceAce.logo,
            rarity: deepSpaceAce.rarity,
          },
        ],
      })

      await press(tree, 'Start game')
      internalState(game).asteroids[0].x = -10_000

      let frame = 0
      const step = () => fireFrame(1_000 + frame++ * 100)

      while (game.getState().orbsCollected < 10) {
        const collectedBefore = game.getState().orbsCollected
        let guard = 0
        while (game.getState().energyOrb === null && guard++ < 60) {
          step()
        }
        const orb = game.getState().energyOrb
        if (!orb) {
          throw new Error('energy orb never spawned')
        }
        const player = internalState(game).player
        player.x = orb.x
        player.y = orb.y
        player.velocityX = 0
        player.velocityY = 0
        step()
        expect(game.getState().orbsCollected).toBe(collectedBefore + 1)
      }
      expect(game.getState().isActive).toBe(true)

      while (game.getGameStats().survivalSeconds < 90) {
        step()
      }

      await act(async () => {
        jest.advanceTimersByTime(91_000)
        for (let i = 0; i < 10; i++) {
          await Promise.resolve()
        }
      })

      expect(game.getState()).toMatchObject({
        outcome: 'survived',
        orbsCollected: 10,
      })
      expect(submitScore).toHaveBeenCalledTimes(1)
      const submission = submitScore.mock.calls[0][0]
      const submittedGameData = (submission.gameData ??
        {}) as AsteroidDriftGameData
      const earned = ACHIEVEMENTS.filter(
        achievement =>
          achievement.gameId === GameID.ASTEROID_DRIFT &&
          achievement.condition.check?.(submittedGameData, submission.score)
      ).map(achievement => achievement.id)
      expect(earned.sort()).toEqual([
        'asteroid_drift_deep_space_ace',
        'asteroid_drift_energy_runner',
        'asteroid_drift_first_charge',
        'asteroid_drift_long_haul',
      ])

      expect(testText(tree, 'result-outcome')).toBe('Survived')
      expect(testText(tree, 'final-score')).toBe('1900')
      expect(testText(tree, 'result-save-status')).toBe('Score saved')
      expect(renderedText(tree).match(/Deep Space Ace/g)).toHaveLength(1)
      expect(renderedText(tree)).toContain('Achievement unlocked')

      await act(async () => {
        await game.end()
      })
      await act(async () => {
        jest.advanceTimersByTime(10_000)
        for (let i = 0; i < 10; i++) {
          await Promise.resolve()
        }
      })
      step()
      step()

      expect(submitScore).toHaveBeenCalledTimes(1)
      expect(renderedText(tree).match(/Deep Space Ace/g)).toHaveLength(1)
    } finally {
      jest.useRealTimers()
    }
  })

  test('a failed save reports unconfirmed honestly and never re-POSTs', async () => {
    submitScore.mockResolvedValue({ success: false, code: 'NETWORK_ERROR' })
    const tree = await render(<NativeGameHost gameId={GameID.ASTEROID_DRIFT} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const intro = internalState(game).asteroids[0]
    intro.x = game.getState().player.x
    intro.y = game.getState().player.y
    fireFrame(16)
    fireFrame(116)
    await drain()

    expect(game.getState()).toMatchObject({
      outcome: 'collision',
      isGameOver: true,
    })
    expect(testText(tree, 'result-outcome')).toBe('Collision')
    expect(testText(tree, 'result-save-status')).toBe(
      'Score not confirmed — the connection failed. It may still have been saved.'
    )
    expect(renderedText(tree)).not.toContain('Score saved')
    expect(renderedText(tree)).not.toContain('Achievement unlocked')
    expect(tree.root.findAllByProps({ testID: 'reward-banner' })).toHaveLength(
      0
    )

    await act(async () => {
      await game.end()
    })
    fireFrame(216)
    fireFrame(316)
    await drain()

    expect(testText(tree, 'result-save-status')).toBe(
      'Score not confirmed — the connection failed. It may still have been saved.'
    )
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})
