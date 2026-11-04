import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { ApiClientError } from '@cetus/api-client/api-client'
import type {
  LeaderboardEntryResponse,
  LeaderboardResponse,
} from '@cetus/shared/api-dto'
import { getActiveGames } from '@cetus/shared/games'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockCanGoBack = jest.fn()
const mockParams: { gameId?: string | string[] } = {}
let mockFocusCallback: (() => void) | undefined

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

jest.mock('../src/lib/api', () => ({
  api: { getLeaderboard: jest.fn() },
}))

import LeaderboardScreen from '../app/(tabs)/leaderboard'
import GameLeaderboardScreen from '../app/leaderboard/[gameId]'
import { api } from '../src/lib/api'

const getLeaderboard = jest.mocked(api.getLeaderboard)
const addAppStateListener = jest.spyOn(AppState, 'addEventListener')

const ACTIVE_GAMES = getActiveGames()

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let runs: Deferred<LeaderboardResponse>[]
let appStateListeners: {
  listener: (state: AppStateStatus) => void
  remove: jest.Mock
  removed: boolean
}[]
let focusCleanup: (() => void) | undefined

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  return tree
}

const settle = async (
  run: Deferred<LeaderboardResponse>,
  value: LeaderboardResponse
) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
}

const settleRejection = async (
  run: Deferred<LeaderboardResponse>,
  reason: unknown
) => {
  await act(async () => {
    run.reject(reason)
    await run.promise.catch(() => undefined)
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

const press = async (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string
) => {
  const node = tree.root.findByProps({ accessibilityLabel })
  await act(async () => {
    node.props.onPress()
  })
}

const comboboxOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByProps({ accessibilityRole: 'combobox' })

const menuItemsOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll(
    node =>
      node.props.accessibilityRole === 'menuitem' &&
      typeof node.props.onPress === 'function'
  )

const openSelector = async (tree: TestRenderer.ReactTestRenderer) => {
  await act(async () => {
    comboboxOf(tree).props.onPress()
  })
}

const pickOption = async (
  tree: TestRenderer.ReactTestRenderer,
  label: string
) => {
  const option = tree.root.findByProps({
    accessibilityRole: 'menuitem',
    accessibilityLabel: label,
  })
  await act(async () => {
    option.props.onPress()
  })
}

const chooseScope = async (
  tree: TestRenderer.ReactTestRenderer,
  label: string
) => {
  await openSelector(tree)
  await pickOption(tree, label)
}

const focus = async () => {
  await act(async () => {
    const cleanup = mockFocusCallback?.()
    focusCleanup = typeof cleanup === 'function' ? cleanup : undefined
  })
}

const blur = async () => {
  await act(async () => {
    focusCleanup?.()
    focusCleanup = undefined
  })
}

const appState = async (state: AppStateStatus) => {
  await act(async () => {
    for (const entry of appStateListeners) {
      if (!entry.removed) {
        entry.listener(state)
      }
    }
  })
}

const entry = (
  over: Partial<LeaderboardEntryResponse>
): LeaderboardEntryResponse => ({
  rank: 1,
  name: 'Diver One',
  username: 'diver-one',
  score: 1250,
  created_at: '2026-01-02T03:04:05Z',
  image: null,
  ...over,
})

const overviewResponse: LeaderboardResponse = {
  leaderboards: {
    tetris: [entry({ rank: 1, name: 'Diver One', username: 'diver-one' })],
    snake: [
      entry({ rank: 1, name: 'Snake Ace', username: 'snake-ace', score: 900 }),
    ],
  },
}

const snakeResponse: LeaderboardResponse = {
  gameId: 'snake',
  gameName: 'Snake',
  leaderboard: [
    entry({ rank: 1, name: 'Snake Ace', username: 'snake-ace', score: 900 }),
    entry({ rank: 2, name: 'Python Pro', username: null, score: 700 }),
  ],
}

const tetrisResponse: LeaderboardResponse = {
  gameId: 'tetris',
  gameName: 'Tetris Challenge',
  leaderboard: [
    entry({ rank: 1, name: 'Block Boss', username: 'block-boss', score: 4000 }),
  ],
}

const emptySnakeResponse: LeaderboardResponse = {
  gameId: 'snake',
  gameName: 'Snake',
  leaderboard: [],
}

const unavailable = () =>
  new ApiClientError(
    'Score context is unavailable',
    503,
    'http',
    'SCORE_CONTEXT_UNAVAILABLE'
  )

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockParams.gameId = undefined
  mockFocusCallback = undefined
  focusCleanup = undefined
  runs = []
  appStateListeners = []
  addAppStateListener.mockReset()
  addAppStateListener.mockImplementation(
    (_type: string, listener: (state: AppStateStatus) => void) => {
      const subscription = {
        listener,
        removed: false,
        remove: jest.fn(),
      }
      subscription.remove.mockImplementation(() => {
        subscription.removed = true
      })
      appStateListeners.push(subscription)
      return subscription as unknown as ReturnType<
        typeof AppState.addEventListener
      >
    }
  )
  getLeaderboard.mockReset()
  getLeaderboard.mockImplementation(() => {
    const run = deferred<LeaderboardResponse>()
    runs.push(run)
    return run.promise
  })
})

describe('leaderboard tab', () => {
  test('loads the public global board anonymously and renders every game section', async () => {
    const tree = await render(<LeaderboardScreen />)

    expect(getLeaderboard).toHaveBeenCalledTimes(1)
    expect(getLeaderboard).toHaveBeenLastCalledWith(
      { limit: 10 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(
      tree.root.findByProps({ testID: 'leaderboard-loading' })
    ).toBeTruthy()

    await settle(runs[0], overviewResponse)

    const rendered = renderedText(tree)
    for (const game of ACTIVE_GAMES) {
      expect(rendered).toContain(game.name)
    }
    expect(rendered).toContain('Diver One')
    expect(rendered).toContain('1,250')
    expect(rendered).toContain('Snake Ace')
    expect(rendered).toContain('No scores yet')
    expect(rendered).not.toContain('Sign in')

    await openSelector(tree)
    expect(
      tree.root.findByProps({
        accessibilityRole: 'menuitem',
        accessibilityLabel: 'All games',
      }).props.accessibilityState?.selected
    ).toBe(true)
  })

  test('selecting a game fetches the per-game board and marks it selected', async () => {
    const tree = await render(<LeaderboardScreen />)
    await settle(runs[0], overviewResponse)

    await chooseScope(tree, 'Snake')

    expect(getLeaderboard).toHaveBeenCalledTimes(2)
    expect(getLeaderboard).toHaveBeenLastCalledWith(
      { gameId: 'snake', limit: 25 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(
      tree.root.findByProps({ testID: 'leaderboard-loading' })
    ).toBeTruthy()

    await settle(runs[1], snakeResponse)

    const rendered = renderedText(tree)
    expect(rendered).toContain('Snake Ace')
    expect(rendered).toContain('Python Pro')
    expect(rendered).not.toContain('Diver One')

    await openSelector(tree)
    const items = menuItemsOf(tree)
    const snake = items.find(node => node.props.accessibilityLabel === 'Snake')
    const all = items.find(
      node => node.props.accessibilityLabel === 'All games'
    )
    expect(snake?.props.accessibilityState?.selected).toBe(true)
    expect(all?.props.accessibilityState?.selected).toBe(false)
  })

  test('shows the empty board state when the selected game has no scores', async () => {
    const tree = await render(<LeaderboardScreen />)
    await settle(runs[0], overviewResponse)

    await chooseScope(tree, 'Snake')
    await settle(runs[1], emptySnakeResponse)

    const rendered = renderedText(tree)
    expect(rendered).toContain('No scores yet')
    expect(rendered).toContain('Snake')
  })

  test('surfaces the 503 unavailable state and retries into data', async () => {
    const tree = await render(<LeaderboardScreen />)
    await settleRejection(runs[0], unavailable())

    expect(
      tree.root.findByProps({ testID: 'leaderboard-unavailable' })
    ).toBeTruthy()
    expect(renderedText(tree)).toContain('temporarily unavailable')

    await press(tree, 'Retry loading the leaderboard')
    expect(getLeaderboard).toHaveBeenCalledTimes(2)
    expect(
      tree.root.findByProps({ testID: 'leaderboard-loading' })
    ).toBeTruthy()

    await settle(runs[1], overviewResponse)
    expect(renderedText(tree)).toContain('Diver One')
    expect(
      tree.root.findAllByProps({ testID: 'leaderboard-unavailable' })
    ).toHaveLength(0)
  })

  test('surfaces an ordinary network error distinctly from 503 and retries', async () => {
    const tree = await render(<LeaderboardScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(tree.root.findByProps({ testID: 'leaderboard-error' })).toBeTruthy()
    const rendered = renderedText(tree)
    expect(rendered).toContain('connection')
    expect(rendered).not.toContain('temporarily unavailable')
    expect(
      tree.root.findAllByProps({ testID: 'leaderboard-unavailable' })
    ).toHaveLength(0)

    await press(tree, 'Retry loading the leaderboard')
    await settle(runs[1], overviewResponse)
    expect(renderedText(tree)).toContain('Diver One')
  })

  test('never shows a stale board that resolves after the scope changed', async () => {
    const tree = await render(<LeaderboardScreen />)
    await settle(runs[0], overviewResponse)

    await chooseScope(tree, 'Snake')
    await chooseScope(tree, 'Tetris Challenge')
    expect(getLeaderboard).toHaveBeenCalledTimes(3)

    await settle(runs[1], snakeResponse)
    expect(renderedText(tree)).not.toContain('Snake Ace')
    expect(
      tree.root.findByProps({ testID: 'leaderboard-loading' })
    ).toBeTruthy()

    await settle(runs[2], tetrisResponse)
    const rendered = renderedText(tree)
    expect(rendered).toContain('Block Boss')
    expect(rendered).not.toContain('Snake Ace')

    await openSelector(tree)
    expect(
      tree.root.findByProps({
        accessibilityRole: 'menuitem',
        accessibilityLabel: 'Tetris Challenge',
      }).props.accessibilityState?.selected
    ).toBe(true)
  })

  test('refetches only when the tab regains focus', async () => {
    await render(<LeaderboardScreen />)
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await focus()
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await blur()
    await focus()
    expect(getLeaderboard).toHaveBeenCalledTimes(2)
  })

  test('refetches on app foreground while focused, not on other transitions', async () => {
    await render(<LeaderboardScreen />)
    await settle(runs[0], overviewResponse)
    await focus()
    expect(appStateListeners).toHaveLength(1)
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await appState('background')
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await appState('inactive')
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getLeaderboard).toHaveBeenCalledTimes(2)
  })

  test('drops the app-state subscription on blur and ignores foregrounding unfocused', async () => {
    await render(<LeaderboardScreen />)
    await focus()
    expect(appStateListeners).toHaveLength(1)
    const subscription = appStateListeners[0]

    await blur()
    expect(subscription.remove).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await focus()
    expect(getLeaderboard).toHaveBeenCalledTimes(2)
    expect(appStateListeners).toHaveLength(2)
  })

  test('opens the dedicated per-game leaderboard route from a board header', async () => {
    const tree = await render(<LeaderboardScreen />)
    await settle(runs[0], overviewResponse)

    await press(tree, 'Snake leaderboard')
    expect(mockPush).toHaveBeenCalledWith('/leaderboard/snake')

    await press(tree, 'Tetris Challenge leaderboard')
    expect(mockPush).toHaveBeenCalledWith('/leaderboard/tetris')
  })

  test('exposes every active game as a selector option', async () => {
    const tree = await render(<LeaderboardScreen />)
    await settle(runs[0], overviewResponse)

    await openSelector(tree)

    const items = menuItemsOf(tree)
    expect(items).toHaveLength(ACTIVE_GAMES.length + 1)
    for (const game of ACTIVE_GAMES) {
      expect(
        items.some(node => node.props.accessibilityLabel === game.name)
      ).toBe(true)
    }
  })
})

describe('per-game leaderboard route', () => {
  test('fetches and renders the board for a valid game id', async () => {
    mockParams.gameId = 'snake'
    const tree = await render(<GameLeaderboardScreen />)

    expect(getLeaderboard).toHaveBeenCalledTimes(1)
    expect(getLeaderboard).toHaveBeenLastCalledWith(
      { gameId: 'snake', limit: 25 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(
      tree.root.findByProps({ testID: 'leaderboard-loading' })
    ).toBeTruthy()

    await settle(runs[0], snakeResponse)

    const rendered = renderedText(tree)
    expect(rendered).toContain('Snake')
    expect(rendered).toContain('Snake Ace')
    expect(rendered).toContain('Python Pro')
    expect(rendered).toContain('900')
    expect(
      tree.root.find(node => node.props.accessibilityRole === 'header')
    ).toBeTruthy()
  })

  test('shows the not-found state for an unknown game id without fetching', async () => {
    mockParams.gameId = 'definitely-not-a-game'
    const tree = await render(<GameLeaderboardScreen />)

    expect(getLeaderboard).not.toHaveBeenCalled()
    const rendered = renderedText(tree)
    expect(rendered).toContain('not found')
    expect(rendered).toContain('definitely-not-a-game')

    await press(tree, 'Back to leaderboard')
    expect(mockReplace).toHaveBeenCalledWith('/leaderboard')
  })

  test('shows the not-found state when the id is missing', async () => {
    mockParams.gameId = undefined
    const tree = await render(<GameLeaderboardScreen />)

    expect(getLeaderboard).not.toHaveBeenCalled()
    expect(renderedText(tree)).toContain('not found')
  })

  test('honors loading, 503 and retry states on the leaf too', async () => {
    mockParams.gameId = 'tetris'
    const tree = await render(<GameLeaderboardScreen />)

    expect(
      tree.root.findByProps({ testID: 'leaderboard-loading' })
    ).toBeTruthy()

    await settleRejection(runs[0], unavailable())
    expect(
      tree.root.findByProps({ testID: 'leaderboard-unavailable' })
    ).toBeTruthy()

    await press(tree, 'Retry loading the leaderboard')
    await settle(runs[1], tetrisResponse)
    expect(renderedText(tree)).toContain('Block Boss')
  })

  test('shows the empty state on the leaf for a game with no scores', async () => {
    mockParams.gameId = 'snake'
    const tree = await render(<GameLeaderboardScreen />)

    await settle(runs[0], emptySnakeResponse)

    const rendered = renderedText(tree)
    expect(rendered).toContain('No scores yet')
  })

  test('offers a back fallback when the stack cannot go back', async () => {
    mockParams.gameId = 'snake'
    mockCanGoBack.mockReturnValue(false)
    const tree = await render(<GameLeaderboardScreen />)
    await settle(runs[0], snakeResponse)

    await press(tree, 'Back to leaderboard')
    expect(mockReplace).toHaveBeenCalledWith('/leaderboard')
  })

  test('hides the back fallback while ordinary stack back is available', async () => {
    mockParams.gameId = 'snake'
    const tree = await render(<GameLeaderboardScreen />)
    await settle(runs[0], snakeResponse)

    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Back to leaderboard' })
    ).toHaveLength(0)
  })

  test('refetches only when the leaf regains focus', async () => {
    mockParams.gameId = 'snake'
    await render(<GameLeaderboardScreen />)
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await focus()
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await blur()
    await focus()
    expect(getLeaderboard).toHaveBeenCalledTimes(2)
  })

  test('refetches on app foreground while focused on the leaf', async () => {
    mockParams.gameId = 'tetris'
    await render(<GameLeaderboardScreen />)
    await settle(runs[0], tetrisResponse)
    await focus()
    expect(appStateListeners).toHaveLength(1)

    await appState('background')
    expect(getLeaderboard).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getLeaderboard).toHaveBeenCalledTimes(2)
  })
})
