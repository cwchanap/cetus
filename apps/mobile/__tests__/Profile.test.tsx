import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { ApiClientError } from '@cetus/api-client/api-client'
import type {
  ScoreHistoryResponse,
  UserOverviewResponse,
} from '@cetus/shared/api-dto'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockCanGoBack = jest.fn()
let mockFocusCallback: (() => void) | undefined
const mockSessionRefetch = jest.fn()
const mockSignOut = jest.fn()
const mockRequestPermission = jest.fn()
const mockLaunchLibrary = jest.fn()
let mockSession: {
  data: {
    user: { id: string; name: string; email: string; image?: string | null }
    session: { id: string; updatedAt: string }
  } | null
  isPending: boolean
  refetch: jest.Mock
} = { data: null, isPending: false, refetch: mockSessionRefetch }

jest.mock('expo-router', () => ({
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

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    getUserOverview: jest.fn(),
    getScoreHistory: jest.fn(),
    updateProfile: jest.fn(),
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn(),
  },
}))

jest.mock('../src/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockSession,
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}))

import ProfileScreen from '../app/(tabs)/profile'
import { api } from '../src/lib/api'

const getUserOverview = jest.mocked(api.getUserOverview)
const getScoreHistory = jest.mocked(api.getScoreHistory)
const updateProfile = jest.mocked(api.updateProfile)
const uploadAvatar = jest.mocked(api.uploadAvatar)
const deleteAvatar = jest.mocked(api.deleteAvatar)
const addAppStateListener = jest.spyOn(AppState, 'addEventListener')

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

let overviewRuns: Deferred<UserOverviewResponse>[]
let historyRuns: Deferred<ScoreHistoryResponse>[]
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

const settleOverview = async (
  run: Deferred<UserOverviewResponse>,
  value: UserOverviewResponse
) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
  await drain()
}

const settleOverviewRejection = async (
  run: Deferred<UserOverviewResponse>,
  reason: unknown
) => {
  await act(async () => {
    run.reject(reason)
    await run.promise.catch(() => undefined)
  })
  await drain()
}

const settleHistory = async (
  run: Deferred<ScoreHistoryResponse>,
  value: ScoreHistoryResponse
) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
  await drain()
}

const settleHistoryRejection = async (
  run: Deferred<ScoreHistoryResponse>,
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

const typeInto = async (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string,
  value: string
) => {
  const node = tree.root.findByProps({ accessibilityLabel })
  await act(async () => {
    node.props.onChangeText(value)
  })
  await drain()
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
  sessionUpdatedAt = '2026-01-01T00:00:00Z',
  image: string | null = null
) => {
  mockSession = {
    data: {
      user: { id, name: `Diver ${id}`, email: `${id}@cetus.test`, image },
      session: { id: sessionId, updatedAt: sessionUpdatedAt },
    },
    isPending: false,
    refetch: mockSessionRefetch,
  }
}

const signOut = () => {
  mockSession = { data: null, isPending: false, refetch: mockSessionRefetch }
}

const overview = (
  overrides: Partial<UserOverviewResponse['profile']> = {},
  stats: Partial<UserOverviewResponse['stats']> = {}
): UserOverviewResponse => ({
  profile: {
    name: 'Diver',
    displayName: 'Wave Rider',
    username: 'wave_rider',
    image: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  },
  stats: {
    totalGamesPlayed: 12,
    totalScore: 3450,
    favoriteGame: 'tetris',
    streakDays: 3,
    xp: 450,
    level: 3,
    ...stats,
  },
  earnedAchievementIds: [],
})

const historyOf = (
  entries: ScoreHistoryResponse['history']
): ScoreHistoryResponse => ({ history: entries })

const HISTORY_ENTRIES: ScoreHistoryResponse['history'] = [
  {
    game_id: 'tetris',
    game_name: 'Tetris Challenge',
    score: 1200,
    created_at: '2026-01-05T12:00:00Z',
  },
  {
    game_id: 'snake',
    game_name: 'Snake',
    score: 640,
    created_at: '2026-01-04T12:00:00Z',
  },
]

const unauthorized = () =>
  new ApiClientError('Request failed with status 401', 401, 'http')

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockFocusCallback = undefined
  focusCleanup = undefined
  mockSessionRefetch.mockReset().mockResolvedValue(undefined)
  mockSignOut.mockReset().mockResolvedValue(undefined)
  mockRequestPermission.mockReset().mockResolvedValue({ granted: true })
  mockLaunchLibrary.mockReset().mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file://picked/avatar.png',
        fileName: 'avatar.png',
        fileSize: 1024,
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    ],
  })
  mockSession = { data: null, isPending: false, refetch: mockSessionRefetch }
  overviewRuns = []
  historyRuns = []
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
    overviewRuns.push(run)
    return run.promise
  })
  getScoreHistory.mockReset()
  getScoreHistory.mockImplementation(() => {
    const run = deferred<ScoreHistoryResponse>()
    historyRuns.push(run)
    return run.promise
  })
  updateProfile.mockReset().mockResolvedValue({
    success: true,
    message: 'Profile updated successfully',
  })
  uploadAvatar.mockReset().mockResolvedValue({
    success: true,
    message: 'Avatar updated successfully',
    avatar: 'data:image/png;base64,AAA=',
  })
  deleteAvatar.mockReset().mockResolvedValue({
    success: true,
    message: 'Avatar removed successfully',
  })
})

describe('profile tab — signed out', () => {
  test('shows an accessible sign-in CTA without issuing protected requests', async () => {
    const tree = await render(<ProfileScreen />)

    expect(getUserOverview).not.toHaveBeenCalled()
    expect(getScoreHistory).not.toHaveBeenCalled()

    const cta = tree.root.findByProps({
      accessibilityLabel: 'Sign in to view your profile',
    })
    expect(cta.props.accessibilityRole).toBe('button')
    expect(renderedText(tree)).toContain('Sign in')
  })

  test('routes the CTA to sign-in with a profile return destination', async () => {
    const tree = await render(<ProfileScreen />)

    await press(tree, 'Sign in to view your profile')

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/(tabs)/profile' },
    })
  })

  test('focus and app-foreground refetches stay inert while signed out', async () => {
    await render(<ProfileScreen />)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getUserOverview).not.toHaveBeenCalled()
    expect(getScoreHistory).not.toHaveBeenCalled()
  })
})

describe('profile tab — session resolving', () => {
  test('shows loading and issues no request while the session resolves', async () => {
    mockSession = { data: null, isPending: true, refetch: mockSessionRefetch }

    const tree = await render(<ProfileScreen />)

    expect(getUserOverview).not.toHaveBeenCalled()
    expect(getScoreHistory).not.toHaveBeenCalled()
    expect(tree.root.findByProps({ testID: 'profile-loading' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Sign in to view your profile',
      })
    ).toHaveLength(0)
  })

  test('holds the protected requests while a cached session is still resolving', async () => {
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

    const tree = await render(<ProfileScreen />)

    expect(getUserOverview).not.toHaveBeenCalled()
    expect(getScoreHistory).not.toHaveBeenCalled()

    mockSession = {
      data: mockSession.data,
      isPending: false,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <ProfileScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(getScoreHistory).toHaveBeenCalledTimes(1)
  })
})

describe('profile tab — signed in', () => {
  test('fetches overview and history and renders identity, stats and scores', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(getScoreHistory).toHaveBeenCalledTimes(1)

    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf(HISTORY_ENTRIES))

    const rendered = renderedText(tree)
    expect(rendered).toContain('Wave Rider')
    expect(rendered).toContain('@wave_rider')
    expect(rendered).toContain('user-a@cetus.test')
    expect(rendered).toContain('12')
    expect(rendered).toContain('3,450')
    expect(rendered).toContain('Tetris Challenge')
    expect(rendered).toContain('1,200')
    expect(rendered).toContain('Snake')
    expect(rendered).toContain('640')
    expect(
      tree.root.findByProps({ testID: 'profile-avatar-initial' })
    ).toBeTruthy()
  })

  test('falls back to the account name when the profile has no display name', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview({ displayName: null }))
    await settleHistory(historyRuns[0], historyOf([]))

    const rendered = renderedText(tree)
    expect(rendered).toContain('Diver user-a')
    expect(rendered).not.toContain('Wave Rider')
  })

  test('renders the server-provided avatar image when present', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(
      overviewRuns[0],
      overview({ image: 'data:image/png;base64,AAA=' })
    )
    await settleHistory(historyRuns[0], historyOf([]))

    const avatar = tree.root.findByProps({ testID: 'profile-avatar-image' })
    expect(avatar.props.source.uri).toBe('data:image/png;base64,AAA=')
  })

  test('shows the empty recent-scores state', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    expect(renderedText(tree)).toContain('No recent scores')
  })

  test('surfaces a history error with a retry that refetches history only', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistoryRejection(
      historyRuns[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(renderedText(tree)).toContain("Couldn't load recent scores")

    await press(tree, 'Retry loading recent scores')
    expect(getScoreHistory).toHaveBeenCalledTimes(2)
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await settleHistory(historyRuns[1], historyOf(HISTORY_ENTRIES))
    expect(renderedText(tree)).toContain('Tetris Challenge')
  })

  test('surfaces an overview error with a retry path', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverviewRejection(
      overviewRuns[0],
      new ApiClientError('Internal server error', 500, 'http')
    )

    expect(tree.root.findByProps({ testID: 'profile-error' })).toBeTruthy()

    await press(tree, 'Retry loading your profile')
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    await settleOverview(overviewRuns[1], overview())
    expect(renderedText(tree)).toContain('Wave Rider')
  })

  test('treats a 401 as an expired session and returns to the sign-in CTA', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverviewRejection(overviewRuns[0], unauthorized())

    const rendered = renderedText(tree)
    expect(rendered).toContain('expired')
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Retry loading your profile',
      })
    ).toHaveLength(0)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    await press(tree, 'Sign in to view your profile')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/(tabs)/profile' },
    })
  })

  test('suppresses focus and foreground refetches after a 401 until reauthentication', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverviewRejection(overviewRuns[0], unauthorized())
    await settleHistoryRejection(historyRuns[0], unauthorized())
    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(getScoreHistory).toHaveBeenCalledTimes(1)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(getScoreHistory).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
  })

  test('resumes fetching when reconciliation refreshes the same session id', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverviewRejection(overviewRuns[0], unauthorized())
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-user-a', '2026-01-02T00:00:00Z')
    await rerender(tree, <ProfileScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(getScoreHistory).toHaveBeenCalledTimes(2)
    await settleOverview(overviewRuns[1], overview())
    await settleHistory(historyRuns[1], historyOf(HISTORY_ENTRIES))
    expect(renderedText(tree)).toContain('Wave Rider')
    expect(renderedText(tree)).not.toContain('expired')
  })

  test('stays suppressed when reconciliation returns the identical session', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverviewRejection(overviewRuns[0], unauthorized())

    await rerender(tree, <ProfileScreen />)
    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
  })

  test('a different account still fetches after a 401 on the previous account', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverviewRejection(overviewRuns[0], unauthorized())

    signIn('user-b')
    await rerender(tree, <ProfileScreen />)

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).not.toContain('expired')
  })

  test('a 401 from a mutation also latches the expired session', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    updateProfile.mockRejectedValueOnce(unauthorized())
    await press(tree, 'Save profile')

    expect(renderedText(tree)).toContain('expired')
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
  })
})

describe('profile tab — account isolation', () => {
  test('masks the previous account immediately when the session user changes', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf(HISTORY_ENTRIES))
    expect(renderedText(tree)).toContain('Wave Rider')

    signIn('user-b')
    await rerender(tree, <ProfileScreen />)

    const rendered = renderedText(tree)
    expect(rendered).not.toContain('Wave Rider')
    expect(rendered).not.toContain('@wave_rider')
    expect(rendered).not.toContain('Tetris Challenge')
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(getScoreHistory).toHaveBeenCalledTimes(2)
  })

  test('never shows account A data that resolves after switching to account B', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <ProfileScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(2)

    await settleOverview(overviewRuns[0], overview({ username: 'leaked_a' }))
    await settleHistory(
      historyRuns[0],
      historyOf([
        {
          game_id: 'tetris',
          game_name: 'Leaked Game',
          score: 1,
          created_at: '2026-01-05T12:00:00Z',
        },
      ])
    )

    const rendered = renderedText(tree)
    expect(rendered).not.toContain('leaked_a')
    expect(rendered).not.toContain('Wave Rider')
    expect(rendered).not.toContain('Leaked Game')
    expect(tree.root.findByProps({ testID: 'profile-loading' })).toBeTruthy()

    await settleOverview(overviewRuns[1], overview({ username: 'diver_b' }))
    await settleHistory(historyRuns[1], historyOf([]))
    expect(renderedText(tree)).toContain('@diver_b')
  })

  test('a mutation started by account A cannot update the UI after switching to B', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    const pendingSave = deferred<{
      success: true
      message: string
    }>()
    updateProfile.mockImplementationOnce(() => pendingSave.promise)
    await typeInto(tree, 'Display name', 'Mutated A')
    const save = tree.root.findByProps({ accessibilityLabel: 'Save profile' })
    await act(async () => {
      save.props.onPress()
    })

    signIn('user-b')
    await rerender(tree, <ProfileScreen />)

    await act(async () => {
      pendingSave.resolve({ success: true, message: 'ok' })
      await pendingSave.promise
    })
    await drain()

    const rendered = renderedText(tree)
    expect(rendered).not.toContain('Profile updated')
    expect(updateProfile).toHaveBeenCalledTimes(1)
    expect(getUserOverview).toHaveBeenCalledTimes(2)
  })

  test('signing out masks private data and late read resolutions stay hidden', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf(HISTORY_ENTRIES))

    signOut()
    await rerender(tree, <ProfileScreen />)

    const rendered = renderedText(tree)
    expect(rendered).not.toContain('Wave Rider')
    expect(rendered).not.toContain('Tetris Challenge')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view your profile',
      })
    ).toBeTruthy()
    expect(getUserOverview).toHaveBeenCalledTimes(1)
  })
})

describe('profile tab — profile editing', () => {
  test('prefills the editor from the loaded profile', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    expect(
      tree.root.findByProps({ accessibilityLabel: 'Display name' }).props.value
    ).toBe('Wave Rider')
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Username' }).props.value
    ).toBe('wave_rider')
  })

  test('rejects invalid input locally without calling the API', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    await typeInto(tree, 'Username', 'NO!!')
    await press(tree, 'Save profile')

    expect(updateProfile).not.toHaveBeenCalled()
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' })
    expect(scalarText(alert.props.children)).toContain('Username')
  })

  test('saves valid input, confirms, and refreshes the overview', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    await typeInto(tree, 'Display name', 'Nova Diver')
    await typeInto(tree, 'Username', 'Nova_K')
    await press(tree, 'Save profile')

    expect(updateProfile).toHaveBeenCalledTimes(1)
    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Nova Diver',
      username: 'nova_k',
    })
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('Profile updated')
  })

  test('surfaces a server-side profile error', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    updateProfile.mockRejectedValueOnce(
      new ApiClientError('Username is already taken', 409, 'http')
    )
    await typeInto(tree, 'Username', 'taken_name')
    await press(tree, 'Save profile')

    const alert = tree.root.findByProps({ accessibilityRole: 'alert' })
    expect(scalarText(alert.props.children)).toContain(
      'Username is already taken'
    )
  })
})

describe('profile tab — avatar', () => {
  const signedInWithAvatar = async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(
      overviewRuns[0],
      overview({ image: 'data:image/png;base64,OLD=' })
    )
    await settleHistory(historyRuns[0], historyOf([]))
    return tree
  }

  test('does nothing when the picker is canceled', async () => {
    const tree = await signedInWithAvatar()
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: true, assets: null })

    await press(tree, 'Change avatar')

    expect(uploadAvatar).not.toHaveBeenCalled()
    expect(mockRequestPermission).toHaveBeenCalledTimes(1)
    expect(mockLaunchLibrary).toHaveBeenCalledTimes(1)
    const options = mockLaunchLibrary.mock.calls[0][0] as {
      allowsEditing?: boolean
      aspect?: number[]
      mediaTypes?: unknown
    }
    expect(options.allowsEditing).toBe(true)
    expect(options.aspect).toEqual([1, 1])
  })

  test('explains when photo permission is denied and never launches the picker', async () => {
    const tree = await signedInWithAvatar()
    mockRequestPermission.mockResolvedValueOnce({ granted: false })

    await press(tree, 'Change avatar')

    expect(mockLaunchLibrary).not.toHaveBeenCalled()
    expect(uploadAvatar).not.toHaveBeenCalled()
    expect(renderedText(tree)).toContain('photo library access')
  })

  test.each([
    [{ mimeType: 'image/heic', fileName: 'avatar.heic', uri: 'file://a.heic' }],
    [{ mimeType: undefined, fileName: 'notes.txt', uri: 'file://notes.txt' }],
  ])(
    'rejects an unsupported asset type without uploading %j',
    async assetOverrides => {
      const tree = await signedInWithAvatar()
      mockLaunchLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            fileSize: 100,
            width: 10,
            height: 10,
            ...assetOverrides,
          },
        ],
      })

      await press(tree, 'Change avatar')

      expect(uploadAvatar).not.toHaveBeenCalled()
      expect(renderedText(tree)).toContain('PNG, JPEG, WebP, or GIF')
    }
  )

  test('rejects an oversized asset without uploading', async () => {
    const tree = await signedInWithAvatar()
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://big.png',
          fileName: 'big.png',
          fileSize: 5 * 1024 * 1024 + 1,
          mimeType: 'image/png',
          width: 4000,
          height: 4000,
        },
      ],
    })

    await press(tree, 'Change avatar')

    expect(uploadAvatar).not.toHaveBeenCalled()
    expect(renderedText(tree)).toContain('5 MB')
  })

  test('uploads the picked asset as a native FormData part named avatar', async () => {
    const tree = await signedInWithAvatar()
    const appendSpy = jest.spyOn(FormData.prototype, 'append')

    await press(tree, 'Change avatar')

    expect(uploadAvatar).toHaveBeenCalledTimes(1)
    const formData = uploadAvatar.mock.calls[0][0] as FormData
    expect(formData).toBeInstanceOf(FormData)
    expect(appendSpy).toHaveBeenCalledWith(
      'avatar',
      expect.objectContaining({
        uri: 'file://picked/avatar.png',
        name: 'avatar.png',
        type: 'image/png',
      })
    )
    appendSpy.mockRestore()
  })

  test('displays the returned server image immediately and after refresh', async () => {
    const tree = await signedInWithAvatar()

    await press(tree, 'Change avatar')

    let avatar = tree.root.findByProps({ testID: 'profile-avatar-image' })
    expect(avatar.props.source.uri).toBe('data:image/png;base64,AAA=')
    expect(renderedText(tree)).toContain('Avatar updated')
    expect(getUserOverview).toHaveBeenCalledTimes(2)

    await settleOverview(
      overviewRuns[1],
      overview({ image: 'data:image/png;base64,AAA=' })
    )
    avatar = tree.root.findByProps({ testID: 'profile-avatar-image' })
    expect(avatar.props.source.uri).toBe('data:image/png;base64,AAA=')
  })

  test('surfaces an upload failure without changing the avatar', async () => {
    const tree = await signedInWithAvatar()
    uploadAvatar.mockRejectedValueOnce(
      new ApiClientError('Failed to update avatar', 500, 'http')
    )

    await press(tree, 'Change avatar')

    const avatar = tree.root.findByProps({ testID: 'profile-avatar-image' })
    expect(avatar.props.source.uri).toBe('data:image/png;base64,OLD=')
    expect(renderedText(tree)).toContain("Couldn't update your avatar")
  })

  test('removes the avatar through deleteAvatar and refreshes', async () => {
    const tree = await signedInWithAvatar()

    await press(tree, 'Remove avatar')

    expect(deleteAvatar).toHaveBeenCalledTimes(1)
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(
      tree.root.findByProps({ testID: 'profile-avatar-initial' })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({ testID: 'profile-avatar-image' })
    ).toHaveLength(0)
    expect(renderedText(tree)).toContain('Avatar removed')
  })

  test('a canceled picker or a switch mid-upload cannot leak into the next account', async () => {
    const tree = await signedInWithAvatar()
    const pendingUpload = deferred<{
      success: true
      message: string
      avatar: string
    }>()
    uploadAvatar.mockImplementationOnce(() => pendingUpload.promise)

    await press(tree, 'Change avatar')

    signIn('user-b')
    await rerender(tree, <ProfileScreen />)

    await act(async () => {
      pendingUpload.resolve({
        success: true,
        message: 'ok',
        avatar: 'data:image/png;base64,AAA=',
      })
      await pendingUpload.promise
    })
    await drain()

    expect(renderedText(tree)).not.toContain('Avatar updated')
    expect(
      tree.root.findAllByProps({ testID: 'profile-avatar-image' })
    ).toHaveLength(0)
  })
})

describe('profile tab — sign out', () => {
  test('signs out through the auth client', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))

    await press(tree, 'Sign out')

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})

describe('profile tab — sign out availability', () => {
  test('keeps sign-out available while the overview is still loading', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)

    const button = tree.root.findByProps({ accessibilityLabel: 'Sign out' })
    await act(async () => {
      button.props.onPress()
    })
    await drain()

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  test('keeps sign-out available while the session resolves', async () => {
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
    const tree = await render(<ProfileScreen />)

    const button = tree.root.findByProps({ accessibilityLabel: 'Sign out' })
    await act(async () => {
      button.props.onPress()
    })
    await drain()

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  test('keeps sign-out available when the overview request fails', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverviewRejection(
      overviewRuns[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(tree.root.findByProps({ testID: 'profile-error' })).toBeTruthy()
    await press(tree, 'Sign out')

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})

describe('profile tab — stale session image', () => {
  test('treats the overview image as authoritative over a stale cached session avatar', async () => {
    signIn('user-a', 'sess-a', '2026-01-01T00:00:00Z', 'data:STALE_SESSION')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview({ image: null }))
    await settleHistory(historyRuns[0], historyOf([]))

    expect(
      tree.root.findByProps({ testID: 'profile-avatar-initial' })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({ testID: 'profile-avatar-image' })
    ).toHaveLength(0)
  })
})

describe('profile tab — picker session transitions', () => {
  const signedInWithAvatar = async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(
      overviewRuns[0],
      overview({ image: 'data:image/png;base64,OLD=' })
    )
    await settleHistory(historyRuns[0], historyOf([]))
    return tree
  }

  const openPendingPicker = async (tree: TestRenderer.ReactTestRenderer) => {
    const picker = deferred<{
      canceled: boolean
      assets: unknown[] | null
    }>()
    mockLaunchLibrary.mockImplementationOnce(() => picker.promise)
    const change = tree.root.findByProps({
      accessibilityLabel: 'Change avatar',
    })
    await act(async () => {
      change.props.onPress()
    })
    await drain()
    expect(mockLaunchLibrary).toHaveBeenCalledTimes(1)
    return picker
  }

  const resolvePicker = async (
    picker: Deferred<{ canceled: boolean; assets: unknown[] | null }>
  ) => {
    await act(async () => {
      picker.resolve({
        canceled: false,
        assets: [
          {
            uri: 'file://picked/avatar.png',
            fileName: 'avatar.png',
            fileSize: 1024,
            mimeType: 'image/png',
            width: 512,
            height: 512,
          },
        ],
      })
      await picker.promise
    })
    await drain()
  }

  test('abandons the pick when the session becomes pending mid-picker', async () => {
    const tree = await signedInWithAvatar()
    const picker = await openPendingPicker(tree)

    mockSession = {
      data: mockSession.data,
      isPending: true,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <ProfileScreen />)

    await resolvePicker(picker)

    expect(uploadAvatar).not.toHaveBeenCalled()
  })

  test('abandons the pick when a 401 latches mid-picker', async () => {
    const tree = await signedInWithAvatar()
    const picker = await openPendingPicker(tree)

    await focus()
    await blur()
    await focus()
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    await settleOverviewRejection(overviewRuns[1], unauthorized())
    expect(renderedText(tree)).toContain('expired')

    await resolvePicker(picker)

    expect(uploadAvatar).not.toHaveBeenCalled()
  })

  test('completes the upload when the session stays eligible through the pick', async () => {
    const tree = await signedInWithAvatar()
    const picker = await openPendingPicker(tree)

    await resolvePicker(picker)

    expect(uploadAvatar).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('Avatar updated')
  })
})

describe('profile tab — avatar override reconciliation', () => {
  const signedInWithAvatar = async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(
      overviewRuns[0],
      overview({ image: 'data:image/png;base64,OLD=' })
    )
    await settleHistory(historyRuns[0], historyOf([]))
    return tree
  }

  const avatarUri = (tree: TestRenderer.ReactTestRenderer) =>
    (
      tree.root.findByProps({ testID: 'profile-avatar-image' }).props
        .source as { uri: string }
    ).uri

  test('retires the upload override when the post-mutation read returns a server-side change', async () => {
    const tree = await signedInWithAvatar()

    await press(tree, 'Change avatar')
    expect(avatarUri(tree)).toBe('data:image/png;base64,AAA=')
    expect(getUserOverview).toHaveBeenCalledTimes(2)

    await settleOverview(
      overviewRuns[1],
      overview({ image: 'data:image/png;base64,WEB=' })
    )

    expect(avatarUri(tree)).toBe('data:image/png;base64,WEB=')
  })

  test('a stale in-flight read cannot retire the override before the post-mutation read lands', async () => {
    const tree = await signedInWithAvatar()

    await focus()
    await blur()
    await focus()
    expect(getUserOverview).toHaveBeenCalledTimes(2)

    await press(tree, 'Change avatar')
    expect(avatarUri(tree)).toBe('data:image/png;base64,AAA=')
    expect(getUserOverview).toHaveBeenCalledTimes(3)

    await settleOverview(
      overviewRuns[1],
      overview({ image: 'data:image/png;base64,STALE=' })
    )
    expect(avatarUri(tree)).toBe('data:image/png;base64,AAA=')

    await settleOverview(
      overviewRuns[2],
      overview({ image: 'data:image/png;base64,WEB=' })
    )
    expect(avatarUri(tree)).toBe('data:image/png;base64,WEB=')
  })
})

describe('profile tab — busy ownership across accounts', () => {
  const signedIn = async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(overviewRuns[0], overview())
    await settleHistory(historyRuns[0], historyOf([]))
    return tree
  }

  const switchToUserB = async (tree: TestRenderer.ReactTestRenderer) => {
    signIn('user-b')
    await rerender(tree, <ProfileScreen />)
    await settleOverview(overviewRuns[1], overview({ username: 'diver_b' }))
    await settleHistory(historyRuns[1], historyOf([]))
  }

  test('account B can save while account A save is still in flight', async () => {
    const tree = await signedIn()

    const pendingA = deferred<{ success: true; message: string }>()
    updateProfile.mockImplementationOnce(() => pendingA.promise)
    await typeInto(tree, 'Display name', 'A edit')
    await press(tree, 'Save profile')
    expect(updateProfile).toHaveBeenCalledTimes(1)

    await switchToUserB(tree)

    await typeInto(tree, 'Display name', 'B edit')
    await press(tree, 'Save profile')

    expect(updateProfile).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('Profile updated')

    await act(async () => {
      pendingA.resolve({ success: true, message: 'ok' })
      await pendingA.promise
    })
    await drain()

    expect(renderedText(tree)).toContain('Profile updated')
    expect(getUserOverview).toHaveBeenCalledTimes(3)
  })

  test('a stale A completion resolving after B started does not block B result', async () => {
    const tree = await signedIn()

    const pendingA = deferred<{ success: true; message: string }>()
    updateProfile.mockImplementationOnce(() => pendingA.promise)
    await typeInto(tree, 'Display name', 'A edit')
    await press(tree, 'Save profile')

    await switchToUserB(tree)

    const pendingB = deferred<{ success: true; message: string }>()
    updateProfile.mockImplementationOnce(() => pendingB.promise)
    await typeInto(tree, 'Display name', 'B edit')
    await press(tree, 'Save profile')
    expect(updateProfile).toHaveBeenCalledTimes(2)

    await act(async () => {
      pendingA.resolve({ success: true, message: 'ok' })
      await pendingA.promise
    })
    await drain()
    expect(renderedText(tree)).not.toContain('Profile updated')

    await act(async () => {
      pendingB.resolve({ success: true, message: 'ok' })
      await pendingB.promise
    })
    await drain()

    expect(renderedText(tree)).toContain('Profile updated')
  })

  test('account B can upload an avatar while account A upload is in flight', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    await settleOverview(
      overviewRuns[0],
      overview({ image: 'data:image/png;base64,OLD=' })
    )
    await settleHistory(historyRuns[0], historyOf([]))

    const pendingA = deferred<{
      success: true
      message: string
      avatar: string
    }>()
    uploadAvatar.mockImplementationOnce(() => pendingA.promise)
    await press(tree, 'Change avatar')
    expect(uploadAvatar).toHaveBeenCalledTimes(1)

    await switchToUserB(tree)

    await press(tree, 'Change avatar')
    expect(uploadAvatar).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('Avatar updated')

    await act(async () => {
      pendingA.resolve({
        success: true,
        message: 'ok',
        avatar: 'data:image/png;base64,AAA=',
      })
      await pendingA.promise
    })
    await drain()
    expect(renderedText(tree)).toContain('Avatar updated')
  })
})

describe('profile tab — refetch lifecycle', () => {
  test('refetches only when the tab regains focus', async () => {
    signIn('user-a')
    await render(<ProfileScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(1)
    expect(getScoreHistory).toHaveBeenCalledTimes(1)

    await focus()
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await blur()
    await focus()
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(getScoreHistory).toHaveBeenCalledTimes(2)
  })

  test('refetches on app foreground while focused', async () => {
    signIn('user-a')
    await render(<ProfileScreen />)
    await focus()
    expect(appStateListeners).toHaveLength(1)

    await appState('background')
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(getScoreHistory).toHaveBeenCalledTimes(2)
  })
})
