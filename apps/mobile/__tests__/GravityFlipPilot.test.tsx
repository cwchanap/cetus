import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import { GravityFlipGame } from '@cetus/games/gravity-flip/GravityFlipGame'
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

const createdGames: GravityFlipGame[] = []
const originalEntry = NATIVE_GAMES[GameID.GRAVITY_FLIP]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Gravity Flip registry port missing')
  }
  NATIVE_GAMES[GameID.GRAVITY_FLIP] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new GravityFlipGame({
          rng: () => 0,
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
  NATIVE_GAMES[GameID.GRAVITY_FLIP] = originalEntry
})

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-flip',
  name: 'Ceiling Runner',
  description: 'Survive upside down',
  icon: '🙃',
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

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 800,
  height = 320
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

const shapes = (
  tree: TestRenderer.ReactTestRenderer,
  name: string
): Array<Record<string, unknown>> =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => node.props.testID === `skia-${name}`)
    .map(node => node.props)

const pathsWith = (
  tree: TestRenderer.ReactTestRenderer,
  color: string
): string[] =>
  shapes(tree, 'Path')
    .filter(props => props.color === color)
    .map(props => String(props.path))

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
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    return id
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => {
    rafQueue = rafQueue.filter(entry => entry.id !== id)
  })
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

const SPIKE_FILL = '#f43f5e'
const STAR_FILL = '#facc15'
const PLAYER_FILL = '#22d3ee'

describe('Gravity Flip pilot — board', () => {
  test('renders the corridor, floor-parked player and HUD badges while idle', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)

    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(testText(tree, 'gf-gravity')).toBe('Gravity FLOOR ↓')
    expect(testText(tree, 'gf-distance')).toBe('Distance 0')
    expect(testText(tree, 'gf-stars')).toBe('Stars 0')
    expect(testText(tree, 'gf-flips')).toBe('Flips 0')
    expect(testText(tree, 'gf-speed')).toBe('Speed 220')

    expect(pathsWith(tree, PLAYER_FILL)).toEqual([
      'M150 256L164 270L150 284L136 270L150 256',
    ])
    expect(pathsWith(tree, SPIKE_FILL)).toHaveLength(0)

    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Pause game' })
    ).toHaveLength(0)
    const flip = tree.root.findByProps({ accessibilityLabel: 'Flip gravity' })
    expect(flip.props.disabled).toBe(true)
  })

  test('start spawns the floor spike plus ceiling star and frames move the world', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const flip = tree.root.findByProps({ accessibilityLabel: 'Flip gravity' })
    expect(flip.props.disabled).toBe(false)

    fireFrame(100)
    expect(pathsWith(tree, SPIKE_FILL)).toEqual([
      'M880 284L906 250L932 284L880 284',
    ])
    expect(pathsWith(tree, STAR_FILL)[0]?.startsWith('M906 40')).toBe(true)

    fireFrame(200)
    expect(game.getState().distance).toBeGreaterThan(0)
    const moved = pathsWith(tree, SPIKE_FILL)[0]
    expect(moved.startsWith('M880')).toBe(false)
    expect(testText(tree, 'gf-distance')).toBe('Distance 22')
  })

  test('the Flip gravity button calls the live model and the player rides the ceiling', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)
    const game = createdGames[0]
    const flipGravity = jest.spyOn(game, 'flipGravity')

    await press(tree, 'Start game')
    fireFrame(100)
    await press(tree, 'Flip gravity')

    expect(flipGravity).toHaveBeenCalledTimes(1)
    expect(game.getState().gravity).toBe('up')
    expect(testText(tree, 'gf-gravity')).toBe('Gravity CEILING ↑')
    expect(testText(tree, 'gf-flips')).toBe('Flips 1')

    for (let i = 0; i < 6; i++) {
      fireFrame(200 + i * 100)
    }
    expect(game.getState().player.y).toBe(50)
    expect(pathsWith(tree, PLAYER_FILL)).toEqual([
      'M150 36L164 50L150 64L136 50L150 36',
    ])
  })

  test('riding the ceiling collects the challenge star into the HUD and score', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    await press(tree, 'Flip gravity')
    for (let i = 0; i < 40; i++) {
      fireFrame(200 + i * 100)
    }

    expect(game.getState().starsCollected).toBeGreaterThanOrEqual(1)
    expect(testText(tree, 'gf-stars')).not.toBe('Stars 0')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a floor-spike collision ends the run, posts once and labels Collision', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    for (let i = 0; i < 40; i++) {
      fireFrame(100 + i * 100)
    }
    await drain()

    const stats = game.getGameStats()
    expect(stats.outcome).toBe('collision')
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.GRAVITY_FLIP,
        platform: 'ios',
        gameData: expect.objectContaining({
          survivedFullRun: false,
        }),
      })
    )
    expect(testText(tree, 'result-outcome')).toBe('Collision')
    expect(tree.root.findByProps({ testID: 'final-score' })).toBeTruthy()
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })

  test('a mid-run reset clears board-local hazards on the next frame', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    fireFrame(200)
    expect(pathsWith(tree, SPIKE_FILL).length).toBeGreaterThan(0)
    expect(game.getState().distance).toBeGreaterThan(0)

    await press(tree, 'Reset game')
    fireFrame(300)

    expect(pathsWith(tree, SPIKE_FILL)).toHaveLength(0)
    expect(pathsWith(tree, STAR_FILL)).toHaveLength(0)
    expect(game.getState().hazards).toHaveLength(0)
    expect(game.getState().distance).toBe(0)
    expect(testText(tree, 'gf-distance')).toBe('Distance 0')
    expect(testText(tree, 'game-time')).toBe('1:00')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('60 normal-timestep frames notify the chrome only on real score ticks, never per frame', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    const rendersAfterStart = formatTimeSpy.mock.calls.length

    let lastScore = game.getState().score
    let scoreTicks = 0
    for (let i = 0; i < 60; i++) {
      fireFrame(200 + i * (1000 / 60))
      const score = game.getState().score
      if (score !== lastScore) {
        scoreTicks += 1
        lastScore = score
      }
    }

    const distance = game.getState().distance
    expect(distance).toBeGreaterThan(150)
    expect(testText(tree, 'gf-distance')).toBe(
      `Distance ${Math.floor(distance)}`
    )
    expect(scoreTicks).toBeGreaterThan(0)
    expect(formatTimeSpy.mock.calls.length - rendersAfterStart).toBe(scoreTicks)
  })

  test('backgrounding never fakes a pause and the run resumes stepping on return', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    fireFrame(200)
    const distance = game.getState().distance

    emitAppState('background')
    fireFrame(300)
    expect(game.getState().isPaused).toBe(false)
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().distance).toBe(distance)

    emitAppState('active')
    fireFrame(400)
    fireFrame(500)
    expect(game.getState().distance).toBeGreaterThan(distance)
  })
})

describe('Gravity Flip pilot — Stage-1 save contract', () => {
  test('a provisional pending result becomes server-confirmed saved', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)

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
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)

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
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(tree.root.findByProps({ testID: 'reward-banner' })).toBeTruthy()
    expect(renderedText(tree).match(/Ceiling Runner/g)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Achievement unlocked')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })
})

describe('Gravity Flip pilot — lifecycle', () => {
  test('a replay clears the finished run back to an idle corridor', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    fireLayout(tree)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    expect(testText(tree, 'gf-distance')).toBe('Distance 0')
    expect(testText(tree, 'gf-gravity')).toBe('Gravity FLOOR ↓')
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Start game' })
    ).toHaveLength(0)

    fireFrame(100)
    fireFrame(200)
    expect(pathsWith(tree, SPIKE_FILL).length).toBeGreaterThan(0)
    expect(createdGames[0].getState().distance).toBeGreaterThan(0)
  })

  test('unmount destroys the game, the loop and the listeners', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GRAVITY_FLIP} />)
    const destroy = jest.spyOn(createdGames[0], 'destroy')

    await unmount(tree)
    expect(destroy).toHaveBeenCalled()
    expect(rafQueue).toHaveLength(0)
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
      <NativeGameHost gameId={GameID.GRAVITY_FLIP} settledUserId="user-a" />
    )

    await press(treeA, 'Start game')
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()
    expect(renderedText(treeA)).toContain('Saving score…')

    await unmount(treeA)
    const treeB = await render(
      <NativeGameHost gameId={GameID.GRAVITY_FLIP} settledUserId="user-b" />
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
    expect(renderedText(treeB)).not.toContain('Ceiling Runner')
    expect(renderedText(treeB)).not.toContain('Score saved')
    expect(
      treeB.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })
})
