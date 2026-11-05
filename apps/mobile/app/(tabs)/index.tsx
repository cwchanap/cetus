import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { Badge, Card, cn } from '@cetus/ui'
import { getActiveGames, searchGames, type Game } from '@cetus/shared/games'

import { difficultyBadgeVariant } from '../../src/lib/game-catalog'
import { LoginRewardHost } from '../../src/lib/login-rewards'

declare const __DEV__: boolean

// All registry games are listed honestly: none are playable on mobile yet
// (HPA-182/HPA-425 own the screens); entries open the game detail page,
// which states that plainly.
const ACTIVE_GAMES = getActiveGames()
const ACTIVE_COUNT = ACTIVE_GAMES.length

type CategoryFilter = 'all' | Game['category']

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'action', label: 'Action' },
  { value: 'strategy', label: 'Strategy' },
]

function GameCard({ game, onOpen }: { game: Game; onOpen: () => void }) {
  return (
    // Dark non-abyssal theme: surfaces/ink/hairline come from the shared
    // --cetus-* tokens (see global.css); unsupported effects (wordmark
    // gradient, animations) are simply not used here.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={game.name}
      accessibilityHint="Opens game details"
      onPress={onOpen}
      className="active:opacity-80"
    >
      <Card variant="sci-fi" className="gap-1.5 p-4">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 font-display text-base font-bold text-cetus-ink">
            {game.name}
          </Text>
          <Badge variant={difficultyBadgeVariant(game.difficulty)} size="sm">
            {game.difficulty}
          </Badge>
        </View>
        <Text
          className="font-sans text-[13px] text-cetus-ink-muted"
          numberOfLines={2}
        >
          {game.description}
        </Text>
        <View className="flex-row items-center justify-between gap-2">
          <Text className="font-sans text-xs text-cetus-ink-muted">
            {game.category}
          </Text>
          <Text className="font-sans text-xs text-cetus-accent">
            Not playable on mobile yet
          </Text>
        </View>
      </Card>
    </Pressable>
  )
}

export default function GamesScreen() {
  const router = useRouter()
  const inkMuted = useNativeVariable('--cetus-ink-muted')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')

  const games = useMemo(() => {
    const trimmed = query.trim()
    const base = trimmed ? searchGames(trimmed) : ACTIVE_GAMES
    return category === 'all'
      ? base
      : base.filter(game => game.category === category)
  }, [query, category])

  const header = (
    <View className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Daily missions"
        accessibilityHint="Opens today's missions, XP and reset countdown"
        onPress={() => router.push('/challenges')}
        className="active:opacity-80"
      >
        <Card variant="sci-fi" className="flex-row items-center gap-3 p-4">
          <Text className="text-xl">🎯</Text>
          <View className="flex-1 gap-0.5">
            <Text className="font-display text-sm font-bold text-cetus-ink">
              Daily missions
            </Text>
            <Text className="font-sans text-xs text-cetus-ink-muted">
              Challenges and XP — reset daily at midnight UTC
            </Text>
          </View>
          <Text className="font-sans text-sm text-cetus-ink-muted">›</Text>
        </Card>
      </Pressable>
      {__DEV__ ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="UI gallery"
          accessibilityHint="Opens the dev-only native component gallery"
          onPress={() => router.push('/dev/ui-gallery')}
          className="active:opacity-80"
        >
          <Card variant="sci-fi" className="flex-row items-center gap-3 p-4">
            <Text className="text-xl">🧪</Text>
            <View className="flex-1 gap-0.5">
              <Text className="font-display text-sm font-bold text-cetus-ink">
                UI gallery
              </Text>
              <Text className="font-sans text-xs text-cetus-ink-muted">
                Dev-only component preview
              </Text>
            </View>
            <Text className="font-sans text-sm text-cetus-ink-muted">›</Text>
          </Card>
        </Pressable>
      ) : null}
      <TextInput
        accessibilityLabel="Search games"
        placeholder="Search games"
        placeholderTextColor={inkMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        className="rounded-xl border border-cetus-hairline bg-cetus-surface px-4 py-2.5 font-sans text-sm text-cetus-ink"
      />
      <View className="flex-row flex-wrap gap-2">
        {CATEGORY_FILTERS.map(filter => {
          const active = category === filter.value
          return (
            <Pressable
              key={filter.value}
              accessibilityRole="button"
              accessibilityLabel={`Filter: ${filter.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(filter.value)}
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
      <Text className="font-sans text-xs text-cetus-ink-muted">
        {games.length} of {ACTIVE_COUNT} games
      </Text>
    </View>
  )

  const empty = (
    <Text
      testID="games-empty"
      className="font-sans mt-6 text-center text-sm text-cetus-ink-muted"
    >
      No games match your search.
    </Text>
  )

  return (
    // initialNumToRender >= registry size keeps every game mounted from the
    // first render (no virtualized rows hiding catalog entries).
    <>
      <FlatList
        className="flex-1 bg-cetus-canvas"
        contentContainerClassName="gap-3 p-4 pb-8"
        data={games}
        initialNumToRender={ACTIVE_COUNT}
        keyExtractor={game => game.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <GameCard
            game={item}
            onOpen={() => router.push(`/games/${item.id}`)}
          />
        )}
      />
      <LoginRewardHost />
    </>
  )
}
