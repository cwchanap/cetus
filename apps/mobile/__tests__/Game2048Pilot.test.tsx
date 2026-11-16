import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import * as Reanimated from 'react-native-reanimated'
import { GameID } from '@cetus/shared/games'
import { Game2048 } from '@cetus/games/2048/Game2048'
import type { Game2048State } from '@cetus/games/2048/frameworkTypes'
import type { Board, Tile } from '@cetus/games/2048/types'
import { canMove } from '@cetus/games/2048/utils'

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

const submitScore = jest.mocked(api.submitScore)

const createdGames: Game2048[] = []
const originalEntry = NATIVE_GAMES[GameID.GAME_2048]
const originalPort = originalEntry?.port
beforeAll(() => {
  if (!originalPort) {
    throw new Error('2048 registry port missing')
  }
  NATIVE_GAMES[GameID.GAME_2048] = {
    port: {
      ...originalPort,
      createGame: deps => {
        const game = originalPort.createGame(deps) as Game2048
        createdGames.push(game)
        return game
      },
    },
  }
})
afterAll(() => {
  NATIVE_GAMES[GameID.GAME_2048] = originalEntry
})

const trees: Array<TestRenderer.ReactTestRenderer> = []

const settle = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })
}

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  await settle()
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

const testText = (
  tree: TestRenderer.ReactTestRenderer,
  testID: string
): string =>
  scalarText(
    tree.root.findByProps({ testID }).props.children as React.ReactNode
  )

const byLabel = (
  tree: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance[] =>
  tree.root.findAll(
    node =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label
  )

const fireLayout = (
  tree: TestRenderer.ReactTestRenderer,
  width = 410,
  height = 410
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

const swipe = (
  tree: TestRenderer.ReactTestRenderer,
  translationX: number,
  translationY: number
) => {
  const detector = tree.root.findByType(GestureDetector)
  act(() => {
    detector.props.gesture.handlers.onEnd({ translationX, translationY })
  })
}

interface ProjectedTile {
  id: string
  value: number
  row: number
  col: number
  pop: boolean
}

const tileElements = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll(
    node =>
      typeof node.type === 'string' &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('game-2048-tile-')
  )

const hasAccessibleAncestor = (
  node: TestRenderer.ReactTestInstance
): boolean => {
  let current = node.parent
  while (current) {
    if (typeof current.type === 'string' && current.props.accessible === true) {
      return true
    }
    current = current.parent
  }
  return false
}

const tileProp = (
  tree: TestRenderer.ReactTestRenderer,
  id: string
): ProjectedTile | undefined =>
  tree.root
    .findAll(node => (node.props.tile as ProjectedTile | undefined)?.id === id)
    .map(node => node.props.tile as ProjectedTile)[0]

const tilePosition = (
  tree: TestRenderer.ReactTestRenderer,
  id: string
): { x: number; y: number } | undefined => {
  const element = tileElements(tree).find(
    node => node.props.testID === `game-2048-tile-${id}`
  )
  if (!element) {
    return undefined
  }
  const flat = StyleSheet.flatten(element.props.style) as {
    transform?: Array<Record<string, number>>
  }
  const transforms = flat.transform ?? []
  const read = (key: string) => transforms.find(entry => key in entry)?.[key]
  return { x: read('translateX') ?? NaN, y: read('translateY') ?? NaN }
}

const makeTile = (
  id: string,
  value: number,
  row: number,
  col: number
): Tile => ({
  id,
  value,
  position: { row, col },
})

const setBoard = (game: Game2048, board: Board): void => {
  const state = (game as unknown as { state: Game2048State }).state
  state.board = board
  state.tileIdCounter = 100
  act(() => {
    game.emit('state-change', { state: game.getState() })
  })
}

const flagState = (
  game: Game2048,
  patch: Partial<Pick<Game2048State, 'won' | 'stuck' | 'maxTile'>>
): void => {
  const state = (game as unknown as { state: Game2048State }).state
  Object.assign(state, patch)
  act(() => {
    game.emit('state-change', { state: game.getState() })
  })
}

const STUCK_BOARD = (startId: number): Board => {
  const board: Board = []
  let id = startId
  for (let row = 0; row < 4; row++) {
    const line: (Tile | null)[] = []
    for (let col = 0; col < 4; col++) {
      const value = (row + col) % 2 === 0 ? 2 : 4
      line.push(makeTile(`stuck-${id++}`, value, row, col))
    }
    board.push(line)
  }
  return board
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
  jest.restoreAllMocks()
})

describe('2048 pilot — board', () => {
  test('renders the 4×4 cell grid, deals two tiles on start and counts the clock up', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)

    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(testText(tree, 'game-2048-max')).toBe('Max 0')
    expect(tileElements(tree)).toHaveLength(0)
    expect(
      tree.root.findAll(
        node =>
          typeof node.type === 'string' &&
          node.props.testID === 'game-2048-cell'
      )
    ).toHaveLength(16)
    expect(byLabel(tree, 'Finish run')).toHaveLength(0)
    const undo = byLabel(tree, 'Undo move')[0]
    expect(undo.props.accessibilityState).toMatchObject({ disabled: true })

    await press(tree, 'Start game')
    const tiles = tileElements(tree)
    expect(tiles).toHaveLength(2)
    for (const tile of tiles) {
      expect(tile.props.accessibilityLabel).toMatch(
        /^Tile \d+ row \d column \d$/
      )
    }
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(testText(tree, 'game-2048-max')).toMatch(/^Max [24]$/)

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2200))
    })
    expect(testText(tree, 'game-time')).not.toBe('0:00')
  })

  test('the swipe pan is pinned to the JS thread', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)

    const detector = tree.root.findByType(GestureDetector)
    expect(detector.props.gesture.config.runOnJS).toBe(true)
  })

  test('a horizontal swipe calls move on the live game and merges the pair', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2, 0, 0), makeTile('b', 2, 0, 1), null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    const move = jest.spyOn(game, 'move')

    swipe(tree, -50, 0)

    expect(move).toHaveBeenCalledWith('left')
    const state = game.getState()
    expect(state.moveCount).toBe(1)
    expect(state.mergeCount).toBe(1)
    expect(state.score).toBe(4)
    expect(state.board[0][0]?.value).toBe(4)

    const merged = tileProp(tree, state.board[0][0]!.id)
    expect(merged).toMatchObject({ value: 4, row: 0, col: 0, pop: true })
    expect(tilePosition(tree, state.board[0][0]!.id)).toEqual({ x: 10, y: 10 })
  })

  test('a vertical swipe slides the tile to the top of the column', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, makeTile('a', 8, 3, 2), null],
    ])
    const move = jest.spyOn(game, 'move')

    swipe(tree, 0, -50)

    expect(move).toHaveBeenCalledWith('up')
    const state = game.getState()
    expect(state.moveCount).toBe(1)
    expect(state.board[0][2]?.value).toBe(8)
    expect(state.board[3][2]?.value ?? 0).not.toBe(8)
    expect(tilePosition(tree, 'a')).toEqual({ x: 210, y: 10 })
  })

  test('a swipe that moves nothing changes neither board nor score', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2, 0, 0), null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    const move = jest.spyOn(game, 'move')

    swipe(tree, -50, 0)

    expect(move).toHaveBeenCalledWith('left')
    expect(game.getState().moveCount).toBe(0)
    expect(game.getState().score).toBe(0)
    expect(tileElements(tree)).toHaveLength(1)
  })

  test('a sub-threshold drag never reaches the model', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    const move = jest.spyOn(game, 'move')

    swipe(tree, 10, 0)

    expect(move).not.toHaveBeenCalled()
  })

  test('per-tile value and coordinate labels stay reachable to screen readers', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2, 0, 0), null, null, makeTile('b', 4, 0, 3)],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])

    for (const expected of [
      { id: 'a', value: 2, row: 0, col: 0 },
      { id: 'b', value: 4, row: 0, col: 3 },
    ]) {
      const label = `Tile ${expected.value} row ${expected.row + 1} column ${expected.col + 1}`
      const element = tileElements(tree).find(
        node =>
          node.props.testID === `game-2048-tile-${expected.id}` &&
          node.props.accessibilityLabel === label
      )
      expect(element).toBeDefined()
      expect(element!.props.accessible).toBe(true)
      expect(hasAccessibleAncestor(element!)).toBe(false)
    }
  })

  test('consecutive merges on the same tile id each replay the pulse while a clock tick does not', async () => {
    const sequence = jest.spyOn(Reanimated, 'withSequence')
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2, 0, 0), makeTile('b', 2, 0, 1), null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])

    swipe(tree, -50, 0)
    expect(game.getState().board[0][0]?.id).toBe('b')
    expect(tileProp(tree, 'b')).toMatchObject({ value: 4, pop: true })
    expect(sequence).toHaveBeenCalledTimes(1)

    setBoard(game, [
      [makeTile('b', 4, 0, 0), null, null, makeTile('c', 4, 0, 3)],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    swipe(tree, 50, 0)
    const merged = game.getState().board[0][3]
    expect(merged?.id).toBe('b')
    expect(merged?.value).toBe(8)
    expect(tileProp(tree, 'b')).toMatchObject({ value: 8, pop: true })
    expect(sequence).toHaveBeenCalledTimes(2)

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2200))
    })
    expect(testText(tree, 'game-time')).not.toBe('0:00')
    expect(sequence).toHaveBeenCalledTimes(2)
  })

  test('Undo restores the pre-move board and hands the merge score back', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2, 0, 0), makeTile('b', 2, 0, 1), null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    swipe(tree, -50, 0)
    expect(game.getState().score).toBe(4)
    expect(
      byLabel(tree, 'Undo move')[0].props.accessibilityState
    ).toMatchObject({ disabled: false })

    await press(tree, 'Undo move')

    const state = game.getState()
    expect(state.score).toBe(0)
    expect(state.undosUsed).toBe(1)
    expect(state.undosLeft).toBe(0)
    expect(state.board[0][0]?.id).toBe('a')
    expect(state.board[0][1]?.id).toBe('b')
    expect(tileElements(tree)).toHaveLength(2)
    expect(
      byLabel(tree, 'Undo move')[0].props.accessibilityState
    ).toMatchObject({ disabled: true })
  })
})

describe('2048 pilot — finish run', () => {
  test('a live board with moves left offers no Finish run control', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')

    expect(byLabel(tree, 'Finish run')).toHaveLength(0)
  })

  test('a stuck board with an undo left offers Undo and Finish run; undoing clears the offer', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2, 0, 0), makeTile('b', 2, 0, 1), null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    swipe(tree, -50, 0)

    const stuckBoard = STUCK_BOARD(200)
    expect(canMove(stuckBoard)).toBe(false)
    setBoard(game, stuckBoard)
    flagState(game, { stuck: true })

    expect(game.getState().isActive).toBe(true)
    expect(
      byLabel(tree, 'Undo move')[0].props.accessibilityState
    ).toMatchObject({ disabled: false })
    expect(byLabel(tree, 'Finish run')).toHaveLength(1)
    expect(testText(tree, 'game-2048-status')).toBe('No moves left')

    await press(tree, 'Undo move')
    expect(byLabel(tree, 'Finish run')).toHaveLength(0)
    expect(game.getState().stuck).toBe(false)
    expect(submitScore).not.toHaveBeenCalled()
  })

  test('pressing Finish run on a stuck board posts exactly one final score and shows the result sheet', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2, 0, 0), makeTile('b', 2, 0, 1), null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    swipe(tree, -50, 0)
    setBoard(game, STUCK_BOARD(200))
    flagState(game, { stuck: true })

    await press(tree, 'Finish run')
    await settle()

    expect(game.getState().isGameOver).toBe(true)
    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(submitScore).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: GameID.GAME_2048, platform: 'ios' })
    )
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
    expect(Number(testText(tree, 'final-score'))).toBe(4)
    expect(
      tree.root.findAll(
        node =>
          typeof node.type === 'string' && node.props.testID === 'final-score'
      )
    ).toHaveLength(1)

    await act(async () => {
      await game.end()
    })
    await settle()
    expect(submitScore).toHaveBeenCalledTimes(1)
  })

  test('a won run shows Finish run, banks the score once and reports Reached 2048', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    setBoard(game, [
      [makeTile('a', 2048, 0, 0), makeTile('b', 2, 0, 1), null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    flagState(game, { won: true, maxTile: 2048 })

    expect(game.getState().isActive).toBe(true)
    expect(byLabel(tree, 'Finish run')).toHaveLength(1)
    expect(testText(tree, 'game-2048-status')).toBe('2048 reached')
    expect(testText(tree, 'game-2048-max')).toBe('Max 2048')

    await press(tree, 'Finish run')
    await settle()

    expect(submitScore).toHaveBeenCalledTimes(1)
    expect(testText(tree, 'result-outcome')).toBe('Reached 2048')
    expect(testText(tree, 'result-save-status')).toBe('Score saved')
  })

  test('a replay after Finish run starts fresh while the old run still saved once', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    flagState(game, { won: true, maxTile: 2048 })
    await press(tree, 'Finish run')
    await settle()
    expect(submitScore).toHaveBeenCalledTimes(1)

    await press(tree, 'Play again')
    expect(tileElements(tree)).toHaveLength(2)
    expect(testText(tree, 'game-2048-max')).toMatch(/^Max [24]$/)
    expect(testText(tree, 'game-time')).toBe('0:00')
    expect(byLabel(tree, 'Finish run')).toHaveLength(0)
    expect(submitScore).toHaveBeenCalledTimes(1)
  })
})

describe('2048 pilot — projection identity', () => {
  test('the tile prop objects the view renders stay identical across a clock tick', async () => {
    const tree = await render(<NativeGameHost gameId={GameID.GAME_2048} />)
    fireLayout(tree)
    await press(tree, 'Start game')
    const game = createdGames[0]
    const before = game
      .getState()
      .board.flat()
      .filter((cell): cell is Tile => cell !== null)
      .map(cell => tileProp(tree, cell.id))
    expect(before.every(Boolean)).toBe(true)

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2200))
    })
    expect(testText(tree, 'game-time')).not.toBe('0:00')
    for (const tile of before) {
      expect(tileProp(tree, tile!.id)).toBe(tile)
    }
  })

  test('the port projector hands back the same tile list until the board visibly changes', async () => {
    const port = originalPort as NativeGamePort
    const game = new Game2048({
      submitScore: async () => ({ success: true }),
      platform: 'ios',
    })
    const project = port.createProjector?.(game)
    expect(project).toBeDefined()
    if (!project) {
      game.destroy()
      return
    }
    game.start()
    const first = project(game.getState())
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })
    const afterTick = project(game.getState())
    expect(afterTick.clock).toBeGreaterThan(0)
    expect(afterTick).not.toBe(first)
    expect(afterTick.tiles).toBe(first.tiles)
    game.destroy()
  })
})
