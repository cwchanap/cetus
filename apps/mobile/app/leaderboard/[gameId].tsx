import { useCallback } from 'react'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Heading } from '@cetus/ui'
import { useRemoteData } from '@cetus/app-core'
import type { LeaderboardResponse } from '@cetus/shared/api-dto'
import { getGameById, type GameID } from '@cetus/shared/games'

import { api } from '../../src/lib/api'
import {
  EmptyBoard,
  isSingleBoard,
  LeaderboardError,
  LeaderboardLoading,
  LeaderboardRow,
  leaderboardQueryFor,
  useRefetchOnFocus,
} from '../../src/lib/leaderboard'

export default function GameLeaderboardScreen() {
  const router = useRouter()
  const accent = useNativeVariable('--cetus-accent')
  const insets = useSafeAreaInsets()
  const { gameId } = useLocalSearchParams<{
    gameId?: string | string[]
  }>()
  const id = Array.isArray(gameId) ? gameId[0] : gameId
  const game = id ? getGameById(id as GameID) : undefined

  const { data, loading, error, refresh } = useRemoteData<LeaderboardResponse>(
    useCallback(
      (signal: AbortSignal) => {
        if (!game) {
          return Promise.reject(new Error('No game selected'))
        }
        return api.getLeaderboard(leaderboardQueryFor(game.id), { signal })
      },
      [game]
    ),
    ['leaderboard', id ?? ''],
    game !== undefined
  )
  useRefetchOnFocus(refresh)

  if (!game) {
    return (
      <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
        <Stack.Screen options={{ title: 'Leaderboard' }} />
        <Heading level={4} variant="section" align="center">
          Leaderboard not found
        </Heading>
        <Text className="font-sans text-center text-sm text-cetus-ink-muted">
          No game matches "{id ?? 'unknown'}".
        </Text>
        <Button
          variant="outline"
          accessibilityLabel="Back to leaderboard"
          onPress={() => router.replace('/leaderboard')}
          className="mt-2"
        >
          Back to leaderboard
        </Button>
      </View>
    )
  }

  const entries =
    data !== undefined && isSingleBoard(data) ? data.leaderboard : null
  const boardError =
    error ??
    (data !== undefined && entries === null
      ? new Error('Unexpected leaderboard response')
      : null)

  return (
    <View className="flex-1 bg-cetus-canvas">
      <Stack.Screen options={{ title: `${game.name} Leaderboard` }} />
      {entries === null ? (
        loading ? (
          <LeaderboardLoading />
        ) : (
          <LeaderboardError
            error={boardError ?? new Error('Leaderboard request failed')}
            onRetry={refresh}
          />
        )
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-2.5 px-4 pb-8"
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={accent}
            />
          }
        >
          <View className="gap-1 pb-1 pt-2">
            <Heading level={4} variant="section" kicker="LEADERBOARD">
              {game.name}
            </Heading>
            <Text className="font-sans text-xs text-cetus-ink-muted">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          {entries.length === 0 ? (
            <EmptyBoard game={game} />
          ) : (
            entries.map(entry => (
              <LeaderboardRow
                key={`${entry.rank}-${entry.username ?? entry.name}`}
                entry={entry}
              />
            ))
          )}
        </ScrollView>
      )}
      {router.canGoBack() ? null : (
        <View
          className="border-t border-cetus-hairline px-4 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Button
            variant="outline"
            accessibilityLabel="Back to leaderboard"
            accessibilityHint="Returns to the leaderboard tab"
            onPress={() => router.replace('/leaderboard')}
          >
            Back to leaderboard
          </Button>
        </View>
      )}
    </View>
  )
}
