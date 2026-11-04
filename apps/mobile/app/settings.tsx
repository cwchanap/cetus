import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Stack, useRouter } from 'expo-router'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRemoteData } from '@cetus/app-core'
import { Button, Card, Heading, Toggle } from '@cetus/ui'
import type { NotificationSettingsResponse } from '@cetus/shared/api-dto'

import { api } from '../src/lib/api'
import { authClient } from '../src/lib/auth-client'
import {
  NOTIFICATION_PREFS,
  notificationPrefsFor,
  SettingsError,
  SettingsLoading,
  SettingsSignIn,
  settingsResponseFor,
  settingsUpdateFor,
  type NotificationPrefKey,
  type NotificationPrefs,
} from '../src/lib/settings'
import { isUnauthorizedError, useRefetchOnFocus } from '../src/lib/refetch'
import { sessionKeyFor, useExpiredSessionGate } from '../src/lib/session'

const toError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error(String(reason))

export default function SettingsScreen() {
  const router = useRouter()
  const accent = useNativeVariable('--cetus-accent')
  const insets = useSafeAreaInsets()
  const {
    data: session,
    isPending,
    refetch: refetchSession,
  } = authClient.useSession()
  const userId = session?.user.id ?? null
  const sessionKey = sessionKeyFor(session)
  const { authExpired, markSessionExpired } = useExpiredSessionGate(sessionKey)

  const { data, loading, error, refresh } =
    useRemoteData<NotificationSettingsResponse>(
      useCallback(() => api.getSettings(), []),
      ['settings', userId ?? 'anonymous', sessionKey ?? 'none'],
      userId !== null && !isPending && !authExpired
    )
  useRefetchOnFocus(refresh)

  const [mutationError, setMutationError] = useState<Error | null>(null)
  const reconciledForRef = useRef<string | null>(null)
  useEffect(() => {
    const unauthorized =
      isUnauthorizedError(error) || isUnauthorizedError(mutationError)
    if (!unauthorized || sessionKey === null) {
      return
    }
    markSessionExpired()
    if (reconciledForRef.current !== sessionKey) {
      reconciledForRef.current = sessionKey
      void Promise.resolve(refetchSession?.()).catch(() => undefined)
    }
  }, [error, mutationError, sessionKey, markSessionExpired, refetchSession])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const eligible =
    sessionKey !== null &&
    !isPending &&
    !authExpired &&
    !isUnauthorizedError(error) &&
    !isUnauthorizedError(mutationError)
  const epochRef = useRef(0)
  const latestRef = useRef({ key: sessionKey, eligible, epoch: 0 })
  if (
    latestRef.current.key !== sessionKey ||
    latestRef.current.eligible !== eligible
  ) {
    epochRef.current += 1
  }
  latestRef.current = { key: sessionKey, eligible, epoch: epochRef.current }
  const isStale = (operationEpoch: number) =>
    !mountedRef.current || latestRef.current.epoch !== operationEpoch

  const [prefsFor, setPrefsFor] = useState<string | null>(sessionKey)
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null)
  const desiredRef = useRef<{ epoch: number; prefs: NotificationPrefs } | null>(
    null
  )
  const confirmedRef = useRef<{
    epoch: number
    prefs: NotificationPrefs
  } | null>(null)
  const drainingRef = useRef<Partial<Record<NotificationPrefKey, number>>>({})
  const appliedDataRef = useRef<unknown>(null)

  if (prefsFor !== sessionKey) {
    setPrefsFor(sessionKey)
    setPrefs(null)
    setStatus(null)
    setMutationError(null)
  }

  const syncFromServer = (
    server: NotificationPrefs,
    operationEpoch: number
  ) => {
    if (isStale(operationEpoch)) {
      return
    }
    const confirmed =
      confirmedRef.current?.epoch === operationEpoch
        ? confirmedRef.current.prefs
        : null
    const desired =
      desiredRef.current?.epoch === operationEpoch
        ? desiredRef.current.prefs
        : null
    const nextDesired = { ...(desired ?? server) }
    for (const row of NOTIFICATION_PREFS) {
      const busy = drainingRef.current[row.key] === operationEpoch
      if (
        !busy &&
        (confirmed === null ||
          desired === null ||
          desired[row.key] === confirmed[row.key])
      ) {
        nextDesired[row.key] = server[row.key]
      }
    }
    confirmedRef.current = { epoch: operationEpoch, prefs: { ...server } }
    desiredRef.current = { epoch: operationEpoch, prefs: nextDesired }
    setPrefs({ ...nextDesired })
    for (const row of NOTIFICATION_PREFS) {
      void drainKey(row.key)
    }
  }

  const drainKey = async (key: NotificationPrefKey) => {
    const operationEpoch = latestRef.current.epoch
    if (drainingRef.current[key] === operationEpoch) {
      return
    }
    drainingRef.current[key] = operationEpoch
    let wrote = false
    const wire = NOTIFICATION_PREFS.find(row => row.key === key)?.wire
    try {
      while (true) {
        if (isStale(operationEpoch) || wire === undefined) {
          return
        }
        const desired =
          desiredRef.current?.epoch === operationEpoch
            ? desiredRef.current.prefs
            : null
        const confirmed =
          confirmedRef.current?.epoch === operationEpoch
            ? confirmedRef.current.prefs
            : null
        if (
          desired === null ||
          confirmed === null ||
          desired[key] === confirmed[key]
        ) {
          return
        }
        const target = desired[key]
        const payload: Partial<NotificationSettingsResponse> = {
          [wire]: target,
        }
        try {
          const response = await api.updateSettings(payload)
          if (isStale(operationEpoch)) {
            return
          }
          const parsed = settingsUpdateFor(response)
          if (parsed === null) {
            throw new Error('Unexpected settings response')
          }
          wrote = true
          setStatus('saved')
          syncFromServer(
            notificationPrefsFor(parsed.preferences),
            operationEpoch
          )
        } catch (reason) {
          if (isStale(operationEpoch)) {
            return
          }
          const failure = toError(reason)
          setMutationError(failure)
          const latestDesired =
            desiredRef.current?.epoch === operationEpoch
              ? desiredRef.current.prefs
              : null
          const latestConfirmed =
            confirmedRef.current?.epoch === operationEpoch
              ? confirmedRef.current.prefs
              : null
          if (latestDesired !== null && latestDesired[key] === target) {
            const rollback = latestConfirmed?.[key] ?? target
            desiredRef.current = {
              epoch: operationEpoch,
              prefs: { ...latestDesired, [key]: rollback },
            }
            setPrefs(current =>
              current === null ? current : { ...current, [key]: rollback }
            )
          }
          if (!isUnauthorizedError(failure)) {
            setStatus('failed')
          }
        }
      }
    } finally {
      if (drainingRef.current[key] === operationEpoch) {
        drainingRef.current[key] = undefined
      }
      if (wrote && !isStale(operationEpoch)) {
        refresh()
      }
    }
  }

  useEffect(() => {
    if (data === undefined || appliedDataRef.current === data) {
      return
    }
    const parsed = settingsResponseFor(data)
    if (parsed === null) {
      return
    }
    appliedDataRef.current = data
    syncFromServer(notificationPrefsFor(parsed), latestRef.current.epoch)
  })

  const openSignIn = useCallback(() => {
    router.push({
      pathname: '/sign-in',
      params: { returnTo: '/settings' },
    })
  }, [router])

  const payload = data === undefined ? undefined : settingsResponseFor(data)
  const serverPrefs =
    payload === null || payload === undefined
      ? null
      : notificationPrefsFor(payload)
  const view = prefs ?? serverPrefs

  const handleToggle = (key: NotificationPrefKey, next: boolean) => {
    if (!latestRef.current.eligible || serverPrefs === null) {
      return
    }
    const operationEpoch = latestRef.current.epoch
    const confirmed =
      confirmedRef.current?.epoch === operationEpoch
        ? confirmedRef.current.prefs
        : serverPrefs
    const desired =
      desiredRef.current?.epoch === operationEpoch
        ? desiredRef.current.prefs
        : { ...confirmed }
    if (desired[key] === next) {
      return
    }
    confirmedRef.current = { epoch: operationEpoch, prefs: confirmed }
    desiredRef.current = {
      epoch: operationEpoch,
      prefs: { ...desired, [key]: next },
    }
    setPrefs({ ...desiredRef.current.prefs })
    setStatus(null)
    void drainKey(key)
  }

  const payloadError =
    error ??
    (payload === null ? new Error('Unexpected settings response') : null)

  let content: ReactNode
  if (isPending) {
    content = <SettingsLoading />
  } else if (!session) {
    content = <SettingsSignIn onSignIn={openSignIn} />
  } else if (
    authExpired ||
    isUnauthorizedError(error) ||
    isUnauthorizedError(mutationError)
  ) {
    content = <SettingsSignIn expired onSignIn={openSignIn} />
  } else if (payload === undefined || payload === null || view === null) {
    content = loading ? (
      <SettingsLoading />
    ) : (
      <SettingsError
        error={payloadError ?? new Error('Settings request failed')}
        onRetry={refresh}
      />
    )
  } else {
    content = (
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={accent}
          />
        }
      >
        <View className="gap-1">
          <Heading level={4} variant="section" kicker="MISSION CONTROL">
            Settings
          </Heading>
          <Text className="font-sans text-xs text-cetus-ink-muted">
            Notification preferences sync to your account
          </Text>
        </View>
        <Card variant="sci-fi" className="gap-4 p-4">
          {NOTIFICATION_PREFS.map(row => (
            <Toggle
              key={row.key}
              variant="sci-fi"
              label={row.label}
              description={row.description}
              checked={view[row.key]}
              onCheckedChange={next => handleToggle(row.key, next)}
            />
          ))}
        </Card>
        {status === 'saved' ? (
          <Text
            testID="settings-status"
            className="font-sans text-sm text-cetus-accent"
          >
            Preferences saved.
          </Text>
        ) : null}
        {status === 'failed' ? (
          <Text
            accessibilityRole="alert"
            testID="settings-status"
            className="font-sans text-sm text-red-400"
          >
            Couldn&apos;t save your preferences. Try again.
          </Text>
        ) : null}
      </ScrollView>
    )
  }

  return (
    <View className="flex-1 bg-cetus-canvas">
      <Stack.Screen options={{ title: 'Settings' }} />
      {content}
      {router.canGoBack() ? null : (
        <View
          className="border-t border-cetus-hairline px-4 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Button
            variant="outline"
            accessibilityLabel="Back to games"
            accessibilityHint="Returns to the games catalog"
            onPress={() => router.replace('/')}
          >
            Back to games
          </Button>
        </View>
      )}
    </View>
  )
}
