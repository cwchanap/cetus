import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import {
  AccessibilityInfo,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  type AppStateStatus,
} from 'react-native'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import { AchievementRarity } from '@cetus/shared/achievements'
import { RhythmReactorGame } from '@cetus/games/rhythm-reactor/RhythmReactorGame'
import { RHYTHM_REACTOR_RULES } from '@cetus/games/rhythm-reactor/types'

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

type MockAudioStatus = {
  currentTime: number
  playing: boolean
  isLoaded: boolean
  error: string | null
  duration: number
  didJustFinish: boolean
}

class MockAudioPlayer {
  isLoaded = false
  playing = false
  paused = true
  currentTime = 0
  error: string | null = null
  private listeners = new Set<(status: MockAudioStatus) => void>()

  play = jest.fn(() => {
    this.playing = true
    this.paused = false
    this.emit()
  })

  pause = jest.fn(() => {
    this.playing = false
    this.paused = true
    this.emit()
  })

  seekTo = jest.fn(async (seconds: number) => {
    this.currentTime = seconds
    this.emit()
  })

  remove = jest.fn()

  addListener = (
    _event: string,
    listener: (status: MockAudioStatus) => void
  ) => {
    this.listeners.add(listener)
    return { remove: () => this.listeners.delete(listener) }
  }

  emit(overrides: Partial<MockAudioStatus> = {}) {
    const status: MockAudioStatus = {
      currentTime: this.currentTime,
      playing: this.playing,
      isLoaded: this.isLoaded,
      error: this.error,
      duration: 60,
      didJustFinish: false,
      ...overrides,
    }
    for (const listener of [...this.listeners]) {
      listener(status)
    }
  }

  finishLoading() {
    this.isLoaded = true
    this.emit()
  }

  failLoading(message = 'decode failed') {
    this.error = message
    this.emit()
  }
}

let mockAudioPlayer: MockAudioPlayer
const mockCreateAudioPlayer = jest.fn(
  (_source: unknown, _options?: unknown) => {
    return mockAudioPlayer
  }
)
const mockSetAudioModeAsync = jest.fn(async (_mode: unknown) => {})

jest.mock('expo-audio', () => ({
  createAudioPlayer: mockCreateAudioPlayer,
  setAudioModeAsync: mockSetAudioModeAsync,
}))

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'
import { createRhythmReactorRun } from '../src/games/rhythm-reactor/run'

const submitScore = jest.mocked(api.submitScore)

const createdGames: RhythmReactorGame[] = []
const originalEntry = NATIVE_GAMES[GameID.RHYTHM_REACTOR]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Rhythm Reactor registry port missing')
  }
  NATIVE_GAMES[GameID.RHYTHM_REACTOR] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new RhythmReactorGame({
          submitScore: deps.submitScore,
          platform: deps.platform,
          maxUpdateDelta: RHYTHM_REACTOR_RULES.duration,
        })
        createRhythmReactorRun(game)
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.RHYTHM_REACTOR] = originalEntry
})

let rafQueue: Array<{ id: number; cb: (time: number) => void }> = []
let nextRafId = 1
let frameTime = 1_000_000
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

const advanceFrames = (count: number, stepMs = 50) => {
  for (let frame = 0; frame < count; frame += 1) {
    if (rafQueue.length === 0) {
      return
    }
    frameTime += stepMs
    fireFrame(frameTime)
  }
}

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

const renderWithFakeTimers = async (element: React.ReactElement) => {
  jest.useFakeTimers({
    doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
  })
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve()
    }
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  trees.push(tree)
  return tree
}

const loadAudioWithFakeTimers = async () => {
  await act(async () => {
    mockAudioPlayer.finishLoading()
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve()
    }
  })
}

const startWithFakeTimers = async (tree: TestRenderer.ReactTestRenderer) => {
  await press(tree, 'Start game')
  await act(async () => {
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve()
    }
  })
}

const runFakeFrame = async (stepMs: number) => {
  await act(async () => {
    const entry = rafQueue.shift()
    if (!entry) {
      throw new Error('no frame scheduled')
    }
    frameTime += stepMs
    entry.cb(frameTime)
    jest.advanceTimersByTime(stepMs)
    await Promise.resolve()
  })
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
): string => {
  const node = tree.root.findAll(
    candidate => candidate.type === Text && candidate.props.testID === testID
  )[0]
  if (!node) {
    throw new Error(`no Text with testID ${testID}`)
  }
  return scalarText(node.props.children as React.ReactNode)
}

const control = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root.findByProps({ accessibilityLabel: label })

const fireLayouts = (tree: TestRenderer.ReactTestRenderer) => {
  const hosts = tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => typeof node.props.onLayout === 'function')
  expect(hosts.length).toBeGreaterThan(0)
  act(() => {
    for (const host of hosts) {
      host.props.onLayout({
        nativeEvent: {
          layout: { x: 0, y: 0, width: 390, height: 560 },
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

const noteRects = (tree: TestRenderer.ReactTestRenderer) =>
  shapes(tree, 'Rect').filter(props => props.color === '#f472b6')

const loadAudio = async () => {
  act(() => {
    mockAudioPlayer.finishLoading()
  })
  await drain()
}

const setAudioTime = (seconds: number) => {
  mockAudioPlayer.currentTime = seconds
  mockAudioPlayer.emit()
}

const ACHIEVEMENT = {
  id: 'ach-rhythm-late',
  name: 'Late Beat',
  description: 'Land a late save',
  icon: '🎵',
  rarity: AchievementRarity.RARE,
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
  mockAudioPlayer = new MockAudioPlayer()
  mockCreateAudioPlayer.mockClear()
  mockSetAudioModeAsync.mockClear()
  rafQueue = []
  nextRafId = 1
  frameTime = 1_000_000
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
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      appStateHandlers.add(listener as (state: AppStateStatus) => void)
      return {
        remove: () =>
          appStateHandlers.delete(listener as (state: AppStateStatus) => void),
      } as never
    })
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined)
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('Rhythm Reactor pilot — readiness and controls', () => {
  test('gates Start on audio readiness and exposes labelled lanes, calibration and idle feedback', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)

    // The bundled track is still loading: the shared chrome withholds every
    // action and the board says what it is waiting for.
    expect(tree.root.findByProps({ testID: 'host-binding' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Start game' })
    ).toHaveLength(0)
    expect(testText(tree, 'rr-audio-state')).toBe('Loading click track…')

    await loadAudio()

    expect(tree.root.findAllByProps({ testID: 'host-binding' })).toHaveLength(0)
    expect(control(tree, 'Start game')).toBeTruthy()
    expect(testText(tree, 'rr-audio-state')).toBe('Click track ready')
    expect(testText(tree, 'rr-status')).toBe('Waiting to start')
    expect(testText(tree, 'rr-feedback')).toBe(
      'Tap lanes as notes cross the hit line'
    )
    expect(testText(tree, 'rr-calibration')).toBe('Calibration +0 ms')
    expect(testText(tree, 'game-time')).toBe('1:00')

    for (let lane = 1; lane <= 4; lane += 1) {
      const button = control(tree, `Tap lane ${lane}`)
      expect(button.props.disabled).toBe(true)
      expect(button.props.accessibilityState?.disabled).toBe(true)
      expect(scalarText(button.props.children)).toContain(`Lane ${lane}`)
    }
    expect(control(tree, 'Calibration -10 ms').props.disabled).toBe(false)
    expect(control(tree, 'Calibration +10 ms').props.disabled).toBe(false)

    const summary = String(
      tree.root.findByProps({ testID: 'rhythm-board' }).props.accessibilityLabel
    )
    expect(summary).toContain('Rhythm Reactor board')
    expect(summary).toContain('4 lanes')
    expect(summary).toContain('Waiting to start')
    expect(summary).toContain('Calibration +0 milliseconds')

    // The wide four-lane board sits in a ScrollView so short or
    // text-enlarged viewports can still reach the controls.
    expect(tree.root.findByType(ScrollView)).toBeTruthy()
    const boardStyle = StyleSheet.flatten(
      tree.root.findByProps({ testID: 'rhythm-board' }).props.style
    )
    expect(boardStyle.aspectRatio).toBeCloseTo(800 / 420)
    expect(createdGames).toHaveLength(1)
    expect(createdGames[0].getState().isActive).toBe(false)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a load failure shows the setup error, releases the player and never starts or posts', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    expect(createdGames).toHaveLength(1)

    act(() => {
      mockAudioPlayer.failLoading('unsupported codec')
    })
    await drain()

    expect(tree.root.findByProps({ testID: 'host-setup-error' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Start game' })
    ).toHaveLength(0)
    expect(createdGames[0].getState().isActive).toBe(false)
    expect(createdGames[0].getTimerStatus().isRunning).toBe(false)
    expect(mockAudioPlayer.remove).toHaveBeenCalledTimes(1)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a play failure leaves the model idle with explicit failure copy and no POST', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    mockAudioPlayer.play.mockImplementationOnce(() => {
      throw new Error('audio session failed')
    })

    await press(tree, 'Start game')
    await drain()
    fireFrame(frameTime)

    expect(game.getState().isActive).toBe(false)
    expect(game.getState().gameStarted).toBe(false)
    expect(testText(tree, 'rr-play-error')).toBe(
      'The click track could not start. Press Start to try again.'
    )
    expect(control(tree, 'Start game')).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('re-prepares after a post-readiness audio error instead of refusing Start forever', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1)

    act(() => {
      mockAudioPlayer.error = 'decoder reset'
      mockAudioPlayer.emit()
    })
    await drain()
    expect(testText(tree, 'rr-audio-state')).toBe('Click track failed to load')
    expect(game.getState().isActive).toBe(false)

    // Clear the native failure and let a fresh player load; Start must
    // recreate the player and prepare the track again.
    mockAudioPlayer.error = null
    mockAudioPlayer.isLoaded = true
    await press(tree, 'Start game')
    await drain()

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2)
    expect(game.getState().isActive).toBe(true)
    expect(game.getTimerStatus().isRunning).toBe(true)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('re-prepares on Play again after a post-run audio error', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(true)

    act(() => {
      ;(game as unknown as { handleTimeUp: () => void }).handleTimeUp()
    })
    await drain()
    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)

    act(() => {
      mockAudioPlayer.error = 'post-run pipeline failure'
      mockAudioPlayer.isLoaded = false
      mockAudioPlayer.playing = false
      mockAudioPlayer.emit()
    })
    await drain()
    expect(testText(tree, 'rr-audio-state')).toBe('Click track failed to load')

    mockAudioPlayer.error = null
    mockAudioPlayer.isLoaded = true
    await press(tree, 'Play again')
    await drain()

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2)
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getTimerStatus().isRunning).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('Rhythm Reactor pilot — media clock', () => {
  test('keeps the model and wall timer idle until playback is confirmed, then follows media time', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]

    // `play()` was accepted synchronously but the player is not actually
    // playing yet (Android can return without starting). Neither the model
    // nor its independent wall timer may start.
    mockAudioPlayer.play.mockImplementationOnce(() => {
      mockAudioPlayer.playing = false
    })
    await press(tree, 'Start game')
    await drain()
    advanceFrames(5)
    expect(game.getState().isActive).toBe(false)
    expect(game.getState().gameStarted).toBe(false)
    expect(game.getState().elapsedSeconds).toBe(0)
    expect(game.getTimerStatus().isRunning).toBe(false)
    expect(control(tree, 'Start game')).toBeTruthy()

    // Playback confirmation arrives: the model starts exactly once and the
    // first frame catches it up to the media position.
    mockAudioPlayer.playing = true
    setAudioTime(0.52)
    await drain()
    expect(game.getState().isActive).toBe(true)
    expect(game.getTimerStatus().isRunning).toBe(true)
    frameTime += 16
    fireFrame(frameTime)
    expect(game.getState().elapsedSeconds).toBeCloseTo(0.52, 6)

    // A stalled media clock never advances the model, no matter how many
    // wall frames pass (not a wall-clock countdown).
    advanceFrames(5)
    expect(game.getState().elapsedSeconds).toBeCloseTo(0.52, 6)
  })

  test('never starts or posts when playback is never confirmed', async () => {
    jest.useFakeTimers({
      doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
    let tree: TestRenderer.ReactTestRenderer | undefined
    await act(async () => {
      tree = TestRenderer.create(
        <NativeGameHost gameId={GameID.RHYTHM_REACTOR} />
      )
      await Promise.resolve()
    })
    if (!tree) {
      throw new Error('TestRenderer.create returned nothing')
    }
    trees.push(tree)
    fireLayouts(tree)
    await act(async () => {
      mockAudioPlayer.finishLoading()
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve()
      }
    })
    const game = createdGames[0]
    mockAudioPlayer.play.mockImplementationOnce(() => {
      mockAudioPlayer.playing = false
    })

    await press(tree, 'Start game')
    expect(game.getState().isActive).toBe(false)
    expect(game.getTimerStatus().isRunning).toBe(false)

    // The bounded confirmation window expires without ever confirming
    // playback: the model stays idle and no zero-score run is posted.
    await act(async () => {
      jest.advanceTimersByTime(1_600)
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve()
      }
    })
    expect(game.getState().isActive).toBe(false)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().elapsedSeconds).toBe(0)
    expect(game.getTimerStatus().isRunning).toBe(false)
    expect(testText(tree, 'rr-play-error')).toBe(
      'The click track did not start. Press Start to try again.'
    )
    expect(control(tree, 'Start game')).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a playback error during a live run aborts to idle without a POST', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(true)

    act(() => {
      mockAudioPlayer.error = 'audio interrupted'
      mockAudioPlayer.playing = false
      mockAudioPlayer.emit()
    })
    await drain()

    expect(game.getState().isActive).toBe(false)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().elapsedSeconds).toBe(0)
    expect(testText(tree, 'rr-play-error')).toBe(
      'Playback failed. Press Start to try again.'
    )
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('aborts a confirmed run when cumulative playback continuity is lost', async () => {
    const tree = await renderWithFakeTimers(
      <NativeGameHost gameId={GameID.RHYTHM_REACTOR} />
    )
    fireLayouts(tree)
    await loadAudioWithFakeTimers()
    const game = createdGames[0]
    await startWithFakeTimers(tree)
    expect(game.getState().isActive).toBe(true)

    // Ten healthy 100 ms frames: media and actual elapsed time move together.
    for (let step = 1; step <= 10; step += 1) {
      mockAudioPlayer.currentTime = step / 10
      await runFakeFrame(100)
    }
    expect(game.getState().elapsedSeconds).toBeCloseTo(1, 5)

    // First interruption: 300 ms of real elapsed time with media frozen.
    mockAudioPlayer.playing = false
    for (let step = 0; step < 3; step += 1) {
      await runFakeFrame(100)
    }
    expect(game.getState().isActive).toBe(true)

    // Playback resumes; the lost 300 ms remains missing from media time.
    mockAudioPlayer.playing = true
    await runFakeFrame(100)

    // A second interruption pushes the cumulative gap past the tolerance.
    mockAudioPlayer.playing = false
    await runFakeFrame(100)
    if (game.getState().isActive) {
      await runFakeFrame(100)
    }

    expect(game.getState().isActive).toBe(false)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().elapsedSeconds).toBe(0)
    expect(game.getTimerStatus().isRunning).toBe(false)
    expect(testText(tree, 'rr-play-error')).toBe(
      'Playback was interrupted. Press Start to try again.'
    )
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('uses uncapped elapsed time so slow 200 ms frames expose an interruption', async () => {
    const tree = await renderWithFakeTimers(
      <NativeGameHost gameId={GameID.RHYTHM_REACTOR} />
    )
    fireLayouts(tree)
    await loadAudioWithFakeTimers()
    const game = createdGames[0]
    await startWithFakeTimers(tree)
    expect(game.getState().isActive).toBe(true)

    // Ten healthy seconds at 200 ms frames. The shared frame loop caps its
    // delta at 0.1 s; continuity must still use the real elapsed time.
    for (let step = 1; step <= 50; step += 1) {
      mockAudioPlayer.currentTime = step * 0.2
      await runFakeFrame(200)
    }
    expect(game.getState().elapsedSeconds).toBeCloseTo(10, 5)
    expect(game.getTimerStatus().isRunning).toBe(true)

    // A four-second media interruption while frames keep arriving at
    // 200 ms. A capped frame-delta counter would still show media ahead.
    for (let step = 0; step < 20; step += 1) {
      if (!game.getState().isActive) {
        break
      }
      await runFakeFrame(200)
    }

    expect(game.getState().isActive).toBe(false)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().elapsedSeconds).toBe(0)
    expect(testText(tree, 'rr-play-error')).toBe(
      'Playback was interrupted. Press Start to try again.'
    )
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('keeps the earned score when a resolved chart misses frames before timer end', async () => {
    const tree = await renderWithFakeTimers(
      <NativeGameHost gameId={GameID.RHYTHM_REACTOR} />
    )
    fireLayouts(tree)
    await loadAudioWithFakeTimers()
    const game = createdGames[0]
    await startWithFakeTimers(tree)
    expect(game.getState().isActive).toBe(true)

    // Play through the chart in 100 ms frames up to the final note at
    // 57.5 s. Earlier notes have been hit, missed or expired.
    for (let step = 1; step <= 575; step += 1) {
      mockAudioPlayer.currentTime = step / 10
      await runFakeFrame(100)
    }
    expect(game.getState().elapsedSeconds).toBeCloseTo(57.5, 5)
    expect(game.getState().pendingNotes).toHaveLength(1)
    expect(game.getState().pendingNotes[0].hitTimeSeconds).toBe(57.5)

    // Perfect final hit, caught up between frames at 57.5 s. The chart is
    // now fully resolved even though the model clock is still at 57.5.
    mockAudioPlayer.currentTime = 57.5
    await press(tree, 'Tap lane 3')
    expect(game.getState().pendingNotes).toHaveLength(0)
    expect(game.getState().perfectHits).toBeGreaterThanOrEqual(1)
    const earnedScore = game.getState().score
    expect(earnedScore).toBeGreaterThan(0)

    // Audio reaches 60 s normally, but no animation callback arrives before
    // the independent timer completes. The resolved model must keep its
    // earned score.
    mockAudioPlayer.currentTime = RHYTHM_REACTOR_RULES.duration
    await act(async () => {
      jest.advanceTimersByTime(2_500)
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve()
      }
    })

    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(testText(tree, 'final-score')).toBe(String(earnedScore))
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })

  test('does not post when frame callbacks are absent at timer end', async () => {
    const tree = await renderWithFakeTimers(
      <NativeGameHost gameId={GameID.RHYTHM_REACTOR} />
    )
    fireLayouts(tree)
    await loadAudioWithFakeTimers()
    const game = createdGames[0]
    await startWithFakeTimers(tree)
    expect(game.getState().isActive).toBe(true)

    // Media reaches the end, but no frame callback ever delivers it to the
    // model before the independent 60 s wall timer completes.
    mockAudioPlayer.currentTime = RHYTHM_REACTOR_RULES.duration
    await act(async () => {
      jest.advanceTimersByTime(60_000)
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve()
      }
    })

    expect(game.getState().isActive).toBe(false)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().elapsedSeconds).toBe(0)
    expect(game.getTimerStatus().isRunning).toBe(false)
    expect(testText(tree, 'rr-play-error')).toBe(
      'Playback was interrupted. Press Start to try again.'
    )
    expect(submitScore).not.toHaveBeenCalled()

    // A late frame after the abort cannot revive the run or post.
    if (rafQueue.length > 0) {
      act(() => {
        const entry = rafQueue.shift()
        frameTime += 16
        entry?.cb(frameTime)
      })
    }
    expect(game.getState().isActive).toBe(false)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('replays a naturally ended player whose Android getter reports unloaded', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(true)

    act(() => {
      ;(game as unknown as { handleTimeUp: () => void }).handleTimeUp()
    })
    await drain()
    expect(game.getState().isGameOver).toBe(true)

    // Native-style EOF: the status reports ended audio as loaded while the
    // player getter excludes STATE_ENDED.
    act(() => {
      mockAudioPlayer.isLoaded = false
      mockAudioPlayer.playing = false
      mockAudioPlayer.currentTime = 60
      mockAudioPlayer.emit({
        isLoaded: true,
        playing: false,
        currentTime: 60,
        didJustFinish: true,
      })
    })
    await drain()
    expect(mockAudioPlayer.isLoaded).toBe(false)

    await press(tree, 'Play again')
    await drain()

    // The replay rewound, confirmed playback and started the next run.
    expect(mockAudioPlayer.seekTo).toHaveBeenLastCalledWith(0)
    expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2)
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getTimerStatus().isRunning).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('catches up a 200 ms hitch in one update because the game accepts the full duration', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    await press(tree, 'Start game')
    await drain()

    setAudioTime(0.05)
    frameTime += 16
    fireFrame(frameTime)
    expect(game.getState().elapsedSeconds).toBeCloseTo(0.05, 6)

    setAudioTime(0.25)
    frameTime += 16
    fireFrame(frameTime)
    // A 0.1 s clamp would leave the model at 0.15.
    expect(game.getState().elapsedSeconds).toBeCloseTo(0.25, 6)
  })

  test('advances to the current audio time before a between-frame tap', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    await press(tree, 'Start game')
    await drain()

    // No frame has delivered the 2.0 s first note yet.
    expect(game.getState().elapsedSeconds).toBe(0)
    setAudioTime(RHYTHM_REACTOR_RULES.firstHitTimeSeconds)
    await press(tree, 'Tap lane 1')

    expect(game.getState().elapsedSeconds).toBeCloseTo(2, 6)
    expect(game.getState().perfectHits).toBe(1)
    expect(game.getState().misses).toBe(0)
    expect(testText(tree, 'rr-feedback')).toBe('Perfect!')
  })

  test('judges the inclusive perfect and good windows and misses beyond good', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]

    const start = async () => {
      await press(tree, 'Start game')
      await drain()
    }
    const reset = async () => {
      await press(tree, 'Reset game')
      await drain()
    }
    const tapAt = async (seconds: number, lane: string) => {
      setAudioTime(seconds)
      await press(tree, lane)
    }

    // Perfect boundary: first note (lane 1) at 2.0, tapped 80 ms early.
    await start()
    await tapAt(2 - RHYTHM_REACTOR_RULES.perfectWindowSeconds, 'Tap lane 1')
    expect(game.getState().perfectHits).toBe(1)
    expect(game.getState().goodHits).toBe(0)
    await reset()

    // Good boundary: the same note 160 ms early.
    await start()
    await tapAt(2 - RHYTHM_REACTOR_RULES.goodWindowSeconds, 'Tap lane 1')
    expect(game.getState().perfectHits).toBe(0)
    expect(game.getState().goodHits).toBe(1)
    await reset()

    // Beyond good but inside the miss window: consumed as a miss.
    await start()
    await tapAt(
      2 - (RHYTHM_REACTOR_RULES.goodWindowSeconds + 0.01),
      'Tap lane 1'
    )
    expect(game.getState().goodHits).toBe(0)
    expect(game.getState().misses).toBe(1)
    // The first note was consumed by the late press; the next chart note
    // remains (lane 2, two beat steps after the first hit).
    expect(game.getState().pendingNotes[0].hitTimeSeconds).toBe(
      RHYTHM_REACTOR_RULES.firstHitTimeSeconds +
        RHYTHM_REACTOR_RULES.beatStepSeconds * 2
    )
    expect(game.getState().pendingNotes[0].id).not.toBe('note-0')
  })

  test('positive calibration subtracts from player time and locks during a run', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]

    for (let step = 0; step < 30; step += 1) {
      await press(tree, 'Calibration +10 ms')
    }
    expect(testText(tree, 'rr-calibration')).toBe('Calibration +200 ms')

    await press(tree, 'Start game')
    await drain()
    expect(control(tree, 'Calibration +10 ms').props.disabled).toBe(true)
    expect(control(tree, 'Calibration -10 ms').props.disabled).toBe(true)

    // +200 ms means audio at 2.19 s maps to chart time 1.99 s.
    setAudioTime(2.19)
    frameTime += 16
    fireFrame(frameTime)
    expect(game.getState().elapsedSeconds).toBeCloseTo(1.99, 6)
    await press(tree, 'Tap lane 1')
    expect(game.getState().perfectHits).toBe(1)

    // The bound is enforced from both sides and stays pre-run only.
    await press(tree, 'Reset game')
    await drain()
    expect(control(tree, 'Calibration +10 ms').props.disabled).toBe(false)
    for (let step = 0; step < 50; step += 1) {
      await press(tree, 'Calibration -10 ms')
    }
    expect(testText(tree, 'rr-calibration')).toBe('Calibration -200 ms')
  })

  test('renders falling notes from the model clock with readable beat feedback', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    await press(tree, 'Start game')
    await drain()

    setAudioTime(0)
    frameTime += 16
    fireFrame(frameTime)
    expect(testText(tree, 'rr-status')).toBe('Count-in — get ready')
    const notesAtStart = noteRects(tree)
    expect(notesAtStart.length).toBeGreaterThan(0)
    const firstNoteY = Math.min(...notesAtStart.map(props => Number(props.y)))

    setAudioTime(1.5)
    frameTime += 16
    fireFrame(frameTime)
    const notesLater = noteRects(tree)
    expect(
      Math.min(...notesLater.map(props => Number(props.y)))
    ).toBeGreaterThan(firstNoteY)
    expect(testText(tree, 'rr-status')).toBe('Count-in — get ready')

    setAudioTime(2)
    frameTime += 16
    fireFrame(frameTime)
    expect(testText(tree, 'rr-status')).toBe('Playing — Beat 5')
    expect(testText(tree, 'rr-feedback')).toBe('Tap the lit lanes on the beat')
    expect(renderedText(tree)).toContain('Hits 0')
    expect(renderedText(tree)).toContain('Combo ×0')
  })

  test('approaching notes expose their lanes and times to screen readers', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    await press(tree, 'Start game')
    await drain()

    setAudioTime(1)
    frameTime += 16
    fireFrame(frameTime)

    // The Skia notes are invisible to screen readers: the same 2-second
    // approach window is spelled out with lanes and remaining seconds.
    expect(testText(tree, 'rr-upcoming')).toBe(
      'Upcoming: lane 1 in 1.0 seconds, lane 2 in 2.0 seconds.'
    )
    expect(control(tree, 'Tap lane 1').props.accessibilityValue?.text).toBe(
      'Note in 1.0 seconds'
    )
    expect(control(tree, 'Tap lane 2').props.accessibilityValue?.text).toBe(
      'Note in 2.0 seconds'
    )
    expect(control(tree, 'Tap lane 3').props.accessibilityValue?.text).toBe(
      'No approaching note'
    )
    expect(control(tree, 'Tap lane 4').props.accessibilityValue?.text).toBe(
      'No approaching note'
    )

    setAudioTime(1.5)
    frameTime += 16
    fireFrame(frameTime)
    expect(testText(tree, 'rr-upcoming')).toBe(
      'Upcoming: lane 1 in 0.5 seconds, lane 2 in 1.5 seconds.'
    )
    expect(control(tree, 'Tap lane 1').props.accessibilityValue?.text).toBe(
      'Note in 0.5 seconds'
    )
  })

  test('spoken lane cues are paced and not repeated on each frame', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    await press(tree, 'Start game')
    await drain()
    const announce = jest.mocked(AccessibilityInfo.announceForAccessibility)
    announce.mockClear()
    const now = Date.now()
    let elapsedMs = 0
    jest.spyOn(Date, 'now').mockImplementation(() => now + elapsedMs)
    const cueCalls = () =>
      announce.mock.calls
        .map(([message]) => message)
        .filter(message => message.includes(' in '))

    // Below the whole cue lead no note is close enough to speak.
    for (let seconds = 0; seconds < 0.45; seconds += 0.05) {
      setAudioTime(seconds)
      elapsedMs = seconds * 1000
      frameTime += 50
      fireFrame(frameTime)
    }
    expect(cueCalls()).toHaveLength(0)

    // The next note is included ahead of time rather than interrupting the cue.
    for (let seconds = 0.5; seconds <= 1.6; seconds += 0.05) {
      setAudioTime(seconds)
      elapsedMs = seconds * 1000
      frameTime += 50
      fireFrame(frameTime)
    }
    expect(cueCalls()).toEqual([
      'Lane 1, in 1.5 seconds; lane 2, in 2.5 seconds.',
    ])

    // Holding the same clock across many frames never repeats the cue.
    for (let frame = 0; frame < 10; frame += 1) {
      setAudioTime(1.6)
      frameTime += 50
      fireFrame(frameTime)
    }
    expect(cueCalls()).toEqual([
      'Lane 1, in 1.5 seconds; lane 2, in 2.5 seconds.',
    ])

    setAudioTime(2.5)
    elapsedMs = 2500
    frameTime += 50
    fireFrame(frameTime)
    expect(cueCalls()).toEqual([
      'Lane 1, in 1.5 seconds; lane 2, in 2.5 seconds.',
      'Lane 3, in 1.5 seconds; lane 4, in 2.5 seconds.',
    ])
  })

  test('coalesces due lanes after a hitch and does not interrupt them for hit feedback', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    await press(tree, 'Start game')
    await drain()
    const announce = jest.mocked(AccessibilityInfo.announceForAccessibility)
    announce.mockClear()
    const now = Date.now()
    let elapsedMs = 0
    jest.spyOn(Date, 'now').mockImplementation(() => now + elapsedMs)

    // A delayed frame puts both the 6.0 s and 6.5 s notes inside the cue lead.
    setAudioTime(5.01)
    frameTime += 16
    fireFrame(frameTime)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce.mock.calls[0][0]).toContain('Lane 1')
    expect(announce.mock.calls[0][0]).toContain('lane 2')
    expect(announce.mock.calls[0][0]).toContain('lane 3')

    setAudioTime(5.026)
    elapsedMs = 16
    frameTime += 16
    fireFrame(frameTime)
    await press(tree, 'Tap lane 4')
    expect(testText(tree, 'rr-feedback')).toBe('Perfect!')
    expect(announce).toHaveBeenCalledTimes(1)

    // A newly due note must not immediately interrupt the ongoing 3-note cue,
    // even once the 1.5 s base interval has elapsed.
    setAudioTime(6.01)
    elapsedMs = 1000
    frameTime += 16
    fireFrame(frameTime)
    expect(announce).toHaveBeenCalledTimes(1)

    setAudioTime(7.01)
    elapsedMs = 1590
    frameTime += 16
    fireFrame(frameTime)
    expect(announce).toHaveBeenCalledTimes(1)

    setAudioTime(7.01)
    elapsedMs = 2000
    frameTime += 16
    fireFrame(frameTime)
    expect(announce).toHaveBeenCalledTimes(2)
    expect(announce.mock.calls[1][0]).toContain('Lane 4')
    expect(announce.mock.calls[1][0]).toContain('1.5 seconds')
  })
})

describe('Rhythm Reactor pilot — background policy', () => {
  test('background aborts to idle without a POST and never auto-resumes; foreground starts fresh', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    await press(tree, 'Start game')
    await drain()
    setAudioTime(2)
    await press(tree, 'Tap lane 1')
    expect(game.getState().perfectHits).toBe(1)
    expect(game.getState().isActive).toBe(true)

    // Two listeners: the generic host policy (non-pausable => no-op) and
    // the Rhythm abort policy.
    expect(appStateHandlers.size).toBe(2)
    emitAppState('background')

    expect(game.getState().isActive).toBe(false)
    expect(game.getState().isGameOver).toBe(false)
    expect(game.getState().gameStarted).toBe(false)
    expect(game.getState().elapsedSeconds).toBe(0)
    expect(game.getState().pendingNotes).toHaveLength(
      (game as unknown as { config: { chart: unknown[] } }).config.chart.length
    )
    expect(game.getState().score).toBe(0)
    expect(mockAudioPlayer.pause).toHaveBeenCalled()
    expect(mockAudioPlayer.seekTo).toHaveBeenLastCalledWith(0)
    expect(testText(tree, 'rr-notice')).toBe(
      'Run stopped when the app left the foreground. Start again to replay.'
    )
    expect(testText(tree, 'rr-status')).toBe('Waiting to start')
    expect(control(tree, 'Start game')).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()

    // Foregrounding never auto-resumes.
    emitAppState('active')
    await drain()
    expect(game.getState().isActive).toBe(false)
    expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1)

    // A fresh Start begins a new run at the audio origin.
    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(true)
    expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2)
    setAudioTime(0.5)
    frameTime += 16
    fireFrame(frameTime)
    expect(game.getState().elapsedSeconds).toBeCloseTo(0.5, 6)
  })

  test('backgrounding cancels a Start awaiting playback confirmation', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    mockAudioPlayer.play.mockImplementationOnce(() => {
      mockAudioPlayer.playing = false
    })

    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(false)
    expect(game.getTimerStatus().isRunning).toBe(false)

    emitAppState('background')
    await drain()
    expect(game.getState().isActive).toBe(false)

    // A late native playback confirmation after backgrounding must not
    // start the idle model, and foregrounding does not resume it.
    act(() => {
      mockAudioPlayer.playing = true
      mockAudioPlayer.currentTime = 0
      mockAudioPlayer.emit()
    })
    emitAppState('active')
    await drain()
    expect(game.getState().isActive).toBe(false)
    expect(game.getTimerStatus().isRunning).toBe(false)
    expect(submitScore).not.toHaveBeenCalled()

    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(true)
    expect(game.getTimerStatus().isRunning).toBe(true)
  })

  test('backgrounding cancels a Start awaiting audio-session setup', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    let releaseSession: (() => void) | undefined
    mockSetAudioModeAsync.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseSession = resolve
        })
    )

    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(false)
    emitAppState('background')
    act(() => {
      releaseSession?.()
    })
    await drain()
    expect(game.getState().isActive).toBe(false)
    expect(game.getTimerStatus().isRunning).toBe(false)
    expect(submitScore).not.toHaveBeenCalled()

    // Foregrounding never auto-starts; a fresh Start is required and works.
    emitAppState('active')
    await drain()
    expect(game.getState().isActive).toBe(false)
    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(true)
    expect(game.getTimerStatus().isRunning).toBe(true)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('backgrounding cancels a Start awaiting seekTo', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    let releaseSeek: (() => void) | undefined
    mockAudioPlayer.seekTo.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseSeek = () => {
            mockAudioPlayer.currentTime = 0
            resolve()
          }
        })
    )

    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(false)
    emitAppState('background')
    act(() => {
      releaseSeek?.()
    })
    await drain()
    expect(game.getState().isActive).toBe(false)
    expect(game.getTimerStatus().isRunning).toBe(false)
    expect(submitScore).not.toHaveBeenCalled()

    emitAppState('active')
    await drain()
    expect(game.getState().isActive).toBe(false)
    await press(tree, 'Start game')
    await drain()
    expect(game.getState().isActive).toBe(true)
    expect(game.getTimerStatus().isRunning).toBe(true)
  })

  test('an idle or finished run is untouched by backgrounding', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]

    emitAppState('background')
    emitAppState('active')
    expect(game.getState().isActive).toBe(false)
    expect(mockAudioPlayer.pause).not.toHaveBeenCalled()

    await press(tree, 'Start game')
    await drain()
    act(() => {
      ;(game as unknown as { handleTimeUp: () => void }).handleTimeUp()
    })
    await drain()
    expect(game.getState().isGameOver).toBe(true)
    const postsAfterFinish = submitScore.mock.calls.length
    emitAppState('background')
    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(postsAfterFinish)
  })
})

describe('Rhythm Reactor pilot — finish, replay and rewards', () => {
  test('a full 60-second run finishes with one POST and a clean Replay', async () => {
    jest.useFakeTimers({
      doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
    })
    let tree: TestRenderer.ReactTestRenderer | undefined
    await act(async () => {
      tree = TestRenderer.create(
        <NativeGameHost gameId={GameID.RHYTHM_REACTOR} />
      )
      await Promise.resolve()
    })
    if (!tree) {
      throw new Error('TestRenderer.create returned nothing')
    }
    trees.push(tree)
    fireLayouts(tree)
    act(() => {
      mockAudioPlayer.finishLoading()
    })
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve()
      }
    })
    const game = createdGames[0]

    await startWithFakeTimers(tree)
    expect(game.getState().isActive).toBe(true)

    // Advance media and the independent wall timer together for the full
    // run: 600 × 100 ms frames, tapping the first note when both clocks are
    // at 2 s. Media is never ahead of or behind the timer by design.
    for (let step = 1; step <= 600; step += 1) {
      mockAudioPlayer.currentTime = step / 10
      await runFakeFrame(100)
      if (step === 20) {
        await press(tree, 'Tap lane 1')
      }
      if (game.getState().isGameOver) {
        break
      }
    }
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve()
      }
    })

    expect(game.getState().perfectHits).toBe(1)
    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.RHYTHM_REACTOR,
        platform: 'ios',
        gameData: expect.objectContaining({ perfectHits: 1 }),
      })
    )
    expect(testText(tree, 'final-score')).toBe(String(game.getState().score))
    expect(testText(tree, 'result-save-status')).toBe('Score saved')

    await press(tree, 'Play again')
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve()
      }
    })
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().isGameOver).toBe(false)
    expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2)
    expect(mockAudioPlayer.seekTo).toHaveBeenLastCalledWith(0)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a stale save is dropped but same-account late rewards still forward once', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise<ScoreSubmissionResult>(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    await press(tree, 'Start game')
    await drain()

    act(() => {
      ;(game as unknown as { handleTimeUp: () => void }).handleTimeUp()
    })
    await drain()
    expect(renderedText(tree)).toContain('Saving score…')

    await press(tree, 'Play again')
    await drain()
    expect(renderedText(tree)).not.toContain('Saving score…')

    await act(async () => {
      releaseSave?.({
        success: true,
        newAchievements: [ACHIEVEMENT],
      })
    })
    await drain()

    const rendered = renderedText(tree)
    expect(rendered).not.toContain('Score saved')
    expect(rendered).not.toContain('Run complete')
    expect(rendered.match(/Late Beat/g)).toHaveLength(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('unmount releases the audio player and both AppState listeners without posting', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.RHYTHM_REACTOR} />)
    fireLayouts(tree)
    await loadAudio()
    const game = createdGames[0]
    const destroy = jest.spyOn(game, 'destroy')
    await press(tree, 'Start game')
    await drain()
    expect(appStateHandlers.size).toBe(2)

    await unmount(tree)

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(mockAudioPlayer.remove).toHaveBeenCalledTimes(1)
    expect(mockAudioPlayer.pause).toHaveBeenCalled()
    expect(appStateHandlers.size).toBe(0)
    expect(submitScore).not.toHaveBeenCalled()
  })
})
