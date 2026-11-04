import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Button, cn } from '@cetus/ui'
import type { LeaderboardQuery } from '@cetus/api-client/api-client'
import type {
  AllGamesLeaderboardResponse,
  GameLeaderboardResponse,
  LeaderboardEntryResponse,
  LeaderboardResponse,
  ScopedLeaderboardResponse,
} from '@cetus/shared/api-dto'
import { getGameIcon, type Game, type GameID } from '@cetus/shared/games'

import {
  isNetworkError,
  isServiceUnavailable,
  useRefetchOnFocus,
} from './refetch'

export { isNetworkError, isServiceUnavailable, useRefetchOnFocus }

export const LEADERBOARD_OVERVIEW_LIMIT = 10
export const LEADERBOARD_BOARD_LIMIT = 25

export type LeaderboardScope = 'all' | GameID
export const ALL_GAMES_SCOPE = 'all'

export function leaderboardQueryFor(scope: LeaderboardScope): LeaderboardQuery {
  return scope === ALL_GAMES_SCOPE
    ? { limit: LEADERBOARD_OVERVIEW_LIMIT }
    : { gameId: scope, limit: LEADERBOARD_BOARD_LIMIT }
}

export function isAllGamesLeaderboard(
  data: LeaderboardResponse
): data is AllGamesLeaderboardResponse {
  return 'leaderboards' in data
}

export function isSingleBoard(
  data: LeaderboardResponse
): data is GameLeaderboardResponse | ScopedLeaderboardResponse {
  return 'leaderboard' in data
}

export interface LeaderboardBoardModel {
  game: Game
  entries: LeaderboardEntryResponse[]
}

export function boardsFor(
  scope: LeaderboardScope,
  data: LeaderboardResponse | undefined,
  games: Game[]
): LeaderboardBoardModel[] | null {
  if (!data) {
    return null
  }
  if (scope === ALL_GAMES_SCOPE) {
    if (!isAllGamesLeaderboard(data)) {
      return null
    }
    return games.map(game => ({
      game,
      entries: data.leaderboards[game.id] ?? [],
    }))
  }
  if (!isSingleBoard(data)) {
    return null
  }
  const game = games.find(candidate => candidate.id === scope)
  return game ? [{ game, entries: data.leaderboard }] : null
}

export function GameBoardHeader({
  game,
  entryCount,
  onOpen,
}: {
  game: Game
  entryCount: number
  onOpen?: () => void
}) {
  const count = `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`
  const rowClass = 'flex-row items-center justify-between gap-3 pb-1 pt-4'
  const inner = (
    <>
      <View className="flex-1 flex-row items-center gap-2">
        <Text className="text-lg">{getGameIcon(game.id)}</Text>
        <Text
          className="flex-1 font-display text-base font-bold text-cetus-ink"
          numberOfLines={1}
        >
          {game.name}
        </Text>
      </View>
      <Text className="font-sans text-xs text-cetus-ink-muted">
        {onOpen ? `${count} ›` : count}
      </Text>
    </>
  )
  if (!onOpen) {
    return <View className={rowClass}>{inner}</View>
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${game.name} leaderboard`}
      accessibilityHint="Opens the dedicated leaderboard page"
      onPress={onOpen}
      className={cn(rowClass, 'active:opacity-80')}
    >
      {inner}
    </Pressable>
  )
}

export function LeaderboardRow({ entry }: { entry: LeaderboardEntryResponse }) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-cetus-hairline bg-cetus-surface px-3 py-2.5">
      <View className="h-8 w-8 items-center justify-center rounded-full border border-cetus-hairline bg-cetus-canvas">
        <Text
          className={cn(
            'font-sans text-sm font-bold',
            entry.rank <= 3 ? 'text-cetus-accent' : 'text-cetus-ink-muted'
          )}
        >
          {entry.rank}
        </Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          className="font-sans text-sm font-semibold text-cetus-ink"
          numberOfLines={1}
        >
          {entry.name || 'Anonymous'}
        </Text>
        <Text
          className="font-sans text-xs text-cetus-ink-muted"
          numberOfLines={1}
        >
          {entry.username ? `@${entry.username} · ` : ''}
          {new Date(entry.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text className="font-sans text-base font-bold text-cetus-accent">
        {entry.score.toLocaleString()}
      </Text>
    </View>
  )
}

export function EmptyBoard({ game }: { game: Game }) {
  return (
    <View className="items-center gap-1 rounded-xl border border-cetus-hairline px-4 py-5">
      <Text className="font-sans text-sm text-cetus-ink-muted">
        No scores yet
      </Text>
      <Text className="font-sans text-center text-xs text-cetus-ink-muted">
        Be the first to play {game.name} and set a record.
      </Text>
    </View>
  )
}

export function LeaderboardLoading() {
  return (
    <View
      testID="leaderboard-loading"
      className="flex-1 items-center justify-center gap-3 py-16"
    >
      <ActivityIndicator accessibilityLabel="Loading leaderboard" />
      <Text className="font-sans text-sm text-cetus-ink-muted">
        Loading leaderboard…
      </Text>
    </View>
  )
}

export function LeaderboardError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const unavailable = isServiceUnavailable(error)
  const offline = isNetworkError(error)
  const title = unavailable
    ? 'Leaderboards temporarily unavailable'
    : offline
      ? "Couldn't reach the leaderboard"
      : "Couldn't load the leaderboard"
  const body = unavailable
    ? 'Rankings cannot read scores right now. Try again shortly.'
    : offline
      ? 'Check your connection and try again.'
      : 'Something went wrong. Try again.'
  return (
    <View
      testID={unavailable ? 'leaderboard-unavailable' : 'leaderboard-error'}
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
        accessibilityLabel="Retry loading the leaderboard"
        onPress={onRetry}
        className="mt-1"
      >
        Retry
      </Button>
    </View>
  )
}
