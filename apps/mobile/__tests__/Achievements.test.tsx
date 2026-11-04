import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { ApiClientError } from '@cetus/api-client/api-client'
import type { UserOverviewResponse } from '@cetus/shared/api-dto'
import { getAllAchievements } from '@cetus/shared/achievements'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockCanGoBack = jest.fn()
let mockFocusCallback: (() => void) | undefined
const mockSessionRefetch = jest.fn()
let mockSession: {
  data: {
    user: { id: string; name: string; email: string }
    session: { id: string; updatedAt: string }
  } | null
  isPending: boolean
  refetch: jest.Mock
} = { data: null, isPending: false, refetch: mockSessionRefetch }

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

jest.mock('../src/lib/api', () => ({
  api: { getUserOverview: jest.fn() },
}))

jest.mock('../src/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockSession,
  },
}))

import AchievementsScreen from '../app/(tabs)/achievements'
import { api } from '../src/lib/api'

const getUserOverview = jest.mocked(api.getUserOverview)
const addAppStateListener = jest.spyOn(AppState, 'addEventListener')

const TOTAL_ACHIEVEMENTS = getAllAchievements().length

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

let runs: Deferred<UserOverviewResponse>[]
let appStateListeners: {
  listener: (state: AppStateStatus) => void
  remove: jest.Mock
  removed: boolean
}[]
let focusCleanup: (() => void) | undefined

const drain = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 75))
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

const settle = async (
  run: Deferred<UserOverviewResponse>,
  value: UserOverviewResponse
) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
  await drain()
}

const settleRejection = async (
  run: Deferred<UserOverviewResponse>,
  reason: unknown
) => {
  await act(async () => {
    run.reject(reason)
    await run.promise.catch(() => undefined)
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

const press = async (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string
) => {
  const node = tree.root.findByProps({ accessibilityLabel })
  await act(async () => {
    node.props.onPress()
  })
  await drain()
}

const comboboxOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findByProps({ accessibilityRole: 'combobox' })

const openSelector = async (tree: TestRenderer.ReactTestRenderer) => {
  await act(async () => {
    comboboxOf(tree).props.onPress()
  })
  await drain()
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
  await drain()
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
  await drain()
}

const blur = async () => {
  await act(async () => {
    focusCleanup?.()
    focusCleanup = undefined
  })
  await drain()
}

const appState = async (state: AppStateStatus) => {
  await act(async () => {
    for (const entry of appStateListeners) {
      if (!entry.removed) {
        entry.listener(state)
      }
    }
  })
  await drain()
}

const signIn = (
  id: string,
  sessionId = `sess-${id}`,
  sessionUpdatedAt = '2026-01-01T00:00:00Z'
) => {
  mockSession = {
    data: {
      user: { id, name: `Diver ${id}`, email: `${id}@cetus.test` },
      session: { id: sessionId, updatedAt: sessionUpdatedAt },
    },
    isPending: false,
    refetch: mockSessionRefetch,
  }
}

const signOut = () => {
  mockSession = { data: null, isPending: false, refetch: mockSessionRefetch }
}

const overview = (earnedAchievementIds: string[]): UserOverviewResponse => ({
  profile: {
    name: 'Diver',
    displayName: null,
    username: null,
    image: null,
    createdAt: '2026-01-01T00:00:00Z',
  },
  stats: {
    totalGamesPlayed: 0,
    totalScore: 0,
    favoriteGame: null,
    streakDays: 0,
    xp: 0,
    level: 1,
  },
  earnedAchievementIds,
})

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockFocusCallback = undefined
  focusCleanup = undefined
  mockSessionRefetch.mockReset().mockResolvedValue(undefined)
  mockSession = { data: null, isPending: false, refetch: mockSessionRefetch }
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
  getUserOverview.mockReset()
  getUserOverview.mockImplementation(() => {
    const run = deferred<UserOverviewResponse>()
    runs.push(run)
    return run.promise
  })
})

describe('achievements tab — signed out', () => {
  test('shows an accessible sign-in CTA without issuing the protected request', async () => {
    const tree = await render(<AchievementsScreen />)

    expect(getUserOverview).not.toHaveBeenCalled()
    expect(
      tree.root.findAllByProps({ testID: 'achievements-loading' })
    ).toHaveLength(0)

    const cta = tree.root.findByProps({
      accessibilityLabel: 'Sign in to view achievements',
    })
    expect(cta.props.accessibilityRole).toBe('button')

    const rendered = renderedText(tree)
    expect(rendered).toContain('Sign in')
    expect(rendered).not.toContain('Space Explorer')
    expect(rendered).not.toContain('Locked')
  })

  test('routes the CTA to sign-in with an achievements return destination', async () => {
    const tree = await render(<AchievementsScreen />)

    await press(tree, 'Sign in to view achievements')

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/(tabs)/achievements' },
    })
  })

  test('focus and app-foreground refetches stay inert while signed out', async () => {
    await render(<AchievementsScreen />)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getUserOverview).not.toHaveBeenCalled()
  })
})

describe('achievements tab — session resolving', () => {
  test('shows loading and issues no request while the session resolves', async () => {
    mockSession = { data: null, isPending: true, refetch: mockSessionRefetch }

    const tree = await render(<AchievementsScreen />)

    expect(getUserOverview).not.toHaveBeenCalled()
    expect(
      tree.root.findByProps({ testID: 'achievements-loading' })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Sign in to view achievements',
      })
    ).toHaveLength(0)
  })

  test('holds the protected request while a cached session is still resolving', async () => {
    mockSession = {
      data: {
        user: {
          id: 'user-a',
          name: 'Diver user-a',
          email: 'user-a@cetus.test',
        },
        session: { id: 'sess-a', updatedAt: '2026-01-01T00:00:00Z' },
      },
      isPending: true,
      refetch: mockSessionRefetch,
    }

    const tree = await render(<AchievementsScreen />)

    expect(getUserOverview).not.toHaveBeenCalled()
    expect(
      tree.root.findByProps({ testID: 'achievements-loading' })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Sign in to view achievements',
      })
    ).toHaveLength(0)

    mockSession = {
      data: mockSession.data,
      isPending: false,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(1)
  })
})

describe('achievements tab — signed in', () => {
  test('fetches the overview and renders earned and locked achievements', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(
      tree.root.findByProps({ testID: 'achievements-loading' })
    ).toBeTruthy()

    await settle(runs[0], overview(['space_explorer', 'tetris_novice']))

    const rendered = renderedText(tree)
    expect(rendered).toContain('Space Explorer')
    expect(rendered).toContain('Tetris Novice')
    expect(rendered).toContain('Sudoku Master')
    expect(rendered).toContain('Earned')
    expect(rendered).toContain('Locked')
    expect(rendered).toContain(`2 of ${TOTAL_ACHIEVEMENTS} earned`)
  })

  test('masks hidden achievements until earned', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview(['word_secret_dog']))

    const rendered = renderedText(tree)
    expect(rendered).toContain('Pawsitive Thinker')
    expect(rendered).toContain('Hidden achievement')
    expect(rendered).not.toContain('Stellar Mind')
    expect(rendered).not.toContain('the hidden word: supernova')

    const hiddenCards = tree.root.findAllByProps({
      accessibilityLabel: 'Hidden achievement, locked',
    })
    expect(hiddenCards.length).toBeGreaterThan(0)
  })

  test('exposes an accessible earned/locked summary per achievement', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview(['space_explorer']))

    const earned = tree.root.findByProps({
      accessibilityLabel:
        'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
    })
    expect(earned.props.accessible).toBe(true)
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Tetris Novice, common achievement, Tetris Challenge, Score 100 points in Tetris, locked',
      })
    ).toBeTruthy()
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Vocabulary Virtuoso, legendary achievement, Word Scramble, Score 800 points in Word Scramble, locked',
      })
    ).toBeTruthy()
  })

  test('includes unlock descriptions and game context in accessible labels', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview(['sudoku_adept']))

    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Sudoku Adept, rare achievement, Sudoku, Score 2000 points in Sudoku, earned',
      }).props.accessible
    ).toBe(true)
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Sudoku Master, epic achievement, Sudoku, Score 3000 points in Sudoku, locked',
      })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Hidden achievement, locked',
      }).length
    ).toBeGreaterThan(0)
  })

  test('filters by earned and locked status with selected-state chips', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview(['space_explorer']))

    await press(tree, 'Filter: Earned')
    let rendered = renderedText(tree)
    expect(rendered).toContain('Space Explorer')
    expect(rendered).not.toContain('Tetris Novice')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Filter: Earned' }).props
        .accessibilityState?.selected
    ).toBe(true)
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Filter: All' }).props
        .accessibilityState?.selected
    ).toBe(false)

    await press(tree, 'Filter: Locked')
    rendered = renderedText(tree)
    expect(rendered).not.toContain('Space Explorer')
    expect(rendered).toContain('Tetris Novice')
    expect(rendered).toContain('Hidden achievement')
    expect(rendered).not.toContain('Pawsitive Thinker')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Filter: Locked' }).props
        .accessibilityState?.selected
    ).toBe(true)

    await press(tree, 'Filter: All')
    rendered = renderedText(tree)
    expect(rendered).toContain('Space Explorer')
    expect(rendered).toContain('Tetris Novice')
  })

  test('filters by game via the selector, including the Global scope', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview([]))

    await chooseScope(tree, 'Sudoku')
    let rendered = renderedText(tree)
    expect(rendered).toContain('Sudoku Novice')
    expect(rendered).toContain('Sudoku Master')
    expect(rendered).not.toContain('Tetris Novice')
    expect(rendered).not.toContain('Space Explorer')

    await chooseScope(tree, 'Global')
    rendered = renderedText(tree)
    expect(rendered).toContain('Space Explorer')
    expect(rendered).toContain('Weekly Warrior')
    expect(rendered).not.toContain('Sudoku Novice')

    await chooseScope(tree, 'All games')
    rendered = renderedText(tree)
    expect(rendered).toContain('Sudoku Novice')
    expect(rendered).toContain('Space Explorer')
  })

  test('marks the active game scope selected in the selector', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview([]))

    await openSelector(tree)
    expect(
      tree.root.findByProps({
        accessibilityRole: 'menuitem',
        accessibilityLabel: 'All games',
      }).props.accessibilityState?.selected
    ).toBe(true)

    await pickOption(tree, 'Snake')
    await openSelector(tree)
    expect(
      tree.root.findByProps({
        accessibilityRole: 'menuitem',
        accessibilityLabel: 'Snake',
      }).props.accessibilityState?.selected
    ).toBe(true)
    expect(
      tree.root.findByProps({
        accessibilityRole: 'menuitem',
        accessibilityLabel: 'All games',
      }).props.accessibilityState?.selected
    ).toBe(false)
  })

  test('shows an honest empty state when the earned filter has no matches', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview([]))

    await press(tree, 'Filter: Earned')

    const rendered = renderedText(tree)
    expect(rendered).toContain('No earned achievements yet')
    expect(rendered).not.toContain('Space Explorer')
  })

  test('combines game and status filters', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview(['sudoku_novice']))

    await press(tree, 'Filter: Earned')
    await chooseScope(tree, 'Sudoku')
    let rendered = renderedText(tree)
    expect(rendered).toContain('Sudoku Novice')
    expect(rendered).not.toContain('Sudoku Master')
    expect(rendered).not.toContain('Space Explorer')

    await press(tree, 'Filter: Locked')
    rendered = renderedText(tree)
    expect(rendered).toContain('Sudoku Master')
    expect(rendered).not.toContain('Sudoku Novice')
  })

  test('surfaces a network error distinctly and retries into data', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(tree.root.findByProps({ testID: 'achievements-error' })).toBeTruthy()
    expect(renderedText(tree)).toContain('connection')

    await press(tree, 'Retry loading achievements')
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(
      tree.root.findByProps({ testID: 'achievements-loading' })
    ).toBeTruthy()

    await settle(runs[1], overview(['space_explorer']))
    expect(renderedText(tree)).toContain('Space Explorer')
    expect(
      tree.root.findAllByProps({ testID: 'achievements-error' })
    ).toHaveLength(0)
  })

  test('surfaces a server error with a retry path', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Internal server error', 500, 'http')
    )

    expect(tree.root.findByProps({ testID: 'achievements-error' })).toBeTruthy()
    const rendered = renderedText(tree)
    expect(rendered).toContain('Something went wrong')
    expect(rendered).not.toContain('connection')

    await press(tree, 'Retry loading achievements')
    await settle(runs[1], overview(['tetris_novice']))
    expect(renderedText(tree)).toContain('Tetris Novice')
  })

  test('treats a 401 as an expired session and returns to the sign-in CTA', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    const rendered = renderedText(tree)
    expect(rendered).toContain('expired')
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Retry loading achievements',
      })
    ).toHaveLength(0)

    await press(tree, 'Sign in to view achievements')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/(tabs)/achievements' },
    })
  })

  test('suppresses focus and foreground refetches after a 401 until reauthentication', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view achievements',
      })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({ testID: 'achievements-loading' })
    ).toHaveLength(0)
  })

  test('resumes fetching when the same user returns with a fresh session', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-a2')
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    await settle(runs[1], overview(['space_explorer']))
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
      })
    ).toBeTruthy()
    expect(renderedText(tree)).not.toContain('expired')
  })

  test('resumes fetching when reconciliation refreshes the same session id', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-user-a', '2026-01-02T00:00:00Z')
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    await settle(runs[1], overview(['space_explorer']))
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
      })
    ).toBeTruthy()
    expect(renderedText(tree)).not.toContain('expired')
  })

  test('stays suppressed when reconciliation returns the identical session', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    await rerender(tree, <AchievementsScreen />)
    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findAllByProps({ testID: 'achievements-loading' })
    ).toHaveLength(0)
  })

  test('shows the plain sign-in CTA when reconciliation finds no session', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signOut()
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    const rendered = renderedText(tree)
    expect(rendered).not.toContain('expired')
    expect(rendered).toContain('Sign in')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view achievements',
      })
    ).toBeTruthy()
  })

  test('latches again after a second 401 and never loops', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )

    signIn('user-a', 'sess-user-a', '2026-01-02T00:00:00Z')
    await rerender(tree, <AchievementsScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(2)

    await settleRejection(
      runs[1],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(2)

    await rerender(tree, <AchievementsScreen />)
    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findAllByProps({ testID: 'achievements-loading' })
    ).toHaveLength(0)
  })

  test('a stale reconciliation cannot unlock a newer session’s suppression', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <AchievementsScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(2)

    await settleRejection(
      runs[1],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(2)

    signIn('user-a', 'sess-user-a', '2026-01-01T00:00:00Z')
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findAllByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
      })
    ).toHaveLength(0)
  })

  test('signing out and back in as the same user resumes fetching', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    signOut()
    await rerender(tree, <AchievementsScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view achievements',
      })
    ).toBeTruthy()

    signIn('user-a', 'sess-a3')
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    await settle(runs[1], overview(['space_explorer']))
    expect(renderedText(tree)).toContain('Space Explorer')
  })

  test('a different account still fetches after a 401 on the previous account', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )

    signIn('user-b')
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).not.toContain('expired')

    await settle(runs[1], overview(['tetris_novice']))
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Tetris Novice, common achievement, Tetris Challenge, Score 100 points in Tetris, earned',
      })
    ).toBeTruthy()
  })
})

describe('achievements tab — account isolation', () => {
  test('masks the previous account immediately when the session user changes', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview(['space_explorer']))
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
      })
    ).toBeTruthy()

    signIn('user-b')
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(
      tree.root.findByProps({ testID: 'achievements-loading' })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
      })
    ).toHaveLength(0)
    expect(renderedText(tree)).not.toContain(`of ${TOTAL_ACHIEVEMENTS} earned`)

    await settle(runs[1], overview(['tetris_novice']))
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, locked',
      })
    ).toBeTruthy()
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Tetris Novice, common achievement, Tetris Challenge, Score 100 points in Tetris, earned',
      })
    ).toBeTruthy()
    expect(renderedText(tree)).toContain(`1 of ${TOTAL_ACHIEVEMENTS} earned`)
  })

  test('never shows account A data that resolves after switching to account B', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <AchievementsScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(2)

    await settle(runs[0], overview(['space_explorer']))
    expect(
      tree.root.findByProps({ testID: 'achievements-loading' })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
      })
    ).toHaveLength(0)

    await settle(runs[1], overview(['tetris_novice']))
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, locked',
      })
    ).toBeTruthy()
  })

  test('signing out returns to the CTA and masks the loaded data without refetching', async () => {
    signIn('user-a')
    const tree = await render(<AchievementsScreen />)
    await settle(runs[0], overview(['space_explorer']))

    signOut()
    await rerender(tree, <AchievementsScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view achievements',
      })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel:
          'Space Explorer, common achievement, Global, Welcome to the Cetus universe!, earned',
      })
    ).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Space Explorer')
  })
})

describe('achievements tab — refetch lifecycle', () => {
  test('refetches only when the tab regains focus', async () => {
    signIn('user-a')
    await render(<AchievementsScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await focus()
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await blur()
    await focus()
    expect(getUserOverview).toHaveBeenCalledTimes(2)
  })

  test('refetches on app foreground while focused, not on other transitions', async () => {
    signIn('user-a')
    await render(<AchievementsScreen />)
    await settle(runs[0], overview([]))
    await focus()
    expect(appStateListeners).toHaveLength(1)

    await appState('background')
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await appState('inactive')
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getUserOverview).toHaveBeenCalledTimes(2)
  })

  test('drops the app-state subscription on blur and ignores foregrounding unfocused', async () => {
    signIn('user-a')
    await render(<AchievementsScreen />)
    await focus()
    expect(appStateListeners).toHaveLength(1)
    const subscription = appStateListeners[0]

    await blur()
    expect(subscription.remove).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await focus()
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(appStateListeners).toHaveLength(2)
  })
})
