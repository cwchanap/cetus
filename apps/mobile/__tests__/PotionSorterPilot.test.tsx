import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { createStableProjector } from '@cetus/app-core'
import { PotionSorterGame } from '@cetus/games/potion-sorter/PotionSorterGame'
import { POTION_SORTER_PRESETS } from '@cetus/games/potion-sorter/levels'
import {
  isPotionSorterSolved,
  pourPotion,
} from '@cetus/games/potion-sorter/puzzle'
import type {
  PotionSorterPreset,
  PotionSorterState,
  PotionTube,
} from '@cetus/games/potion-sorter/types'
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

// The native Select reads safe-area insets for its bottom sheet; the
// host tree has no SafeAreaProvider under TestRenderer.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES, type NativeGamePort } from '../src/games/registry'
const submitScore = jest.mocked(api.submitScore)

const createdGames: PotionSorterGame[] = []
const originalEntry = NATIVE_GAMES[GameID.POTION_SORTER]
const originalPort = originalEntry?.port

/** Per-test model config: tests swap the puzzle preset (timeout uses a
 *  1-second duration; the dead-end test uses a crafted 3-tube board);
 *  `null` keeps the production Medium preset untouched. */
let pilotPreset: PotionSorterPreset | null = null

beforeAll(() => {
  if (!originalPort) {
    throw new Error('Potion Sorter registry port missing')
  }
  // Production port (view, projector, outcome label); only the model's
  // own preset knob is overridden per test.
  NATIVE_GAMES[GameID.POTION_SORTER] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new PotionSorterGame({
          ...deps,
          ...(pilotPreset ? { preset: pilotPreset } : {}),
        })
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.POTION_SORTER] = originalEntry
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
  game: PotionSorterGame,
  predicate: (state: PotionSorterState) => boolean,
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
  throw new Error(`waitFor timed out with result ${game.getState().result}`)
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

/** The tube Pressable for an index — the composite node that owns the
 *  raw onPress prop (jest-expo renders several nodes carrying the same
 *  testID). Tube testIDs encode the visual state, so match all three. */
const tubeNode = (
  tree: TestRenderer.ReactTestRenderer,
  index: number
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.type === 'function' &&
      typeof node.props.testID === 'string' &&
      /^ps-tube-(idle|selected|complete)-\d+$/.test(node.props.testID) &&
      Number(node.props.testID.split('-').pop()) === index &&
      typeof node.props.onPress === 'function'
  )[0]

const tubeState = (
  tree: TestRenderer.ReactTestRenderer,
  index: number
): 'idle' | 'selected' | 'complete' =>
  tubeNode(tree, index).props.testID.split('-')[2] as
    'idle' | 'selected' | 'complete'

/** Count distinct tube testIDs (jest-expo duplicates testIDs across
 *  composite/host nodes; unique ids are the honest tube count). */
const tubeCount = (tree: TestRenderer.ReactTestRenderer): number =>
  new Set(
    tree.root
      .findAll(
        node =>
          typeof node.type === 'string' &&
          typeof node.props.testID === 'string' &&
          /^ps-tube-(idle|selected|complete)-\d+$/.test(node.props.testID)
      )
      .map(node => node.props.testID)
  ).size

/** The Undo Button's inner Pressable — the composite node carrying
 *  the merged variant classes (the Button wrapper itself only sees the
 *  caller's className). */
const undoPressable = (
  tree: TestRenderer.ReactTestRenderer
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.type === 'function' &&
      node.props.accessibilityLabel === 'Undo' &&
      typeof node.props.className === 'string' &&
      node.props.className.includes('flex-row')
  )[0]

/** Does `node` sit inside an ancestor satisfying `predicate`? */
const hasAncestor = (
  node: TestRenderer.ReactTestInstance,
  predicate: (candidate: TestRenderer.ReactTestInstance) => boolean
): boolean => {
  let current = node.parent
  while (current) {
    if (predicate(current)) {
      return true
    }
    current = current.parent
  }
  return false
}

/** Colored layer testIDs of one tube, top slot → bottom slot. */
const layersOfTube = (
  tree: TestRenderer.ReactTestRenderer,
  index: number
): Array<string | undefined> =>
  tree.root
    .findAll(
      node =>
        typeof node.type === 'string' &&
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('ps-layer-') &&
        hasAncestor(
          node,
          candidate =>
            typeof candidate.props.testID === 'string' &&
            /^ps-tube-(idle|selected|complete)-\d+$/.test(
              candidate.props.testID
            ) &&
            Number(candidate.props.testID.split('-').pop()) === index
        )
    )
    .map(node => node.props.testID)

const tapTube = async (tree: TestRenderer.ReactTestRenderer, index: number) => {
  const tube = tubeNode(tree, index)
  await act(async () => {
    tube.props.onPress()
  })
}

/** Solve the given tube layout with the REAL pour rules (the package's
 *  own `pourPotion`/`isPotionSorterSolved`); returns the pour pairs the
 *  test taps through. Deterministic: presets are frozen constants. */
const planSolution = (start: PotionTube[]): Array<[number, number]> => {
  const seen = new Set([JSON.stringify(start)])
  const queue: Array<{ tubes: PotionTube[]; moves: Array<[number, number]> }> =
    [{ tubes: start, moves: [] }]
  while (queue.length > 0) {
    const node = queue.shift() as {
      tubes: PotionTube[]
      moves: Array<[number, number]>
    }
    if (isPotionSorterSolved(node.tubes)) {
      return node.moves
    }
    for (let source = 0; source < node.tubes.length; source++) {
      for (
        let destination = 0;
        destination < node.tubes.length;
        destination++
      ) {
        if (source === destination) {
          continue
        }
        const next = pourPotion(node.tubes, source, destination)
        if (!next) {
          continue
        }
        const key = JSON.stringify(next.tubes)
        if (seen.has(key)) {
          continue
        }
        seen.add(key)
        queue.push({
          tubes: next.tubes,
          moves: [...node.moves, [source, destination]],
        })
      }
    }
  }
  throw new Error('preset has no solution')
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
  pilotPreset = null
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
})

describe('Potion Sorter board — render', () => {
  test('renders the 7-tube medium board idle with parity labels and disabled tubes', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)

    expect(tubeCount(tree)).toBe(7)
    // Web tube-label parity: contents read bottom → top.
    expect(tubeNode(tree, 0).props.accessibilityLabel).toBe(
      'Tube 1: Magenta, Magenta, Amber, Cyan'
    )
    expect(tubeNode(tree, 5).props.accessibilityLabel).toBe('Tube 6: empty')
    expect(tubeNode(tree, 0).props.accessibilityRole).toBe('button')
    expect(tubeNode(tree, 0).props.accessibilityState.disabled).toBe(true)
    expect(tubeState(tree, 0)).toBe('idle')

    expect(testText(tree, 'ps-status')).toBe('Ready.')
    expect(testText(tree, 'ps-moves')).toBe('Moves 0')
    expect(testText(tree, 'ps-undos')).toBe('Undos 0')
    expect(renderedText(tree)).toContain('Medium')

    // Idle difficulty select is usable; Undo has no history yet.
    expect(
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props
        .accessibilityState.disabled
    ).toBe(false)
    expect(undoPressable(tree).props.accessibilityState.disabled).toBe(true)
    expect(undoPressable(tree).props.className).not.toContain(
      'border-cetus-accent-3'
    )
  })

  test('renders the four liquid layers stacked bottom-up with parity colors', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)

    // Tube 1 holds Magenta, Magenta, Amber, Cyan (bottom → top). The
    // tube column renders the top slot first, so the colored children
    // read Cyan, Amber, Magenta, Magenta — the bottom layer is last.
    expect(layersOfTube(tree, 0)).toEqual([
      'ps-layer-cyan',
      'ps-layer-amber',
      'ps-layer-magenta',
      'ps-layer-magenta',
    ])
    // Empty tube 6 renders its four slots without any liquid.
    expect(layersOfTube(tree, 5)).toEqual([])
    // Medium preset: five tubes × four layers are visible.
    expect(
      tree.root.findAll(
        node =>
          typeof node.type === 'string' &&
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('ps-layer-')
      )
    ).toHaveLength(20)
  })
})

describe('Potion Sorter board — input', () => {
  test('selecting a source tube calls activateTube(index) and shows the selection', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]
    const activateTube = jest.spyOn(game, 'activateTube')

    await press(tree, 'Start game')
    await tapTube(tree, 0)

    expect(activateTube).toHaveBeenCalledTimes(1)
    expect(activateTube).toHaveBeenCalledWith(0)
    expect(tubeState(tree, 0)).toBe('selected')
    expect(tubeNode(tree, 0).props.accessibilityState.selected).toBe(true)
    expect(testText(tree, 'ps-status')).toBe('Selected tube 1.')
    expect(game.getState().selectedTubeIndex).toBe(0)
  })

  test('a correct pour moves the visible layers, bumps Moves and clears the selection', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await tapTube(tree, 0) // top run: one Cyan
    await tapTube(tree, 5) // empty tube → legal pour

    expect(game.getState().movesMade).toBe(1)
    expect(game.getState().selectedTubeIndex).toBeNull()
    expect(testText(tree, 'ps-moves')).toBe('Moves 1')
    expect(testText(tree, 'ps-status')).toBe('Potion poured.')
    // The copied projection surfaces the moved layer: tube 1 lost its
    // top Cyan, tube 6 gained one at the bottom.
    expect(tubeNode(tree, 0).props.accessibilityLabel).toBe(
      'Tube 1: Magenta, Magenta, Amber'
    )
    expect(tubeNode(tree, 5).props.accessibilityLabel).toBe('Tube 6: Cyan')
    // The moved Cyan sits in tube 6's BOTTOM slot (last rendered child).
    expect(layersOfTube(tree, 5)).toEqual(['ps-layer-cyan'])
    // One pour of history exists: Undo becomes usable.
    expect(undoPressable(tree).props.accessibilityState.disabled).toBe(false)
  })

  test('an illegal pour keeps the source selected, says so and counts no move', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    // Tapping an empty tube as the source is rejected outright.
    await tapTube(tree, 5)
    expect(testText(tree, 'ps-status')).toBe('That pour is not allowed.')
    expect(game.getState().selectedTubeIndex).toBeNull()

    // Tube 1 tops with Cyan, tube 5 tops with Amber → mismatched pour.
    await tapTube(tree, 0)
    await tapTube(tree, 4)
    expect(testText(tree, 'ps-status')).toBe('That pour is not allowed.')
    expect(game.getState().selectedTubeIndex).toBe(0)
    expect(game.getState().movesMade).toBe(0)
    expect(tubeState(tree, 0)).toBe('selected')
    expect(testText(tree, 'ps-moves')).toBe('Moves 0')
  })

  test('tapping the selected tube again deselects it', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await tapTube(tree, 0)
    await tapTube(tree, 0)

    expect(game.getState().selectedTubeIndex).toBeNull()
    expect(tubeState(tree, 0)).toBe('idle')
    expect(testText(tree, 'ps-status')).toBe('Selection cleared.')
  })
})

describe('Potion Sorter board — undo', () => {
  test('undo restores the previous layout, counts an Undo and empties the history', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]
    const undo = jest.spyOn(game, 'undo')

    await press(tree, 'Start game')
    await tapTube(tree, 0)
    await tapTube(tree, 5) // pour 1: tube 1 → [M,M,A], tube 6 → [C]
    await tapTube(tree, 1)
    await tapTube(tree, 5) // pour 2: tube 2 → [A,V,V], tube 6 → [C,C]
    expect(game.getState().movesMade).toBe(2)

    await press(tree, 'Undo')
    expect(undo).toHaveBeenCalledTimes(1)
    expect(game.getState().tubes[1]).toEqual([
      'amber',
      'violet',
      'violet',
      'cyan',
    ])
    expect(game.getState().tubes[5]).toEqual(['cyan'])
    expect(game.getState().undosUsed).toBe(1)
    expect(testText(tree, 'ps-undos')).toBe('Undos 1')
    expect(testText(tree, 'ps-status')).toBe('Last pour undone.')
    // Undo does not refund the move counter (model behavior).
    expect(game.getState().movesMade).toBe(2)
    expect(undoPressable(tree).props.accessibilityState.disabled).toBe(false)

    // Undo back to the very first state: history empties, button locks.
    await press(tree, 'Undo')
    expect(game.getState().tubes[0]).toEqual([
      'magenta',
      'magenta',
      'amber',
      'cyan',
    ])
    expect(game.getState().tubes[5]).toEqual([])
    expect(game.getState().undosUsed).toBe(2)
    expect(undoPressable(tree).props.accessibilityState.disabled).toBe(true)
    // Undoing with an empty history is a no-op.
    await press(tree, 'Undo')
    expect(game.getState().undosUsed).toBe(2)
  })
})

describe('Potion Sorter board — difficulty', () => {
  test('the difficulty Select calls newGame(difficulty) and rebuilds the tubes while idle only', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]
    const newGame = jest.spyOn(game, 'newGame')

    await act(async () => {
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props.onPress()
    })
    const hard = tree.root.findByProps({
      accessibilityRole: 'menuitem',
      accessibilityLabel: 'Hard',
    })
    await act(async () => {
      hard.props.onPress()
    })

    expect(newGame).toHaveBeenCalledWith('hard')
    expect(game.getState().difficulty).toBe('hard')
    expect(game.getState().tubes).toHaveLength(9)
    expect(tubeCount(tree)).toBe(9)
    expect(testText(tree, 'ps-moves')).toBe('Moves 0')

    // While a run is active the Select locks (newGame would be rejected
    // by the model anyway).
    await press(tree, 'Start game')
    expect(
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props
        .accessibilityState.disabled
    ).toBe(true)
  })
})

describe('Potion Sorter board — dead end', () => {
  test('a dead-ending pour announces it and emphasizes Undo; undoing clears the emphasis', async () => {
    // Crafted 3-tube board: pouring tube 1's Amber onto tube 3 dead-ends
    // (no empties left, no matching tops) — one tap away.
    pilotPreset = {
      difficulty: 'easy',
      duration: 60,
      moveTarget: 10,
      completionBase: 1000,
      initialTubes: [
        ['cyan', 'magenta', 'amber'],
        ['magenta', 'cyan'],
        ['amber'],
      ],
    }
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    expect(undoPressable(tree).props.className).not.toContain(
      'border-cetus-accent-3'
    )

    await tapTube(tree, 0)
    await tapTube(tree, 2)
    expect(testText(tree, 'ps-status')).toBe('No pours left — undo or reset.')
    expect(game.getState().tubes).toEqual([
      ['cyan', 'magenta'],
      ['magenta', 'cyan'],
      ['amber', 'amber'],
    ])
    // Dead-end emphasis (web data-dead-end parity) on a usable Undo.
    expect(undoPressable(tree).props.className).toContain(
      'border-cetus-accent-3'
    )
    expect(undoPressable(tree).props.accessibilityState.disabled).toBe(false)

    await press(tree, 'Undo')
    expect(testText(tree, 'ps-status')).toBe('Last pour undone.')
    expect(undoPressable(tree).props.className).not.toContain(
      'border-cetus-accent-3'
    )
  })
})

describe('Potion Sorter board — finish and reset', () => {
  test('solving the puzzle banks the score once and replays fresh', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    // Plan over the frozen medium preset with the package's own rules,
    // then tap the pours through the real board.
    const moves = planSolution(
      POTION_SORTER_PRESETS.medium.initialTubes.map(tube => [...tube])
    )
    expect(moves.length).toBeGreaterThan(0)
    for (const [source, destination] of moves) {
      await tapTube(tree, source)
      await tapTube(tree, destination)
    }

    expect(game.getState().result).toBe('solved')
    expect(testText(tree, 'result-outcome')).toBe('Solved')
    expect(Number(testText(tree, 'final-score'))).toBeGreaterThan(0)
    expect(testText(tree, 'ps-moves')).toBe(`Moves ${moves.length}`)

    await settle()
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.POTION_SORTER,
        platform: 'ios',
        gameData: expect.objectContaining({
          difficulty: 'medium',
          solved: true,
          movesMade: moves.length,
          undosUsed: 0,
        }),
      })
    )
    expect(renderedText(tree)).toContain('Score saved')

    // Replay: fresh preset tubes, no second save for the finished run.
    await press(tree, 'Play again')
    expect(game.getState().tubes).toEqual(
      POTION_SORTER_PRESETS.medium.initialTubes
    )
    expect(testText(tree, 'ps-moves')).toBe('Moves 0')
    expect(testText(tree, 'ps-status')).toBe('Ready.')
    await tapTube(tree, 0)
    expect(testText(tree, 'ps-status')).toBe('Selected tube 1.')
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a timeout ends unsolved with score zero and one save', async () => {
    pilotPreset = { ...POTION_SORTER_PRESETS.medium, duration: 1 }
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await tapTube(tree, 0) // hold a selection when the clock runs out
    await waitFor(game, state => state.isGameOver)

    expect(game.getState().result).toBe('timeout')
    expect(game.getState().selectedTubeIndex).toBeNull()
    expect(testText(tree, 'result-outcome')).toBe('Timeout')
    expect(Number(testText(tree, 'final-score'))).toBe(0)
    expect(tubeNode(tree, 0).props.accessibilityState.disabled).toBe(true)

    await settle()
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameData: expect.objectContaining({ solved: false }),
      })
    )
    expect(renderedText(tree)).toContain('Score saved')
  })

  test('a mid-run reset restores the preset board without saving', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.POTION_SORTER} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await tapTube(tree, 0)
    await tapTube(tree, 5)
    expect(game.getState().movesMade).toBe(1)

    await press(tree, 'Reset game')
    expect(game.getState().tubes).toEqual(
      POTION_SORTER_PRESETS.medium.initialTubes
    )
    expect(game.getState().selectedTubeIndex).toBeNull()
    expect(game.getState().movesMade).toBe(0)
    expect(testText(tree, 'ps-moves')).toBe('Moves 0')
    expect(testText(tree, 'ps-status')).toBe('Ready.')
    expect(renderedText(tree)).not.toContain('Run complete')
    expect(submitScore).not.toHaveBeenCalled()

    // The fresh board plays normally.
    await press(tree, 'Start game')
    await tapTube(tree, 0)
    expect(testText(tree, 'ps-status')).toBe('Selected tube 1.')
  })
})

describe('Potion Sorter board — projection stability', () => {
  test('timer ticks keep the projection reference; a pour changes it', async () => {
    const game = new PotionSorterGame({
      submitScore: async () => ({ success: true }),
      platform: 'ios',
    })
    const port = originalPort as NativeGamePort
    const project = createStableProjector((state: BaseGameState) =>
      port.project(state, game as unknown as BaseGame)
    )

    game.start()
    const afterStart = project(game.getState())

    // One countdown tick: timeRemaining changes, no visible tube does —
    // the stable projector hands back the SAME reference.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })
    expect(project(game.getState())).toBe(afterStart)

    // A pour must surface as a NEW projection.
    game.activateTube(0)
    game.activateTube(5)
    const afterPour = project(game.getState()) as { movesMade: number }
    expect(afterPour).not.toBe(afterStart)
    expect(afterPour.movesMade).toBe(1)

    game.destroy()
  })
})
