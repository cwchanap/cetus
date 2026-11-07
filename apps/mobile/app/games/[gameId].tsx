import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { Badge, Button, Card, Heading } from '@cetus/ui'
import { getGameById, type GameID } from '@cetus/shared/games'

import { difficultyBadgeVariant } from '../../src/lib/game-catalog'
import { isNativePlayable } from '../../src/games/registry'

export default function GameDetailScreen() {
  const router = useRouter()
  const { gameId } = useLocalSearchParams<{
    gameId?: string | string[]
  }>()
  const id = Array.isArray(gameId) ? gameId[0] : gameId
  const game = id ? getGameById(id as GameID) : undefined
  const nativePlayable = id ? isNativePlayable(id) : false

  if (!game) {
    return (
      <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
        <Stack.Screen options={{ title: 'Game not found' }} />
        <Heading level={4} variant="section" align="center">
          Game not found
        </Heading>
        <Text className="font-sans text-center text-sm text-cetus-ink-muted">
          No catalog entry matches "{id ?? 'unknown'}".
        </Text>
        <Button
          variant="outline"
          accessibilityLabel="Back to games"
          onPress={() => router.replace('/')}
          className="mt-2"
        >
          Back to games
        </Button>
      </View>
    )
  }

  return (
    <ScrollView
      className="flex-1 bg-cetus-canvas"
      contentContainerClassName="gap-4 p-5 pb-10"
    >
      <Stack.Screen options={{ title: game.name }} />
      <Heading level={3} variant="section" kicker="GAME FILE">
        {game.name}
      </Heading>
      <View className="flex-row flex-wrap gap-2">
        <Badge variant="outline">{game.category}</Badge>
        <Badge variant={difficultyBadgeVariant(game.difficulty)}>
          {game.difficulty}
        </Badge>
        {game.estimatedDuration ? (
          <Badge variant="secondary">{game.estimatedDuration}</Badge>
        ) : null}
      </View>
      <Card variant="sci-fi" className="gap-2 p-4">
        <Text className="font-sans text-sm text-cetus-ink">
          {game.description}
        </Text>
        <Text className="font-sans text-xs text-cetus-ink-muted">
          {game.maxPlayers === 1
            ? 'Single player'
            : `Up to ${game.maxPlayers} players`}
        </Text>
      </Card>
      {game.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {game.tags.map(tag => (
            <Badge key={tag} variant="secondary" size="sm">
              {tag}
            </Badge>
          ))}
        </View>
      ) : null}
      <View className="mt-2 gap-2">
        <Button
          variant="primary"
          size="lg"
          disabled={!nativePlayable}
          accessibilityLabel={`Play ${game.name}`}
          onPress={
            nativePlayable
              ? () => router.push(`/games/${game.id}/play`)
              : undefined
          }
        >
          Play
        </Button>
        <Text className="font-sans text-center text-xs text-cetus-ink-muted">
          {nativePlayable
            ? 'Opens the native play screen.'
            : 'Not playable on mobile yet — the native port is still in progress.'}
        </Text>
      </View>
      {router.canGoBack() ? null : (
        <Button
          variant="outline"
          accessibilityLabel="Back to games"
          accessibilityHint="Returns to the games catalog"
          onPress={() => router.replace('/')}
        >
          Back to games
        </Button>
      )}
    </ScrollView>
  )
}
