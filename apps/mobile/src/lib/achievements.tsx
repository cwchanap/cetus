import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Badge, type BadgeVariant, Button, Card, cn, Heading } from '@cetus/ui'
import type { UserOverviewResponse } from '@cetus/shared/api-dto'
import {
  AchievementRarity,
  getAllAchievements,
  type Achievement,
} from '@cetus/shared/achievements'
import { getAllGames, getGameById, type GameID } from '@cetus/shared/games'

import { isNetworkError } from './refetch'

export type AchievementStatusFilter = 'all' | 'earned' | 'locked'
export type AchievementGameScope = 'all' | 'global' | GameID

export const ACHIEVEMENT_GAME_ALL = 'all'
export const ACHIEVEMENT_GAME_GLOBAL = 'global'

export interface AchievementView {
  achievement: Achievement
  earned: boolean
}

const RARITY_ORDER: Record<AchievementRarity, number> = {
  [AchievementRarity.COMMON]: 1,
  [AchievementRarity.RARE]: 2,
  [AchievementRarity.EPIC]: 3,
  [AchievementRarity.LEGENDARY]: 4,
}

export function compareAchievementViews(
  a: AchievementView,
  b: AchievementView
): number {
  if (a.earned !== b.earned) {
    return a.earned ? -1 : 1
  }
  const rarityDiff =
    (RARITY_ORDER[a.achievement.rarity] ?? 1) -
    (RARITY_ORDER[b.achievement.rarity] ?? 1)
  return rarityDiff !== 0
    ? rarityDiff
    : a.achievement.name.localeCompare(b.achievement.name)
}

export function achievementViewsFor(
  data: UserOverviewResponse | undefined
): AchievementView[] | null {
  if (!data) {
    return null
  }
  const earned = new Set(data.earnedAchievementIds)
  return getAllAchievements()
    .map(achievement => ({ achievement, earned: earned.has(achievement.id) }))
    .sort(compareAchievementViews)
}

export function filterAchievementViews(
  views: AchievementView[],
  status: AchievementStatusFilter,
  game: AchievementGameScope
): AchievementView[] {
  return views.filter(view => {
    if (status === 'earned' && !view.earned) {
      return false
    }
    if (status === 'locked' && view.earned) {
      return false
    }
    if (game === ACHIEVEMENT_GAME_ALL) {
      return true
    }
    if (game === ACHIEVEMENT_GAME_GLOBAL) {
      return view.achievement.gameId === 'global'
    }
    return view.achievement.gameId === game
  })
}

export function achievementGameOptions(): Array<{
  value: string
  label: string
}> {
  const withAchievements = new Set(
    getAllAchievements().map(achievement => achievement.gameId)
  )
  return [
    { value: ACHIEVEMENT_GAME_ALL, label: 'All games' },
    { value: ACHIEVEMENT_GAME_GLOBAL, label: 'Global' },
    ...getAllGames()
      .filter(game => withAchievements.has(game.id))
      .map(game => ({ value: game.id as string, label: game.name })),
  ]
}

export function rarityBadgeVariant(
  rarity: Achievement['rarity']
): BadgeVariant {
  switch (rarity) {
    case AchievementRarity.RARE:
      return 'success'
    case AchievementRarity.EPIC:
      return 'error'
    case AchievementRarity.LEGENDARY:
      return 'warning'
    default:
      return 'secondary'
  }
}

export function isMaskedAchievement(view: AchievementView): boolean {
  return Boolean(view.achievement.isHidden) && !view.earned
}

function gameLabel(gameId: Achievement['gameId']): string {
  if (gameId === 'global') {
    return 'Global'
  }
  return getGameById(gameId)?.name ?? gameId.replace(/_/g, ' ')
}

export function AchievementRow({ view }: { view: AchievementView }) {
  const { achievement, earned } = view
  const masked = isMaskedAchievement(view)
  const state = earned ? 'earned' : 'locked'
  const label = masked
    ? 'Hidden achievement, locked'
    : `${achievement.name}, ${achievement.rarity} achievement, ${state}`
  return (
    <Card
      variant="sci-fi"
      accessible
      accessibilityLabel={label}
      className={cn('gap-2 p-4', !earned && 'opacity-60')}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full border border-cetus-hairline bg-cetus-canvas">
          <Text className="text-xl">{masked ? '🔒' : achievement.logo}</Text>
        </View>
        <View className="flex-1 gap-1.5">
          <Text className="font-display text-base font-bold text-cetus-ink">
            {masked ? 'Hidden achievement' : achievement.name}
          </Text>
          {masked ? null : (
            <Text className="font-sans text-[13px] text-cetus-ink-muted">
              {achievement.description}
            </Text>
          )}
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Badge variant={earned ? 'success' : 'outline'} size="sm">
              {earned ? 'Earned' : 'Locked'}
            </Badge>
            {masked ? null : (
              <>
                <Badge
                  variant={rarityBadgeVariant(achievement.rarity)}
                  size="sm"
                >
                  {achievement.rarity}
                </Badge>
                {achievement.gameId === 'global' ? null : (
                  <Badge variant="secondary" size="sm">
                    {gameLabel(achievement.gameId)}
                  </Badge>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Card>
  )
}

export function AchievementsLoading() {
  return (
    <View
      testID="achievements-loading"
      className="flex-1 items-center justify-center gap-3 py-16"
    >
      <ActivityIndicator accessibilityLabel="Loading achievements" />
      <Text className="font-sans text-sm text-cetus-ink-muted">
        Loading achievements…
      </Text>
    </View>
  )
}

export function AchievementsError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const offline = isNetworkError(error)
  const title = offline
    ? "Couldn't reach the achievements service"
    : "Couldn't load achievements"
  const body = offline
    ? 'Check your connection and try again.'
    : 'Something went wrong. Try again.'
  return (
    <View
      testID="achievements-error"
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
        accessibilityLabel="Retry loading achievements"
        onPress={onRetry}
        className="mt-1"
      >
        Retry
      </Button>
    </View>
  )
}

export function AchievementsEmpty({
  status,
}: {
  status: AchievementStatusFilter
}) {
  const copy =
    status === 'earned'
      ? 'No earned achievements yet — play games to unlock them.'
      : 'No achievements match the current filters.'
  return (
    <View className="items-center gap-1 px-4 py-8">
      <Text
        testID="achievements-empty"
        className="font-sans text-center text-sm text-cetus-ink-muted"
      >
        {copy}
      </Text>
    </View>
  )
}

export function AchievementsSignIn({
  expired,
  onSignIn,
}: {
  expired?: boolean
  onSignIn: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Heading level={4} variant="section" align="center">
        Achievements
      </Heading>
      <Text className="font-sans text-center text-sm text-cetus-ink-muted">
        {expired
          ? 'Your session has expired. Sign in again to keep tracking your achievements.'
          : 'Sign in to track your achievements and unlock badges across all games.'}
      </Text>
      <Button
        variant="primary"
        accessibilityRole="button"
        accessibilityLabel="Sign in to view achievements"
        onPress={onSignIn}
        className="mt-2"
      >
        Sign in
      </Button>
    </View>
  )
}

export const STATUS_FILTERS: Array<{
  value: AchievementStatusFilter
  label: string
}> = [
  { value: 'all', label: 'All' },
  { value: 'earned', label: 'Earned' },
  { value: 'locked', label: 'Locked' },
]

export function StatusFilterChips({
  status,
  onChange,
}: {
  status: AchievementStatusFilter
  onChange: (next: AchievementStatusFilter) => void
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {STATUS_FILTERS.map(filter => {
        const active = status === filter.value
        return (
          <Pressable
            key={filter.value}
            accessibilityRole="button"
            accessibilityLabel={`Filter: ${filter.label}`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(filter.value)}
            className={cn(
              'rounded-full border px-3 py-1.5',
              active
                ? 'border-cetus-accent bg-cetus-accent/10'
                : 'border-cetus-hairline bg-cetus-surface'
            )}
          >
            <Text
              className={cn(
                'font-sans text-xs font-semibold',
                active ? 'text-cetus-accent' : 'text-cetus-ink-muted'
              )}
            >
              {filter.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
