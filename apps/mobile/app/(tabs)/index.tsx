import { FlatList, Text, View } from 'react-native'
import { GAMES } from '@cetus/shared/games'

// All registry games are listed honestly: none are playable on mobile yet
// (HPA-182/HPA-425 own the screens), so entries carry no tap handler at all.
const ACTIVE_GAMES = GAMES.filter(game => game.isActive)

function GameCard({ game }: { game: (typeof ACTIVE_GAMES)[number] }) {
  return (
    // Dark non-abyssal theme: surfaces/ink/hairline come from the shared
    // --cetus-* tokens (see global.css); unsupported effects (wordmark
    // gradient, animations) are simply not used here.
    <View className="rounded-xl border border-cetus-hairline bg-cetus-surface gap-1.5 p-4">
      <Text className="font-display text-base font-bold text-cetus-ink">
        {game.name}
      </Text>
      <Text className="font-sans text-[13px] text-cetus-ink-muted">
        {game.category} · {game.difficulty} difficulty
      </Text>
      <Text className="font-sans text-xs text-cetus-accent">
        Not playable on mobile yet
      </Text>
    </View>
  )
}

export default function GamesScreen() {
  return (
    // initialNumToRender >= registry size keeps every game mounted from the
    // first render (no virtualized rows hiding catalog entries).
    <FlatList
      className="flex-1 bg-cetus-canvas"
      contentContainerClassName="gap-3 p-4 pb-8"
      data={ACTIVE_GAMES}
      initialNumToRender={ACTIVE_GAMES.length}
      keyExtractor={game => game.id}
      renderItem={({ item }) => <GameCard game={item} />}
    />
  )
}
