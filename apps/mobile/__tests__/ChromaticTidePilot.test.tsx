import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import type { ChallengeUpdatesPayload } from '@cetus/shared/api-dto'
import { ChromaticTideGame } from '@cetus/games/chromatic-tide/ChromaticTideGame'

jest.mock('../src/lib/api', () => ({
  api: {
    submitScore: jest.fn(),
  },
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'

const submitScore = jest.mocked(api.submitScore)

// Deterministic one-move-clear board, same shape as @cetus/games'
// oneMoveClearRng fixture: 143 teal cells plus one amber corner, so
// choosing amber floods the whole 12×12 board in a single move. Every
// later rng call yields amber, making the replay board all-amber with a
// magenta corner (clearable by choosing magenta).
function oneMoveClearRng(): () => number {
  let calls = 0
  return () => (calls++ < 143 ? 0 : 0.2)
}

const createdGames: ChromaticTideGame[] = []
const originalEntry = NATIVE_GAMES[GameID.CHROMATIC_TIDE]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Chromatic Tide registry port missing')
  }
  // Production port (view, projector, outcome label) with only the board
  // rng made deterministic; createGame still injects the host deps.
  NATIVE_GAMES[GameID.CHROMATIC_TIDE] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new ChromaticTideGame({
          rng: oneMoveClearRng(),
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
  NATIVE_GAMES[GameID.CHROMATIC_TIDE] = originalEntry
})

const ACHIEVEMENT: AchievementNotification = {
  id: 'ach-tide',
  name: 'Tide Turner',
  description: 'Flood the board',
  icon: '🌊',
  rarity: AchievementRarity.RARE,
}
const CHALLENGE_UPDATES: ChallengeUpdatesPayload = {
  completedChallenges: [
    {
      id: 'ch-tide',
      name: 'Flood the board',
      description: 'Clear a Chromatic Tide board',
      icon: '🎯',
      xpReward: 10,
    },
  ],
  xpEarned: 10,
  levelUp: false,
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

/** Count rendered native elements by testID. jest-expo's View mock
 *  renders a React wrapper AND a host-tag element carrying the same
 *  props (plain findAllByProps matches each twice), so count host-tag
 *  elements only — one per actually rendered View. */
const countViews = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): number =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => node.props.testID === testID).length

/** Count board cells whose testID carries the given color/captured suffix. */
const cellsWith = (
  tree: TestRenderer.ReactTestRenderer,
  suffix: string
): number => countViews(tree, `tide-cell-${suffix}`)

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
})

describe('Chromatic Tide pilot — board', () => {
  test('renders the 12×12 board, palette and captured-territory HUD', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    expect(countViews(tree, 'tide-row')).toBe(12)
    // All 143 teal cells form the captured territory; the amber corner
    // is the one uncaptured cell.
    expect(cellsWith(tree, 'teal')).toBe(0)
    expect(cellsWith(tree, 'teal-captured')).toBe(143)
    expect(cellsWith(tree, 'amber')).toBe(1)
    expect(testText(tree, 'tide-moves')).toBe('Moves 0')
    expect(testText(tree, 'tide-captured')).toBe('143 / 144 captured')
    expect(testText(tree, 'tide-territory')).toBe('Territory teal')

    for (const color of ['teal', 'amber', 'magenta', 'ice', 'green']) {
      const button = tree.root.findByProps({
        accessibilityLabel: `Choose ${color}`,
      })
      // Idle run: the palette is visible but disabled.
      expect(button.props.disabled).toBe(true)
    }
  })

  test('a palette tap calls chooseColor on the live game, updates the board and finishes', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)
    const game = createdGames[0]
    const chooseColor = jest.spyOn(game, 'chooseColor')

    await press(tree, 'Start game')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Choose amber' }).props
        .disabled
    ).toBe(false)

    await press(tree, 'Choose amber')
    expect(chooseColor).toHaveBeenCalledWith('amber')
    await drain()

    // Projection refreshed through the real session: everything captured.
    expect(cellsWith(tree, 'amber-captured')).toBe(144)
    expect(testText(tree, 'tide-moves')).toBe('Moves 1')
    expect(testText(tree, 'tide-captured')).toBe('144 / 144 captured')
    expect(testText(tree, 'tide-territory')).toBe('Territory amber')

    // The cleared outcome finished the run and saved exactly once with
    // the OS platform and the run's game data.
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.CHROMATIC_TIDE,
        platform: 'ios',
        gameData: expect.objectContaining({
          cleared: true,
          movesUsed: 1,
          capturedCells: 144,
        }),
      })
    )
    expect(testText(tree, 'result-outcome')).toBe('Cleared')
    expect(Number(testText(tree, 'final-score'))).toBeGreaterThanOrEqual(500)
    expect(renderedText(tree)).toContain('Score saved')
  })

  test('a mid-run reset returns to a fresh idle board without saving', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    await press(tree, 'Start game')
    await press(tree, 'Reset game')

    expect(testText(tree, 'tide-moves')).toBe('Moves 0')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('a replay starts a fresh board and clears it again', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)
    await press(tree, 'Start game')
    await press(tree, 'Choose amber')
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    expect(testText(tree, 'tide-moves')).toBe('Moves 0')
    // The replay board is all amber (fresh rng tail) with a magenta corner.
    expect(testText(tree, 'tide-territory')).toBe('Territory amber')
    expect(cellsWith(tree, 'amber-captured')).toBe(143)

    await press(tree, 'Choose magenta')
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(2)
    expect(testText(tree, 'result-outcome')).toBe('Cleared')
  })
})

describe('Chromatic Tide pilot — Stage-1 save contract', () => {
  test('a provisional pending result becomes server-confirmed saved', async () => {
    let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseSave = resolve
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

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
  })

  test('NETWORK_ERROR stays honest about a possibly-committed request and never re-POSTs', async () => {
    submitScore.mockResolvedValue({ success: false, code: 'NETWORK_ERROR' })
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toContain(
      'may still have been saved'
    )
    expect(renderedText(tree)).not.toContain('Score saved')
    // No retry path: the single POST is all there ever was.
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a 401 shows the sign-in CTA for future scores only', async () => {
    submitScore.mockResolvedValue({
      success: false,
      code: 'UNAUTHENTICATED',
    })
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toBe(
      'Score not saved — you are signed out.'
    )
    expect(renderedText(tree)).not.toContain('Score saved')

    await press(tree, 'Sign in to save future scores')
    expect(mockPush).toHaveBeenCalledWith('/sign-in')
    // The CTA routes to sign-in; it never re-submits the finished run.
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a code-less failure falls back to the generic unconfirmed message', async () => {
    submitScore.mockRejectedValue(new Error('transport threw'))
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(testText(tree, 'result-save-status')).toBe('Score not confirmed')
    expect(renderedText(tree)).not.toContain('Score saved')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('Chromatic Tide pilot — reward forwarding', () => {
  test('a successful save routes rewards into one banner without duplicating them', async () => {
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [ACHIEVEMENT],
      challengeUpdates: CHALLENGE_UPDATES,
    })
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(tree.root.findByProps({ testID: 'reward-banner' })).toBeTruthy()
    expect(renderedText(tree).match(/Tide Turner/g)).toHaveLength(1)
    expect(renderedText(tree).match(/Flood the board/g)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Achievement unlocked')
    expect(renderedText(tree)).toContain('Challenge complete')
    // The result sheet stays outcome/score/save-status — no reward copy.
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })

  test('an error response delivers no rewards', async () => {
    submitScore.mockResolvedValue({ success: false, code: 'NETWORK_ERROR' })
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    await press(tree, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()

    expect(tree.root.findAllByProps({ testID: 'reward-banner' })).toHaveLength(
      0
    )
    expect(renderedText(tree)).not.toContain('Achievement unlocked')
    expect(renderedText(tree)).not.toContain('Challenge complete')
  })

  test('a same-account quick replay during an in-flight save keeps the old-run reward visible once', async () => {
    const pendingSaves: Array<(value: ScoreSubmissionResult) => void> = []
    submitScore.mockImplementation(
      () =>
        new Promise(resolve => {
          pendingSaves.push(resolve)
        })
    )
    const tree = await render(<NativeGameHost gameId={GameID.CHROMATIC_TIDE} />)

    // Run 1 finishes; its save stays in flight.
    await press(tree, 'Start game')
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()
    expect(renderedText(tree)).toContain('Saving score…')

    // Quick replay starts run 2 before run 1's save resolves.
    await press(tree, 'Play again')
    expect(testText(tree, 'tide-moves')).toBe('Moves 0')

    await act(async () => {
      pendingSaves[0]?.({
        success: true,
        newAchievements: [ACHIEVEMENT],
      })
    })
    await drain()

    // The stale run's committed reward is still shown — exactly once.
    expect(renderedText(tree).match(/Tide Turner/g)).toHaveLength(1)
    // Its stale result never becomes run 2's result sheet.
    expect(tree.root.findAllByProps({ testID: 'final-score' })).toHaveLength(0)
    expect(submitScore).toHaveBeenCalledTimes(1)

    // Run 2 finishes with its own clean save; the banner still shows the
    // old-run reward exactly once (no duplicate delivery).
    await act(async () => {
      void createdGames[0].end()
    })
    await drain()
    await act(async () => {
      pendingSaves[1]?.({ success: true })
    })
    await drain()
    expect(renderedText(tree)).toContain('Score saved')
    expect(renderedText(tree).match(/Tide Turner/g)).toHaveLength(1)
  })

  test('a new-account remount drops the previous account reward banner', async () => {
    submitScore.mockResolvedValue({
      success: true,
      newAchievements: [ACHIEVEMENT],
    })
    const treeA = await render(
      <NativeGameHost gameId={GameID.CHROMATIC_TIDE} />
    )

    await press(treeA, 'Start game')
    await act(async () => {
      await createdGames[0].end()
    })
    await drain()
    expect(renderedText(treeA).match(/Tide Turner/g)).toHaveLength(1)

    // The play route remounts the keyed host on an identity change.
    await unmount(treeA)
    const treeB = await render(
      <NativeGameHost gameId={GameID.CHROMATIC_TIDE} />
    )

    expect(treeB.root.findAllByProps({ testID: 'reward-banner' })).toHaveLength(
      0
    )
    expect(renderedText(treeB)).not.toContain('Tide Turner')
    expect(
      treeB.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })
})
