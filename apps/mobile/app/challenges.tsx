import { useCallback, useEffect, type ReactNode } from 'react'
import { Stack, useRouter } from 'expo-router'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRemoteData } from '@cetus/app-core'
import { Button, DailyMissionsPanel, Heading } from '@cetus/ui'
import type { ChallengesResponse } from '@cetus/shared/api-dto'

import { api } from '../src/lib/api'
import { authClient } from '../src/lib/auth-client'
import {
  ChallengesEmpty,
  ChallengesError,
  ChallengesLoading,
  ChallengesSignIn,
  challengesResponseFor,
} from '../src/lib/challenges'
import { isUnauthorizedError, useRefetchOnFocus } from '../src/lib/refetch'
import { sessionKeyFor, useExpiredSessionGate } from '../src/lib/session'

export default function ChallengesScreen() {
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

  const { data, loading, error, refresh } = useRemoteData<ChallengesResponse>(
    useCallback((signal: AbortSignal) => api.getChallenges({ signal }), []),
    ['challenges', userId ?? 'anonymous', sessionKey ?? 'none'],
    userId !== null && !isPending && !authExpired
  )
  useRefetchOnFocus(refresh)

  useEffect(() => {
    if (error !== null && isUnauthorizedError(error) && sessionKey !== null) {
      markSessionExpired()
      void Promise.resolve(refetchSession?.()).catch(() => undefined)
    }
  }, [error, sessionKey, markSessionExpired, refetchSession])

  const openSignIn = useCallback(() => {
    router.push({
      pathname: '/sign-in',
      params: { returnTo: '/challenges' },
    })
  }, [router])

  const payload = data === undefined ? undefined : challengesResponseFor(data)
  const payloadError =
    error ??
    (payload === null ? new Error('Unexpected challenges response') : null)

  let content: ReactNode
  if (isPending) {
    content = <ChallengesLoading />
  } else if (!session) {
    content = <ChallengesSignIn onSignIn={openSignIn} />
  } else if (authExpired || isUnauthorizedError(error)) {
    content = <ChallengesSignIn expired onSignIn={openSignIn} />
  } else if (payload === undefined || payload === null) {
    content = loading ? (
      <ChallengesLoading />
    ) : (
      <ChallengesError
        error={payloadError ?? new Error('Challenges request failed')}
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
          <Heading level={4} variant="section" kicker="DAILY OPS">
            Challenges
          </Heading>
          <Text className="font-sans text-xs text-cetus-ink-muted">
            {payload.date} UTC · missions reset daily at midnight UTC
          </Text>
        </View>
        <DailyMissionsPanel
          challenges={payload.challenges}
          xp={payload.xp}
          level={payload.level}
          xpProgress={payload.xpProgress}
          xpToNextLevel={payload.xpToNextLevel}
          streak={payload.streak}
          resetIn={payload.resetIn}
          onResetRefresh={refresh}
        />
        {payload.challenges.length === 0 ? <ChallengesEmpty /> : null}
      </ScrollView>
    )
  }

  return (
    <View className="flex-1 bg-cetus-canvas">
      <Stack.Screen options={{ title: 'Challenges' }} />
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
