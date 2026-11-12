import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AccessibilityInfo, Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { createStableProjector } from '@cetus/app-core'
import { PatternPulseGame } from '@cetus/games/pattern-pulse/PatternPulseGame'
import type { PatternPulseState } from '@cetus/games/pattern-pulse/types'
import type { BaseGame, BaseGameState } from '@cetus/games'

jest.setTimeout(15000)

jest.mock('../src/lib/api', () => mockApiModule)

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

const mockNotificationAsync = jest.fn()
jest.mock('expo-haptics', () => ({
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}))

const mockAnnounce = jest
  .spyOn(AccessibilityInfo, 'announceForAccessibility')
  .mockImplementation(() => undefined)

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES, type NativeGamePort } from '../src/games/registry'
const submitScore = jest.mocked(api.submitScore)

const createdGames: PatternPulseGame[] = []
const originalEntry = NATIVE_GAMES[GameID.PATTERN_PULSE]
const originalPort = originalEntry?.port

/** Per-test model config: a deterministic rng and a one-pad first
 *  sequence so real-timer playback settles fast; individual tests tighten
 *  mistakeLimit/duration further. */
interface PilotConfig {
  rng: () => number
  initialSequenceLength: number
  mistakeLimit?: number
  duration?: number
}
let pilotConfig: PilotConfig = { rng: () => 0, initialSequenceLength: 1 }

beforeAll(() => {
  if (!originalPort) {
    throw new Error('Pattern Pulse registry port missing')
  }
  // Production port (view, projector, outcome label); only the model's
  // own configurable knobs are overridden. The playback/feedback timings
  // are model constants — the view must survive them with real timers.
  NATIVE_GAMES[GameID.PATTERN_PULSE] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new PatternPulseGame({ ...deps, ...pilotConfig })
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.PATTERN_PULSE] = originalEntry
})

const trees: Array<TestRenderer.ReactTestRenderer> = []

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  trees.push(tree)
  return tree
}

/** Unmount now (and drop the tree from the afterEach sweep). */
const unmountNow = async (tree: TestRenderer.ReactTestRenderer) => {
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

/** Poll the live model (real timers) until its state satisfies the
 *  predicate; every 25ms poll runs inside act so the session store and
 *  the tree settle the state-change events the model emits meanwhile. */
const waitFor = async (
  game: PatternPulseGame,
  predicate: (state: PatternPulseState) => boolean,
  timeoutMs = 8000
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25))
    })
    if (predicate(game.getState())) {
      return game.getState()
    }
  }
  throw new Error(`waitFor timed out in phase ${game.getState().phase}`)
}

/** Let the model's async end()/score-save microtasks finish. */
const settle = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
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

type PadVisual = 'idle' | 'active' | 'wrong'

/** Host-tag element carrying a pad's testID (jest-expo renders a React
 *  wrapper AND a host element with identical props). */
const padNode = (
  tree: TestRenderer.ReactTestRenderer,
  state: PadVisual,
  pad: number
): TestRenderer.ReactTestInstance | undefined =>
  tree.root.findAll(
    node =>
      typeof node.type === 'string' &&
      node.props.testID === `pp-pad-${state}-${pad}`
  )[0]

/** The Pressable component instance for a pad: the one node that owns
 *  the raw onPress prop. */
const padButton = (
  tree: TestRenderer.ReactTestRenderer,
  state: PadVisual,
  pad: number
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.type === 'function' &&
      node.props.testID === `pp-pad-${state}-${pad}` &&
      typeof node.props.onPress === 'function'
  )[0]

const hasPad = (
  tree: TestRenderer.ReactTestRenderer,
  state: PadVisual,
  pad: number
): boolean => padNode(tree, state, pad) !== undefined

/** Count host-tag pads whose testID carries the visual state suffix. */
const padsInState = (
  tree: TestRenderer.ReactTestRenderer,
  state: PadVisual
): number =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith(`pp-pad-${state}-`)
    ).length

/** Every one of the four pads' host nodes reports the given disabled bit. */
const padsDisabled = (
  tree: TestRenderer.ReactTestRenderer,
  disabled: boolean
): boolean =>
  [0, 1, 2, 3].every(
    pad =>
      padNode(tree, 'idle', pad)?.props.accessibilityState.disabled === disabled
  )

/** The run's current score off the chrome badge ("Score N"). */
const shownScore = (tree: TestRenderer.ReactTestRenderer): number => {
  const line = renderedText(tree)
    .split('\n')
    .find(text => text.startsWith('Score '))
  return Number(line?.slice('Score '.length))
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  mockNotificationAsync.mockReset()
  mockAnnounce.mockClear()
  mockPush.mockReset()
  createdGames.length = 0
  pilotConfig = { rng: () => 0, initialSequenceLength: 1 }
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
})

/** Element children only — text children type as string. */
const elementChildren = (
  node: TestRenderer.ReactTestInstance
): TestRenderer.ReactTestInstance[] =>
  node.children.filter(
    (child): child is TestRenderer.ReactTestInstance =>
      child !== null && typeof child === 'object'
  )

describe('Pattern Pulse board — 2×2 layout structure', () => {
  test('the square board holds two flex-row containers of two pads each', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)

    // The pads group must be a true 2×2 grid: two row containers inside
    // the square board — never four pads stacked in its default column.
    const board = tree.root.findAll(
      node =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'Pattern Pulse signal pads'
    )[0]

    // Exactly two row containers sit directly in the board, in order.
    const boardRows = elementChildren(board)
    expect(boardRows).toHaveLength(2)
    boardRows.forEach((child, index) => {
      expect(child.props.testID).toBe(`pp-row-${index}`)
    })

    // Host-tag row elements (jest-expo renders a React wrapper AND a
    // host element with identical props) carry the horizontal layout,
    // each holding its own pair of pads.
    ;[0, 1].forEach(index => {
      const row = tree.root.findAll(
        node =>
          typeof node.type === 'string' &&
          node.props.testID === `pp-row-${index}`
      )[0]
      expect(String(row?.props.className)).toContain('flex-1')
      expect(String(row?.props.className)).toContain('flex-row')
      const pads = elementChildren(row).filter(child =>
        /^pp-pad-(idle|active|wrong)-\d$/.test(String(child.props.testID))
      )
      expect(pads).toHaveLength(2)
      expect(pads.map(pad => pad.props.testID)).toEqual([
        `pp-pad-idle-${index * 2}`,
        `pp-pad-idle-${index * 2 + 1}`,
      ])
    })
  })
})

describe('Pattern Pulse board — idle render', () => {
  test('renders four disabled pads, READY status and a zeroed HUD', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)

    expect(padsInState(tree, 'idle')).toBe(4)
    expect(padsInState(tree, 'active')).toBe(0)
    expect(padsInState(tree, 'wrong')).toBe(0)
    expect(padsDisabled(tree, true)).toBe(true)

    expect(testText(tree, 'pp-status')).toBe('READY')
    expect(testText(tree, 'pp-length')).toBe('Length 1')
    expect(testText(tree, 'pp-rounds')).toBe('Rounds 0')
    expect(testText(tree, 'pp-streak')).toBe('Streak 0')
    expect(testText(tree, 'pp-mistakes')).toBe('Mistakes 0')

    // Web-pad parity: glyph, visible number and accessible name.
    expect(padNode(tree, 'idle', 0)?.props.accessibilityLabel).toBe(
      'Pad 1, triangle'
    )
    expect(padNode(tree, 'idle', 3)?.props.accessibilityLabel).toBe(
      'Pad 4, star'
    )
    expect(renderedText(tree)).toContain('▲')
    expect(renderedText(tree)).toContain('✦')
  })
})

describe('Pattern Pulse board — model-driven playback timing', () => {
  test('start plays the cue from the model: WATCH with disabled pads, the pad lights, then input opens', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]
    const pressPad = jest.spyOn(game, 'pressPad')

    await press(tree, 'Start game')

    // beginPlayback emits synchronously from start(): watch phase, gated.
    expect(testText(tree, 'pp-status')).toBe('WATCH')
    expect(padsDisabled(tree, true)).toBe(true)

    // The model's cue lights pad 0 (prePlaybackDelay 400ms, pulse 600ms).
    await waitFor(game, state => state.activePad === 0)
    expect(hasPad(tree, 'active', 0)).toBe(true)

    // ...then the model clears it and opens input; no view timers exist.
    await waitFor(game, state => state.phase === 'input')
    expect(hasPad(tree, 'active', 0)).toBe(false)
    expect(testText(tree, 'pp-status')).toBe('REPEAT')
    expect(padsDisabled(tree, false)).toBe(true)
    expect(pressPad).not.toHaveBeenCalled()
  })

  test('pads stay disabled outside the input phase and the model rejects the press', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    expect(testText(tree, 'pp-status')).toBe('WATCH')
    expect(padsDisabled(tree, true)).toBe(true)

    // The affordance is honest: even a forced model press during watch is
    // rejected with no state change.
    let accepted = false
    await act(async () => {
      accepted = game.pressPad(0)
    })
    expect(accepted).toBe(false)
    expect(game.getState()).toMatchObject({ mistakes: 0, phase: 'watch' })
    expect(testText(tree, 'pp-status')).toBe('WATCH')
  })
})

describe('Pattern Pulse board — input', () => {
  test('a correct tap calls pressPad(pad) and completes the round', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]
    const pressPad = jest.spyOn(game, 'pressPad')

    await press(tree, 'Start game')
    await waitFor(game, state => state.phase === 'input')

    await act(async () => {
      padButton(tree, 'idle', 0).props.onPress()
    })
    expect(pressPad).toHaveBeenCalledTimes(1)
    expect(pressPad).toHaveBeenCalledWith(0)

    await waitFor(game, state => state.feedback === 'correct')
    expect(testText(tree, 'pp-status')).toBe('CORRECT')
    expect(mockNotificationAsync).not.toHaveBeenCalled()

    // After the feedback window the model grows the sequence by one pad
    // and replays it (model timing; the view only shows the projection).
    await waitFor(
      game,
      state => state.phase === 'watch' && state.sequence.length === 2
    )
    expect(testText(tree, 'pp-length')).toBe('Length 2')
    expect(testText(tree, 'pp-rounds')).toBe('Rounds 1')
    expect(testText(tree, 'pp-streak')).toBe('Streak 1')
    // 100 completion points + speed bonus for a fast answer.
    expect(shownScore(tree)).toBeGreaterThanOrEqual(280)
  })

  test('a wrong tap counts a mistake, resets the streak and replays the same sequence', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]
    const pressPad = jest.spyOn(game, 'pressPad')

    await press(tree, 'Start game')
    await waitFor(game, state => state.phase === 'input')
    // Bank a correct round FIRST so the reset below starts from a real
    // positive streak — resetting from zero proves nothing.
    await act(async () => {
      padButton(tree, 'idle', 0).props.onPress()
    })
    await waitFor(
      game,
      state => state.phase === 'input' && state.sequence.length === 2
    )
    expect(testText(tree, 'pp-streak')).toBe('Streak 1')
    expect(testText(tree, 'pp-rounds')).toBe('Rounds 1')

    await act(async () => {
      padButton(tree, 'idle', 1).props.onPress()
    })
    expect(pressPad).toHaveBeenCalledWith(1)

    await waitFor(game, state => state.feedback === 'wrong')
    expect(testText(tree, 'pp-status')).toBe('WRONG — WATCH AGAIN')
    expect(hasPad(tree, 'wrong', 1)).toBe(true)
    expect(testText(tree, 'pp-mistakes')).toBe('Mistakes 1')
    // The streak genuinely RESET here: from 1 down to 0.
    expect(testText(tree, 'pp-streak')).toBe('Streak 0')
    // The wrong-pad cue is the one sensory extra: a haptic keyed off the
    // model's feedback state (no SFX).
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1)
    expect(mockNotificationAsync).toHaveBeenCalledWith('error')

    // The feedback window ends in a replay of the SAME sequence.
    await waitFor(game, state => state.phase === 'watch')
    await waitFor(game, state => state.phase === 'input')
    expect(testText(tree, 'pp-length')).toBe('Length 2')
    expect(testText(tree, 'pp-mistakes')).toBe('Mistakes 1')
  })
})

describe('Pattern Pulse board — finish', () => {
  test('the mistake limit ends the run, saves once and replays fresh', async () => {
    pilotConfig = { rng: () => 0, initialSequenceLength: 1, mistakeLimit: 1 }
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await waitFor(game, state => state.phase === 'input')
    await act(async () => {
      padButton(tree, 'idle', 1).props.onPress()
    })
    await waitFor(game, state => state.isGameOver)

    expect(game.getState()).toMatchObject({
      outcome: 'mistakes',
      phase: 'ended',
      mistakes: 1,
    })
    expect(testText(tree, 'pp-status')).toBe('SIGNAL LOST')
    expect(testText(tree, 'result-outcome')).toBe('Mistake Limit')
    expect(Number(testText(tree, 'final-score'))).toBe(0)

    await settle()
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.PATTERN_PULSE,
        platform: 'ios',
        gameData: {
          completedRounds: 0,
          longestSequence: 0,
          mistakes: 1,
          maxStreak: 0,
        },
      })
    )
    expect(renderedText(tree)).toContain('Score saved')

    // Replay: a fresh run, zeroed HUD and no second save.
    await press(tree, 'Play again')
    expect(testText(tree, 'pp-status')).toBe('WATCH')
    expect(testText(tree, 'pp-length')).toBe('Length 1')
    expect(testText(tree, 'pp-rounds')).toBe('Rounds 0')
    expect(testText(tree, 'pp-mistakes')).toBe('Mistakes 0')
    await waitFor(game, state => state.phase === 'input')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a timeout ends the run, cancels the pending cue and saves once', async () => {
    pilotConfig = { rng: () => 0, initialSequenceLength: 1, duration: 1 }
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await waitFor(game, state => state.isGameOver)

    expect(game.getState()).toMatchObject({
      outcome: 'timeout',
      phase: 'ended',
      activePad: null,
      feedback: null,
    })
    expect(testText(tree, 'pp-status')).toBe('TIME')
    expect(testText(tree, 'result-outcome')).toBe('Timeout')

    await settle()
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.PATTERN_PULSE,
        gameData: {
          completedRounds: 0,
          longestSequence: 0,
          mistakes: 0,
          maxStreak: 0,
        },
      })
    )
    expect(renderedText(tree)).toContain('Score saved')

    // handleTimeUp cleared the scheduled playback: no stray callbacks
    // mutate the ended state afterwards.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1600))
    })
    expect(game.getState()).toMatchObject({ phase: 'ended', activePad: null })
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('Pattern Pulse board — reset and cleanup', () => {
  test('a mid-playback reset returns to READY, cancels cues and saves nothing', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    expect(testText(tree, 'pp-status')).toBe('WATCH')

    await press(tree, 'Reset game')
    expect(game.getState().phase).toBe('idle')
    expect(testText(tree, 'pp-status')).toBe('READY')
    expect(testText(tree, 'pp-length')).toBe('Length 1')
    expect(testText(tree, 'pp-rounds')).toBe('Rounds 0')
    expect(testText(tree, 'pp-mistakes')).toBe('Mistakes 0')
    expect(renderedText(tree)).not.toContain('Run complete')

    // Past the pending prePlaybackDelay and the whole first cue: the
    // canceled playback must never fire against the idle run.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1600))
    })
    expect(game.getState()).toMatchObject({ phase: 'idle', activePad: null })
    expect(testText(tree, 'pp-status')).toBe('READY')
    expect(submitScore).not.toHaveBeenCalled()

    // The host still starts a fresh run afterwards.
    await press(tree, 'Start game')
    expect(testText(tree, 'pp-status')).toBe('WATCH')
  })

  test('unmounting mid-cue cancels the pending pad-clear callback and saves nothing', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    // Unmount while the first cue is lit and its pulseMs clear callback
    // is pending — destroy() must cancel it, or it would flip activePad
    // to null after the screen is gone.
    await waitFor(game, state => state.activePad === 0)
    await unmountNow(tree)

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 700))
    })
    expect(game.getState().activePad).toBe(0)
    expect(game.getState().phase).toBe('watch')
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Pattern Pulse board — projection stability', () => {
  test('timer ticks keep the projection reference; a state change replaces it', async () => {
    const game = new PatternPulseGame({
      submitScore: async () => ({ success: true }),
      platform: 'ios',
      rng: () => 0,
      initialSequenceLength: 1,
    })
    const port = originalPort as NativeGamePort
    const project = createStableProjector((state: BaseGameState) =>
      port.project(state, game as unknown as BaseGame)
    )

    game.start()
    await waitFor(game, state => state.phase === 'input')
    const atInput = project(game.getState())

    // Two countdown ticks: timeRemaining changes, nothing visible does —
    // the stable projector hands back the SAME reference.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })
    expect(project(game.getState())).toBe(atInput)

    // An accepted press changes the visible projection.
    await act(async () => {
      game.pressPad(0)
    })
    const afterRound = project(game.getState()) as {
      completedRounds: number
      feedback: string
    }
    expect(afterRound).not.toBe(atInput)
    expect(afterRound.completedRounds).toBe(1)
    expect(afterRound.feedback).toBe('correct')

    game.destroy()
  })
})

describe('Pattern Pulse board — screen-reader cues', () => {
  // One complete ordered recap per input phase replaces per-cue
  // announcements: announceForAccessibility interrupts on VoiceOver and
  // high-rate per-pad calls would trample each other. The recap is read
  // from the live model AT input entry — the model only enters input
  // after full playback, so the recap can never be partial.
  test('input entry announces one ordered recap; repeated pads stay distinguishable', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]
    // Nothing is announced while the board sits idle.
    expect(mockAnnounce).not.toHaveBeenCalled()

    await press(tree, 'Start game')
    await waitFor(game, state => state.phase === 'input')

    // Exactly two utterances so far: the playback cue and ONE recap of
    // the complete sequence — no per-pad announcements at all.
    expect(mockAnnounce.mock.calls.map(([m]) => m)).toEqual([
      'Watch the pattern',
      'Your turn — repeat the pattern: Pad 1, triangle.',
    ])

    // Round 2 grows the sequence to [0, 0]: the repeated pad must be
    // spoken twice, in order, inside the single recap utterance.
    await act(async () => {
      padButton(tree, 'idle', 0).props.onPress()
    })
    await waitFor(
      game,
      state => state.phase === 'input' && state.sequence.length === 2
    )

    expect(mockAnnounce.mock.calls.map(([m]) => m)).toEqual([
      'Watch the pattern',
      'Your turn — repeat the pattern: Pad 1, triangle.',
      'Watch the pattern',
      'Your turn — repeat the pattern: Pad 1, triangle. Pad 1, triangle.',
    ])
  })

  test('a wrong tap replays and the recap repeats the full sequence', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await waitFor(game, state => state.phase === 'input')
    await act(async () => {
      padButton(tree, 'idle', 1).props.onPress()
    })
    await waitFor(game, state => state.phase === 'watch')
    // The replay restarts with its playback cue — and NOTHING is spoken
    // during the watch phase itself (no per-cue interruptions).
    expect(mockAnnounce.mock.calls.map(([m]) => m)).toEqual([
      'Watch the pattern',
      'Your turn — repeat the pattern: Pad 1, triangle.',
      'Watch the pattern',
    ])

    await waitFor(game, state => state.phase === 'input')
    // The same complete sequence recapped again for the replay.
    expect(mockAnnounce.mock.calls.map(([m]) => m)).toEqual([
      'Watch the pattern',
      'Your turn — repeat the pattern: Pad 1, triangle.',
      'Watch the pattern',
      'Your turn — repeat the pattern: Pad 1, triangle.',
    ])
  })

  test('reset or unmount during playback never queues stale speech', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.PATTERN_PULSE} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    expect(testText(tree, 'pp-status')).toBe('WATCH')
    // Reset mid-playback: input is never entered, so no recap — and no
    // partial-sequence speech — is ever queued.
    await press(tree, 'Reset game')
    expect(game.getState().phase).toBe('idle')
    expect(mockAnnounce.mock.calls.map(([m]) => m)).toEqual([
      'Watch the pattern',
    ])

    // Restart, then unmount before input opens: nothing further queues.
    await press(tree, 'Start game')
    expect(testText(tree, 'pp-status')).toBe('WATCH')
    await unmountNow(tree)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1600))
    })
    expect(mockAnnounce.mock.calls.map(([m]) => m)).toEqual([
      'Watch the pattern',
      'Watch the pattern',
    ])
    expect(
      mockAnnounce.mock.calls.filter(([m]) => m.includes('Pad 1'))
    ).toHaveLength(0)
  })
})
