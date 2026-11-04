import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { useRemoteData } from '@cetus/app-core'
import type { LeaderboardResponse } from '@cetus/shared/api-dto'
import { getActiveGames } from '@cetus/shared/games'

import { api } from '../../src/lib/api'
import {
  ALL_GAMES_SCOPE,
  boardsFor,
  EmptyBoard,
  GameBoardHeader,
  LeaderboardError,
  LeaderboardLoading,
  LeaderboardRow,
  leaderboardQueryFor,
  ScopeChip,
  useRefetchOnFocus,
  type LeaderboardScope,
} from '../../src/lib/leaderboard'

const ACTIVE_GAMES = getActiveGames()

export default function LeaderboardScreen() {
  const router = useRouter()
  const accent = useNativeVariable('--cetus-accent')
  const [scope, setScope] = useState<LeaderboardScope>(ALL_GAMES_SCOPE)
  const { data, loading, error, refresh } = useRemoteData<LeaderboardResponse>(
    useCallback(
      (signal: AbortSignal) =>
        api.getLeaderboard(leaderboardQueryFor(scope), { signal }),
      [scope]
    ),
    ['leaderboard', scope]
  )
  useRefetchOnFocus(refresh)

  const boards = useMemo(
    () => boardsFor(scope, data, ACTIVE_GAMES),
    [scope, data]
  )
  const boardError =
    error ??
    (data !== undefined && boards === null
      ? new Error('Unexpected leaderboard response')
      : null)

  return (
    <View className="flex-1 bg-cetus-canvas">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0"
        contentContainerClassName="gap-2 px-4 py-3"
      >
        <ScopeChip
          label="All games"
          active={scope === ALL_GAMES_SCOPE}
          onPress={() => setScope(ALL_GAMES_SCOPE)}
        />
        {ACTIVE_GAMES.map(game => (
          <ScopeChip
            key={game.id}
            label={game.name}
            active={scope === game.id}
            onPress={() => setScope(game.id)}
          />
        ))}
      </ScrollView>
      {boards === null ? (
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
          {boards.map(board => (
            <View key={board.game.id}>
              <GameBoardHeader
                game={board.game}
                entryCount={board.entries.length}
                onOpen={() => router.push(`/leaderboard/${board.game.id}`)}
              />
              <View className="gap-2">
                {board.entries.length === 0 ? (
                  <EmptyBoard game={board.game} />
                ) : (
                  board.entries.map(entry => (
                    <LeaderboardRow
                      key={`${board.game.id}-${entry.rank}-${entry.username ?? entry.name}`}
                      entry={entry}
                    />
                  ))
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
