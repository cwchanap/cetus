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

type SettingsFetch = {
  settledAfter: number
  settings: unknown
}

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

  const writesSettledRef = useRef(0)
  const { data, loading, error, refresh } = useRemoteData<SettingsFetch>(
    useCallback(async () => {
      const settledAfter = writesSettledRef.current
      const settings = await api.getSettings()
      return { settledAfter, settings }
    }, []),
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
  const [saved, setSaved] = useState(false)
  const [failedKey, setFailedKey] = useState<NotificationPrefKey | null>(null)
  const [saving, setSaving] = useState(false)
  const busyRef = useRef<{
    epoch: number
    key: NotificationPrefKey
  } | null>(null)
  const confirmedRef = useRef<{
    epoch: number
    prefs: NotificationPrefs
  } | null>(null)
  const appliedDataRef = useRef<unknown>(null)

  if (busyRef.current !== null && busyRef.current.epoch !== epochRef.current) {
    busyRef.current = null
    setSaving(false)
  }
  if (prefsFor !== sessionKey) {
    setPrefsFor(sessionKey)
    setPrefs(null)
    setSaved(false)
    setFailedKey(null)
    setMutationError(null)
  }

  const saveKey = async (
    key: NotificationPrefKey,
    target: boolean,
    operationEpoch: number
  ) => {
    const wire = NOTIFICATION_PREFS.find(row => row.key === key)?.wire
    try {
      if (wire === undefined) {
        return
      }
      const payload: Partial<NotificationSettingsResponse> = {
        [wire]: target,
      }
      const response = await api.updateSettings(payload)
      if (isStale(operationEpoch)) {
        return
      }
      const parsed = settingsUpdateFor(response)
      if (parsed === null) {
        throw new Error('Unexpected settings response')
      }
      writesSettledRef.current += 1
      const acknowledged = notificationPrefsFor(parsed.preferences)
      confirmedRef.current = { epoch: operationEpoch, prefs: acknowledged }
      setPrefs({ ...acknowledged })
      setMutationError(null)
      setFailedKey(current => (current === key ? null : current))
      setSaved(true)
      refresh()
    } catch (reason) {
      if (isStale(operationEpoch)) {
        return
      }
      writesSettledRef.current += 1
      const failure = toError(reason)
      setMutationError(failure)
      const confirmed =
        confirmedRef.current?.epoch === operationEpoch
          ? confirmedRef.current.prefs
          : null
      if (confirmed !== null) {
        setPrefs(current =>
          current === null ? current : { ...current, [key]: confirmed[key] }
        )
      }
      if (!isUnauthorizedError(failure)) {
        setSaved(false)
        setFailedKey(key)
      }
    } finally {
      if (busyRef.current?.epoch === operationEpoch) {
        busyRef.current = null
        if (mountedRef.current) {
          setSaving(false)
        }
      }
    }
  }

  useEffect(() => {
    if (data === undefined || appliedDataRef.current === data) {
      return
    }
    appliedDataRef.current = data
    const parsed = settingsResponseFor(data.settings)
    if (
      parsed === null ||
      busyRef.current !== null ||
      data.settledAfter < writesSettledRef.current
    ) {
      return
    }
    const server = notificationPrefsFor(parsed)
    confirmedRef.current = {
      epoch: latestRef.current.epoch,
      prefs: server,
    }
    setPrefs({ ...server })
  })

  const openSignIn = useCallback(() => {
    router.push({
      pathname: '/sign-in',
      params: { returnTo: '/settings' },
    })
  }, [router])

  const payload =
    data === undefined ? undefined : settingsResponseFor(data.settings)
  const serverPrefs =
    payload === null || payload === undefined
      ? null
      : notificationPrefsFor(payload)
  const view = prefs ?? serverPrefs

  const handleToggle = (key: NotificationPrefKey, next: boolean) => {
    if (
      !latestRef.current.eligible ||
      serverPrefs === null ||
      busyRef.current !== null
    ) {
      return
    }
    const operationEpoch = latestRef.current.epoch
    const confirmed =
      confirmedRef.current?.epoch === operationEpoch
        ? confirmedRef.current.prefs
        : { ...serverPrefs }
    if (confirmed[key] === next) {
      return
    }
    busyRef.current = { epoch: operationEpoch, key }
    confirmedRef.current = { epoch: operationEpoch, prefs: confirmed }
    setSaving(true)
    setPrefs({ ...confirmed, [key]: next })
    setSaved(false)
    void saveKey(key, next, operationEpoch)
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
              disabled={saving}
              onCheckedChange={next => handleToggle(row.key, next)}
            />
          ))}
        </Card>
        {failedKey !== null ? (
          <Text
            accessibilityRole="alert"
            testID="settings-status"
            className="font-sans text-sm text-red-400"
          >
            Couldn&apos;t save your preferences. Try again.
          </Text>
        ) : saved ? (
          <Text
            testID="settings-status"
            className="font-sans text-sm text-cetus-accent"
          >
            Preferences saved.
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
