import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AccessibilityInfo, ScrollView, StyleSheet, Text } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import { BubbleShooterGame } from '@cetus/games/bubble-shooter/BubbleShooterGame'
import type {
  Bubble,
  BubbleShooterState,
  GameConstants,
} from '@cetus/games/bubble-shooter/types'
import {
  getBubbleX,
  getBubbleY,
  getRowColumnCount,
} from '@cetus/games/bubble-shooter/utils'

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

let mockAnnounce: jest.SpyInstance<void, [string]>

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'

const submitScore = jest.mocked(api.submitScore)

const createdGames: BubbleShooterGame[] = []
const originalEntry = NATIVE_GAMES[GameID.BUBBLE_SHOOTER]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Bubble Shooter registry port missing')
  }
  // Production port (view, projector) with only the constructed instance
  // captured so tests can drive and inspect the real model.
  NATIVE_GAMES[GameID.BUBBLE_SHOOTER] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new BubbleShooterGame({
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
  NATIVE_GAMES[GameID.BUBBLE_SHOOTER] = originalEntry
})

const CONSTANTS: GameConstants = {
  BUBBLE_RADIUS: 20,
  GRID_WIDTH: 14,
  GRID_HEIGHT: 20,
  COLORS: [0xff4444, 0x44ff44, 0x4444ff],
  GAME_WIDTH: 600,
  GAME_HEIGHT: 800,
  SHOOTER_Y: 740,
}
const RED = 0xff4444
const GREEN = 0x44ff44
const BLUE = 0x4444ff

// The fired canvas layout (320×640) letterboxes the logical 600×800 board:
// scale 0.5333 with a 106.67 top offset. Gesture points are mapped through
// the same toGamePoint geometry the board aims with.
const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 640
const SCALE = Math.min(
  CANVAS_WIDTH / CONSTANTS.GAME_WIDTH,
  CANVAS_HEIGHT / CONSTANTS.GAME_HEIGHT
)
const OFFSET_Y = (CANVAS_HEIGHT - CONSTANTS.GAME_HEIGHT * SCALE) / 2
const screenX = (logicalX: number) => logicalX * SCALE
const screenY = (logicalY: number) => OFFSET_Y + logicalY * SCALE
const CURRENT_BUBBLE = { x: 300, y: 710 }

let rafQueue: Array<{ id: number; cb: (time: number) => void }> = []
let nextRafId = 1
let frameTime = 1_000_000

const fireFrame = (time: number) => {
  const entry = rafQueue.shift()
  if (!entry) {
    throw new Error('no frame scheduled')
  }
  act(() => {
    entry.cb(time)
  })
}

/** Fire up to `frames` scheduled frames, 50 ms apart, stopping when the
 *  run finishes and the loop stops scheduling. */
const advance = (frames: number, stepMs = 50) => {
  for (let frame = 0; frame < frames; frame += 1) {
    if (rafQueue.length === 0) {
      return
    }
    frameTime += stepMs
    fireFrame(frameTime)
  }
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

const control = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root.findByProps({ accessibilityLabel: label })

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
  // jest-expo renders each Text twice (wrapper + host), so scope to Text.
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
        nativeEvent: {
          layout: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        },
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

const bubbles = (tree: TestRenderer.ReactTestRenderer) =>
  shapes(tree, 'Circle').filter(
    props => props.r === CONSTANTS.BUBBLE_RADIUS && props.style !== 'stroke'
  )

/** Grid bubbles only: the shooter's own current bubble sits at y≈710. */
const gridBubbles = (tree: TestRenderer.ReactTestRenderer) =>
  bubbles(tree).filter(props => Number(props.cy) < CURRENT_BUBBLE.y)

const guideDots = (tree: TestRenderer.ReactTestRenderer) =>
  shapes(tree, 'Circle').filter(props => props.r === 2)

const boardSummary = (tree: TestRenderer.ReactTestRenderer): string =>
  String(
    tree.root.findByProps({ testID: 'bubble-board' }).props.accessibilityLabel
  )

const panHandlers = (
  tree: TestRenderer.ReactTestRenderer
): Record<string, (event: unknown, success?: boolean) => void> =>
  tree.root.findByType(GestureDetector).props.gesture.handlers

const beginDragAt = (
  tree: TestRenderer.ReactTestRenderer,
  x: number,
  y: number
) => {
  act(() => {
    panHandlers(tree).onBegin({ x, y })
  })
}

const dragTo = (
  tree: TestRenderer.ReactTestRenderer,
  logicalX: number,
  logicalY: number
) => {
  act(() => {
    panHandlers(tree).onUpdate({
      x: screenX(logicalX),
      y: screenY(logicalY),
    })
  })
}

/** Release at a logical board point; the board maps it through the same
 *  letterbox as the drag, so out-of-board releases can be exercised too. */
const endDrag = (
  tree: TestRenderer.ReactTestRenderer,
  logicalX: number,
  logicalY: number,
  success = true
) => {
  act(() => {
    panHandlers(tree).onFinalize(
      {
        x: screenX(logicalX),
        y: screenY(logicalY),
        translationX: 0,
        translationY: -100,
      },
      success
    )
  })
}

/** Start the run and settle the mounting/start frames. */
const startRun = async (tree: TestRenderer.ReactTestRenderer) => {
  fireLayouts(tree)
  fireFrame(frameTime)
  await press(tree, 'Start game')
  frameTime += 16
  fireFrame(frameTime)
}

const liveState = (game: BubbleShooterGame): BubbleShooterState =>
  (game as unknown as { state: BubbleShooterState }).state

const bubble = (row: number, col: number, color: number): Bubble => ({
  color,
  x: getBubbleX(col, row, 0, CONSTANTS),
  y: getBubbleY(row, CONSTANTS),
})

const emptyGrid = (): Array<Array<Bubble | null>> =>
  Array.from({ length: CONSTANTS.GRID_HEIGHT }, (_, row) =>
    Array.from({ length: getRowColumnCount(row, 0, CONSTANTS) }, () => null)
  )

/** Crafted visible state, then one frame syncs the board scene. */
const setState = (
  game: BubbleShooterGame,
  overrides: Partial<BubbleShooterState>
) => {
  Object.assign(liveState(game), overrides, { needsRedraw: true })
}

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-bubble',
  name: 'Cluster Burst',
  description: 'Pop a cluster',
  icon: '🫧',
  rarity: AchievementRarity.RARE,
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
  mockAnnounce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined)
  rafQueue = []
  nextRafId = 1
  frameTime = 1_000_000
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    return id
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => {
    rafQueue = rafQueue.filter(entry => entry.id !== id)
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

describe('Bubble Shooter pilot — board', () => {
  test('renders the idle hex board with disabled aim/shoot controls and a full board summary', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    fireLayouts(tree)

    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(testText(tree, 'bubble-shots')).toBe('Shots 0')
    expect(testText(tree, 'bubble-bubbles')).toBe('Bubbles 0')
    expect(testText(tree, 'bubble-colors')).toBe('Now — · Next —')
    expect(testText(tree, 'bubble-status')).toBe('Waiting to start')
    expect(tree.root.findByProps({ testID: 'bubble-scroll' })).toBeTruthy()

    // The empty idle grid draws no bubbles at all; the aim guide is gone
    // too until a run starts.
    expect(bubbles(tree)).toHaveLength(0)
    expect(guideDots(tree)).toHaveLength(0)

    const summary = boardSummary(tree)
    expect(summary).toContain('Bubble Shooter board, 14 columns by 20 rows.')
    expect(summary).toContain('Waiting to start.')
    expect(summary).toContain('0 bubbles remaining.')
    expect(summary).toContain('Aim straight up.')

    for (const label of ['Aim left', 'Aim right', 'Shoot']) {
      const button = control(tree, label)
      expect(button.props.disabled).toBe(true)
      expect(button.props.accessibilityState?.disabled).toBe(true)
    }
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })

  test('drag aiming maps through the letterbox and clamps to the upward arc', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]

    // A drag inside the board aims the live model through the letterbox.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 560, 300)
    expect(game.getState().aimAngle).toBeCloseTo(
      Math.atan2(300 - CURRENT_BUBBLE.y, 560 - CURRENT_BUBBLE.x),
      10
    )

    // A touch-down outside the letterboxed board is not an aim gesture.
    const aimed = game.getState().aimAngle
    beginDragAt(tree, screenX(300), 10)
    dragTo(tree, 300, 300)
    expect(game.getState().aimAngle).toBe(aimed)
    endDrag(tree, 300, 300, false)

    // Drag nearly horizontal to the right: the model clamps to -0.1π.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 560, 700)
    expect(game.getState().aimAngle).toBeCloseTo(-Math.PI * 0.1, 10)

    // Drag far left: the model clamps to -0.9π.
    dragTo(tree, 40, 660)
    expect(game.getState().aimAngle).toBeCloseTo(-Math.PI * 0.9, 10)
    endDrag(tree, 40, 660, false)

    frameTime += 16
    fireFrame(frameTime)
    expect(testText(tree, 'bubble-status')).toBe('Aim 72° left of straight up')
    expect(boardSummary(tree)).toContain('Aim 72° left of straight up.')
    // The aim guide follows the model angle.
    expect(guideDots(tree)).toHaveLength(11)

    // Straight up is representable, and the cancelled release never shoots.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    expect(game.getState().aimAngle).toBeCloseTo(-Math.PI / 2, 10)
    endDrag(tree, 300, 300, false)
    frameTime += 16
    fireFrame(frameTime)
    expect(testText(tree, 'bubble-status')).toBe('Aim straight up')
    expect(game.getState().shotsFired).toBe(0)
  })

  test('a valid release shoots once; cancelled, duplicate and off-board gestures never shoot', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]
    setState(game, {
      grid: emptyGrid(),
      currentBubble: { ...CURRENT_BUBBLE, color: RED },
      nextBubble: { color: GREEN },
    })
    frameTime += 16
    fireFrame(frameTime)
    expect(bubbles(tree)).toHaveLength(1)

    // Begin outside the logical board: neither aim nor release acts.
    beginDragAt(tree, screenX(300), 10)
    dragTo(tree, 300, 300)
    endDrag(tree, 300, 300)
    expect(game.getState().shotsFired).toBe(0)
    expect(game.getState().projectile).toBeNull()

    // A cancelled pan commits nothing, even after a full aim drag.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 300, 300, false)
    expect(game.getState().shotsFired).toBe(0)
    expect(game.getState().projectile).toBeNull()

    // One valid drag-release fires exactly one projectile.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 300, 300)
    expect(game.getState().shotsFired).toBe(1)
    expect(game.getState().projectile).not.toBeNull()
    // A duplicate final callback of the same gesture must not shoot twice.
    endDrag(tree, 300, 300)
    expect(game.getState().shotsFired).toBe(1)

    frameTime += 16
    fireFrame(frameTime)
    expect(testText(tree, 'bubble-shots')).toBe('Shots 1')
    // The adopted next bubble becomes current while the last projectile
    // flies; the queue color is model-generated.
    expect(testText(tree, 'bubble-colors')).toContain('Now green')
    expect(control(tree, 'Shoot').props.disabled).toBe(true)
  })

  test('an in-board start released outside the board never fires the previous aim', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]
    setState(game, {
      grid: emptyGrid(),
      currentBubble: { ...CURRENT_BUBBLE, color: RED },
      nextBubble: { color: GREEN },
    })
    frameTime += 16
    fireFrame(frameTime)

    // The pan begins and aims on the board, then leaves through the top
    // letterbox. Recognition can still succeed there; the release is not on
    // the board, so it must not fire the last aim.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 300, -1)
    expect(game.getState().shotsFired).toBe(0)
    expect(game.getState().projectile).toBeNull()

    // Releasing beyond the right edge of the view is likewise no shot.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 620, 300)
    expect(game.getState().shotsFired).toBe(0)
    expect(game.getState().projectile).toBeNull()

    // A finalize event without usable coordinates cannot prove the finger
    // ended on the board, so it is not a shot either.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    act(() => {
      panHandlers(tree).onFinalize(
        { translationX: 0, translationY: -100 },
        true
      )
    })
    expect(game.getState().shotsFired).toBe(0)
    expect(game.getState().projectile).toBeNull()

    // An actual on-board release still fires the aimed shot.
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 300, 300)
    expect(game.getState().shotsFired).toBe(1)
    expect(game.getState().projectile).not.toBeNull()
  })

  test('a stale gesture from a reset run never fires into the replacement run', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]

    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    await press(tree, 'Reset game')
    const runId = game.getRunId()
    endDrag(tree, 300, 300)
    expect(game.getRunId()).toBe(runId)
    expect(game.getState().shotsFired).toBe(0)
    expect(game.getState().projectile).toBeNull()
  })

  test('the shared frame loop advances model physics in seconds, not milliseconds', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]
    setState(game, {
      grid: emptyGrid(),
      currentBubble: { ...CURRENT_BUBBLE, color: RED },
      nextBubble: { color: GREEN },
    })
    frameTime += 16
    fireFrame(frameTime)

    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 300, 300)
    const fired = game.getState().projectile
    expect(fired).not.toBeNull()
    const y0 = fired?.y ?? Number.NaN
    expect(y0).toBe(CURRENT_BUBBLE.y)

    // 720 px/s for a 16 ms frame is 11.52 px. A millisecond feed would
    // clamp to the 50 ms step and teleport 36 px instead.
    frameTime += 16
    fireFrame(frameTime)
    const y1 = game.getState().projectile?.y ?? Number.NaN
    expect(y0 - y1).toBeCloseTo(11.52, 5)

    frameTime += 16
    fireFrame(frameTime)
    const y2 = game.getState().projectile?.y ?? Number.NaN
    expect(y1 - y2).toBeCloseTo(11.52, 5)
  })

  test('a real match attaches, eliminates and scores through the model', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]

    const grid = emptyGrid()
    grid[0][5] = bubble(0, 5, RED)
    grid[0][6] = bubble(0, 6, RED)
    grid[0][7] = bubble(0, 7, RED)
    grid[0][8] = bubble(0, 8, GREEN)
    grid[0][9] = bubble(0, 9, GREEN)
    setState(game, {
      grid,
      bubblesRemaining: 5,
      currentBubble: { ...CURRENT_BUBBLE, color: RED },
      nextBubble: { color: GREEN },
    })
    frameTime += 16
    fireFrame(frameTime)
    expect(gridBubbles(tree)).toHaveLength(5)

    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 300, 300)
    advance(30)

    const state = game.getState()
    expect(state.projectile).toBeNull()
    expect(state.score).toBe(40)
    expect(state.bubblesPopped).toBe(4)
    expect(state.successfulShots).toBe(1)
    expect(state.largestCombo).toBe(4)
    expect(state.bubblesRemaining).toBe(2)
    // Only the two green bubbles survive.
    expect(state.grid[0][5]).toBeNull()
    expect(state.grid[0][6]).toBeNull()
    expect(state.grid[0][7]).toBeNull()
    expect(state.grid[0][8]?.color).toBe(GREEN)
    expect(state.grid[0][9]?.color).toBe(GREEN)
    // Board-local HUD reflects the same model state on the next frames.
    advance(1)
    expect(testText(tree, 'bubble-shots')).toBe('Shots 1')
    expect(testText(tree, 'bubble-bubbles')).toBe('Bubbles 2')
    expect(renderedText(tree)).toContain('Score 40')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('pause sleeps the loop and disables aiming and shooting until resume', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]
    expect(control(tree, 'Aim left').props.disabled).toBe(false)
    expect(control(tree, 'Shoot').props.disabled).toBe(false)

    await press(tree, 'Pause game')
    frameTime += 16
    fireFrame(frameTime)
    expect(game.getState().isPaused).toBe(true)
    expect(testText(tree, 'bubble-status')).toBe('Paused')
    expect(control(tree, 'Aim left').props.disabled).toBe(true)
    expect(control(tree, 'Shoot').props.disabled).toBe(true)
    // The loop sleeps: no frame is queued while paused.
    expect(rafQueue).toHaveLength(0)

    // A stale press is refused by the model's own pause guard.
    await press(tree, 'Shoot')
    expect(game.getState().projectile).toBeNull()

    await press(tree, 'Resume game')
    frameTime += 16
    fireFrame(frameTime)
    expect(game.getState().isPaused).toBe(false)
    expect(control(tree, 'Shoot').props.disabled).toBe(false)
    expect(testText(tree, 'bubble-status')).toBe('Aim straight up')
  })

  test('screen-reader aim controls clamp the model angle and announce it; Shoot fires once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]

    await press(tree, 'Aim left')
    frameTime += 16
    fireFrame(frameTime)
    expect(game.getState().aimAngle).toBeCloseTo(-Math.PI / 2 - 0.06, 10)
    expect(testText(tree, 'bubble-status')).toBe('Aim 3° left of straight up')
    expect(mockAnnounce).toHaveBeenCalledWith('Aim 3° left of straight up.')

    for (let step = 0; step < 30; step += 1) {
      await press(tree, 'Aim left')
    }
    expect(game.getState().aimAngle).toBeCloseTo(-Math.PI * 0.9, 10)

    for (let step = 0; step < 60; step += 1) {
      await press(tree, 'Aim right')
    }
    expect(game.getState().aimAngle).toBeCloseTo(-Math.PI * 0.1, 10)

    await press(tree, 'Shoot')
    expect(game.getState().shotsFired).toBe(1)
    expect(game.getState().projectile).not.toBeNull()
    frameTime += 16
    fireFrame(frameTime)
    expect(control(tree, 'Shoot').props.disabled).toBe(true)
    expect(control(tree, 'Aim right').props.disabled).toBe(true)
    // The model refuses a second shot while the first is in flight.
    await press(tree, 'Shoot')
    expect(game.getState().shotsFired).toBe(1)
    expect(testText(tree, 'bubble-status')).toBe('Bubble in flight')
  })

  test('fits the board to the available height and scrolls when space is tight', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    fireLayouts(tree)
    const scroll = tree.root.findByType(ScrollView)
    const setViewport = (width: number, height: number) => {
      act(() => {
        scroll.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width, height } },
        })
      })
    }
    const boardWidth = () =>
      StyleSheet.flatten(
        tree.root.findByProps({ testID: 'bubble-board' }).props.style
      ).width as number

    setViewport(390, 800)
    expect(boardWidth()).toBe(358)

    // A short viewport shrinks the 4:3-tall board rather than clipping it.
    setViewport(390, 520)
    expect(boardWidth()).toBe(210)

    // Below the static reserve the board keeps a usable floor and the
    // ScrollView carries the overflow (for example enlarged text).
    setViewport(390, 400)
    expect(boardWidth()).toBe(150)
  })
})

describe('Bubble Shooter pilot — run result', () => {
  test('a danger-zone breach finishes the run with one score POST and a clean replay', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]

    // A bubble already inside the danger zone (row 18 is below the
    // shooter-relative threshold): the next attachment ends the run.
    const grid = emptyGrid()
    grid[18][6] = bubble(18, 6, GREEN)
    setState(game, {
      grid,
      bubblesRemaining: 1,
      currentBubble: { ...CURRENT_BUBBLE, color: BLUE },
      nextBubble: { color: RED },
    })
    frameTime += 16
    fireFrame(frameTime)

    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [ACHIEVEMENT],
    })
    beginDragAt(tree, screenX(300), screenY(700))
    dragTo(tree, 300, 300)
    endDrag(tree, 300, 300)
    advance(20)
    await drain(50)

    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.BUBBLE_SHOOTER,
        platform: 'ios',
        gameData: expect.objectContaining({
          bubblesPopped: expect.any(Number),
          shotsFired: 1,
          largestCombo: expect.any(Number),
          successfulShots: expect.any(Number),
        }),
      })
    )
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(testText(tree, 'bubble-status')).toBe('Run complete')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(tree.root.findByProps({ testID: 'final-score' })).toBeTruthy()
    expect(tree.root.findByProps({ testID: 'reward-banner' })).toBeTruthy()
    expect(control(tree, 'Shoot').props.disabled).toBe(true)

    // Play again clears the finished run and never re-posts.
    await press(tree, 'Play again')
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().shotsFired).toBe(0)
    expect(game.getState().score).toBe(0)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('unmount destroys the game and stops its timer', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.BUBBLE_SHOOTER} />)
    await startRun(tree)
    const game = createdGames[0]
    const destroy = jest.spyOn(game, 'destroy')

    await act(async () => {
      tree.unmount()
    })

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(game.getTimerStatus().isRunning).toBe(false)
  })
})
