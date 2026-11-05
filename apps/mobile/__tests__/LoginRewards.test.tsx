import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Modal, Text, type AppStateStatus } from 'react-native'
import { ApiClientError } from '@cetus/api-client/api-client'
import type {
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
  ScoreHistoryResponse,
  UserOverviewResponse,
} from '@cetus/shared/api-dto'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockCanGoBack = jest.fn()
const mockFocusCallbacks: (() => unknown)[] = []
const mockSessionRefetch = jest.fn()
const mockNotificationAsync = jest.fn()
const mockRequestPermission = jest.fn()
const mockLaunchLibrary = jest.fn()
let mockSession: {
  data: {
    user: { id: string; name: string; email: string }
    session: { id: string; updatedAt: string }
  } | null
  isPending: boolean
  refetch: jest.Mock
} = { data: null, isPending: false, refetch: mockSessionRefetch }
let mockFocusOnRegister = true

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useFocusEffect: (callback: () => unknown) => {
    if (!mockFocusCallbacks.includes(callback)) {
      mockFocusCallbacks.push(callback)
      if (mockFocusOnRegister) {
        const cleanup = callback()
        if (typeof cleanup === 'function') {
          mockFocusCleanups.push(cleanup as () => void)
        }
      }
    }
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

jest.mock('expo-haptics', () => ({
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    getLoginRewardStatus: jest.fn(),
    claimLoginReward: jest.fn(),
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
    signOut: jest.fn().mockResolvedValue(undefined),
  },
}))

let mockTodayUTC = '2026-03-04'

jest.mock('@cetus/shared/challenges', () => ({
  ...jest.requireActual('@cetus/shared/challenges'),
  getTodayUTC: () => mockTodayUTC,
}))

import { LoginRewardHost } from '../src/lib/login-rewards'
import GamesScreen from '../app/(tabs)/index'
import ProfileScreen from '../app/(tabs)/profile'
import { api } from '../src/lib/api'

// The first render carries the cold transform/render cost of the native UI
// tree; on a shared CI worker that can exceed the 5s default. An act() that
// is abandoned mid-flight also poisons React's act depth for the whole file,
// so keep the timeout comfortably above worst-case render time.
jest.setTimeout(30_000)

const getLoginRewardStatus = jest.mocked(api.getLoginRewardStatus)
const claimLoginReward = jest.mocked(api.claimLoginReward)
const getUserOverview = jest.mocked(api.getUserOverview)
const getScoreHistory = jest.mocked(api.getScoreHistory)
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

let statusRuns: Deferred<LoginRewardStatusResponse>[]
let claimRuns: Deferred<LoginRewardClaimResponse>[]
let overviewRuns: Deferred<UserOverviewResponse>[]
let historyRuns: Deferred<ScoreHistoryResponse>[]
let appStateListeners: {
  listener: (state: AppStateStatus) => void
  remove: jest.Mock
  removed: boolean
}[]
let mockFocusCleanups: (() => void)[]

const drain = async (ms = 75) => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms))
  })
}

const mountedTrees: TestRenderer.ReactTestRenderer[] = []

const render = async (element: React.ReactElement) => {
  let tree: TestRenderer.ReactTestRenderer | undefined
  await act(async () => {
    tree = TestRenderer.create(element)
  })
  await drain()
  if (!tree) {
    throw new Error('TestRenderer.create returned nothing')
  }
  mountedTrees.push(tree)
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

const settle = async <T,>(run: Deferred<T>, value: T) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
  await drain()
}

const settleRejection = async <T,>(run: Deferred<T>, reason: unknown) => {
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

const openModals = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Modal).filter(node => node.props.visible === true)

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

const focus = async () => {
  await act(async () => {
    for (const callback of mockFocusCallbacks) {
      const cleanup = callback()
      if (typeof cleanup === 'function') {
        mockFocusCleanups.push(cleanup as () => void)
      }
    }
  })
  await drain()
}

const blur = async () => {
  await act(async () => {
    for (const cleanup of mockFocusCleanups) {
      cleanup()
    }
    mockFocusCleanups = []
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

const status = (
  overrides: Partial<LoginRewardStatusResponse> = {}
): LoginRewardStatusResponse => ({
  loginStreak: 2,
  currentCycleDay: 3,
  totalCycles: 1,
  totalConsecutiveDays: 9,
  todayReward: {
    day: 3,
    xp: 30,
    icon: '✨',
    description: 'Day 3 - Building momentum!',
  },
  alreadyClaimed: false,
  canClaim: true,
  nextMilestone: {
    totalDays: 30,
    achievementId: 'login_streak_30',
    name: 'Monthly Master',
    description: 'Complete 30 days of consecutive logins',
    icon: '🎖️',
  },
  daysUntilMilestone: 21,
  ...overrides,
})

const claimSuccess = (
  overrides: Partial<LoginRewardClaimResponse> = {}
): LoginRewardClaimResponse => ({
  success: true,
  xpEarned: 30,
  newTotalXP: 480,
  newLevel: 4,
  leveledUp: true,
  previousLevel: 3,
  updatedStatus: status({
    loginStreak: 3,
    currentCycleDay: 3,
    totalConsecutiveDays: 10,
    alreadyClaimed: true,
    canClaim: false,
    daysUntilMilestone: 20,
  }),
  ...overrides,
})

const unauthorized = () =>
  new ApiClientError('Request failed with status 401', 401, 'http')

const AUTO_OPEN_WAIT = 650

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockFocusCallbacks.length = 0
  mockFocusCleanups = []
  mockFocusOnRegister = true
  mockTodayUTC = '2026-03-04'
  mockSessionRefetch.mockReset().mockResolvedValue(undefined)
  mockNotificationAsync.mockReset().mockResolvedValue(undefined)
  mockRequestPermission.mockReset().mockResolvedValue({ granted: true })
  mockLaunchLibrary
    .mockReset()
    .mockResolvedValue({ canceled: true, assets: [] })
  mockSession = { data: null, isPending: false, refetch: mockSessionRefetch }
  statusRuns = []
  claimRuns = []
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
  getLoginRewardStatus.mockReset()
  getLoginRewardStatus.mockImplementation(() => {
    const run = deferred<LoginRewardStatusResponse>()
    statusRuns.push(run)
    return run.promise
  })
  claimLoginReward.mockReset()
  claimLoginReward.mockImplementation(() => {
    const run = deferred<LoginRewardClaimResponse>()
    claimRuns.push(run)
    return run.promise
  })
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
})

afterEach(async () => {
  while (mountedTrees.length > 0) {
    const tree = mountedTrees.pop()
    await act(async () => {
      tree?.unmount()
    })
  }
})

describe('login reward host — session gating', () => {
  test('issues no protected request and renders nothing while signed out', async () => {
    const tree = await render(<LoginRewardHost />)

    expect(getLoginRewardStatus).not.toHaveBeenCalled()
    expect(claimLoginReward).not.toHaveBeenCalled()
    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })

  test('holds the protected request while a cached session resolves', async () => {
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

    const tree = await render(<LoginRewardHost />)

    expect(getLoginRewardStatus).not.toHaveBeenCalled()

    mockSession = {
      data: mockSession.data,
      isPending: false,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <LoginRewardHost />)

    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)
  })

  test('focus and foreground refetches stay inert while signed out', async () => {
    await render(<LoginRewardHost />)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getLoginRewardStatus).not.toHaveBeenCalled()
  })

  test('fetches the server status once signed in', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)

    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)
    await settle(
      statusRuns[0],
      status({ alreadyClaimed: true, canClaim: false })
    )
    expect(openModals(tree)).toHaveLength(0)
  })
})

describe('login reward host — server status rendering', () => {
  test('opens the modal with the server-provided day, streak and reward', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())

    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    const rendered = renderedText(tree)
    expect(rendered).toContain('Daily Login Reward')
    expect(rendered).toContain('Day 3')
    expect(rendered).toContain('+30 XP')
    expect(rendered).toContain('Day 3 - Building momentum!')
    expect(rendered).toContain('Day Streak')
    expect(rendered).toContain('Cycles')
    expect(rendered).toContain('Claim Reward')
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      expect(rendered).toContain(`Day ${day}`)
    }
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Day 1, 10 XP, claimed' })
    ).toBeTruthy()
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Day 3, 30 XP, today' })
    ).toBeTruthy()
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Day 7, 100 XP, upcoming',
      })
    ).toBeTruthy()
  })

  test('stays closed when the server reports the reward already claimed', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(
      statusRuns[0],
      status({
        loginStreak: 3,
        alreadyClaimed: true,
        canClaim: false,
      })
    )

    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })

  test('stays closed on a malformed status payload', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(
      statusRuns[0],
      status({
        canClaim: 'yes',
      } as unknown as Partial<LoginRewardStatusResponse>)
    )

    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })

  test('stays closed when the status request fails', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settleRejection(
      statusRuns[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })

  test('opens again when a refetch flips the server status back to claimable', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(
      statusRuns[0],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)

    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
  })

  test('does not reopen on a refetch while the same status stays claimable', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)

    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
  })
})

describe('login reward host — claiming', () => {
  const openClaimable = async (tree: TestRenderer.ReactTestRenderer) => {
    await settle(statusRuns[statusRuns.length - 1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
  }

  test('claims through the API, celebrates and refreshes the status', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)

    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('Claiming')

    await settle(claimRuns[0], claimSuccess())

    const rendered = renderedText(tree)
    expect(rendered).toContain('LEVEL UP! Level 4')
    expect(rendered).toContain('Claimed Today')
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1)
    expect(mockNotificationAsync).toHaveBeenCalledWith('success')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
  })

  test('surfaces the milestone badge the server returns', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')

    await settle(
      claimRuns[0],
      claimSuccess({
        leveledUp: false,
        milestoneBadge: {
          totalDays: 30,
          achievementId: 'login_streak_30',
          name: 'Monthly Master',
          description: 'Complete 30 days of consecutive logins',
          icon: '🎖️',
        },
      })
    )

    const rendered = renderedText(tree)
    expect(rendered).toContain('Monthly Master')
    expect(rendered).toContain('Complete 30 days of consecutive logins')
    expect(rendered).not.toContain('LEVEL UP')
  })

  test('auto-closes a few seconds after a successful claim', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settle(claimRuns[0], claimSuccess())
    expect(openModals(tree)).toHaveLength(1)

    await drain(3200)

    expect(openModals(tree)).toHaveLength(0)
  })

  test('ignores duplicate presses while a claim is in flight', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)

    const claimButton = () =>
      tree.root.findByProps({
        accessibilityLabel: 'Claim daily login reward',
      })
    await act(async () => {
      claimButton().props.onPress()
      claimButton().props.onPress()
      claimButton().props.onPress()
    })
    await drain()

    expect(claimLoginReward).toHaveBeenCalledTimes(1)
    expect(claimButton().props.accessibilityState?.busy).toBe(true)

    await settle(claimRuns[0], claimSuccess({ leveledUp: false }))
    expect(claimLoginReward).toHaveBeenCalledTimes(1)
  })

  test('surfaces a transient failure with a persistent alert and allows a retry', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settleRejection(
      claimRuns[0],
      new ApiClientError('Reward service unavailable', 500, 'http')
    )

    expect(mockNotificationAsync).not.toHaveBeenCalled()
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' })
    expect(scalarText(alert.props.children)).toBe('Reward service unavailable')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settle(statusRuns[1], status())
    expect(renderedText(tree)).toContain('Try again')

    await drain(2200)
    const persisted = tree.root.findByProps({ accessibilityRole: 'alert' })
    expect(scalarText(persisted.props.children)).toBe(
      'Reward service unavailable'
    )

    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(2)
    await settle(claimRuns[1], claimSuccess({ leveledUp: false }))
    expect(renderedText(tree)).toContain('Claimed Today')
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1)
  })

  test('reconciles an already-claimed rejection to the server truth without another mutation', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settleRejection(
      claimRuns[0],
      new ApiClientError('Reward already claimed today', 400, 'http')
    )

    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    expect(tree.root.findByProps({ accessibilityRole: 'alert' })).toBeTruthy()

    await settle(
      statusRuns[1],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await drain()

    expect(renderedText(tree)).toContain('Claimed Today')
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Claim daily login reward',
      })
    ).toHaveLength(0)
    expect(claimLoginReward).toHaveBeenCalledTimes(1)
    expect(mockNotificationAsync).not.toHaveBeenCalled()
  })

  test('surfaces a network claim failure distinctly', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settleRejection(
      claimRuns[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(statusRuns[1], status())

    const rendered = renderedText(tree)
    expect(rendered).toContain('Network error')
    expect(mockNotificationAsync).not.toHaveBeenCalled()
  })

  test('retires the claim overlay when the post-claim refetch returns newer truth', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settle(claimRuns[0], claimSuccess())
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('Claimed Today')

    await drain(3200)
    expect(openModals(tree)).toHaveLength(0)

    await settle(
      statusRuns[1],
      status({
        loginStreak: 3,
        currentCycleDay: 4,
        todayReward: {
          day: 4,
          xp: 40,
          icon: '💫',
          description: 'Day 4 - Half way there!',
        },
        totalConsecutiveDays: 10,
        alreadyClaimed: false,
        canClaim: true,
        daysUntilMilestone: 20,
      })
    )
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('+40 XP')
  })

  test('a pre-claim fetch resolving late cannot displace the claim overlay', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')

    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settle(claimRuns[0], claimSuccess())
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(3)
    expect(renderedText(tree)).toContain('Claimed Today')

    await settle(statusRuns[1], status())
    expect(renderedText(tree)).toContain('Claimed Today')

    await settle(
      statusRuns[2],
      status({ alreadyClaimed: true, canClaim: false })
    )
    expect(renderedText(tree)).toContain('Claimed Today')
  })

  test('a failed refetch cannot resurrect the retired claim overlay', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settle(claimRuns[0], claimSuccess())
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('Claimed Today')

    await settle(
      statusRuns[1],
      status({
        loginStreak: 3,
        currentCycleDay: 4,
        todayReward: {
          day: 4,
          xp: 40,
          icon: '💫',
          description: 'Day 4 - Half way there!',
        },
        totalConsecutiveDays: 10,
        daysUntilMilestone: 20,
      })
    )
    expect(renderedText(tree)).toContain('+40 XP')

    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(3)
    await settleRejection(
      statusRuns[2],
      new ApiClientError('Reward service unavailable', 500, 'http')
    )

    expect(renderedText(tree)).not.toContain('+30 XP')
    expect(renderedText(tree)).not.toContain('Day 3 - Building momentum!')
  })

  test('an unresolved claim from account A does not block account B', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <LoginRewardHost />)
    await settle(statusRuns[statusRuns.length - 1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(2)

    await settle(claimRuns[1], claimSuccess({ leveledUp: false }))
    expect(renderedText(tree)).toContain('Claimed Today')
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1)

    await settle(claimRuns[0], claimSuccess())
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1)
  })

  test('claims stay independent across A to B to A account switches', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <LoginRewardHost />)
    await settle(statusRuns[statusRuns.length - 1], status())
    await drain(AUTO_OPEN_WAIT)
    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(2)

    signIn('user-a', 'sess-a2')
    await rerender(tree, <LoginRewardHost />)
    await settle(statusRuns[statusRuns.length - 1], status())
    await drain(AUTO_OPEN_WAIT)
    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(3)
  })

  test('treats a 401 claim failure as an expired session and hides the modal', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settleRejection(claimRuns[0], unauthorized())

    expect(openModals(tree)).toHaveLength(0)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    await focus()
    await appState('active')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)
  })

  test('resumes fetching when the same user returns with a fresh session', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await settleRejection(claimRuns[0], unauthorized())
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-a2')
    await rerender(tree, <LoginRewardHost />)

    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(
      statusRuns[1],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)
  })
})

describe('login reward host — close and stale async', () => {
  const openClaimable = async (tree: TestRenderer.ReactTestRenderer) => {
    await settle(statusRuns[statusRuns.length - 1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
  }

  test('closes via the labeled close control without claiming', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)

    await press(tree, 'Close daily login reward')

    expect(openModals(tree)).toHaveLength(0)
    expect(claimLoginReward).not.toHaveBeenCalled()
  })

  test('closes via the Android back request-close path', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)

    const modal = openModals(tree)[0]
    await act(async () => {
      modal.props.onRequestClose()
    })
    await drain()

    expect(openModals(tree)).toHaveLength(0)
    expect(claimLoginReward).not.toHaveBeenCalled()
  })

  test('closes when the backdrop is pressed', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)

    await press(tree, 'Dismiss daily login reward')

    expect(openModals(tree)).toHaveLength(0)
    expect(claimLoginReward).not.toHaveBeenCalled()
  })

  test('discards a claim that resolves after the modal closed', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(1)

    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)

    await settle(claimRuns[0], claimSuccess())

    expect(mockNotificationAsync).not.toHaveBeenCalled()
    expect(renderedText(tree)).not.toContain('LEVEL UP')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
  })

  test('a fresh session reopens the flow after a discarded claim', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    await press(tree, 'Close daily login reward')

    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(
      statusRuns[1],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)
  })

  test('discards a claim that resolves after the account switched', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <LoginRewardHost />)

    expect(renderedText(tree)).not.toContain('Daily Login Reward')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settle(claimRuns[0], claimSuccess())
    expect(mockNotificationAsync).not.toHaveBeenCalled()
    expect(renderedText(tree)).not.toContain('LEVEL UP')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(3)

    await settle(
      statusRuns[statusRuns.length - 1],
      status({
        loginStreak: 0,
        currentCycleDay: 1,
        todayReward: {
          day: 1,
          xp: 10,
          icon: '🌟',
          description: 'Day 1 - Welcome back!',
        },
        totalConsecutiveDays: 0,
        totalCycles: 0,
      })
    )
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('+10 XP')
  })

  test('masks the previous account modal immediately on session change', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)

    signIn('user-b')
    await rerender(tree, <LoginRewardHost />)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
  })

  test('a status resolving after sign-out is never displayed', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    signOut()
    await rerender(tree, <LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })

  test('tolerates a claim settling after unmount', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await openClaimable(tree)
    await press(tree, 'Claim daily login reward')

    await act(async () => {
      tree.unmount()
    })
    await settle(claimRuns[0], claimSuccess())
    expect(mockNotificationAsync).not.toHaveBeenCalled()
  })

  test('focus and foreground refetch while eligible', async () => {
    signIn('user-a')
    await render(<LoginRewardHost />)
    await settle(
      statusRuns[0],
      status({ alreadyClaimed: true, canClaim: false })
    )

    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(
      statusRuns[1],
      status({ alreadyClaimed: true, canClaim: false })
    )

    await appState('active')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(3)
  })
})

describe('login reward host — single visible modal', () => {
  test('two mounted hosts never stack reward modals', async () => {
    signIn('user-a')
    const tree = await render(
      <>
        <LoginRewardHost />
        <LoginRewardHost />
      </>
    )
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settle(statusRuns[0], status())
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
  })

  test('a surviving claimable host presents once the modal lease frees', async () => {
    signIn('user-a')
    const tree = await render(
      <>
        <LoginRewardHost key="a" />
        <LoginRewardHost key="b" />
      </>
    )
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settle(statusRuns[0], status())
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await rerender(tree, <LoginRewardHost key="b" />)
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
  })

  test('an explicit dismissal does not let a surviving host re-present the same reward', async () => {
    signIn('user-a')
    const tree = await render(
      <>
        <LoginRewardHost key="a" />
        <LoginRewardHost key="b" />
      </>
    )
    await settle(statusRuns[0], status())
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Close daily login reward')
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })

  test('a claim on one host disarms a sibling still holding stale claimable truth', async () => {
    signIn('user-a')
    const tree = await render(
      <>
        <LoginRewardHost key="a" />
        <LoginRewardHost key="b" />
      </>
    )
    await settle(statusRuns[0], status())
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Claim daily login reward')
    await settle(claimRuns[0], claimSuccess())
    // The claim broadcasts to the sibling, which refreshes on its own.
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(4)

    // The sibling's broadcast-triggered refetch resolves with a pre-claim
    // read (server state from before the claim committed).
    await settle(statusRuns[3], status())
    await settle(
      statusRuns[2],
      status({ alreadyClaimed: true, canClaim: false })
    )

    // After the claiming host's modal auto-closes and frees the lease, the
    // sibling's stale window must not reopen the modal.
    await drain(3200)
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)

    // Genuinely newer truth (the next cycle day) still re-arms the sibling.
    await focus()
    await settle(
      statusRuns[4],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await settle(
      statusRuns[5],
      status({
        loginStreak: 3,
        currentCycleDay: 4,
        todayReward: {
          day: 4,
          xp: 40,
          icon: '💫',
          description: 'Day 4 - Half way there!',
        },
        daysUntilMilestone: 20,
      })
    )
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('+40 XP')
  })

  test('a stale claim resolving after an account switch does not suppress the next account', async () => {
    signIn('user-a')
    const tree = await render(
      <>
        <LoginRewardHost key="a" />
        <LoginRewardHost key="b" />
      </>
    )
    await settle(statusRuns[0], status())
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Claim daily login reward')
    expect(claimLoginReward).toHaveBeenCalledTimes(1)

    // The session switches to another account while A's claim is still in
    // flight; only the sibling host survives the switch.
    signIn('user-b')
    await rerender(tree, <LoginRewardHost key="b" />)

    // A's claim resolves late. Its broadcast is scoped to A's session, so
    // it must not disarm B's host or dismiss B's unclaimed same-day reward.
    await settle(claimRuns[0], claimSuccess())
    await settle(statusRuns[2], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
  })
})

describe('login reward host — focus-scoped presentation', () => {
  test('defers presentation while unfocused and presents on focus', async () => {
    mockFocusOnRegister = false
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)

    await focus()
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
  })

  test('cancels a pending presentation when the screen blurs', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())

    await blur()
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)

    await focus()
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
  })

  test('closes the open modal on blur and re-presents while still armed', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await blur()
    expect(openModals(tree)).toHaveLength(0)

    await focus()
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
  })

  test('a claim settling while blurred is discarded but still refreshes status', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
    await press(tree, 'Claim daily login reward')

    await blur()
    expect(openModals(tree)).toHaveLength(0)

    await settle(claimRuns[0], claimSuccess())
    expect(mockNotificationAsync).not.toHaveBeenCalled()
    expect(renderedText(tree)).not.toContain('LEVEL UP')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
  })

  test('an explicitly dismissed reward stays closed across blur and refocus', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)

    await blur()
    await focus()
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
  })

  test('a claim rejection while blurred still reconciles the same session status', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
    await press(tree, 'Claim daily login reward')

    await blur()
    expect(openModals(tree)).toHaveLength(0)

    await settleRejection(
      claimRuns[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'alert' })
    ).toHaveLength(0)

    await settle(
      statusRuns[1],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await focus()
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)
  })

  test('a claim rejection after the account switched reconciles nothing', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
    await press(tree, 'Claim daily login reward')

    signIn('user-b')
    await rerender(tree, <LoginRewardHost />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settleRejection(claimRuns[0], unauthorized())
    expect(mockSessionRefetch).not.toHaveBeenCalled()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'alert' })
    ).toHaveLength(0)
  })
})

describe('login reward host — dismissal window identity', () => {
  test('re-presents the same-streak reward on the next UTC day', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)

    mockTodayUTC = '2026-03-05'
    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
  })

  test('re-presents a repeated-cycle day after the dismissed UTC day passes', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    const dayOne = () =>
      status({
        loginStreak: 0,
        currentCycleDay: 1,
        totalCycles: 1,
        totalConsecutiveDays: 7,
        todayReward: {
          day: 1,
          xp: 10,
          icon: '🌟',
          description: 'Day 1 - Welcome back!',
        },
        daysUntilMilestone: 23,
      })
    await settle(statusRuns[0], dayOne())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)

    mockTodayUTC = '2026-03-12'
    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
    await settle(statusRuns[1], dayOne())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
  })

  test('a status fetched under a prior UTC day does not re-present after rollover', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)

    mockTodayUTC = '2026-03-05'
    await focus()
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)

    await settle(
      statusRuns[1],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)
  })

  test('does not let a pre-midnight dismissal window persist onto the new day', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)

    mockTodayUTC = '2026-03-05'
    await focus()
    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Close daily login reward')
    expect(openModals(tree)).toHaveLength(0)
  })
})

describe('login reward host — UTC rollover provenance', () => {
  test('suppresses a GET issued before midnight that resolves after, then refetches', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    mockTodayUTC = '2026-03-05'
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
  })

  test('presents the fresh-day response and does not refetch in a loop', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)

    mockTodayUTC = '2026-03-05'
    await settle(statusRuns[0], status())
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await drain(AUTO_OPEN_WAIT)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)
  })

  test('a claim resolving after midnight keeps request-day provenance', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)

    await press(tree, 'Claim daily login reward')
    await focus()
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    mockTodayUTC = '2026-03-05'
    await settle(claimRuns[0], claimSuccess())
    expect(mockNotificationAsync).toHaveBeenCalledTimes(1)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(3)

    await settle(statusRuns[1], status())
    await settle(
      statusRuns[2],
      status({ alreadyClaimed: true, canClaim: false })
    )
    await drain(AUTO_OPEN_WAIT)

    expect(renderedText(tree)).toContain('Claimed Today')
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(3)
  })

  test('a request resolving after the account changed stays discarded', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <LoginRewardHost />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(2)

    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(0)

    await settle(statusRuns[1], status())
    await drain(AUTO_OPEN_WAIT)
    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('+30 XP')
  })

  test('a request resolving after sign-out is never displayed', async () => {
    signIn('user-a')
    const tree = await render(<LoginRewardHost />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    mockSession = { data: null, isPending: false, refetch: mockSessionRefetch }
    await rerender(tree, <LoginRewardHost />)

    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).not.toContain('Daily Login Reward')
  })
})

describe('login reward host — screen mounting', () => {
  test('opens the modal from the games hub when claimable', async () => {
    signIn('user-a')
    const tree = await render(<GamesScreen />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
    expect(renderedText(tree)).toContain('Tetris Challenge')
  })

  test('keeps the games hub anonymous without a protected request', async () => {
    const tree = await render(<GamesScreen />)

    expect(getLoginRewardStatus).not.toHaveBeenCalled()
    expect(openModals(tree)).toHaveLength(0)
    expect(renderedText(tree)).toContain('Tetris Challenge')
  })

  test('opens the modal from the profile tab when claimable', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    expect(getLoginRewardStatus).toHaveBeenCalledTimes(1)

    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)

    expect(openModals(tree)).toHaveLength(1)
    expect(renderedText(tree)).toContain('Daily Login Reward')
  })

  test('refreshes the profile overview after a claim on the profile tab', async () => {
    signIn('user-a')
    const tree = await render(<ProfileScreen />)
    expect(getUserOverview).toHaveBeenCalledTimes(1)

    await settle(statusRuns[0], status())
    await drain(AUTO_OPEN_WAIT)
    await press(tree, 'Claim daily login reward')
    await settle(claimRuns[0], claimSuccess())

    expect(getUserOverview).toHaveBeenCalledTimes(2)
    expect(getScoreHistory).toHaveBeenCalledTimes(1)
  })
})
