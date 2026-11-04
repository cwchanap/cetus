import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { ApiClientError } from '@cetus/api-client/api-client'
import type {
  ChallengeProgressResponse,
  ChallengesResponse,
} from '@cetus/shared/api-dto'
import { ChallengeType } from '@cetus/shared/challenges'

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
  api: { getChallenges: jest.fn() },
}))

jest.mock('../src/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockSession,
  },
}))

import ChallengesScreen from '../app/challenges'
import { api } from '../src/lib/api'

const getChallenges = jest.mocked(api.getChallenges)
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

let runs: Deferred<ChallengesResponse>[]
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

const settle = async (
  run: Deferred<ChallengesResponse>,
  value: ChallengesResponse
) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
  await drain()
}

const settleRejection = async (
  run: Deferred<ChallengesResponse>,
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

const mission = (
  overrides: Partial<ChallengeProgressResponse> = {}
): ChallengeProgressResponse => ({
  challengeId: 'play_2_games',
  name: 'Warm Up',
  description: 'Play 2 games today',
  icon: '🎮',
  type: ChallengeType.PLAY_GAMES,
  targetValue: 2,
  currentValue: 1,
  xpReward: 30,
  difficulty: 'easy',
  completed: false,
  completedAt: null,
  ...overrides,
})

const payload = (
  challenges: ChallengeProgressResponse[],
  overrides: Partial<ChallengesResponse> = {}
): ChallengesResponse => ({
  challenges,
  xp: 120,
  level: 3,
  xpProgress: 40,
  xpToNextLevel: 130,
  streak: 4,
  resetIn: 3600 + 30 * 60 + 15,
  date: '2026-11-02',
  ...overrides,
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
  getChallenges.mockReset()
  getChallenges.mockImplementation(() => {
    const run = deferred<ChallengesResponse>()
    runs.push(run)
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

describe('challenges route — signed out', () => {
  test('shows an accessible sign-in CTA without issuing the protected request', async () => {
    const tree = await render(<ChallengesScreen />)

    expect(getChallenges).not.toHaveBeenCalled()
    expect(
      tree.root.findAllByProps({ testID: 'challenges-loading' })
    ).toHaveLength(0)

    const cta = tree.root.findByProps({
      accessibilityLabel: 'Sign in to view daily missions',
    })
    expect(cta.props.accessibilityRole).toBe('button')

    const rendered = renderedText(tree)
    expect(rendered).toContain('Sign in')
    expect(rendered).not.toContain('Warm Up')
    expect(rendered).not.toContain('Level 3')
  })

  test('routes the CTA to sign-in with a challenges return destination', async () => {
    const tree = await render(<ChallengesScreen />)

    await press(tree, 'Sign in to view daily missions')

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/challenges' },
    })
  })

  test('focus and app-foreground refetches stay inert while signed out', async () => {
    await render(<ChallengesScreen />)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getChallenges).not.toHaveBeenCalled()
  })
})

describe('challenges route — session resolving', () => {
  test('shows loading and issues no request while the session resolves', async () => {
    mockSession = { data: null, isPending: true, refetch: mockSessionRefetch }

    const tree = await render(<ChallengesScreen />)

    expect(getChallenges).not.toHaveBeenCalled()
    expect(tree.root.findByProps({ testID: 'challenges-loading' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Sign in to view daily missions',
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

    const tree = await render(<ChallengesScreen />)

    expect(getChallenges).not.toHaveBeenCalled()
    expect(tree.root.findByProps({ testID: 'challenges-loading' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Sign in to view daily missions',
      })
    ).toHaveLength(0)

    mockSession = {
      data: mockSession.data,
      isPending: false,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(1)
  })
})

describe('challenges route — signed in', () => {
  test('fetches daily missions with an abort signal and renders the DTO', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(1)
    const options = getChallenges.mock.calls[0][0]
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect(tree.root.findByProps({ testID: 'challenges-loading' })).toBeTruthy()

    await settle(
      runs[0],
      payload([
        mission(),
        mission({
          challengeId: 'score_tetris_100',
          name: 'Tetris Starter',
          description: 'Score 100+ points in Tetris',
          icon: '🔲',
          type: ChallengeType.SCORE_TARGET,
          targetValue: 100,
          currentValue: 100,
          xpReward: 30,
          difficulty: 'medium',
          completed: true,
          completedAt: '2026-11-02T08:15:00Z',
        }),
      ])
    )

    const rendered = renderedText(tree)
    expect(rendered).toContain('DAILY MISSIONS')
    expect(rendered).toContain('Warm Up')
    expect(rendered).toContain('Play 2 games today')
    expect(rendered).toContain('Tetris Starter')
    expect(rendered).toContain('EASY')
    expect(rendered).toContain('MEDIUM')
    expect(rendered).toContain('1/2')
    expect(rendered).toContain('+30 XP')
    expect(rendered).toContain('Level 3')
    expect(rendered).toContain('120 XP')
    expect(rendered).toContain('130 XP to Level 4')
    expect(rendered).toContain('Challenge Streak:')
    expect(rendered).toContain('4 days')
    expect(rendered).toContain('2026-11-02')
    expect(rendered).toContain('Resets in 01:30:15')
  })

  test('renders the server-reported completed state honestly', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settle(
      runs[0],
      payload([
        mission({
          completed: true,
          completedAt: '2026-11-02T08:15:00Z',
          currentValue: 2,
        }),
      ])
    )

    const rendered = renderedText(tree)
    expect(rendered).toContain('Completed')
    expect(
      tree.root.findByProps({
        accessibilityLabel:
          'Warm Up, easy mission, Play 2 games today, 2 of 2 complete, 30 XP reward, completed',
      })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel:
          'Warm Up, easy mission, Play 2 games today, 2 of 2 complete, 30 XP reward, in progress',
      })
    ).toHaveLength(0)
  })

  test('exposes an accessible progress summary for incomplete missions', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settle(runs[0], payload([mission()]))

    const row = tree.root.findByProps({
      accessibilityLabel:
        'Warm Up, easy mission, Play 2 games today, 1 of 2 complete, 30 XP reward, in progress',
    })
    expect(row.props.accessible).toBe(true)
  })

  test('shows an honest empty state when the server returns no missions', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settle(runs[0], payload([], { streak: 0 }))

    const rendered = renderedText(tree)
    expect(rendered).toContain('No missions today')
    expect(rendered).not.toContain('Warm Up')
    expect(rendered).toContain('Level 3')
  })

  test('offers a refresh path once the UTC reset countdown reaches zero', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settle(runs[0], payload([mission()], { resetIn: 0 }))

    const rendered = renderedText(tree)
    expect(rendered).toContain('Daily missions reset')
    expect(rendered).not.toContain('Resets in')

    await press(tree, 'Refresh daily missions')
    expect(getChallenges).toHaveBeenCalledTimes(2)
  })

  test('surfaces a network error distinctly and retries into data', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(tree.root.findByProps({ testID: 'challenges-error' })).toBeTruthy()
    expect(renderedText(tree)).toContain('connection')

    await press(tree, 'Retry loading daily missions')
    expect(getChallenges).toHaveBeenCalledTimes(2)
    expect(tree.root.findByProps({ testID: 'challenges-loading' })).toBeTruthy()

    await settle(runs[1], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
    expect(
      tree.root.findAllByProps({ testID: 'challenges-error' })
    ).toHaveLength(0)
  })

  test('surfaces a 503 as a temporary outage with a retry path', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Service unavailable', 503, 'http')
    )

    expect(
      tree.root.findByProps({ testID: 'challenges-unavailable' })
    ).toBeTruthy()
    const rendered = renderedText(tree)
    expect(rendered).toContain('temporarily unavailable')

    await press(tree, 'Retry loading daily missions')
    await settle(runs[1], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
  })

  test('surfaces a generic server error with a retry path', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Internal server error', 500, 'http')
    )

    expect(tree.root.findByProps({ testID: 'challenges-error' })).toBeTruthy()
    const rendered = renderedText(tree)
    expect(rendered).toContain('Something went wrong')
    expect(rendered).not.toContain('connection')

    await press(tree, 'Retry loading daily missions')
    await settle(runs[1], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
  })

  test('treats a 401 as an expired session and returns to the sign-in CTA', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )

    expect(getChallenges).toHaveBeenCalledTimes(1)
    const rendered = renderedText(tree)
    expect(rendered).toContain('expired')
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Retry loading daily missions',
      })
    ).toHaveLength(0)

    await press(tree, 'Sign in to view daily missions')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/challenges' },
    })
  })

  test('suppresses focus and foreground refetches after a 401 until reauthentication', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getChallenges).toHaveBeenCalledTimes(1)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getChallenges).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view daily missions',
      })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({ testID: 'challenges-loading' })
    ).toHaveLength(0)
  })

  test('resumes fetching when the same user returns with a fresh session', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getChallenges).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-a2')
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(2)
    await settle(runs[1], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
    expect(renderedText(tree)).not.toContain('expired')
  })

  test('resumes fetching when reconciliation refreshes the same session id', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getChallenges).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-user-a', '2026-01-02T00:00:00Z')
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(2)
    await settle(runs[1], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
    expect(renderedText(tree)).not.toContain('expired')
  })

  test('stays suppressed when reconciliation returns the identical session', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getChallenges).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    await rerender(tree, <ChallengesScreen />)
    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getChallenges).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findAllByProps({ testID: 'challenges-loading' })
    ).toHaveLength(0)
  })

  test('shows the plain sign-in CTA when reconciliation finds no session', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signOut()
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(1)
    const rendered = renderedText(tree)
    expect(rendered).not.toContain('expired')
    expect(rendered).toContain('Sign in')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view daily missions',
      })
    ).toBeTruthy()
  })

  test('latches again after a second 401 and never loops', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )

    signIn('user-a', 'sess-user-a', '2026-01-02T00:00:00Z')
    await rerender(tree, <ChallengesScreen />)
    expect(getChallenges).toHaveBeenCalledTimes(2)

    await settleRejection(
      runs[1],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(2)

    await rerender(tree, <ChallengesScreen />)
    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getChallenges).toHaveBeenCalledTimes(2)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findAllByProps({ testID: 'challenges-loading' })
    ).toHaveLength(0)
  })

  test('a stale reconciliation cannot unlock a newer session’s suppression', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <ChallengesScreen />)
    expect(getChallenges).toHaveBeenCalledTimes(2)

    await settleRejection(
      runs[1],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(mockSessionRefetch).toHaveBeenCalledTimes(2)

    signIn('user-a', 'sess-user-a', '2026-01-01T00:00:00Z')
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).toContain('expired')
    expect(renderedText(tree)).not.toContain('Warm Up')
  })

  test('signing out and back in as the same user resumes fetching', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )
    expect(getChallenges).toHaveBeenCalledTimes(1)

    signOut()
    await rerender(tree, <ChallengesScreen />)
    expect(getChallenges).toHaveBeenCalledTimes(1)
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view daily missions',
      })
    ).toBeTruthy()

    signIn('user-a', 'sess-a3')
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(2)
    await settle(runs[1], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
  })

  test('a different account still fetches after a 401 on the previous account', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Request failed with status 401', 401, 'http')
    )

    signIn('user-b')
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).not.toContain('expired')

    await settle(runs[1], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
  })
})

describe('challenges route — account isolation', () => {
  test('masks the previous account immediately when the session user changes', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settle(runs[0], payload([mission()]))
    expect(renderedText(tree)).toContain('Warm Up')
    expect(renderedText(tree)).toContain('Level 3')

    signIn('user-b')
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(2)
    expect(tree.root.findByProps({ testID: 'challenges-loading' })).toBeTruthy()
    expect(renderedText(tree)).not.toContain('Warm Up')
    expect(renderedText(tree)).not.toContain('Level 3')

    await settle(
      runs[1],
      payload([mission({ name: 'Daily Gamer', challengeId: 'play_3' })], {
        xp: 500,
        level: 5,
      })
    )
    expect(renderedText(tree)).toContain('Daily Gamer')
    expect(renderedText(tree)).toContain('Level 5')
  })

  test('never shows account A data that resolves after switching to account B', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    expect(getChallenges).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <ChallengesScreen />)
    expect(getChallenges).toHaveBeenCalledTimes(2)

    await settle(runs[0], payload([mission()]))
    expect(tree.root.findByProps({ testID: 'challenges-loading' })).toBeTruthy()
    expect(renderedText(tree)).not.toContain('Warm Up')

    await settle(
      runs[1],
      payload([mission({ name: 'Daily Gamer', challengeId: 'play_3' })])
    )
    expect(renderedText(tree)).toContain('Daily Gamer')
    expect(renderedText(tree)).not.toContain('Warm Up')
  })

  test('signing out returns to the CTA and masks the loaded data without refetching', async () => {
    signIn('user-a')
    const tree = await render(<ChallengesScreen />)
    await settle(runs[0], payload([mission()]))

    signOut()
    await rerender(tree, <ChallengesScreen />)

    expect(getChallenges).toHaveBeenCalledTimes(1)
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to view daily missions',
      })
    ).toBeTruthy()
    expect(renderedText(tree)).not.toContain('Warm Up')
    expect(renderedText(tree)).not.toContain('Level 3')
  })
})

describe('challenges route — refetch lifecycle', () => {
  test('refetches only when the route regains focus', async () => {
    signIn('user-a')
    await render(<ChallengesScreen />)
    expect(getChallenges).toHaveBeenCalledTimes(1)

    await focus()
    expect(getChallenges).toHaveBeenCalledTimes(1)

    await blur()
    await focus()
    expect(getChallenges).toHaveBeenCalledTimes(2)
  })

  test('refetches on app foreground while focused, not on other transitions', async () => {
    signIn('user-a')
    await render(<ChallengesScreen />)
    await settle(runs[0], payload([mission()]))
    await focus()
    expect(appStateListeners).toHaveLength(1)

    await appState('background')
    expect(getChallenges).toHaveBeenCalledTimes(1)

    await appState('inactive')
    expect(getChallenges).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getChallenges).toHaveBeenCalledTimes(2)
  })

  test('drops the app-state subscription on blur and ignores foregrounding unfocused', async () => {
    signIn('user-a')
    await render(<ChallengesScreen />)
    await focus()
    expect(appStateListeners).toHaveLength(1)
    const subscription = appStateListeners[0]

    await blur()
    expect(subscription.remove).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getChallenges).toHaveBeenCalledTimes(1)

    await focus()
    expect(getChallenges).toHaveBeenCalledTimes(2)
    expect(appStateListeners).toHaveLength(2)
  })
})

describe('challenges route — cold-link recovery', () => {
  test('offers a Back to games fallback when the stack cannot go back', async () => {
    mockCanGoBack.mockReturnValue(false)
    const tree = await render(<ChallengesScreen />)

    const back = tree.root.findByProps({ accessibilityLabel: 'Back to games' })
    await act(async () => {
      back.props.onPress()
    })
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  test('hides the fallback while ordinary stack back is available', async () => {
    mockCanGoBack.mockReturnValue(true)
    const tree = await render(<ChallengesScreen />)

    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Back to games' })
    ).toHaveLength(0)
  })
})
