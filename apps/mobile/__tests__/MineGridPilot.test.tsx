import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet, Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { createStableProjector } from '@cetus/app-core'
import { MineGridGame } from '@cetus/games/mine-grid/MineGridGame'
import type { BaseGame, BaseGameState } from '@cetus/games'

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

// The native Select reads safe-area insets for its bottom sheet; the
// host tree has no SafeAreaProvider under TestRenderer.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

import { api } from '../src/lib/api'
import { NativeGameHost } from '../src/games/NativeGameHost'
import { NATIVE_GAMES, type NativeGamePort } from '../src/games/registry'
import { BOARD_CELL_MIN } from '../src/games/boards/MineGridBoard'
const submitScore = jest.mocked(api.submitScore)

const createdGames: MineGridGame[] = []
const originalEntry = NATIVE_GAMES[GameID.MINE_GRID]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Mine Grid registry port missing')
  }
  // Production port (view, projector, outcome label); only the mine
  // layout is made deterministic — the zero-rng Fisher–Yates shuffle is
  // already validated by the model suite, and the view reads the layout
  // off the live model anyway.
  NATIVE_GAMES[GameID.MINE_GRID] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = new MineGridGame({ ...deps, rng: () => 0 })
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.MINE_GRID] = originalEntry
})

const trees: Array<TestRenderer.ReactTestRenderer> = []

const settle = async () => {
  // Let the model's async end()/score-save microtasks finish.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })
}

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

interface CellPos {
  row: number
  col: number
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

/** First host-tag element carrying the testID (jest-expo mocks render a
 *  React wrapper AND a host element with identical props — count/query
 *  host-tag elements only). Host elements carry Pressability's responder
 *  handlers, not the raw onPress/onLongPress props. */
const hostView = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node => typeof node.type === 'string' && node.props.testID === testID
  )[0]

/** The Pressable component instance for a cell: the one node that owns
 *  the raw onPress/onLongPress props (jest-expo renders several nodes
 *  carrying the same testID, so match by prop shape, not first hit). */
const pressableCell = (
  tree: TestRenderer.ReactTestRenderer,
  state: string,
  pos: CellPos
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.type === 'function' &&
      node.props.testID === `mg-cell-${state}-r${pos.row}c${pos.col}` &&
      typeof node.props.onPress === 'function'
  )[0]

const cellNode = (
  tree: TestRenderer.ReactTestRenderer,
  state: string,
  pos: CellPos
): TestRenderer.ReactTestInstance =>
  hostView(tree, `mg-cell-${state}-r${pos.row}c${pos.col}`)

/** Count cells whose testID carries the given visual state suffix. */
const cellsInState = (
  tree: TestRenderer.ReactTestRenderer,
  state: string
): number =>
  tree.root
    .findAll(node => typeof node.type === 'string')
    .filter(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith(`mg-cell-${state}-`)
    ).length

/** Press a currently hidden cell through its onPress prop. */
const pressCell = async (
  tree: TestRenderer.ReactTestRenderer,
  pos: CellPos
) => {
  const cell = pressableCell(tree, 'hidden', pos)
  await act(async () => {
    cell.props.onPress()
  })
}

/** Minimal GestureResponderEvent for driving a Pressable's responder
 *  handlers — the only supported way to exercise Pressability's own
 *  long-press cancellation in a test. `currentTarget` needs a stubbed
 *  measure(): Pressability skips the whole release transition (including
 *  onPress/cancellation) when the responder id is null. */
const responderEvent = () => ({
  nativeEvent: { touches: [], changedTouches: [] },
  currentTarget: { measure: () => {} },
  target: undefined,
  persist: () => {},
})

const shortTap = async (node: TestRenderer.ReactTestInstance) => {
  const event = responderEvent()
  await act(async () => {
    node.props.onResponderGrant(event)
    node.props.onResponderRelease(event)
  })
}

const longPress = async (node: TestRenderer.ReactTestInstance) => {
  const event = responderEvent()
  await act(async () => {
    node.props.onResponderGrant(event)
    // Pressability's default delayLongPress is 500ms; release after it.
    await new Promise(resolve => setTimeout(resolve, 600))
    node.props.onResponderRelease(event)
  })
}
const flipSwitch = async (
  tree: TestRenderer.ReactTestRenderer,
  label: string,
  value: boolean
) => {
  const node = tree.root.findByProps({
    accessibilityRole: 'switch',
    accessibilityLabel: label,
  })
  await act(async () => {
    node.props.onChange({ nativeEvent: { value } })
  })
}

const boardOf = (game: MineGridGame) => game.getState().board

/** Positions of the live model's mines / still-hidden safe cells. */
const minePositions = (game: MineGridGame): CellPos[] => {
  const positions: CellPos[] = []
  boardOf(game).forEach((row, rowIdx) =>
    row.forEach((cell, colIdx) => {
      if (cell.hasMine) {
        positions.push({ row: rowIdx, col: colIdx })
      }
    })
  )
  return positions
}

const hiddenSafePositions = (game: MineGridGame): CellPos[] => {
  const positions: CellPos[] = []
  boardOf(game).forEach((row, rowIdx) =>
    row.forEach((cell, colIdx) => {
      if (!cell.hasMine && !cell.revealed) {
        positions.push({ row: rowIdx, col: colIdx })
      }
    })
  )
  return positions
}

const anySafeHiddenPosition = (game: MineGridGame): CellPos =>
  hiddenSafePositions(game)[0]

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

describe('Mine Grid board — render', () => {
  test('renders the 10×10 medium board fully hidden and disabled while idle', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)

    expect(
      tree.root.findAll(
        node => typeof node.type === 'string' && node.props.testID === 'mg-row'
      )
    ).toHaveLength(10)
    expect(cellsInState(tree, 'hidden')).toBe(100)
    expect(cellsInState(tree, 'revealed')).toBe(0)
    expect(cellsInState(tree, 'flagged')).toBe(0)
    expect(testText(tree, 'mg-flags')).toBe('Flags 0 / 15')
    expect(renderedText(tree)).toContain('Medium 10×10')

    const cell = cellNode(tree, 'hidden', { row: 0, col: 0 })
    expect(cell.props.accessibilityRole).toBe('button')
    expect(cell.props.accessibilityLabel).toBe('Row 1, column 1, hidden')
    expect(cell.props.accessibilityState.disabled).toBe(true)
    // Idle difficulty select is usable; the flag switch is rendered.
    expect(
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props
        .accessibilityState.disabled
    ).toBe(false)
    expect(
      tree.root.findByProps({
        accessibilityRole: 'switch',
        accessibilityLabel: 'Flag mode',
      })
    ).toBeTruthy()
  })

  test('narrow screens scroll horizontally instead of shrinking cells below the 44pt touch target', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)

    const scroller = hostView(tree, 'mg-board-scroller')
    expect(scroller.props.horizontal).toBe(true)

    const board = hostView(tree, 'mg-board')
    const { minWidth } = StyleSheet.flatten(board.props.style)
    const cols = 10
    expect(minWidth).toBe(cols * BOARD_CELL_MIN + (cols - 1))
    // (minWidth − 9 gaps) / 10 columns keeps every cell ≥ 44×44.
    expect((minWidth - (cols - 1)) / cols).toBeGreaterThanOrEqual(44)
  })
})

describe('Mine Grid board — input', () => {
  test('a tap calls revealCell(row,col) and the first reveal is always safe', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]
    const revealCell = jest.spyOn(game, 'revealCell')

    await press(tree, 'Start game')
    expect(
      cellNode(tree, 'hidden', { row: 0, col: 0 }).props.accessibilityState
        .disabled
    ).toBe(false)

    await pressCell(tree, { row: 0, col: 0 })
    expect(revealCell).toHaveBeenCalledWith(0, 0)

    // Lazy mine placement excludes the first revealed cell.
    const board = boardOf(game)
    expect(game.getState().minesPlaced).toBe(true)
    expect(board[0][0].hasMine).toBe(false)
    expect(board[0][0].revealed).toBe(true)
    // The projection's copied cell values surface the in-place reveal.
    const revealed = cellNode(tree, 'revealed', { row: 0, col: 0 })
    expect(revealed.props.accessibilityLabel).toBe(
      `Row 1, column 1, ${board[0][0].adjacentMines} adjacent mines`
    )
    expect(revealed.props.accessibilityState.disabled).toBe(true)
  })

  test('a successful long press flags directly and Pressability suppresses the trailing onPress', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]
    const revealCell = jest.spyOn(game, 'revealCell')
    const toggleFlag = jest.spyOn(game, 'toggleFlag')

    await press(tree, 'Start game')
    const pos = { row: 0, col: 1 }

    // Grant → hold past delayLongPress (500ms) → release: a real long
    // press through Pressability itself. Its own cancellation must drop
    // the trailing onPress — the board keeps no suppression state.
    await longPress(cellNode(tree, 'hidden', pos))
    expect(toggleFlag).toHaveBeenCalledTimes(1)
    expect(toggleFlag).toHaveBeenCalledWith(pos.row, pos.col)
    expect(revealCell).not.toHaveBeenCalled()
    expect(cellsInState(tree, 'flagged')).toBe(1)
    expect(cellNode(tree, 'flagged', pos).props.accessibilityLabel).toBe(
      'Row 1, column 2, flagged'
    )
    expect(testText(tree, 'mg-flags')).toBe('Flags 1 / 15')

    // Control: a short responder tap on another cell still reveals — the
    // suppression comes from Pressability's long-press state machine, not
    // from a view-level flag.
    const other = anySafeHiddenPosition(game)
    await shortTap(cellNode(tree, 'hidden', other))
    expect(revealCell).toHaveBeenCalledTimes(1)
    expect(revealCell).toHaveBeenCalledWith(other.row, other.col)
    expect(toggleFlag).toHaveBeenCalledTimes(1)
  })

  test('the Flag mode Toggle routes taps to toggleFlag and back', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]
    const revealCell = jest.spyOn(game, 'revealCell')
    const toggleFlag = jest.spyOn(game, 'toggleFlag')

    await press(tree, 'Start game')
    await flipSwitch(tree, 'Flag mode', true)
    const pos = { row: 0, col: 2 }
    await pressCell(tree, pos)
    expect(toggleFlag).toHaveBeenCalledWith(pos.row, pos.col)
    expect(revealCell).not.toHaveBeenCalled()
    expect(cellsInState(tree, 'flagged')).toBe(1)

    // Switch back to Reveal mode: the same tap now reveals.
    await flipSwitch(tree, 'Flag mode', false)
    const other = anySafeHiddenPosition(game)
    await pressCell(tree, other)
    expect(revealCell).toHaveBeenCalledWith(other.row, other.col)
    expect(toggleFlag).toHaveBeenCalledTimes(1)
  })

  test('the difficulty Select calls newGame(difficulty) and rebuilds the grid while idle only', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]
    const newGame = jest.spyOn(game, 'newGame')

    await act(async () => {
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props.onPress()
    })
    const hard = tree.root.findByProps({
      accessibilityRole: 'menuitem',
      accessibilityLabel: 'Hard 12×12',
    })
    await act(async () => {
      hard.props.onPress()
    })
    expect(newGame).toHaveBeenCalledWith('hard')
    expect(game.getState().difficulty).toBe('hard')
    expect(
      tree.root.findAll(
        node => typeof node.type === 'string' && node.props.testID === 'mg-row'
      )
    ).toHaveLength(12)
    expect(cellsInState(tree, 'hidden')).toBe(144)
    expect(testText(tree, 'mg-flags')).toBe('Flags 0 / 24')
    expect(renderedText(tree)).toContain('Hard 12×12')

    // While a run is active the Select is disabled (newGame would be
    // rejected by the model anyway).
    await press(tree, 'Start game')
    expect(
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props
        .accessibilityState.disabled
    ).toBe(true)
  })
})

describe('Mine Grid board — flag accounting, finish and reset', () => {
  test('a bad flag on a safe cell counts an incorrect flag action', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await pressCell(tree, { row: 0, col: 0 }) // mines materialize, safe

    const pos = anySafeHiddenPosition(game)
    await longPress(cellNode(tree, 'hidden', pos))
    expect(game.getState().incorrectFlagActions).toBe(1)
    expect(game.getState().flagsPlaced).toBe(1)
    expect(testText(tree, 'mg-flags')).toBe('Flags 1 / 15')

    // Unflagging does not refund the mistake; the counter is monotonic.
    const flagged = pressableCell(tree, 'flagged', pos)
    await act(async () => {
      flagged.props.onLongPress()
    })
    expect(game.getState().flagsPlaced).toBe(0)
    expect(game.getState().incorrectFlagActions).toBe(1)
    expect(testText(tree, 'mg-flags')).toBe('Flags 0 / 15')
  })

  test('revealing a mine ends the run with every mine shown and one save', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await pressCell(tree, { row: 0, col: 0 }) // safe first reveal
    const mine = minePositions(game)[0]
    await pressCell(tree, mine)

    expect(game.getState().result).toBe('mine')
    expect(game.getState().isGameOver).toBe(true)
    // Timeout/mine-end parity: every mine is revealed to the player.
    expect(cellsInState(tree, 'mine')).toBe(15)
    expect(testText(tree, 'result-outcome')).toBe('Mine hit')
    expect(Number(testText(tree, 'final-score'))).toBe(0)

    await settle()
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.MINE_GRID,
        platform: 'ios',
        gameData: expect.objectContaining({ cleared: false }),
      })
    )
    expect(renderedText(tree)).toContain('Score saved')
  })

  test('clearing every safe cell wins, saves once, and replays fresh', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    await pressCell(tree, { row: 0, col: 0 }) // safe first reveal
    // Flood reveals cascade; walk the remaining hidden safe cells. Each
    // press re-reads the model so already-revealed cells are skipped.
    for (let guard = 0; guard < 200; guard++) {
      const remaining = hiddenSafePositions(game)
      if (remaining.length === 0) {
        break
      }
      await pressCell(tree, remaining[0])
    }
    expect(hiddenSafePositions(game)).toHaveLength(0)

    await settle()
    expect(game.getState().result).toBe('cleared')
    expect(testText(tree, 'result-outcome')).toBe('Cleared')
    expect(Number(testText(tree, 'final-score'))).toBeGreaterThan(0)
    expect(renderedText(tree)).toContain('Score saved')
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.MINE_GRID,
        platform: 'ios',
        gameData: expect.objectContaining({
          difficulty: 'medium',
          cleared: true,
        }),
      })
    )

    // Replay: fresh hidden board, no second save for the finished run.
    await press(tree, 'Play again')
    expect(cellsInState(tree, 'hidden')).toBe(100)
    expect(testText(tree, 'mg-flags')).toBe('Flags 0 / 15')
    await pressCell(tree, { row: 0, col: 0 })
    expect(cellsInState(tree, 'revealed')).toBeGreaterThanOrEqual(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a mid-run reset restores a fresh hidden board and Reveal mode', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.MINE_GRID} />)
    const game = createdGames[0]
    const revealCell = jest.spyOn(game, 'revealCell')
    const toggleFlag = jest.spyOn(game, 'toggleFlag')

    await press(tree, 'Start game')
    await pressCell(tree, { row: 0, col: 0 }) // mines materialize
    await flipSwitch(tree, 'Flag mode', true)
    const pos = anySafeHiddenPosition(game)
    await pressCell(tree, pos)
    expect(cellsInState(tree, 'flagged')).toBe(1)

    await press(tree, 'Reset game')
    const state = game.getState()
    expect(state.minesPlaced).toBe(false)
    expect(state.result).toBe('playing')
    expect(state.incorrectFlagActions).toBe(0)
    expect(cellsInState(tree, 'hidden')).toBe(100)
    expect(testText(tree, 'mg-flags')).toBe('Flags 0 / 15')
    expect(renderedText(tree)).not.toContain('Run complete')

    // The idle transition restored Reveal mode: the next tap reveals.
    await press(tree, 'Start game')
    await pressCell(tree, { row: 3, col: 3 })
    expect(revealCell).toHaveBeenCalledWith(3, 3)
    expect(toggleFlag).toHaveBeenCalledTimes(1)
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Mine Grid board — projection stability', () => {
  test('timer ticks keep the projection reference; an in-place reveal changes it', async () => {
    const game = new MineGridGame({
      submitScore: async () => ({ success: true }),
      platform: 'ios',
      rng: () => 0,
    })
    const port = originalPort as NativeGamePort
    const project = createStableProjector((state: BaseGameState) =>
      port.project(state, game as unknown as BaseGame)
    )

    game.start()
    const afterStart = project(game.getState())

    // One countdown tick: timeRemaining changes, no visible cell does —
    // the stable projector hands back the SAME reference.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })
    expect(project(game.getState())).toBe(afterStart)

    // An in-place cell mutation must surface as a NEW projection.
    game.getState().board[4][5].flagged = true
    const afterFlag = project(game.getState()) as {
      cells: Array<Array<{ flagged: boolean }>>
    }
    expect(afterFlag).not.toBe(afterStart)
    expect(afterFlag.cells[4][5].flagged).toBe(true)

    game.destroy()
  })
})
