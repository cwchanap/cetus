import { useEffect, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { Heading } from '@cetus/ui'
import {
  createBaseGameSession,
  createStableProjector,
  forwardBaseGameResults,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import type { GameID } from '@cetus/shared/games'
import type { ScorePlatform } from '@cetus/shared/validations'

import { api } from '../lib/api'
import { getNativeGameEntry, type NativeGameProjection } from './registry'
import { NativeGameChrome, type NativeRewardBanner } from './NativeGameChrome'

/** Stable null-session default for the pre-effect render. */
const IDLE_NATIVE_SNAPSHOT: GameSessionSnapshot<NativeGameProjection> = {
  status: 'idle',
  score: 0,
  timeRemaining: 0,
  projected: {},
  result: null,
}

/**
 * Generic native session host (HPA-425 Stage 1). Creates the registry
 * entry's concrete `@cetus/games` class with the cookie-backed score
 * transport and the OS platform label, adapts it through ONE
 * `createBaseGameSession` + `useGameSession`, and forwards committed
 * rewards to ONE banner. Unmount cleanup removes the forwarder, disposes
 * the session and destroys the game — in that order. The play route's
 * `key` (settled identity) remounts this host, dropping old-account
 * banners and game UI wholesale.
 */
export function NativeGameHost({ gameId }: { gameId: GameID }) {
  const entry = getNativeGameEntry(gameId)
  const port = entry?.port
  const [session, setSession] =
    useState<GameSession<NativeGameProjection> | null>(null)
  const [rewardBanner, setRewardBanner] = useState<NativeRewardBanner | null>(
    null
  )

  useEffect(() => {
    if (!port) {
      return
    }
    const game = port.createGame({
      submitScore: data => api.submitScore(data),
      platform: Platform.OS as ScorePlatform,
    })
    const nextSession = createBaseGameSession(
      game,
      createStableProjector(port.project)
    )
    setSession(nextSession)
    const removeForwarder = forwardBaseGameResults(game, {
      // One banner merges both deliveries of a single end payload.
      onAchievements: achievements =>
        setRewardBanner(current => ({ ...current, achievements })),
      onChallenges: challenges =>
        setRewardBanner(current => ({ ...current, challenges })),
    })
    return () => {
      // Order matters: no new rewards, then session listeners, then
      // the game (its timer and listeners) last.
      removeForwarder()
      nextSession.dispose()
      game.destroy()
    }
  }, [port])

  const { snapshot, actions, capabilities } = useGameSession(
    session,
    IDLE_NATIVE_SNAPSHOT
  )

  if (!port) {
    // Placeholder until this game's Stage 2/3 port lands — honest, no
    // session, no saves.
    return (
      <View className="flex-1 items-center justify-center gap-2.5 bg-cetus-canvas p-6">
        <Heading level={4} variant="section" align="center">
          Native board in progress
        </Heading>
        <Text className="text-center font-sans text-sm text-cetus-ink-muted">
          This game's native board lands later in this release wave.
        </Text>
      </View>
    )
  }

  const BoardView = port.view
  return (
    <View className="flex-1 bg-cetus-canvas">
      <NativeGameChrome
        snapshot={snapshot}
        actions={actions}
        capabilities={capabilities}
        rewardBanner={rewardBanner}
      />
      {session ? <BoardView projected={snapshot.projected} /> : null}
    </View>
  )
}
