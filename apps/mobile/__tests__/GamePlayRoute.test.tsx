import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { GameID } from '@cetus/shared/games'
import { BaseGame, type BaseGameConfig, type BaseGameState } from '@cetus/games'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockCanGoBack = jest.fn()
const mockParams: { gameId?: string | string[] } = {}

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => {
    callback()
  },
}))

interface MockSessionUser {
  id: string
  name: string
  email: string
}
const mockSessionRefetch = jest.fn()
const mockSession: {
  data: {
    user: MockSessionUser
    session: { id: string; updatedAt: string }
  } | null
  isPending: boolean
  refetch: jest.Mock
} = { data: null, isPending: false, refetch: mockSessionRefetch }

jest.mock('../src/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockSession,
    getCookie: async () => null,
  },
}))

jest.mock('../src/lib/api', () => ({
  api: {
    submitScore: jest.fn().mockResolvedValue({ success: true }),
  },
}))

import GamePlayScreen from '../app/games/[gameId]/play'
import {
  NATIVE_GAMES,
  type NativeGamePort,
  type NativeGameViewProps,
} from '../src/games/registry'

// --- minimal concrete @cetus/games fixture ---------------------------------

interface TestGameState extends BaseGameState {
  board: number[]
}

class TestNativeGame extends BaseGame<TestGameState> {
  constructor(config: BaseGameConfig) {
    super(GameID.QUICK_MATH, config, {}, { basePoints: 10 })
  }

  override createInitialState(): TestGameState {
    return {
      score: 0,
      timeRemaining: this.config.duration,
      isActive: false,
      isPaused: false,
      isGameOver: false,
      gameStarted: false,
      board: [1, 2, 3],
    }
  }

  override update(): void {}
  override render(): void {}
  override cleanup(): void {}

  override getGameStats() {
    return {
      finalScore: this.state.score,
      timeElapsed: this.config.duration - this.state.timeRemaining,
      gameCompleted: true,
    }
  }

  flipBoardCell(index: number): void {
    this.state.board[index] += 1
    this.emit('state-change', { state: this.getState() })
  }
}

const createdGames: TestNativeGame[] = []

const TestBoardView = ({ projected }: NativeGameViewProps) => (
  <Text testID="native-board">{(projected.board as number[]).join(',')}</Text>
)

const testPort: NativeGamePort = {
  createGame(deps) {
    const game = new TestNativeGame({
      duration: 60,
      pausable: true,
      resettable: true,
      submitScore: deps.submitScore,
      platform: deps.platform,
    })
    createdGames.push(game)
    return game
  },
  project: state => ({ board: [...(state as TestGameState).board] }),
  view: TestBoardView,
}

const originalEntry = NATIVE_GAMES[GameID.QUICK_MATH]
beforeAll(() => {
  NATIVE_GAMES[GameID.QUICK_MATH] = { port: testPort }
})
afterAll(() => {
  NATIVE_GAMES[GameID.QUICK_MATH] = originalEntry
})

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
  return tree
}

const rerender = async (
  tree: TestRenderer.ReactTestRenderer,
  element: React.ReactElement
) => {
  await act(async () => {
    tree.update(element)
  })
  await drain()
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

const boardText = (tree: TestRenderer.ReactTestRenderer) =>
  scalarText(tree.root.findByProps({ testID: 'native-board' }).props.children)

const press = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const button = tree.root.findByProps({ accessibilityLabel: label })
  await act(async () => {
    button.props.onPress()
  })
}

const signedIn = (id: string, sessionId: string) => ({
  data: {
    user: { id, name: 'Test User', email: 'test@example.com' },
    session: { id: sessionId, updatedAt: '2026-01-01T00:00:00Z' },
  },
  isPending: false,
  refetch: mockSessionRefetch,
})

const guest = { data: null, isPending: false, refetch: mockSessionRefetch }

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockParams.gameId = 'quick_math'
  createdGames.length = 0
  Object.assign(mockSession, guest)
})

describe('play route — id fallbacks', () => {
  test('renders a not-found state for an unknown game id', async () => {
    mockParams.gameId = 'definitely-not-a-game'
    const tree = await render(<GamePlayScreen />)

    const rendered = renderedText(tree)
    expect(rendered).toContain('not found')
    expect(rendered).toContain('definitely-not-a-game')
    expect(createdGames).toHaveLength(0)
    expect(tree.root.findAllByProps({ testID: 'native-board' })).toHaveLength(0)
  })

  test('renders an explicit unported state for a catalog game outside the registry', async () => {
    mockParams.gameId = 'tetris'
    const tree = await render(<GamePlayScreen />)

    const rendered = renderedText(tree)
    expect(rendered).toContain('Not playable on mobile')
    expect(createdGames).toHaveLength(0)
    expect(tree.root.findAllByProps({ testID: 'native-board' })).toHaveLength(0)

    const back = tree.root.findByProps({ accessibilityLabel: 'Back to games' })
    await act(async () => {
      back.props.onPress()
    })
    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})

describe('play route — first-read gate', () => {
  test('cold start pending shows the session gate and mounts after guest resolves', async () => {
    Object.assign(mockSession, { ...guest, isPending: true })
    let tree: TestRenderer.ReactTestRenderer | undefined
    await act(async () => {
      tree = TestRenderer.create(<GamePlayScreen />)
    })
    await drain()
    expect(tree).toBeDefined()
    if (!tree) {
      throw new Error('no tree')
    }
    expect(createdGames).toHaveLength(0)
    expect(renderedText(tree)).toContain('Resolving session')

    Object.assign(mockSession, guest)
    await rerender(tree, <GamePlayScreen />)
    expect(createdGames).toHaveLength(1)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Start game' })
    ).toBeTruthy()
  })

  test('cold start pending mounts the account host once signed-in resolves', async () => {
    Object.assign(mockSession, { ...guest, isPending: true })
    let tree: TestRenderer.ReactTestRenderer | undefined
    await act(async () => {
      tree = TestRenderer.create(<GamePlayScreen />)
    })
    await drain()
    expect(tree).toBeDefined()
    if (!tree) {
      throw new Error('no tree')
    }
    expect(createdGames).toHaveLength(0)

    Object.assign(mockSession, signedIn('user-1', 'sess-1'))
    await rerender(tree, <GamePlayScreen />)
    expect(createdGames).toHaveLength(1)
  })
})

describe('play route — resolved guest revalidation keeps the run alive', () => {
  test('pending false→true→false preserves the same game instance, board and timer', async () => {
    const tree = await render(<GamePlayScreen />)
    await press(tree, 'Start game')
    await act(async () => {
      createdGames[0].flipBoardCell(1)
    })
    await drain()
    expect(boardText(tree)).toBe('1,3,3')
    const runningGame = createdGames[0]
    expect(runningGame.getTimerStatus().isRunning).toBe(true)

    // Revalidation flips pending while the guest run is live.
    Object.assign(mockSession, { ...guest, isPending: true })
    await rerender(tree, <GamePlayScreen />)
    Object.assign(mockSession, guest)
    await rerender(tree, <GamePlayScreen />)

    expect(createdGames).toHaveLength(1)
    expect(createdGames[0]).toBe(runningGame)
    expect(boardText(tree)).toBe('1,3,3')
    expect(runningGame.getState().isActive).toBe(true)
    expect(runningGame.getTimerStatus().isRunning).toBe(true)
    expect(renderedText(tree)).not.toContain('Resolving session')
    // Stop the live timer so no tick lands after the test ends.
    await act(async () => {
      runningGame.pause()
    })
  })
})

describe('play route — settled identity changes remount the host', () => {
  test('active guest → signed-in tears the old run down before the new account game', async () => {
    const tree = await render(<GamePlayScreen />)
    await press(tree, 'Start game')
    const guestGame = createdGames[0]
    const destroySpy = jest.spyOn(guestGame, 'destroy')
    expect(guestGame.getTimerStatus().isRunning).toBe(true)

    Object.assign(mockSession, signedIn('user-1', 'sess-1'))
    await rerender(tree, <GamePlayScreen />)

    expect(createdGames).toHaveLength(2)
    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(guestGame.getTimerStatus().isRunning).toBe(false)
    // The new account host starts fresh (not running) on its own instance.
    expect(createdGames[1]).not.toBe(guestGame)
    expect(createdGames[1].getState().isActive).toBe(false)
  })

  test('signed-in → guest changes the host again', async () => {
    Object.assign(mockSession, signedIn('user-1', 'sess-1'))
    const tree = await render(<GamePlayScreen />)
    await press(tree, 'Start game')
    const accountGame = createdGames[0]
    expect(accountGame.getTimerStatus().isRunning).toBe(true)

    Object.assign(mockSession, guest)
    await rerender(tree, <GamePlayScreen />)

    expect(createdGames).toHaveLength(2)
    expect(accountGame.getState().isActive).toBe(true) // old state untouched…
    expect(accountGame.getTimerStatus().isRunning).toBe(false) // …but stopped
    expect(createdGames[1].getState().isActive).toBe(false)
  })

  test('ordinary session renewal never resets play', async () => {
    Object.assign(mockSession, signedIn('user-1', 'sess-1'))
    const tree = await render(<GamePlayScreen />)
    await press(tree, 'Start game')
    const accountGame = createdGames[0]
    expect(createdGames).toHaveLength(1)

    // Same user + same session row, just a renewal refetch in flight.
    Object.assign(mockSession, {
      ...signedIn('user-1', 'sess-1'),
      isPending: true,
    })
    await rerender(tree, <GamePlayScreen />)
    // The server renewed the session row (updatedAt bump only).
    const renewed = signedIn('user-1', 'sess-1')
    renewed.data.session.updatedAt = '2026-02-02T00:00:00Z'
    Object.assign(mockSession, renewed)
    await rerender(tree, <GamePlayScreen />)

    expect(createdGames).toHaveLength(1)
    expect(createdGames[0]).toBe(accountGame)
    expect(accountGame.getTimerStatus().isRunning).toBe(true)
    // Stop the live timer so no tick lands after the test ends.
    await act(async () => {
      accountGame.pause()
    })
  })
})
