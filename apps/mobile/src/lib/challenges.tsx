import { ActivityIndicator, Text, View } from 'react-native'
import { Button, Heading } from '@cetus/ui'

import { isNetworkError, isServiceUnavailable } from './refetch'

export function ChallengesLoading() {
  return (
    <View
      testID="challenges-loading"
      className="flex-1 items-center justify-center gap-3 py-16"
    >
      <ActivityIndicator accessibilityLabel="Loading daily missions" />
      <Text className="font-sans text-sm text-cetus-ink-muted">
        Loading daily missions…
      </Text>
    </View>
  )
}

export function ChallengesError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const unavailable = isServiceUnavailable(error)
  const offline = isNetworkError(error)
  const title = unavailable
    ? 'Daily missions temporarily unavailable'
    : offline
      ? "Couldn't reach the missions service"
      : "Couldn't load daily missions"
  const body = unavailable
    ? 'The missions service cannot respond right now. Try again shortly.'
    : offline
      ? 'Check your connection and try again.'
      : 'Something went wrong. Try again.'
  return (
    <View
      testID={unavailable ? 'challenges-unavailable' : 'challenges-error'}
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
        accessibilityLabel="Retry loading daily missions"
        onPress={onRetry}
        className="mt-1"
      >
        Retry
      </Button>
    </View>
  )
}

export function ChallengesEmpty() {
  return (
    <View
      testID="challenges-empty"
      className="items-center gap-1 rounded-xl border border-cetus-hairline px-4 py-5"
    >
      <Text className="font-sans text-sm text-cetus-ink-muted">
        No missions today
      </Text>
      <Text className="font-sans text-center text-xs text-cetus-ink-muted">
        Check back after the daily UTC reset.
      </Text>
    </View>
  )
}

export function ChallengesSignIn({
  expired,
  onSignIn,
}: {
  expired?: boolean
  onSignIn: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Heading level={4} variant="section" align="center">
        Challenges
      </Heading>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {expired
          ? 'Your session has expired. Sign in again to keep tracking daily missions.'
          : 'Sign in to take on daily missions, earn XP and build your streak.'}
      </Text>
      <Button
        variant="primary"
        accessibilityRole="button"
        accessibilityLabel="Sign in to view daily missions"
        onPress={onSignIn}
        className="mt-2"
      >
        Sign in
      </Button>
    </View>
  )
}
