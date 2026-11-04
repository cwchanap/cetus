import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { FlatList, RefreshControl, Text, View } from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { useRemoteData } from '@cetus/app-core'
import { Heading, Select } from '@cetus/ui'
import type { UserOverviewResponse } from '@cetus/shared/api-dto'

import { api } from '../../src/lib/api'
import { authClient } from '../../src/lib/auth-client'
import {
  ACHIEVEMENT_GAME_ALL,
  achievementGameOptions,
  AchievementRow,
  AchievementsEmpty,
  AchievementsError,
  AchievementsLoading,
  AchievementsSignIn,
  achievementViewsFor,
  filterAchievementViews,
  StatusFilterChips,
  type AchievementGameScope,
  type AchievementStatusFilter,
  type AchievementView,
} from '../../src/lib/achievements'
import { isUnauthorizedError, useRefetchOnFocus } from '../../src/lib/refetch'

const GAME_OPTIONS = achievementGameOptions()

export default function AchievementsScreen() {
  const router = useRouter()
  const accent = useNativeVariable('--cetus-accent')
  const {
    data: session,
    isPending,
    refetch: refetchSession,
  } = authClient.useSession()
  const userId = session?.user.id ?? null
  const sessionKey = session?.session
    ? [
        session.session.id,
        String(session.session.updatedAt ?? ''),
        String(session.session.expiresAt ?? ''),
      ].join(':')
    : userId
  const [expiredSessionKeys, setExpiredSessionKeys] = useState<
    readonly string[]
  >([])
  const authExpired =
    sessionKey !== null && expiredSessionKeys.includes(sessionKey)
  const [status, setStatus] = useState<AchievementStatusFilter>('all')
  const [game, setGame] = useState<AchievementGameScope>(ACHIEVEMENT_GAME_ALL)

  const { data, loading, error, refresh } = useRemoteData<UserOverviewResponse>(
    useCallback(() => api.getUserOverview(), []),
    ['achievements', userId ?? 'anonymous', sessionKey ?? 'none'],
    userId !== null && !isPending && !authExpired
  )
  useRefetchOnFocus(refresh)

  useEffect(() => {
    if (error !== null && isUnauthorizedError(error) && sessionKey !== null) {
      setExpiredSessionKeys(current =>
        current.includes(sessionKey) ? current : [...current, sessionKey]
      )
      void Promise.resolve(refetchSession?.()).catch(() => undefined)
    }
  }, [error, sessionKey, refetchSession])

  const views = useMemo(() => achievementViewsFor(data), [data])
  const filtered = useMemo(
    () => filterAchievementViews(views ?? [], status, game),
    [views, status, game]
  )
  const earnedCount = useMemo(
    () => (views ?? []).filter(view => view.earned).length,
    [views]
  )
  const selectedGameLabel =
    GAME_OPTIONS.find(option => option.value === game)?.label ?? 'All games'

  const openSignIn = useCallback(() => {
    router.push({
      pathname: '/sign-in',
      params: { returnTo: '/(tabs)/achievements' },
    })
  }, [router])

  if (isPending) {
    return (
      <View className="flex-1 bg-cetus-canvas">
        <AchievementsLoading />
      </View>
    )
  }

  if (!session) {
    return <AchievementsSignIn onSignIn={openSignIn} />
  }

  if (authExpired || (error !== null && isUnauthorizedError(error))) {
    return <AchievementsSignIn expired onSignIn={openSignIn} />
  }

  if (views === null) {
    return (
      <View className="flex-1 bg-cetus-canvas">
        {loading ? (
          <AchievementsLoading />
        ) : (
          <AchievementsError
            error={error ?? new Error('Achievements request failed')}
            onRetry={refresh}
          />
        )}
      </View>
    )
  }

  const header = (
    <View className="gap-3">
      <View className="gap-1">
        <Heading level={4} variant="section" kicker="ACHIEVEMENT LOG">
          Achievements
        </Heading>
        <Text className="font-sans text-xs text-cetus-ink-muted">
          {earnedCount} of {views.length} earned ·{' '}
          {views.length === 0
            ? 0
            : Math.round((earnedCount / views.length) * 100)}
          %
        </Text>
      </View>
      <StatusFilterChips status={status} onChange={setStatus} />
      <Select
        accessibilityLabel="Achievement game filter"
        accessibilityHint="Chooses which game's achievements to show"
        accessibilityValue={{ text: selectedGameLabel }}
        options={GAME_OPTIONS}
        value={game}
        onValueChange={next => setGame(next as AchievementGameScope)}
      />
    </View>
  )

  return (
    <View className="flex-1 bg-cetus-canvas">
      <FlatList<AchievementView>
        className="flex-1"
        contentContainerClassName="gap-2.5 px-4 pb-8 pt-3"
        data={filtered}
        initialNumToRender={views.length}
        keyExtractor={view => view.achievement.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={<AchievementsEmpty status={status} />}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={accent}
          />
        }
        renderItem={({ item }) => <AchievementRow view={item} />}
      />
    </View>
  )
}
