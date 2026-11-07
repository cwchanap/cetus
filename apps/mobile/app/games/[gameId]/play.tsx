import { useEffect, useState } from 'react'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { Button, Heading } from '@cetus/ui'
import { getGameById, type GameID } from '@cetus/shared/games'

import { NativeGameHost } from '../../../src/games/NativeGameHost'
import { getNativeGameEntry } from '../../../src/games/registry'
import { useSessionGuard } from '../../../src/lib/session'

/**
 * Native play route (HPA-425 wave 1). The Games hub and the detail Play
 * button only link here for registry entries; the route still guards
 * unknown and unported ids explicitly.
 *
 * Auth gating covers ONLY the first unresolved auth read: once the first
 * `useSession` read settles, a route-local latch stays true forever, so a
 * later revalidation (`isPending` flipping true again) never unmounts a
 * live host. The host `key` is the last SETTLED identity — a routine
 * renewal keeps the same `sessionKey` (and pending churn keeps the old
 * one), so the key — and with it the game instance, board and timer —
 * only changes when a genuinely new identity (guest ↔ account) settles.
 */
export default function GamePlayScreen() {
  const router = useRouter()
  const { gameId } = useLocalSearchParams<{
    gameId?: string | string[]
  }>()
  const id = Array.isArray(gameId) ? gameId[0] : gameId
  const game = id ? getGameById(id as GameID) : undefined
  const entry = id ? getNativeGameEntry(id) : undefined

  const { isPending, sessionKey } = useSessionGuard()

  const [resolvedOnce, setResolvedOnce] = useState(!isPending)
  const [settledKey, setSettledKey] = useState<string | null | undefined>(
    isPending ? undefined : sessionKey
  )
  useEffect(() => {
    if (isPending) {
      return
    }
    setResolvedOnce(true)
    // Same value ⇒ React bails out; only a real identity change moves
    // the key and remounts the host.
    setSettledKey(sessionKey)
  }, [isPending, sessionKey])

  const renderFallback = (title: string, message: string) => (
    <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
      <Stack.Screen options={{ title }} />
      <Heading level={4} variant="section" align="center">
        {title}
      </Heading>
      <Text className="text-center font-sans text-sm text-cetus-ink-muted">
        {message}
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

  if (!resolvedOnce) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-cetus-canvas p-6">
        <ActivityIndicator size="large" />
        <Text className="font-sans text-sm text-cetus-ink-muted">
          Resolving session…
        </Text>
      </View>
    )
  }

  if (!id || !game) {
    return renderFallback(
      'Game not found',
      `No catalog entry matches "${id ?? 'unknown'}".`
    )
  }

  if (!entry) {
    return renderFallback(
      'Not playable on mobile',
      'This game is not part of the native wave yet.'
    )
  }

  return (
    <View className="flex-1 bg-cetus-canvas">
      <Stack.Screen options={{ title: game.name }} />
      <NativeGameHost key={settledKey ?? 'guest'} gameId={game.id} />
    </View>
  )
}
