import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { GameID } from '@cetus/shared/games'
import { TetrisGame } from '@cetus/games/tetris/TetrisGame'
import type { Piece } from '@cetus/games/tetris/types'
import { rotateMatrix } from '@cetus/games/tetris/utils'

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
    Path: shape('Path'),
  }
})

import * as mockApiModule from '../src/test/mockApiModule'
import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES } from '../src/games/registry'

const submitScore = jest.mocked(api.submitScore)

const createdGames: TetrisGame[] = []
const originalEntry = NATIVE_GAMES[GameID.TETRIS]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Tetris registry port missing')
  }
  NATIVE_GAMES[GameID.TETRIS] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new TetrisGame({
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
  NATIVE_GAMES[GameID.TETRIS] = originalEntry
})

let rafQueue: Array<{ id: number; cb: (time: number) => void }> = []
let nextRafId = 1
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
  // jest-expo renders each Text twice (wrapper + host) and the passing
  // testID prop also lands on the component, so scope to Text nodes.
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
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 640 } },
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

const CELL = 30
const pieceRects = (tree: TestRenderer.ReactTestRenderer) =>
  shapes(tree, 'Rect').filter(props => props.width === CELL - 2)

const boardLabel = (tree: TestRenderer.ReactTestRenderer): string =>
  String(
    tree.root.findByProps({ testID: 'tetris-board' }).props.accessibilityLabel
  )

const panHandlers = (
  tree: TestRenderer.ReactTestRenderer
): Record<string, (event: unknown, success?: boolean) => void> =>
  tree.root.findByType(GestureDetector).props.gesture.handlers

const beginSwipe = (tree: TestRenderer.ReactTestRenderer) => {
  act(() => {
    panHandlers(tree).onBegin({
      translationX: 0,
      translationY: 0,
    })
  })
}

const endSwipe = (
  tree: TestRenderer.ReactTestRenderer,
  translationX: number,
  translationY: number,
  success = true
) => {
  act(() => {
    panHandlers(tree).onFinalize({ translationX, translationY }, success)
  })
}

const swipe = (
  tree: TestRenderer.ReactTestRenderer,
  translationX: number,
  translationY: number,
  success = true
) => {
  beginSwipe(tree)
  endSwipe(tree, translationX, translationY, success)
}

beforeEach(() => {
  submitScore.mockReset()
  submitScore.mockResolvedValue({ success: true })
  createdGames.length = 0
  mockPush.mockReset()
  rafQueue = []
  nextRafId = 1
  now = 1_000_000
  // Every generated piece is a T: the rotation assertion needs a shape
  // that actually changes when rotated.
  jest.spyOn(Math, 'random').mockReturnValue(0.3)
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextRafId++
    rafQueue.push({ id, cb })
    return id
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => {
    rafQueue = rafQueue.filter(entry => entry.id !== id)
  })
  jest.spyOn(Date, 'now').mockImplementation(() => now)
})

afterEach(async () => {
  for (const tree of trees.splice(0)) {
    await act(async () => {
      tree.unmount()
    })
  }
  jest.restoreAllMocks()
})

/** Fill the spawn row so the next piece tops out. */
const blockSpawnRow = (game: TetrisGame) => {
  const state = game.getState()
  for (const column of [3, 4, 5, 6]) {
    state.board[0][column] = 0xff0000
  }
}

/** Model-required piece accessors: a missing piece fails the test here
 *  instead of a non-null assertion warning. */
const requirePiece = (piece: Piece | null): Piece => {
  if (piece === null) {
    throw new Error('expected a piece')
  }
  return piece
}

const currentPiece = (game: TetrisGame): Piece =>
  requirePiece(game.getState().currentPiece)

const nextPiece = (game: TetrisGame): Piece =>
  requirePiece(game.getState().nextPiece)

const heldPiece = (game: TetrisGame): Piece =>
  requirePiece(game.getState().heldPiece)

describe('Tetris pilot — board', () => {
  test('renders the idle 10×20 field, next/hold previews and an elapsed clock', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)

    const game = createdGames[0]
    const nextType = nextPiece(game).type

    // The model counts down from MAX_SAFE_INTEGER; the chrome must show the
    // projected elapsed clock instead of a 285-million-hour countdown.
    expect(game.getState().timeRemaining).toBe(Number.MAX_SAFE_INTEGER)
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(testText(tree, 'tetris-level')).toBe('Level 1')
    expect(testText(tree, 'tetris-lines')).toBe('Lines 0')
    expect(testText(tree, 'tetris-next')).toBe(`Next ${nextType}`)
    expect(testText(tree, 'tetris-hold')).toBe('Hold —')

    // The empty field draws only its background cell.
    expect(shapes(tree, 'Rect')).toHaveLength(1)
    expect(shapes(tree, 'Path')).toHaveLength(1)

    const label = boardLabel(tree)
    expect(label).toContain('Tetris board, 10 by 20.')
    expect(label).toContain('Waiting to start.')
    expect(label).toContain(`Next ${nextType}.`)
    expect(label).toContain('Hold empty.')

    for (const label of [
      'Move left',
      'Move right',
      'Soft drop',
      'Rotate piece',
      'Hold piece',
      'Hard drop',
    ]) {
      expect(
        tree.root.findByProps({ accessibilityLabel: label }).props.disabled
      ).toBe(true)
    }
  })

  test('start spawns the falling piece and the model Date.now gravity drops it', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)

    const spawned = currentPiece(game)
    const spawnedY = spawned.y
    expect(spawned.type).toBe('T')
    expect(pieceRects(tree)).toHaveLength(4)
    const top = Math.min(...pieceRects(tree).map(props => props.y as number))
    expect(top).toBe(spawnedY * CELL + 1)

    const label = boardLabel(tree)
    expect(label).toContain('Level 1, 0 lines cleared.')
    expect(label).toContain(
      'Falling T: row 1 column 5; row 2 columns 4, 5 and 6.'
    )
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Rotate piece' }).props
        .disabled
    ).toBe(false)

    // Gravity keeps the model's Date.now() clock: no delta plumbing needed.
    now += 1001
    fireFrame(32)
    expect(currentPiece(game).y).toBe(spawnedY + 1)
    const dropped = Math.min(
      ...pieceRects(tree).map(props => props.y as number)
    )
    expect(dropped).toBe(top + CELL)
  })

  test('the chrome HUD reads projected.clock elapsed time, not the countdown duration', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)

    await press(tree, 'Start game')
    fireFrame(16)
    now += 65_000
    // Any model state change republishes the projection; the projected
    // clock is read from the live timer.
    await press(tree, 'Move left')
    fireFrame(32)

    expect(createdGames[0].getState().timeRemaining).toBe(
      Number.MAX_SAFE_INTEGER
    )
    expect(testText(tree, 'game-time')).toBe('1:05')
  })

  test('a labelled Rotate control rotates the falling piece', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    const before = currentPiece(game)
    const beforeShape = before.shape.map(row => [...row])
    const beforeX = before.x
    const beforeY = before.y
    const beforeLabel = boardLabel(tree)
    const expected = rotateMatrix(beforeShape)

    await press(tree, 'Rotate piece')
    fireFrame(32)

    const after = currentPiece(game)
    expect(after.shape).toEqual(expected)
    expect(after.shape).not.toEqual(beforeShape)
    expect(after.x).toBe(beforeX)
    expect(after.y).toBe(beforeY)
    // Same origin, different orientation: the accessible state must change.
    const rotatedLabel = boardLabel(tree)
    expect(beforeLabel).toContain(
      'Falling T: row 1 column 5; row 2 columns 4, 5 and 6.'
    )
    expect(rotatedLabel).toContain(
      'Falling T: row 1 column 4; row 2 columns 4 and 5; row 3 column 4.'
    )
    expect(rotatedLabel).not.toBe(beforeLabel)
  })

  test('the board description exposes occupied rows and stack gaps', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    const state = game.getState()
    const live = game as unknown as { state: { needsRedraw: boolean } }
    for (const column of [0, 1, 2, 3]) {
      state.board[19][column] = 0xff0000
    }
    live.state.needsRedraw = true
    fireFrame(32)
    const filled = boardLabel(tree)
    expect(filled).toContain('Row 20: columns 1, 2, 3 and 4.')

    // Same occupied count, different gap: a blind player can tell them apart.
    state.board[19][1] = null
    state.board[19][2] = null
    live.state.needsRedraw = true
    fireFrame(48)
    const gapped = boardLabel(tree)
    expect(gapped).toContain('Row 20: columns 1 and 4.')
    expect(gapped).not.toContain('Row 20: columns 1, 2, 3 and 4.')
    expect(gapped).not.toBe(filled)
  })

  test('fits the field to available height and scrolls when space is tight', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const scroll = tree.root.findByType(ScrollView)
    const setViewport = (width: number, height: number) => {
      act(() => {
        scroll.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width, height } },
        })
      })
    }
    const fieldWidth = () =>
      StyleSheet.flatten(
        tree.root.findByProps({ testID: 'tetris-board' }).props.style
      ).width as number

    setViewport(390, 800)
    expect(fieldWidth()).toBe(234)

    setViewport(390, 500)
    expect(fieldWidth()).toBe(175)

    // Below the static reserve the field keeps a usable floor and the
    // ScrollView carries the overflow (for example enlarged text).
    setViewport(390, 200)
    expect(fieldWidth()).toBe(120)
  })

  test('swipes move once each; down soft-drops; cancelled and duplicate gestures do nothing', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    const start = currentPiece(game)
    expect(start.x).toBe(3)
    expect(start.y).toBe(0)

    swipe(tree, -40, 0)
    expect(currentPiece(game).x).toBe(2)
    swipe(tree, 40, 0)
    expect(currentPiece(game).x).toBe(3)
    swipe(tree, 0, 40)
    expect(currentPiece(game).y).toBe(1)

    // Cancelled pan: the finger left the board / the scroll took over.
    swipe(tree, -40, 0, false)
    expect(currentPiece(game).x).toBe(3)

    // A duplicate final callback for one gesture must not move twice.
    beginSwipe(tree)
    endSwipe(tree, -40, 0)
    expect(currentPiece(game).x).toBe(2)
    endSwipe(tree, -40, 0)
    expect(currentPiece(game).x).toBe(2)

    // An upward swipe has no bound command.
    swipe(tree, 0, -40)
    expect(currentPiece(game).y).toBe(1)
  })

  test('a Hold swaps once per piece and is refused until the piece locks', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    const first = currentPiece(game)
    const upcoming = nextPiece(game)

    await press(tree, 'Hold piece')
    fireFrame(32)
    let state = game.getState()
    expect(heldPiece(game).type).toBe(first.type)
    expect(state.currentPiece).toBe(upcoming)
    expect(state.holdUsed).toBe(true)
    expect(testText(tree, 'tetris-hold')).toBe(`Hold ${first.type}`)
    expect(boardLabel(tree)).toContain('used this piece')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Hold piece' }).props.disabled
    ).toBe(true)

    // A second hold before the piece locks is refused by the model, even
    // when a stale press reaches the control.
    const held = state.heldPiece
    await press(tree, 'Hold piece')
    state = game.getState()
    expect(state.heldPiece).toBe(held)
    expect(state.currentPiece).toBe(upcoming)

    await press(tree, 'Hard drop')
    fireFrame(48)
    state = game.getState()
    expect(state.holdUsed).toBe(false)
    expect(state.stats.pieces).toBe(1)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Hold piece' }).props.disabled
    ).toBe(false)

    await press(tree, 'Hold piece')
    fireFrame(64)
    expect(currentPiece(game).type).toBe(first.type)
  })

  test('pause sleeps the loop; resume keeps the model Date.now gravity', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    const y = currentPiece(game).y

    await press(tree, 'Pause game')
    fireFrame(32)
    expect(game.getState().isPaused).toBe(true)
    expect(renderedText(tree)).toContain('paused')
    // The loop is asleep: no frame is queued and no model update runs.
    expect(rafQueue).toHaveLength(0)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Rotate piece' }).props
        .disabled
    ).toBe(true)

    now += 10_000
    expect(currentPiece(game).y).toBe(y)

    await press(tree, 'Resume game')
    expect(game.getState().isPaused).toBe(false)
    now += 1001
    fireFrame(48)
    expect(currentPiece(game).y).toBe(y + 1)
  })
})

describe('Tetris pilot — run result', () => {
  test('top-out ends the run, posts one score with stats and shows the result sheet', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    blockSpawnRow(game)

    await press(tree, 'Hard drop')
    fireFrame(32)
    await drain()

    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.TETRIS,
        platform: 'ios',
        gameData: expect.objectContaining({
          lines: 0,
          level: 1,
          piecesPlaced: 1,
        }),
      })
    )
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(tree.root.findByProps({ testID: 'final-score' })).toBeTruthy()
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Rotate piece' }).props
        .disabled
    ).toBe(true)
  })

  test('a mid-run reset returns to an empty idle board without saving', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    expect(pieceRects(tree)).toHaveLength(4)

    await press(tree, 'Reset game')
    fireFrame(32)

    const state = game.getState()
    expect(state.isActive).toBe(false)
    expect(state.isGameOver).toBe(false)
    expect(state.lines).toBe(0)
    expect(state.board.flat().every(cell => cell === null)).toBe(true)
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(pieceRects(tree)).toHaveLength(0)
    expect(boardLabel(tree)).toContain('Waiting to start.')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('replay after a top-out starts a clean run and the finished run saves once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.TETRIS} />)
    fireLayouts(tree)
    const game = createdGames[0]

    await press(tree, 'Start game')
    fireFrame(16)
    blockSpawnRow(game)
    await press(tree, 'Hard drop')
    fireFrame(32)
    await drain()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    fireFrame(48)

    const state = game.getState()
    expect(state.isActive).toBe(true)
    expect(state.isGameOver).toBe(false)
    expect(state.score).toBe(0)
    expect(state.lines).toBe(0)
    expect(state.heldPiece).toBeNull()
    expect(state.holdUsed).toBe(false)
    expect(state.board.flat().every(cell => cell === null)).toBe(true)
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(pieceRects(tree)).toHaveLength(4)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})
