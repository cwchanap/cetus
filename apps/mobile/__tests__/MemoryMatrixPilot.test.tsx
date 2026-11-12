import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet, Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { createStableProjector } from '@cetus/app-core'
import { MemoryMatrixGame } from '@cetus/games/memory-matrix/MemoryMatrixGame'
import type { BaseGame, BaseGameState } from '@cetus/games'

jest.mock('../src/lib/api', () => mockApiModule)

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    canGoBack: jest.fn(),
  }),
}))

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES, type NativeGamePort } from '../src/games/registry'
import { BOARD_MIN_WIDTH } from '../src/games/boards/MemoryMatrixBoard'
const submitScore = jest.mocked(api.submitScore)

const createdGames: MemoryMatrixGame[] = []
const originalEntry = NATIVE_GAMES[GameID.MEMORY_MATRIX]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Memory Matrix registry port missing')
  }
  // Production port (view, projector, outcome label) with only the flip
  // delay shortened so real-timer drains settle the model's own delayed
  // match check — the view never imposes timing of its own.
  NATIVE_GAMES[GameID.MEMORY_MATRIX] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new MemoryMatrixGame({
          ...deps,
          flipDelay: 20,
        })
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.MEMORY_MATRIX] = originalEntry
})

const FLIP_DELAY = 20

const trees: Array<TestRenderer.ReactTestRenderer> = []

// Settle the model's configured flip delay (3x margin, tide-pilot style).
const drain = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, FLIP_DELAY * 3 + 15))
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

interface CardPosition {
  row: number
  col: number
}

const pressCard = async (
  tree: TestRenderer.ReactTestRenderer,
  position: CardPosition
) => {
  const card = tree.root.findByProps({
    testID: `mm-card-down-r${position.row}c${position.col}`,
  })
  await act(async () => {
    card.props.onPress()
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

/** Count rendered native elements by testID. jest-expo mocks render a
 *  React wrapper AND a host-tag element carrying the same props, so
 *  count host-tag elements only — one per actually rendered node. */
const countViews = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): number =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(node => node.props.testID === testID).length

/** Count cards whose testID carries the given visual state suffix. */
const cardsInState = (
  tree: TestRenderer.ReactTestRenderer,
  state: 'down' | 'up' | 'matched'
): number =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith(`mm-card-${state}-`)
    ).length

/** Positions of every card grouped two-by-two into matching pairs, read
 *  off the live model board (the shuffle is random; the shapes are not). */
const matchingPairs = (
  game: MemoryMatrixGame
): Array<[CardPosition, CardPosition]> => {
  const byShape = new Map<string, CardPosition[]>()
  game.getBoard().forEach((row, rowIdx) =>
    row.forEach((card, colIdx) => {
      const positions = byShape.get(card.shape) ?? []
      positions.push({ row: rowIdx, col: colIdx })
      byShape.set(card.shape, positions)
    })
  )
  const pairs: Array<[CardPosition, CardPosition]> = []
  for (const positions of byShape.values()) {
    for (let i = 0; i + 1 < positions.length; i += 2) {
      pairs.push([positions[i], positions[i + 1]])
    }
  }
  return pairs
}

/** Two positions holding different shapes: a guaranteed mismatch. */
const mismatchPair = (game: MemoryMatrixGame): [CardPosition, CardPosition] => {
  const board = game.getBoard()
  const first = { row: 0, col: 0 }
  const firstShape = board[0][0].shape
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (board[row][col].shape !== firstShape) {
        return [first, { row, col }]
      }
    }
  }
  throw new Error('board has a single shape — cannot build a mismatch')
}

/** Any position outside the given pair, for bystander assertions. */
const thirdPosition = (
  game: MemoryMatrixGame,
  ...used: CardPosition[]
): CardPosition => {
  const board = game.getBoard()
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (!used.some(p => p.row === row && p.col === col)) {
        return { row, col }
      }
    }
  }
  throw new Error('board has no third position')
}

/** First host-tag element carrying the testID (jest-expo double-render —
 *  see countViews). */
const hostView = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node => typeof node.type === 'string' && node.props.testID === testID
  )[0]

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

describe('Memory Matrix pilot — board', () => {
  test('renders the 6×8 board fully face down, disabled while idle', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)

    expect(countViews(tree, 'mm-row')).toBe(6)
    expect(cardsInState(tree, 'down')).toBe(48)
    expect(cardsInState(tree, 'up')).toBe(0)
    expect(cardsInState(tree, 'matched')).toBe(0)
    expect(testText(tree, 'mm-matched')).toBe('Matched 0 / 24')

    const card = tree.root.findByProps({ testID: 'mm-card-down-r0c0' })
    expect(card.props.accessibilityRole).toBe('button')
    expect(card.props.accessibilityLabel).toBe(
      'Card row 1, column 1, face down'
    )
    expect(card.props.disabled).toBe(true)
  })

  test('narrow screens scroll horizontally instead of shrinking cards below the 44pt touch target', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)

    // At a 320pt viewport the old w-full board compressed cards to ~35pt.
    // The board now has a minimum width (8 cols × 44pt HIG target + 7 1px
    // gaps) and lives in a horizontal scroller so nothing shrinks below it.
    const scroller = hostView(tree, 'mm-board-scroller')
    expect(scroller.props.horizontal).toBe(true)

    const board = hostView(tree, 'mm-board')
    const { minWidth } = StyleSheet.flatten(board.props.style)
    expect(minWidth).toBe(BOARD_MIN_WIDTH)
    // (minWidth − 7 gaps) / 8 columns keeps every card ≥ 44×44.
    expect((BOARD_MIN_WIDTH - 7) / 8).toBeGreaterThanOrEqual(44)
  })

  test('the production port keeps the configured 700ms flip delay', () => {
    // The pilot suite shortens the delay for its own games; the shipped
    // port must still configure the model's real flip delay.
    expect(originalPort).toBeDefined()
    const game = (originalPort as NativeGamePort).createGame({
      submitScore: async () => ({ success: true }),
      platform: 'ios',
    })
    expect(game).toBeInstanceOf(MemoryMatrixGame)
    expect((game as MemoryMatrixGame).getConfig().flipDelay).toBe(700)
    game.destroy()
  })

  test('a card tap calls flipCard({row,col}) and the in-place flip reaches the board', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)
    const game = createdGames[0]
    const flipCard = jest.spyOn(game, 'flipCard')

    await press(tree, 'Start game')
    expect(
      tree.root.findByProps({ testID: 'mm-card-down-r0c0' }).props.disabled
    ).toBe(false)

    await pressCard(tree, { row: 0, col: 0 })
    expect(flipCard).toHaveBeenCalledWith({ row: 0, col: 0 })

    // The model flips card.isFlipped in place; the projection's copied
    // cell values surface it without a board reference.
    expect(cardsInState(tree, 'up')).toBe(1)
    expect(cardsInState(tree, 'down')).toBe(47)
    const flipped = tree.root.findByProps({ testID: 'mm-card-up-r0c0' })
    expect(flipped.props.accessibilityRole).toBe('image')
    expect(flipped.props.accessibilityLabel).toBe(
      `Card row 1, column 1, face up, ${game.getBoard()[0][0].shape}`
    )
  })

  test('a two-card delayed mismatch clears the flipped visuals', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)
    const game = createdGames[0]
    const [a, b] = mismatchPair(game)

    await press(tree, 'Start game')
    await pressCard(tree, a)
    await pressCard(tree, b)
    expect(cardsInState(tree, 'up')).toBe(2)
    expect(testText(tree, 'mm-matched')).toBe('Matched 0 / 24')

    // Processing window: every other card is blocked while the model
    // holds its configured flip delay.
    const bystanderPos = thirdPosition(game, a, b)
    const bystander = tree.root.findByProps({
      testID: `mm-card-down-r${bystanderPos.row}c${bystanderPos.col}`,
    })
    expect(bystander.props.disabled).toBe(true)

    await drain()
    expect(cardsInState(tree, 'up')).toBe(0)
    expect(cardsInState(tree, 'down')).toBe(48)
    expect(testText(tree, 'mm-matched')).toBe('Matched 0 / 24')
  })

  test('a matching pair stays up, counts and scores', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)
    const game = createdGames[0]
    const [a, b] = matchingPairs(game)[0]

    await press(tree, 'Start game')
    await pressCard(tree, a)
    await pressCard(tree, b)
    await drain()

    expect(cardsInState(tree, 'matched')).toBe(2)
    expect(testText(tree, 'mm-matched')).toBe('Matched 1 / 24')
    expect(renderedText(tree)).toContain('Score 100')
  })

  test('a rapid third tap is blocked during the processing window', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)
    const game = createdGames[0]
    const flipCard = jest.spyOn(game, 'flipCard')
    const [a, b] = mismatchPair(game)
    const third = thirdPosition(game, a, b)

    await press(tree, 'Start game')
    await pressCard(tree, a)
    const secondCard = tree.root.findByProps({
      testID: `mm-card-down-r${b.row}c${b.col}`,
    })
    const thirdCard = tree.root.findByProps({
      testID: `mm-card-down-r${third.row}c${third.col}`,
    })
    // Same macrotask: the flip-delay timer scheduled by the second press
    // cannot fire between the two calls, so the processing window is
    // guaranteed still open for the rapid third tap.
    await act(async () => {
      secondCard.props.onPress()
      thirdCard.props.onPress()
    })

    // The model rejects the flip outright; the board never showed it.
    expect(flipCard).toHaveBeenCalledTimes(3)
    expect(flipCard.mock.results[2].value).toBe(false)
    expect(cardsInState(tree, 'up')).toBe(2)
    expect(
      tree.root.findByProps({
        testID: `mm-card-down-r${third.row}c${third.col}`,
      })
    ).toBeTruthy()
  })

  test('a reset during the delayed match never touches the new run', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)
    const game = createdGames[0]
    const [a, b] = mismatchPair(game)

    await press(tree, 'Start game')
    await pressCard(tree, a)
    const secondCard = tree.root.findByProps({
      testID: `mm-card-down-r${b.row}c${b.col}`,
    })
    const resetButton = tree.root.findByProps({
      accessibilityLabel: 'Reset game',
    })
    // Reset in the same macrotask as the second flip: the match-check
    // timeout is still pending when reset() runs and cancels it. Had it
    // survived, its callback would fire during the drain below against
    // the fresh run's empty flippedCards.
    await act(async () => {
      secondCard.props.onPress()
      resetButton.props.onPress()
    })
    expect(testText(tree, 'mm-matched')).toBe('Matched 0 / 24')

    await drain()
    expect(cardsInState(tree, 'up')).toBe(0)
    expect(cardsInState(tree, 'down')).toBe(48)
    expect(testText(tree, 'mm-matched')).toBe('Matched 0 / 24')

    // The fresh run plays normally afterwards.
    await press(tree, 'Start game')
    await pressCard(tree, { row: 0, col: 0 })
    expect(cardsInState(tree, 'up')).toBe(1)
  })
})

describe('Memory Matrix pilot — projection stability', () => {
  test('timer ticks keep the projection reference; an in-place flip changes it', async () => {
    const game = new MemoryMatrixGame({
      submitScore: async () => ({ success: true }),
      platform: 'ios',
      flipDelay: FLIP_DELAY,
    })
    const port = originalPort as NativeGamePort
    const project = createStableProjector((state: BaseGameState) =>
      port.project(state, game as unknown as BaseGame)
    )

    game.start()
    await drain()
    const afterStart = project(game.getState())

    // One countdown tick: timeRemaining changes, no visible card does —
    // the stable projector hands back the SAME reference.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })
    const afterTick = project(game.getState())
    expect(afterTick).toBe(afterStart)

    // An in-place card mutation must surface as a NEW projection.
    game.getBoard()[0][0].isFlipped = true
    const afterFlip = project(game.getState())
    expect(afterFlip).not.toBe(afterStart)
    expect(
      (afterFlip as { cards: { isFlipped: boolean }[][] }).cards[0][0].isFlipped
    ).toBe(true)

    game.destroy()
  })
})

describe('Memory Matrix pilot — finish and replay', () => {
  // 24 real-timer pair drains (~75ms each) plus render overhead: give an
  // explicit timeout, the Jest 5s default is exceeded on a loaded machine.
  test('matching every pair finishes, saves once, and replays fresh', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MEMORY_MATRIX} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    for (const [a, b] of matchingPairs(game)) {
      await pressCard(tree, a)
      await pressCard(tree, b)
      await drain()
    }

    expect(cardsInState(tree, 'matched')).toBe(48)
    expect(testText(tree, 'mm-matched')).toBe('Matched 24 / 24')
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.MEMORY_MATRIX,
        platform: 'ios',
        gameData: { matchesFound: 24, moves: 24, perfectGame: true },
      })
    )
    expect(Number(testText(tree, 'final-score'))).toBeGreaterThanOrEqual(2400)
    expect(renderedText(tree)).toContain('Score saved')

    // Replay: a fresh board with fresh pairs, and the finished run's
    // save is never re-submitted.
    await press(tree, 'Play again')
    expect(cardsInState(tree, 'down')).toBe(48)
    expect(testText(tree, 'mm-matched')).toBe('Matched 0 / 24')

    const [a, b] = matchingPairs(createdGames[0])[0]
    await pressCard(tree, a)
    await pressCard(tree, b)
    await drain()
    expect(cardsInState(tree, 'matched')).toBe(2)
    expect(testText(tree, 'mm-matched')).toBe('Matched 1 / 24')
    expect(submitScore).toHaveBeenCalledTimes(1)
  }, 15000)
})
