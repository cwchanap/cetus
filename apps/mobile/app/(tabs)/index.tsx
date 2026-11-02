import { FlatList, StyleSheet, Text, View } from 'react-native'
import { GAMES } from '@cetus/shared/games'

// All registry games are listed honestly: none are playable on mobile yet
// (HPA-182/HPA-425 own the screens), so entries carry no tap handler at all.
const ACTIVE_GAMES = GAMES.filter(game => game.isActive)

function GameCard({ game }: { game: (typeof ACTIVE_GAMES)[number] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{game.name}</Text>
      <Text style={styles.meta}>
        {game.category} · {game.difficulty} difficulty
      </Text>
      <Text style={styles.badge}>Not playable on mobile yet</Text>
    </View>
  )
}

export default function GamesScreen() {
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={ACTIVE_GAMES}
      keyExtractor={game => game.id}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <GameCard game={item} />}
    />
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#05070f' },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#0b1020',
    borderColor: '#1b2440',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  name: { color: '#e8ecff', fontSize: 16, fontWeight: '600' },
  meta: { color: '#8b93b0', fontSize: 13 },
  badge: { color: '#7ee7ff', fontSize: 12, marginTop: 2 },
  separator: { height: 12 },
})
