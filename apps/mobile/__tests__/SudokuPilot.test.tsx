import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet, Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { createStableProjector } from '@cetus/app-core'
import { SudokuGame } from '@cetus/games/sudoku/SudokuGame'
import type { SudokuState } from '@cetus/games/sudoku/frameworkTypes'
import { isValidMove } from '@cetus/games/sudoku/utils'
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
import {
  BOARD_CELL_MIN,
  sudokuGridRenders,
} from '../src/games/boards/SudokuGrid'
const submitScore = jest.mocked(api.submitScore)

const createdGames: SudokuGame[] = []
const originalEntry = NATIVE_GAMES[GameID.SUDOKU]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('Sudoku registry port missing')
  }
  // Production port (view, projector, outcome label); only the created
  // instance is captured so tests can read the live model.
  NATIVE_GAMES[GameID.SUDOKU] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = originalPort.createGame(deps) as SudokuGame
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.SUDOKU] = originalEntry
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
 *  host-tag elements only). */
const hostView = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node => typeof node.type === 'string' && node.props.testID === testID
  )[0]

/** First host-tag element carrying the accessibility label. */
const hostByLabel = (
  tree: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label
  )[0]

/** The Pressable component instance for a cell: the one node that owns
 *  the raw onPress prop (jest-expo renders several nodes carrying the
 *  same testID, so match by prop shape, not first hit). */
const pressableCell = (
  tree: TestRenderer.ReactTestRenderer,
  state: string,
  pos: CellPos
): TestRenderer.ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.type === 'function' &&
      node.props.testID === `sudoku-cell-${state}-r${pos.row}c${pos.col}` &&
      typeof node.props.onPress === 'function'
  )[0]

const cellLabel = (
  tree: TestRenderer.ReactTestRenderer,
  state: string,
  pos: CellPos
): string =>
  hostView(tree, `sudoku-cell-${state}-r${pos.row}c${pos.col}`).props
    .accessibilityLabel as string

/** The complete expected accessibility label for a cell — exact match, so
 *  a coordinate digit can never stand in for a displayed number. */
const fullCellLabel = (pos: CellPos, value: string, ...extra: string[]) =>
  [`Row ${pos.row + 1}, column ${pos.col + 1}`, value, ...extra].join(', ')

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
        node.props.testID.startsWith(`sudoku-cell-${state}-`)
    ).length

/** Press a cell through its onPress prop. */
const pressCell = async (
  tree: TestRenderer.ReactTestRenderer,
  state: string,
  pos: CellPos
) => {
  const cell = pressableCell(tree, state, pos)
  await act(async () => {
    cell.props.onPress()
  })
}

/** The live model's number grid (0 for empty) — feeding the package's
 *  own isValidMove keeps the tests free of duplicated Sudoku rules. */
const modelGrid = (game: SudokuGame): number[][] =>
  game.getState().grid.cells.map(row => row.map(cell => cell.value ?? 0))

/** First empty cell where `num` is a legal placement. */
const findValidPlacement = (
  game: SudokuGame,
  num: number
): CellPos | undefined => {
  const grid = modelGrid(game)
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0 && isValidMove(grid, row, col, num)) {
        return { row, col }
      }
    }
  }
  return undefined
}

/** First empty cell and a value that already sits in its row (a
 *  guaranteed conflict). */
const findConflictPlacement = (
  game: SudokuGame
): { pos: CellPos; num: number } | undefined => {
  const grid = modelGrid(game)
  for (let row = 0; row < 9; row++) {
    const col = grid[row].indexOf(0)
    if (col === -1) {
      continue
    }
    const duplicate = grid[row].find(value => value !== 0)
    if (duplicate) {
      return { pos: { row, col }, num: duplicate }
    }
  }
  return undefined
}

const givenPosition = (game: SudokuGame): CellPos => {
  const cells = game.getState().grid.cells
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (cells[row][col].isGiven) {
        return { row, col }
      }
    }
  }
  throw new Error('no given cell found')
}

const emptyPosition = (game: SudokuGame): CellPos => {
  const cells = game.getState().grid.cells
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (cells[row][col].value === null) {
        return { row, col }
      }
    }
  }
  throw new Error('no empty cell found')
}

/** A known-valid solved grid used to seed a one-move finish. */
const SOLVED_GRID: number[][] = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
]

/** Overwrite the live model's grid with a solved-minus-one puzzle
 * (protected-state cast; same precedent as the registry tests). */
const seedSolvedMinusOne = (game: SudokuGame) => {
  const state = (game as unknown as { state: SudokuState }).state
  state.grid.cells = SOLVED_GRID.map((row, rowIndex) =>
    row.map((value, colIndex) => ({
      value: rowIndex === 0 && colIndex === 0 ? null : value,
      isGiven: !(rowIndex === 0 && colIndex === 0),
      isHighlighted: false,
      isConflicting: false,
    }))
  )
  state.grid.selectedCell = null
}

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

describe('Sudoku board — render', () => {
  test('renders the 9×9 medium board locked while idle with the full pad', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)

    expect(
      tree.root.findAll(
        node =>
          typeof node.type === 'string' && node.props.testID === 'sudoku-row'
      )
    ).toHaveLength(9)
    // 81 cells across the idle visual states (given clues + plain empties).
    expect(cellsInState(tree, 'given') + cellsInState(tree, 'plain')).toBe(81)
    expect(testText(tree, 'sudoku-mistakes')).toBe('Mistakes 0')
    expect(renderedText(tree)).toContain('Medium')

    const given = givenPosition(createdGames[0])
    const cell = hostView(tree, `sudoku-cell-given-r${given.row}c${given.col}`)
    expect(cell.props.accessibilityRole).toBe('button')
    expect(cell.props.accessibilityLabel).toContain('given')
    // Idle: cells and pad disabled, difficulty usable.
    expect(cell.props.accessibilityState.disabled).toBe(true)
    expect(hostByLabel(tree, 'Place 5').props.accessibilityState.disabled).toBe(
      true
    )
    expect(hostByLabel(tree, 'Erase').props.accessibilityState.disabled).toBe(
      true
    )
    expect(
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props
        .accessibilityState.disabled
    ).toBe(false)

    // Every pad button 1–9 exists.
    for (let n = 1; n <= 9; n++) {
      expect(
        tree.root.findAllByProps({ accessibilityLabel: `Place ${n}` }).length
      ).toBeGreaterThan(0)
    }
  })

  test('narrow screens scroll horizontally instead of shrinking cells below the 44pt touch target', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)

    const scroller = hostView(tree, 'sudoku-board-scroller')
    expect(scroller.props.horizontal).toBe(true)

    const board = hostView(tree, 'sudoku-board')
    const { minWidth } = StyleSheet.flatten(board.props.style)
    const cols = 9
    expect(minWidth).toBe(cols * BOARD_CELL_MIN + (cols - 1))
    expect((minWidth - (cols - 1)) / cols).toBeGreaterThanOrEqual(44)
  })
})

describe('Sudoku board — input', () => {
  test('a tap calls selectCell(row,col), highlighting the related 20 cells', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]
    const selectCell = jest.spyOn(game, 'selectCell')

    await press(tree, 'Start game')
    const pos = emptyPosition(game)
    await pressCell(tree, 'plain', pos)
    expect(selectCell).toHaveBeenCalledWith(pos.row, pos.col)

    // 8 row + 8 column + 4 box cells highlight; the selection itself is
    // its own visual state.
    expect(cellsInState(tree, 'highlight')).toBe(20)
    expect(cellsInState(tree, 'selected')).toBe(1)
    // Selection is exposed to assistive technology: the target reads
    // selected, its related cells do not.
    expect(
      hostView(tree, `sudoku-cell-selected-r${pos.row}c${pos.col}`).props
        .accessibilityState.selected
    ).toBe(true)
    const siblingCol = pos.col === 0 ? 1 : 0
    expect(
      hostView(tree, `sudoku-cell-highlight-r${pos.row}c${siblingCol}`).props
        .accessibilityState.selected
    ).toBe(false)
    expect(
      hostView(tree, `sudoku-cell-selected-r${pos.row}c${pos.col}`).props
        .accessibilityState.disabled
    ).toBe(false)

    // Tapping the selected cell again deselects (web parity).
    await pressCell(tree, 'selected', pos)
    expect(cellsInState(tree, 'highlight')).toBe(0)
    expect(cellsInState(tree, 'selected')).toBe(0)
    expect(
      hostView(tree, `sudoku-cell-plain-r${pos.row}c${pos.col}`).props
        .accessibilityState.selected
    ).toBe(false)
  })

  test('a pad press calls placeNumber(num) and a valid number lands visibly', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]
    const placeNumber = jest.spyOn(game, 'placeNumber')

    await press(tree, 'Start game')
    const num = 1
    const pos = findValidPlacement(game, num)
    expect(pos).toBeDefined()
    if (!pos) {
      return
    }
    await pressCell(tree, 'plain', pos)
    await press(tree, `Place ${num}`)
    expect(placeNumber).toHaveBeenCalledWith(num)

    // The placed number surfaces through the projection; the model
    // cleared selection + highlights after the placement.
    expect(cellLabel(tree, 'plain', pos)).toBe(fullCellLabel(pos, String(num)))
    expect(cellsInState(tree, 'selected')).toBe(0)
    expect(cellsInState(tree, 'highlight')).toBe(0)
    expect(testText(tree, 'sudoku-mistakes')).toBe('Mistakes 0')
  })

  test('a conflicting number marks the cell and counts the mistake', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const conflict = findConflictPlacement(game)
    expect(conflict).toBeDefined()
    if (!conflict) {
      return
    }
    await pressCell(tree, 'plain', conflict.pos)
    await press(tree, `Place ${conflict.num}`)

    expect(game.getState().mistakes).toBe(1)
    expect(testText(tree, 'sudoku-mistakes')).toBe('Mistakes 1')
    expect(cellsInState(tree, 'conflict')).toBe(1)
    const label = cellLabel(tree, 'conflict', conflict.pos)
    expect(label).toContain(String(conflict.num))
    expect(label).toContain('conflicting')
    // Web parity: conflicting cells get the red treatment.
    expect(
      String(
        hostView(
          tree,
          `sudoku-cell-conflict-r${conflict.pos.row}c${conflict.pos.col}`
        ).props.className
      )
    ).toContain('red')
  })

  test('Erase calls clearSelectedCell() and removes a placed number', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]
    const clearSelectedCell = jest.spyOn(game, 'clearSelectedCell')

    await press(tree, 'Start game')
    const num = 2
    const pos = findValidPlacement(game, num)
    if (!pos) {
      throw new Error('no valid placement for 2')
    }
    await pressCell(tree, 'plain', pos)
    await press(tree, `Place ${num}`)
    expect(cellLabel(tree, 'plain', pos)).toBe(fullCellLabel(pos, String(num)))

    // Select the filled cell again, then erase it.
    await pressCell(tree, 'plain', pos)
    await press(tree, 'Erase')
    expect(clearSelectedCell).toHaveBeenCalledTimes(1)
    expect(game.getState().grid.cells[pos.row][pos.col].value).toBeNull()
    expect(cellLabel(tree, 'plain', pos)).toContain('empty')
  })

  test('given cells select for highlighting but lock number placement and erase', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]
    const placeNumber = jest.spyOn(game, 'placeNumber')
    const clearSelectedCell = jest.spyOn(game, 'clearSelectedCell')

    await press(tree, 'Start game')
    const pos = givenPosition(game)
    const originalValue = game.getState().grid.cells[pos.row][pos.col].value

    // Given cells stay selectable (web parity: row/box highlighting).
    await pressCell(tree, 'given', pos)
    expect(cellsInState(tree, 'selected')).toBe(1)

    // The model locks placement and erase on a given cell: both calls
    // run, neither changes the board nor clears the selection.
    const wrongNumber = originalValue === 5 ? 4 : 5
    await press(tree, `Place ${wrongNumber}`)
    expect(placeNumber).toHaveBeenCalledWith(wrongNumber)
    await press(tree, 'Erase')
    expect(clearSelectedCell).toHaveBeenCalledTimes(1)
    expect(game.getState().grid.cells[pos.row][pos.col].value).toBe(
      originalValue
    )
    expect(cellsInState(tree, 'selected')).toBe(1)
    expect(cellLabel(tree, 'selected', pos)).toBe(
      fullCellLabel(pos, String(originalValue), 'given')
    )
  })

  test('the difficulty Select calls newGame(difficulty) while idle only', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
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
    expect(renderedText(tree)).toContain('Hard')

    // While a run is active the Select locks (web parity).
    await press(tree, 'Start game')
    expect(
      tree.root.findByProps({ accessibilityRole: 'combobox' }).props
        .accessibilityState.disabled
    ).toBe(true)
  })
})

describe('Sudoku board — pause, finish and reset', () => {
  test('pausing disables the board and freezes the clock; resume re-enables both', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const pos = emptyPosition(game)
    await pressCell(tree, 'plain', pos)
    expect(
      hostView(tree, `sudoku-cell-selected-r${pos.row}c${pos.col}`).props
        .accessibilityState.disabled
    ).toBe(false)

    await press(tree, 'Pause game')
    expect(
      hostView(tree, `sudoku-cell-selected-r${pos.row}c${pos.col}`).props
        .accessibilityState.disabled
    ).toBe(true)
    expect(hostByLabel(tree, 'Place 1').props.accessibilityState.disabled).toBe(
      true
    )

    // No timer events while paused: the clock stays frozen.
    const frozen = testText(tree, 'game-time')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200))
    })
    expect(testText(tree, 'game-time')).toBe(frozen)

    await press(tree, 'Resume game')
    expect(
      hostView(tree, `sudoku-cell-selected-r${pos.row}c${pos.col}`).props
        .accessibilityState.disabled
    ).toBe(false)
  })

  test('placing the last correct number finishes the run with one save, then replays fresh', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]
    await act(async () => {
      seedSolvedMinusOne(game)
    })

    await press(tree, 'Start game')
    // The seeded board renders: 80 givens, one plain empty cell.
    expect(cellsInState(tree, 'given')).toBe(80)
    await pressCell(tree, 'plain', { row: 0, col: 0 })
    await press(tree, 'Place 5')

    await settle()
    expect(game.getState().isComplete).toBe(true)
    expect(game.getState().isGameOver).toBe(true)
    expect(testText(tree, 'result-outcome')).toBe('Solved')
    expect(Number(testText(tree, 'final-score'))).toBeGreaterThan(0)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: GameID.SUDOKU,
        platform: 'ios',
        gameData: { difficulty: 'medium', cellsFilled: 81, hintsUsed: 0 },
      })
    )
    expect(renderedText(tree)).toContain('Score saved')

    // Replay clears to a fresh puzzle with no second save; the new board
    // plays normally.
    await press(tree, 'Play again')
    expect(game.getState().isActive).toBe(true)
    expect(game.getState().isComplete).toBe(false)
    expect(cellsInState(tree, 'selected')).toBe(0)
    await pressCell(tree, 'plain', emptyPosition(game))
    expect(cellsInState(tree, 'selected')).toBe(1)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a mid-run reset restores a fresh puzzle and clears selection and mistakes', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    const num = 3
    const pos = findValidPlacement(game, num)
    if (!pos) {
      throw new Error('no valid placement for 3')
    }
    await pressCell(tree, 'plain', pos)
    await press(tree, `Place ${num}`)
    expect(cellLabel(tree, 'plain', pos)).toBe(fullCellLabel(pos, String(num)))

    await press(tree, 'Reset game')
    const state = game.getState()
    expect(state.isActive).toBe(false)
    expect(state.mistakes).toBe(0)
    expect(state.grid.selectedCell).toBeNull()
    expect(state.score).toBe(0)
    expect(cellsInState(tree, 'selected')).toBe(0)
    expect(renderedText(tree)).not.toContain('Run complete')

    // The reset board plays normally.
    await press(tree, 'Start game')
    await pressCell(tree, 'plain', emptyPosition(game))
    expect(cellsInState(tree, 'selected')).toBe(1)
    expect(submitScore).not.toHaveBeenCalled()
  })
})

describe('Sudoku board — clock-only ticks and the memoized grid', () => {
  test('timer ticks update the HUD clock without re-rendering the 81-cell grid', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)
    const game = createdGames[0]

    await press(tree, 'Start game')
    // Let the start transition (the canAct flip opens the memo) settle.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })
    const gridRendersAtStart = sudokuGridRenders.count
    expect(gridRendersAtStart).toBeGreaterThan(0)

    // Two+ clock-only ticks: the HUD time advances while the memoized
    // grid's render count stays put.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2200))
    })
    expect(testText(tree, 'game-time')).not.toBe('00:00')
    expect(sudokuGridRenders.count).toBe(gridRendersAtStart)

    // A real grid change (selection highlight) re-opens the memo.
    await pressCell(tree, 'plain', emptyPosition(game))
    expect(sudokuGridRenders.count).toBe(gridRendersAtStart + 1)
  })

  test('the grid reference the memo receives stays identical across clock-only ticks', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.SUDOKU} />)

    await press(tree, 'Start game')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })
    const gridAtStart = renderedGridSnapshot(tree)

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2200))
    })
    expect(renderedGridSnapshot(tree)).toBe(gridAtStart)
  })
})

/** The grid snapshot the memoized grid component last rendered with
 *  (matched by prop shape — it is the only element carrying the stable
 *  `onSelectCell` callback plus its `grid`/`canAct` props). */
function renderedGridSnapshot(tree: TestRenderer.ReactTestRenderer): unknown {
  const node = tree.root.findAll(
    node_ =>
      typeof node_.props?.onSelectCell === 'function' &&
      node_.props?.grid !== undefined &&
      node_.props?.canAct !== undefined
  )[0]
  if (!node) {
    throw new Error('memoized grid element not found')
  }
  return node.props.grid
}

describe('Sudoku projection stability', () => {
  test('clock ticks change the top-level projection but keep the grid reference; an in-place edit changes it', async () => {
    const game = new SudokuGame({
      submitScore: async () => ({ success: true }),
      platform: 'ios',
    })
    const port = originalPort as NativeGamePort
    const project = createStableProjector((state: BaseGameState) =>
      port.project(state, game as unknown as BaseGame)
    )

    game.start()
    const afterStart = project(game.getState())

    // One clock tick: the count-up HUD moved, so the TOP-LEVEL
    // projection is new…
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })
    const afterTick = project(game.getState())
    expect(afterTick.clock).toBeGreaterThan(0)
    expect(afterTick).not.toBe(afterStart)
    // …but the separately stabilized grid keeps its reference.
    expect(afterTick.grid).toBe(afterStart.grid)

    // An in-place number edit must surface as a NEW grid snapshot.
    const cells = (game as unknown as { state: SudokuState }).state.grid.cells
    const flatIndex = cells.flat().findIndex(cell => cell.value === null)
    cells[Math.floor(flatIndex / 9)][flatIndex % 9].value = 7
    const afterEdit = project(game.getState())
    expect(afterEdit.grid).not.toBe(afterTick.grid)

    game.destroy()
  })
})
