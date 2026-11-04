import { ActivityIndicator, Text, View } from 'react-native'
import { Button, Heading } from '@cetus/ui'
import type {
  NotificationSettingsResponse,
  SettingsUpdateResponse,
} from '@cetus/shared/api-dto'

import { isNetworkError, isServiceUnavailable } from './refetch'

export type NotificationPrefKey =
  'emailNotifications' | 'pushNotifications' | 'challengeReminders'

export type NotificationPrefs = Record<NotificationPrefKey, boolean>

export const NOTIFICATION_PREFS: readonly {
  key: NotificationPrefKey
  wire: keyof NotificationSettingsResponse
  label: string
  description: string
}[] = [
  {
    key: 'emailNotifications',
    wire: 'email_notifications',
    label: 'Email Notifications',
    description: 'Receive updates and reminders via email',
  },
  {
    key: 'pushNotifications',
    wire: 'push_notifications',
    label: 'Push Notifications',
    description: 'Receive push notifications',
  },
  {
    key: 'challengeReminders',
    wire: 'challenge_reminders',
    label: 'Daily Challenge Reminders',
    description: 'Get reminded about incomplete daily challenges',
  },
]

export function settingsResponseFor(
  data: unknown
): NotificationSettingsResponse | null {
  if (data === null || typeof data !== 'object') {
    return null
  }
  const candidate = data as Partial<NotificationSettingsResponse>
  if (
    typeof candidate.email_notifications !== 'boolean' ||
    typeof candidate.push_notifications !== 'boolean' ||
    typeof candidate.challenge_reminders !== 'boolean'
  ) {
    return null
  }
  return {
    email_notifications: candidate.email_notifications,
    push_notifications: candidate.push_notifications,
    challenge_reminders: candidate.challenge_reminders,
  }
}

export function settingsUpdateFor(
  data: unknown
): SettingsUpdateResponse | null {
  if (data === null || typeof data !== 'object') {
    return null
  }
  const candidate = data as Partial<SettingsUpdateResponse>
  if (candidate.success !== true) {
    return null
  }
  const preferences = settingsResponseFor(candidate.preferences)
  if (preferences === null) {
    return null
  }
  return { success: true, preferences }
}

export function notificationPrefsFor(
  response: NotificationSettingsResponse
): NotificationPrefs {
  const result = {} as NotificationPrefs
  for (const row of NOTIFICATION_PREFS) {
    result[row.key] = response[row.wire]
  }
  return result
}

export function SettingsLoading() {
  return (
    <View
      testID="settings-loading"
      className="flex-1 items-center justify-center gap-3 py-16"
    >
      <ActivityIndicator accessibilityLabel="Loading notification settings" />
      <Text className="font-sans text-sm text-cetus-ink-muted">
        Loading settings…
      </Text>
    </View>
  )
}

export function SettingsError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const unavailable = isServiceUnavailable(error)
  const offline = isNetworkError(error)
  const title = unavailable
    ? 'Settings temporarily unavailable'
    : offline
      ? "Couldn't reach the settings service"
      : "Couldn't load settings"
  const body = unavailable
    ? 'The service cannot respond right now. Try again shortly.'
    : offline
      ? 'Check your connection and try again.'
      : 'Something went wrong. Try again.'
  return (
    <View
      testID={unavailable ? 'settings-unavailable' : 'settings-error'}
      className="flex-1 items-center justify-center gap-3 px-6 py-16"
    >
      <Text className="font-display text-center text-base font-bold text-cetus-ink">
        {title}
      </Text>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {body}
      </Text>
      <Button
        variant="outline"
        accessibilityRole="button"
        accessibilityLabel="Retry loading settings"
        onPress={onRetry}
        className="mt-1"
      >
        Retry
      </Button>
    </View>
  )
}

export function SettingsSignIn({
  expired,
  onSignIn,
}: {
  expired?: boolean
  onSignIn: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Heading level={4} variant="section" align="center">
        Settings
      </Heading>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {expired
          ? 'Your session has expired. Sign in again to manage notification settings.'
          : 'Sign in to manage your notification settings.'}
      </Text>
      <Button
        variant="primary"
        accessibilityRole="button"
        accessibilityLabel="Sign in to manage notification settings"
        onPress={onSignIn}
        className="mt-2"
      >
        Sign in
      </Button>
    </View>
  )
}
