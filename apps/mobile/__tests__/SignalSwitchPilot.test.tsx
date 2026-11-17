import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import { SignalSwitchGame } from '@cetus/games/signal-switch/SignalSwitchGame'
import {
  createSignalSwitchConfig,
  type SignalSwitchConfig,
} from '@cetus/games/signal-switch/types'
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

let modelOverrides: Partial<SignalSwitchConfig> = {}

const createdGames: SignalSwitchGame[] = []
const originalEntry = NATIVE_GAMES[GameID.SIGNAL_SWITCH]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Signal Switch registry port missing')
  }
  NATIVE_GAMES[GameID.SIGNAL_SWITCH] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new SignalSwitchGame({
          ...createSignalSwitchConfig({
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
  NATIVE_GAMES[GameID.SIGNAL_SWITCH] = originalEntry
})

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-signal',
  name: 'Signal Master',
  description: 'Survive a full shift',
  icon: '🚦',
  rarity: AchievementRarity.RARE,
}

let rafQueue: Array<{ id: number; cb: (time: number) => void }> = []
let nextRafId = 1
const appStateHandlers = new Set<(state: AppStateStatus) => void>()

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

const gate = (
  tree: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance =>
  tree.root.findByProps({ accessibilityLabel: label })

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 800,
  height = 360
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

const CYAN_GATE = (index: number) => `Lane ${index + 1}: ● Cyan`
const MAGENTA_GATE = (index: number) => `Lane ${index + 1}: ▲ Magenta`
const AMBER_GATE = (index: number) => `Lane ${index + 1}: ◆ Amber`
const LOCKED_GATE = (index: number) => `Lane ${index + 1}: locked`

describe('Signal Switch pilot — board', () => {
  test('renders the four lanes, HUD badges and locked gates while idle', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    fireLayout(tree)

    expect(testText(tree, 'game-time')).toBe('1:30')
    expect(testText(tree, 'ss-integrity')).toBe('Integrity 3')
    expect(testText(tree, 'ss-combo')).toBe('Combo 0')
    expect(testText(tree, 'ss-passes')).toBe('Safe passes 0')
    expect(testText(tree, 'ss-lanes')).toBe('Lanes 2 / 4')
    expect(testText(tree, 'ss-speed')).toBe('Speed 140')

    expect(gate(tree, CYAN_GATE(0)).props.disabled).toBe(true)
    expect(gate(tree, CYAN_GATE(1)).props.disabled).toBe(true)
    expect(gate(tree, LOCKED_GATE(2)).props.disabled).toBe(true)
    expect(gate(tree, LOCKED_GATE(3)).props.disabled).toBe(true)

    expect(shapes(tree, 'Rect').length).toBeGreaterThan(0)
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Pause game' })
    ).toHaveLength(0)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })

  test('each gate button cycles its lane through the signal order', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    expect(gate(tree, CYAN_GATE(0)).props.disabled).toBe(false)

    await press(tree, CYAN_GATE(0))
    expect(game.getState().gateSignals[0]).toBe('magenta')
    fireFrame(200)
    expect(gate(tree, MAGENTA_GATE(0)).props.disabled).toBe(false)

    await press(tree, MAGENTA_GATE(0))
    expect(game.getState().gateSignals[0]).toBe('amber')
    fireFrame(300)
    await press(tree, AMBER_GATE(0))
    expect(game.getState().gateSignals[0]).toBe('cyan')
    fireFrame(400)
    expect(gate(tree, CYAN_GATE(0))).toBeTruthy()

    expect(game.getState().gateSignals[1]).toBe('cyan')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('locked lanes stay disabled until the model unlocks them on schedule', async () => {
    modelOverrides = { laneUnlockSeconds: [0, 0, 0.3, 0.6] }
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    fireLayout(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    expect(gate(tree, LOCKED_GATE(2)).props.disabled).toBe(true)
    expect(gate(tree, LOCKED_GATE(3)).props.disabled).toBe(true)
    expect(game.cycleGate(2)).toBe(false)
    expect(game.cycleGate(3)).toBe(false)

    fireFrame(200)
    fireFrame(300)
    fireFrame(400)
    expect(testText(tree, 'ss-lanes')).toBe('Lanes 3 / 4')
    expect(gate(tree, CYAN_GATE(2)).props.disabled).toBe(false)
    expect(gate(tree, LOCKED_GATE(3)).props.disabled).toBe(true)

    await press(tree, CYAN_GATE(2))
    expect(game.getState().gateSignals[2]).toBe('magenta')

    fireFrame(500)
    fireFrame(600)
    fireFrame(700)
    expect(testText(tree, 'ss-lanes')).toBe('Lanes 4 / 4')
    expect(gate(tree, CYAN_GATE(3)).props.disabled).toBe(false)
  })

  test('a huge frame gap still steps physics by only the 0.1-second cap', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    expect(game.getState().drones[0]?.x).toBe(64)

    fireFrame(100 + 60_000)
    const moved = game.getState().drones[0].x - 64
    expect(moved).toBeGreaterThan(14)
    expect(moved).toBeLessThan(14.2)
  })

  test('matching the gate signal lets the drone pass for a combo and score', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    await press(tree, CYAN_GATE(0))
    expect(game.getState().gateSignals[0]).toBe('magenta')

    for (let i = 0; i < 60; i++) {
      fireFrame(200 + i * 100)
    }

    expect(game.getState().safePasses).toBe(1)
    expect(game.getState().crashes).toBe(0)
    expect(game.getState().combo).toBe(1)
    expect(game.getState().score).toBe(100)
    expect(testText(tree, 'ss-passes')).toBe('Safe passes 1')
    expect(testText(tree, 'ss-combo')).toBe('Combo 1')
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a mismatched gate drains integrity to zero and ends the shift as Systems failed', async () => {
    modelOverrides = { startingIntegrity: 1 }
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    for (let i = 0; i < 60 && !game.getState().isGameOver; i++) {
      fireFrame(100 + i * 100)
    }
    await drain()

    const stats = game.getGameStats()
    expect(stats.outcome).toBe('systems-failed')
    expect(stats.crashes).toBe(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.SIGNAL_SWITCH,
        platform: 'ios',
        gameData: expect.objectContaining({
          survivedFullRun: false,
          crashes: 1,
          integrityRemaining: 0,
        }),
      })
    )
    expect(testText(tree, 'result-outcome')).toBe('Systems failed')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })

  test('60 normal frames notify the chrome only when a HUD value really changes', async () => {
    modelOverrides = {
      gateX: 100,
      droneSpawnX: 90,
      initialSpawnInterval: 0.25,
      finalSpawnInterval: 0.25,
      startingIntegrity: 99,
    }
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    const rendersAfterStart = formatTimeSpy.mock.calls.length

    let lastIntegrity = game.getState().integrity
    let hudChanges = 0
    for (let i = 0; i < 60; i++) {
      fireFrame(200 + i * (1000 / 60))
      const integrity = game.getState().integrity
      if (integrity !== lastIntegrity) {
        hudChanges += 1
        lastIntegrity = integrity
      }
    }

    expect(hudChanges).toBeGreaterThan(0)
    expect(game.getState().crashes).toBe(hudChanges)
    expect(formatTimeSpy.mock.calls.length - rendersAfterStart).toBe(hudChanges)
  })

  test('backgrounding never fakes a pause and the sim resumes stepping on return', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(100)
    fireFrame(200)
    const x = game.getState().drones[0].x

    emitAppState('background')
    // RN suspends RAF while suspended — no frames arrive, but the shift is
    // never fake-paused (NativeGameHost only pauses pausable games).
    expect(game.getState().isPaused).toBe(false)
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().drones[0].x).toBe(x)

    emitAppState('active')
    fireFrame(400)
    fireFrame(500)
    expect(game.getState().drones[0].x).toBeGreaterThan(x)
  })
})

describe('Signal Switch pilot — Stage-1 save contract', () => {
  test('a provisional pending result becomes server-confirmed saved', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)

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
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)

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
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(tree.root.findByProps({ testID: 'reward-banner' })).toBeTruthy()
    expect(renderedText(tree).match(/Signal Master/g)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Achievement unlocked')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })
})

describe('Signal Switch pilot — lifecycle', () => {
  test('a replay resets the drones, gates and lane locks for a fresh shift', async () => {
    modelOverrides = { startingIntegrity: 1 }
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    for (let i = 0; i < 60 && !game.getState().isGameOver; i++) {
      fireFrame(100 + i * 100)
    }
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    const state = game.getState()
    expect(state.isActive).toBe(true)
    expect(state.isGameOver).toBe(false)
    expect(state.integrity).toBe(1)
    expect(state.gateSignals).toEqual(['cyan', 'cyan', 'cyan', 'cyan'])
    expect(state.activeLaneCount).toBe(2)
    expect(state.drones).toHaveLength(1)
    expect(state.drones[0]).toMatchObject({ laneIndex: 0, signal: 'magenta' })

    fireFrame(10_000)
    expect(gate(tree, CYAN_GATE(0)).props.disabled).toBe(false)
    expect(gate(tree, LOCKED_GATE(2)).props.disabled).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a backgrounded run still expires on the wall clock and ends one Survived result', async () => {
    jest.useFakeTimers({
      doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
    try {
      let tree: TestRenderer.ReactTestRenderer | undefined
      await act(async () => {
        tree = TestRenderer.create(
          <NativeGameHost gameId={GameID.SIGNAL_SWITCH} />
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
      const x = game.getState().drones[0].x
      expect(x).toBeGreaterThan(64)

      emitAppState('background')
      expect(game.getState().isPaused).toBe(false)

      await act(async () => {
        jest.advanceTimersByTime(91_000)
      })
      await act(async () => {
        for (let i = 0; i < 10; i++) {
          await Promise.resolve()
        }
      })

      expect(game.getState().isGameOver).toBe(true)
      expect(game.getGameStats().outcome).toBe('survived')
      expect(game.getState().drones[0].x).toBe(x)
      expect(game.getState().activeLaneCount).toBe(2)
      expect(submitScore).toHaveBeenCalledTimes(1)
      expect(testText(tree, 'result-outcome')).toBe('Survived')
      expect(testText(tree, 'result-save-status')).toBe('Score saved')
    } finally {
      jest.useRealTimers()
    }
  })

  test('unmount destroys the game, the loop and the listeners', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SIGNAL_SWITCH} />)
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
      <NativeGameHost gameId={GameID.SIGNAL_SWITCH} settledUserId="user-a" />
    )

    await press(treeA, 'Start game')
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()
    expect(renderedText(treeA)).toContain('Saving score…')

    await unmount(treeA)
    const treeB = await render(
      <NativeGameHost gameId={GameID.SIGNAL_SWITCH} settledUserId="user-b" />
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
    expect(renderedText(treeB)).not.toContain('Signal Master')
    expect(renderedText(treeB)).not.toContain('Score saved')
    expect(
      treeB.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })
})
