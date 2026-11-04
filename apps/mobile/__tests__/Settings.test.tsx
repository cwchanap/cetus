import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { ApiClientError } from '@cetus/api-client/api-client'
import type {
  NotificationSettingsResponse,
  SettingsUpdateResponse,
} from '@cetus/shared/api-dto'

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
  api: { getSettings: jest.fn(), updateSettings: jest.fn() },
}))

jest.mock('../src/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockSession,
  },
}))

import SettingsScreen from '../app/settings'
import { api } from '../src/lib/api'
import {
  claimSettingsWrite,
  releaseSettingsWrite,
  type SettingsWriteLease,
} from '../src/lib/settings'

const getSettings = jest.mocked(api.getSettings)
const updateSettings = jest.mocked(api.updateSettings)
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

let runs: Deferred<NotificationSettingsResponse>[]
let writes: {
  payload: Partial<NotificationSettingsResponse>
  run: Deferred<SettingsUpdateResponse>
}[]
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

const createOutsideAct = (element: React.ReactElement) => {
  const globalRef = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const previous = globalRef.IS_REACT_ACT_ENVIRONMENT
  globalRef.IS_REACT_ACT_ENVIRONMENT = false
  try {
    return TestRenderer.create(element)
  } finally {
    globalRef.IS_REACT_ACT_ENVIRONMENT = previous
  }
}

const settle = async (
  run: Deferred<NotificationSettingsResponse>,
  value: NotificationSettingsResponse
) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
  await drain()
}

const settleRejection = async (
  run: Deferred<NotificationSettingsResponse>,
  reason: unknown
) => {
  await act(async () => {
    run.reject(reason)
    await run.promise.catch(() => undefined)
  })
  await drain()
}

const settleWrite = async (
  run: Deferred<SettingsUpdateResponse>,
  value: SettingsUpdateResponse
) => {
  await act(async () => {
    run.resolve(value)
    await run.promise
  })
  await drain()
}

const settleWriteRejection = async (
  run: Deferred<SettingsUpdateResponse>,
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

const switchFor = (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string
) => {
  const node = tree.root.findByProps({
    accessibilityRole: 'switch',
    accessibilityLabel,
  })
  return node
}

const flip = async (
  tree: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string,
  value: boolean
) => {
  const node = switchFor(tree, accessibilityLabel)
  await act(async () => {
    node.props.onChange({ nativeEvent: { value } })
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

const prefs = (
  overrides: Partial<NotificationSettingsResponse> = {}
): NotificationSettingsResponse => ({
  email_notifications: true,
  push_notifications: false,
  challenge_reminders: true,
  ...overrides,
})

const updateOk = (
  overrides: Partial<NotificationSettingsResponse> = {}
): SettingsUpdateResponse => ({
  success: true,
  preferences: prefs(overrides),
})

const unauthorized = () =>
  new ApiClientError('Request failed with status 401', 401, 'http')

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockCanGoBack.mockReset().mockReturnValue(true)
  mockFocusCallback = undefined
  focusCleanup = undefined
  mockSessionRefetch.mockReset().mockResolvedValue(undefined)
  mockSession = { data: null, isPending: false, refetch: mockSessionRefetch }
  runs = []
  writes = []
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
  getSettings.mockReset()
  getSettings.mockImplementation(() => {
    const run = deferred<NotificationSettingsResponse>()
    runs.push(run)
    return run.promise
  })
  updateSettings.mockReset()
  updateSettings.mockImplementation(payload => {
    const run = deferred<SettingsUpdateResponse>()
    writes.push({ payload, run })
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

describe('settings route — signed out', () => {
  test('shows an accessible sign-in CTA without issuing the protected request', async () => {
    const tree = await render(<SettingsScreen />)

    expect(getSettings).not.toHaveBeenCalled()
    expect(
      tree.root.findAllByProps({ testID: 'settings-loading' })
    ).toHaveLength(0)

    const cta = tree.root.findByProps({
      accessibilityLabel: 'Sign in to manage notification settings',
    })
    expect(cta.props.accessibilityRole).toBe('button')
    expect(renderedText(tree)).toContain('Sign in')
    expect(renderedText(tree)).not.toContain('Push Notifications')
  })

  test('routes the CTA to sign-in with a settings return destination', async () => {
    const tree = await render(<SettingsScreen />)

    await press(tree, 'Sign in to manage notification settings')

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/settings' },
    })
  })

  test('focus and app-foreground refetches stay inert while signed out', async () => {
    await render(<SettingsScreen />)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getSettings).not.toHaveBeenCalled()
    expect(updateSettings).not.toHaveBeenCalled()
  })
})

describe('settings route — session resolving', () => {
  test('shows loading and issues no request while the session resolves', async () => {
    mockSession = { data: null, isPending: true, refetch: mockSessionRefetch }

    const tree = await render(<SettingsScreen />)

    expect(getSettings).not.toHaveBeenCalled()
    expect(tree.root.findByProps({ testID: 'settings-loading' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: 'Sign in to manage notification settings',
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

    const tree = await render(<SettingsScreen />)

    expect(getSettings).not.toHaveBeenCalled()
    expect(tree.root.findByProps({ testID: 'settings-loading' })).toBeTruthy()

    mockSession = {
      data: mockSession.data,
      isPending: false,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <SettingsScreen />)

    expect(getSettings).toHaveBeenCalledTimes(1)
  })
})

describe('settings route — signed in', () => {
  test('renders the three supported toggles with the server values', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)

    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(tree.root.findByProps({ testID: 'settings-loading' })).toBeTruthy()

    await settle(runs[0], prefs())

    const rendered = renderedText(tree)
    expect(rendered).toContain('Email Notifications')
    expect(rendered).toContain('Push Notifications')
    expect(rendered).toContain('Daily Challenge Reminders')
    expect(rendered).toContain('Receive updates and reminders via email')
    expect(rendered).toContain('Get reminded about incomplete daily challenges')
    expect(rendered).not.toContain('Volume')

    const email = switchFor(tree, 'Email Notifications')
    const push = switchFor(tree, 'Push Notifications')
    const reminders = switchFor(tree, 'Daily Challenge Reminders')
    expect(email.props.accessibilityState.checked).toBe(true)
    expect(push.props.accessibilityState.checked).toBe(false)
    expect(reminders.props.accessibilityState.checked).toBe(true)
    expect(email.props.accessibilityState.disabled).toBe(false)
  })

  test('toggling a preference posts the wire key and applies the acknowledgement', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({
      push_notifications: true,
    })
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))

    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
    expect(renderedText(tree)).toContain('Preferences saved')
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settle(runs[1], prefs({ push_notifications: true }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
  })

  test('toggling a preference off posts false for the wire key', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Email Notifications', false)

    expect(updateSettings).toHaveBeenCalledWith({
      email_notifications: false,
    })
    expect(
      switchFor(tree, 'Email Notifications').props.accessibilityState.checked
    ).toBe(false)

    await settleWrite(writes[0].run, updateOk({ email_notifications: false }))
    expect(
      switchFor(tree, 'Email Notifications').props.accessibilityState.checked
    ).toBe(false)
    await settle(runs[1], prefs({ email_notifications: false }))
  })

  test('applies every server-returned preference from the write response', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    await settleWrite(
      writes[0].run,
      updateOk({ push_notifications: true, email_notifications: false })
    )

    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
    expect(
      switchFor(tree, 'Email Notifications').props.accessibilityState.checked
    ).toBe(false)
    await settle(runs[1], prefs({ push_notifications: true }))
  })

  test('rolls the toggle back and reports the failure when the save is rejected', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWriteRejection(
      writes[0].run,
      new ApiClientError('Internal server error', 500, 'http')
    )

    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)
    const rendered = renderedText(tree)
    expect(rendered).toContain("Couldn't save")
    expect(rendered).not.toContain('Preferences saved')
  })

  test('rolls back on a network failure the same way', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Daily Challenge Reminders', false)
    await settleWriteRejection(
      writes[0].run,
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(
      switchFor(tree, 'Daily Challenge Reminders').props.accessibilityState
        .checked
    ).toBe(true)
    expect(renderedText(tree)).toContain("Couldn't save")
  })

  test('refuses another change while a save is pending, then accepts it after the acknowledgement', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).not.toContain('Preferences saved')

    for (const label of [
      'Email Notifications',
      'Push Notifications',
      'Daily Challenge Reminders',
    ]) {
      expect(switchFor(tree, label).props.accessibilityState.disabled).toBe(
        true
      )
    }

    await flip(tree, 'Push Notifications', false)
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    for (const label of [
      'Email Notifications',
      'Push Notifications',
      'Daily Challenge Reminders',
    ]) {
      expect(switchFor(tree, label).props.accessibilityState.disabled).toBe(
        false
      )
    }

    await flip(tree, 'Push Notifications', false)
    expect(updateSettings).toHaveBeenCalledTimes(2)
    expect(writes[1].payload).toEqual({ push_notifications: false })

    await settleWrite(writes[1].run, updateOk({ push_notifications: false }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)
    await settle(runs[runs.length - 1], prefs({ push_notifications: false }))
  })

  test('a change arriving before the disabled state renders is still refused', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    const node = switchFor(tree, 'Push Notifications')
    await act(async () => {
      node.props.onChange({ nativeEvent: { value: true } })
      node.props.onChange({ nativeEvent: { value: false } })
    })
    await drain()

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(writes[0].payload).toEqual({ push_notifications: true })
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
    await settle(runs[runs.length - 1], prefs({ push_notifications: true }))
  })

  test('an accepted write still reaches the server when the route unmounts mid-flight', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    await flip(tree, 'Push Notifications', false)
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(writes[0].payload).toEqual({ push_notifications: true })

    mountedTrees.splice(mountedTrees.indexOf(tree), 1)
    await act(async () => {
      tree.unmount()
    })
    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenLastCalledWith({
      push_notifications: true,
    })
  })

  test('a rejected save rolls back the pending value and flags the key', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    await flip(tree, 'Push Notifications', false)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWriteRejection(
      writes[0].run,
      new ApiClientError('Internal server error', 500, 'http')
    )

    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain("Couldn't save")
  })

  test('a write rejected with a malformed body rolls back like a failure', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    await settleWrite(writes[0].run, {
      success: true,
      preferences: null,
    } as unknown as SettingsUpdateResponse)

    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)
    expect(renderedText(tree)).toContain("Couldn't save")
  })

  test('a save 401 expires the session and returns to the sign-in CTA', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    await settleWriteRejection(writes[0].run, unauthorized())

    const rendered = renderedText(tree)
    expect(rendered).toContain('expired')
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'switch' })
    ).toHaveLength(0)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    await press(tree, 'Sign in to manage notification settings')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/settings' },
    })
  })

  test('saves different keys one at a time so acknowledgements cannot overlap', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    await flip(tree, 'Email Notifications', false)

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(writes[0].payload).toEqual({ push_notifications: true })
    expect(
      switchFor(tree, 'Email Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))

    await flip(tree, 'Email Notifications', false)
    expect(updateSettings).toHaveBeenCalledTimes(2)
    expect(writes[1].payload).toEqual({ email_notifications: false })

    await settleWrite(
      writes[1].run,
      updateOk({ push_notifications: true, email_notifications: false })
    )

    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
    expect(
      switchFor(tree, 'Email Notifications').props.accessibilityState.checked
    ).toBe(false)
  })

  test('an unrelated success does not clear a visible save failure', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Email Notifications', false)
    await settleWriteRejection(
      writes[0].run,
      new ApiClientError('Internal server error', 500, 'http')
    )
    expect(renderedText(tree)).toContain("Couldn't save")

    await flip(tree, 'Push Notifications', true)
    await settleWrite(writes[1].run, updateOk({ push_notifications: true }))

    const rendered = renderedText(tree)
    expect(rendered).toContain("Couldn't save")
    expect(rendered).not.toContain('Preferences saved')
  })

  test('retrying the failed key resolves the failure and shows the acknowledgement', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Email Notifications', false)
    await settleWriteRejection(
      writes[0].run,
      new ApiClientError('Internal server error', 500, 'http')
    )
    expect(renderedText(tree)).toContain("Couldn't save")

    await flip(tree, 'Push Notifications', true)
    await settleWrite(writes[1].run, updateOk({ push_notifications: true }))
    expect(renderedText(tree)).toContain("Couldn't save")

    await flip(tree, 'Email Notifications', false)
    expect(writes[2].payload).toEqual({ email_notifications: false })
    await settleWrite(
      writes[2].run,
      updateOk({ push_notifications: true, email_notifications: false })
    )

    const rendered = renderedText(tree)
    expect(rendered).toContain('Preferences saved')
    expect(rendered).not.toContain("Couldn't save")
  })

  test('tracks each failed key until its own save succeeds', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Email Notifications', false)
    await settleWriteRejection(
      writes[0].run,
      new ApiClientError('Internal server error', 500, 'http')
    )

    await flip(tree, 'Push Notifications', true)
    await settleWriteRejection(
      writes[1].run,
      new ApiClientError('Internal server error', 500, 'http')
    )

    await flip(tree, 'Push Notifications', true)
    await settleWrite(writes[2].run, updateOk({ push_notifications: true }))

    let rendered = renderedText(tree)
    expect(rendered).toContain("Couldn't save")
    expect(rendered).not.toContain('Preferences saved')

    await flip(tree, 'Email Notifications', false)
    await settleWrite(
      writes[3].run,
      updateOk({ push_notifications: true, email_notifications: false })
    )

    rendered = renderedText(tree)
    expect(rendered).toContain('Preferences saved')
    expect(rendered).not.toContain("Couldn't save")
  })
})

describe('settings route — write ownership', () => {
  const ALL_LABELS = [
    'Email Notifications',
    'Push Notifications',
    'Daily Challenge Reminders',
  ]

  const expectDisabled = (
    tree: TestRenderer.ReactTestRenderer,
    disabled: boolean
  ) => {
    for (const label of ALL_LABELS) {
      expect(switchFor(tree, label).props.accessibilityState.disabled).toBe(
        disabled
      )
    }
  }

  test('keeps toggles locked across a same-user session renewal until the write settles', async () => {
    signIn('user-a', 'sess-a1')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-a2')
    await rerender(tree, <SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(2)
    await settle(runs[1], prefs({ push_notifications: false }))

    expectDisabled(tree, true)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)

    await flip(tree, 'Push Notifications', false)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    expect(getSettings).toHaveBeenCalledTimes(3)

    await settle(runs[2], prefs({ push_notifications: true }))
    expectDisabled(tree, false)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
  })

  test('keeps toggles locked while session resolution dips mid-write', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    const sessionData = mockSession.data
    mockSession = {
      data: sessionData,
      isPending: true,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <SettingsScreen />)
    expect(tree.root.findByProps({ testID: 'settings-loading' })).toBeTruthy()

    mockSession = {
      data: sessionData,
      isPending: false,
      refetch: mockSessionRefetch,
    }
    await rerender(tree, <SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(2)
    await settle(runs[1], prefs({ push_notifications: false }))

    expectDisabled(tree, true)
    await flip(tree, 'Push Notifications', false)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    expect(getSettings).toHaveBeenCalledTimes(3)
    await settle(runs[2], prefs({ push_notifications: true }))
    expectDisabled(tree, false)
  })

  test('locks a different account until the outstanding write settles without publishing into it', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(2)
    await settle(runs[1], prefs())

    expectDisabled(tree, true)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))

    expectDisabled(tree, false)
    expect(getSettings).toHaveBeenCalledTimes(2)
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)
  })

  test('a remounted route stays locked until the outstanding write settles and then reconciles', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    mountedTrees.splice(mountedTrees.indexOf(tree), 1)
    await act(async () => {
      tree.unmount()
    })

    const remounted = await render(<SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(2)
    await settle(runs[1], prefs({ push_notifications: false }))

    expectDisabled(remounted, true)
    expect(
      switchFor(remounted, 'Push Notifications').props.accessibilityState
        .checked
    ).toBe(false)

    await flip(remounted, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    expect(getSettings).toHaveBeenCalledTimes(3)

    await settle(runs[2], prefs({ push_notifications: true }))
    expectDisabled(remounted, false)
    expect(
      switchFor(remounted, 'Push Notifications').props.accessibilityState
        .checked
    ).toBe(true)
  })

  test('unlocks and reconciles when an acknowledged write settles between remount render and effect adoption', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    mountedTrees.splice(mountedTrees.indexOf(tree), 1)
    await act(async () => {
      tree.unmount()
    })

    const remounted = createOutsideAct(<SettingsScreen />)
    mountedTrees.push(remounted)
    await new Promise<void>(resolve => setImmediate(resolve))
    writes[0].run.resolve(updateOk({ push_notifications: true }))
    await act(async () => {
      await writes[0].run.promise
    })
    await drain()

    expect(getSettings).toHaveBeenCalledTimes(3)
    await settle(runs[2], prefs({ push_notifications: true }))
    expectDisabled(remounted, false)
    expect(
      switchFor(remounted, 'Push Notifications').props.accessibilityState
        .checked
    ).toBe(true)
  })

  test('unlocks and reconciles when a rejected write settles between remount render and effect adoption', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    mountedTrees.splice(mountedTrees.indexOf(tree), 1)
    await act(async () => {
      tree.unmount()
    })

    const remounted = createOutsideAct(<SettingsScreen />)
    mountedTrees.push(remounted)
    await new Promise<void>(resolve => setImmediate(resolve))
    writes[0].run.reject(
      new ApiClientError('Internal server error', 500, 'http')
    )
    await act(async () => {
      await writes[0].run.promise.catch(() => undefined)
    })
    await drain()

    expect(getSettings).toHaveBeenCalledTimes(3)
    await settle(runs[2], prefs())
    expectDisabled(remounted, false)
    const rendered = renderedText(remounted)
    expect(rendered).not.toContain('Preferences saved')
    expect(rendered).not.toContain("Couldn't save")
    expect(
      switchFor(remounted, 'Push Notifications').props.accessibilityState
        .checked
    ).toBe(false)
  })

  test('an older settle notification cannot unlock a newer outstanding write', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expectDisabled(tree, true)

    const claimed: { lease: SettingsWriteLease | null } = { lease: null }
    try {
      writes[0].run.promise.then(() => {
        claimed.lease = claimSettingsWrite('user-b')
      })
      writes[0].run.resolve(updateOk({ push_notifications: true }))
      await act(async () => {
        await writes[0].run.promise
      })
      await drain()

      if (claimed.lease === null) {
        throw new Error('the newer lease was never claimed')
      }
      const newer = claimed.lease
      expectDisabled(tree, true)

      signIn('user-b')
      await rerender(tree, <SettingsScreen />)
      expect(getSettings).toHaveBeenCalledTimes(2)
      await settle(runs[1], prefs())
      expectDisabled(tree, true)

      await act(async () => {
        releaseSettingsWrite(newer)
        newer.finish()
      })
      await drain()
      claimed.lease = null

      expectDisabled(tree, false)
      expect(getSettings).toHaveBeenCalledTimes(3)
      await settle(runs[2], prefs({ push_notifications: false }))
      expect(
        switchFor(tree, 'Push Notifications').props.accessibilityState.checked
      ).toBe(false)
    } finally {
      const remaining = claimed.lease
      if (remaining !== null) {
        await act(async () => {
          releaseSettingsWrite(remaining)
          remaining.finish()
        })
        await drain()
      }
    }
  })
})

describe('settings route — fetch errors and expiry', () => {
  test('surfaces a network error distinctly and retries into data', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Network error occurred', 0, 'network')
    )

    expect(tree.root.findByProps({ testID: 'settings-error' })).toBeTruthy()
    expect(renderedText(tree)).toContain('connection')

    await press(tree, 'Retry loading settings')
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settle(runs[1], prefs())
    expect(renderedText(tree)).toContain('Push Notifications')
  })

  test('surfaces a 503 as a temporary outage with a retry path', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settleRejection(
      runs[0],
      new ApiClientError('Service unavailable', 503, 'http')
    )

    expect(
      tree.root.findByProps({ testID: 'settings-unavailable' })
    ).toBeTruthy()
    expect(renderedText(tree)).toContain('temporarily unavailable')

    await press(tree, 'Retry loading settings')
    await settle(runs[1], prefs())
    expect(renderedText(tree)).toContain('Push Notifications')
  })

  test('treats a 401 as an expired session and suppresses refetches', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settleRejection(runs[0], unauthorized())

    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Retry loading settings' })
    ).toHaveLength(0)

    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
  })

  test('resumes fetching when the same user returns with a fresh session', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settleRejection(runs[0], unauthorized())
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signIn('user-a', 'sess-a2')
    await rerender(tree, <SettingsScreen />)

    expect(getSettings).toHaveBeenCalledTimes(2)
    await settle(runs[1], prefs())
    expect(renderedText(tree)).toContain('Push Notifications')
    expect(renderedText(tree)).not.toContain('expired')
  })

  test('stays suppressed when reconciliation returns the identical session', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settleRejection(runs[0], unauthorized())

    await rerender(tree, <SettingsScreen />)
    await focus()
    await blur()
    await focus()
    await appState('active')

    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)
    expect(renderedText(tree)).toContain('expired')
  })

  test('shows the plain sign-in CTA when reconciliation finds no session', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settleRejection(runs[0], unauthorized())
    expect(mockSessionRefetch).toHaveBeenCalledTimes(1)

    signOut()
    await rerender(tree, <SettingsScreen />)

    expect(renderedText(tree)).not.toContain('expired')
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to manage notification settings',
      })
    ).toBeTruthy()
  })

  test('a different account still fetches after a 401 on the previous account', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settleRejection(runs[0], unauthorized())

    signIn('user-b')
    await rerender(tree, <SettingsScreen />)

    expect(getSettings).toHaveBeenCalledTimes(2)
    expect(renderedText(tree)).not.toContain('expired')

    await settle(runs[1], prefs())
    expect(renderedText(tree)).toContain('Push Notifications')
  })
})

describe('settings route — account isolation', () => {
  test('masks the previous account immediately when the session user changes', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())
    expect(renderedText(tree)).toContain('Push Notifications')

    signIn('user-b')
    await rerender(tree, <SettingsScreen />)

    expect(getSettings).toHaveBeenCalledTimes(2)
    expect(tree.root.findByProps({ testID: 'settings-loading' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'switch' })
    ).toHaveLength(0)

    await settle(runs[1], prefs({ push_notifications: true }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
  })

  test('never shows account A data that resolves after switching to account B', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settle(runs[0], prefs({ email_notifications: false }))
    expect(tree.root.findByProps({ testID: 'settings-loading' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'switch' })
    ).toHaveLength(0)

    await settle(runs[1], prefs())
    expect(
      switchFor(tree, 'Email Notifications').props.accessibilityState.checked
    ).toBe(true)
  })

  test('drops a write result that lands after switching accounts', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    signIn('user-b')
    await rerender(tree, <SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    await settle(runs[1], prefs({ push_notifications: false }))

    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(false)
    expect(updateSettings).toHaveBeenCalledTimes(1)
  })

  test('signing out returns to the CTA and masks the loaded data without refetching', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())

    signOut()
    await rerender(tree, <SettingsScreen />)

    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(
      tree.root.findByProps({
        accessibilityLabel: 'Sign in to manage notification settings',
      })
    ).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'switch' })
    ).toHaveLength(0)
  })
})

describe('settings route — malformed responses', () => {
  const MALFORMED: Array<[string, unknown]> = [
    ['null payload', null],
    ['empty object', {}],
    ['string payload', 'enabled'],
    [
      'missing push flag',
      { email_notifications: true, challenge_reminders: true },
    ],
    [
      'non-boolean flag',
      {
        email_notifications: 'yes',
        push_notifications: false,
        challenge_reminders: true,
      },
    ],
    [
      'null flag',
      {
        email_notifications: true,
        push_notifications: null,
        challenge_reminders: true,
      },
    ],
  ]

  test.each(MALFORMED)(
    'reports %s through the retryable error state',
    async (_label, value) => {
      signIn('user-a')
      const tree = await render(<SettingsScreen />)
      await settle(runs[runs.length - 1], value as NotificationSettingsResponse)

      expect(tree.root.findByProps({ testID: 'settings-error' })).toBeTruthy()
      expect(renderedText(tree)).toContain('Something went wrong')
      expect(
        tree.root.findAllByProps({ accessibilityRole: 'switch' })
      ).toHaveLength(0)
    }
  )

  test('a retry after a malformed payload still recovers into data', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], {} as NotificationSettingsResponse)
    expect(tree.root.findByProps({ testID: 'settings-error' })).toBeTruthy()

    await press(tree, 'Retry loading settings')
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settle(runs[1], prefs())
    expect(renderedText(tree)).toContain('Push Notifications')
  })

  test('a malformed refresh masks the previously loaded preferences', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())
    expect(renderedText(tree)).toContain('Push Notifications')

    await focus()
    await blur()
    await focus()
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settle(runs[1], {} as NotificationSettingsResponse)
    expect(tree.root.findByProps({ testID: 'settings-error' })).toBeTruthy()
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'switch' })
    ).toHaveLength(0)
  })
})

describe('settings route — refetch lifecycle', () => {
  test('refetches only when the route regains focus', async () => {
    signIn('user-a')
    await render(<SettingsScreen />)
    expect(getSettings).toHaveBeenCalledTimes(1)

    await focus()
    expect(getSettings).toHaveBeenCalledTimes(1)

    await blur()
    await focus()
    expect(getSettings).toHaveBeenCalledTimes(2)
  })

  test('refetches on app foreground while focused, not on other transitions', async () => {
    signIn('user-a')
    await render(<SettingsScreen />)
    await settle(runs[0], prefs())
    await focus()
    expect(appStateListeners).toHaveLength(1)

    await appState('background')
    expect(getSettings).toHaveBeenCalledTimes(1)

    await appState('inactive')
    expect(getSettings).toHaveBeenCalledTimes(1)

    await appState('active')
    expect(getSettings).toHaveBeenCalledTimes(2)
  })

  test('a focus refresh keeps an in-flight intent instead of clobbering it', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())
    await focus()

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await blur()
    await focus()
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settle(runs[1], prefs({ push_notifications: false }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settle(runs[2], prefs({ push_notifications: true }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
  })

  test('a refresh issued before a save cannot regress the acknowledged value', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())
    await focus()

    await blur()
    await focus()
    expect(getSettings).toHaveBeenCalledTimes(2)

    await flip(tree, 'Push Notifications', true)
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    expect(getSettings).toHaveBeenCalledTimes(3)
    expect(renderedText(tree)).toContain('Preferences saved')

    await settle(runs[1], prefs({ push_notifications: false }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settle(runs[2], prefs({ push_notifications: true }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
  })

  test('a refresh resolving mid-save does not clobber the pending intent', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())
    await focus()

    await blur()
    await focus()
    expect(getSettings).toHaveBeenCalledTimes(2)

    await flip(tree, 'Push Notifications', true)
    await settle(runs[1], prefs({ push_notifications: false }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)

    await settleWrite(writes[0].run, updateOk({ push_notifications: true }))
    expect(
      switchFor(tree, 'Push Notifications').props.accessibilityState.checked
    ).toBe(true)
    await settle(runs[runs.length - 1], prefs({ push_notifications: true }))
  })

  test('a focus refresh reflects preferences changed elsewhere', async () => {
    signIn('user-a')
    const tree = await render(<SettingsScreen />)
    await settle(runs[0], prefs())
    await focus()

    await blur()
    await focus()
    expect(getSettings).toHaveBeenCalledTimes(2)

    await settle(runs[1], prefs({ challenge_reminders: false }))
    expect(
      switchFor(tree, 'Daily Challenge Reminders').props.accessibilityState
        .checked
    ).toBe(false)
  })
})

describe('settings route — cold-link recovery', () => {
  test('offers a Back to games fallback when the stack cannot go back', async () => {
    mockCanGoBack.mockReturnValue(false)
    const tree = await render(<SettingsScreen />)

    const back = tree.root.findByProps({ accessibilityLabel: 'Back to games' })
    await act(async () => {
      back.props.onPress()
    })
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  test('hides the fallback while ordinary stack back is available', async () => {
    mockCanGoBack.mockReturnValue(true)
    const tree = await render(<SettingsScreen />)

    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Back to games' })
    ).toHaveLength(0)
  })
})
