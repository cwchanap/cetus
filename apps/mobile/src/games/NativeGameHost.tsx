import { useEffect, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
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

import { createScoreSubmitter } from '../lib/api'
import { getNativeGameEntry, type NativeGameProjection } from './registry'
import { NativeGameChrome, type NativeRewardBanner } from './NativeGameChrome'
import type { BaseGame, BaseGameState } from '@cetus/games'

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
 * entry's concrete `@cetus/games` class with a score transport pinned to
 * ONE identity-verified cookie snapshot (see `createScoreSubmitter`) and
 * the OS platform label, adapts it through ONE `createBaseGameSession` +
 * `useGameSession`, and forwards committed rewards to ONE banner. The
 * constructed instance is the per-instance binding: the projector and the
 * board view both receive it, so boards call model commands on the live
 * game while the projection stays a serializable snapshot. Unmount
 * cleanup removes the forwarder, disposes the session and destroys the
 * game — in that order. The play route's `key` (settled identity)
 * remounts this host, dropping old-account banners and game UI wholesale.
 */
export function NativeGameHost({
  gameId,
  settledUserId = null,
}: {
  gameId: GameID
  settledUserId?: string | null
}) {
  const router = useRouter()
  const entry = getNativeGameEntry(gameId)
  const port = entry?.port
  const [game, setGame] = useState<BaseGame | null>(null)
  const [session, setSession] =
    useState<GameSession<NativeGameProjection> | null>(null)
  const [rewardBanner, setRewardBanner] = useState<NativeRewardBanner | null>(
    null
  )

  useEffect(() => {
    if (!port) {
      return
    }
    let cancelled = false
    let teardown: (() => void) | null = null
    void (async () => {
      // ONE credential snapshot per mount, verified once at the real
      // cookie/header boundary against this host's settled identity;
      // every save reuses it verbatim (api.submitScore's live-cookie
      // read could otherwise attach a new account's cookie to an old
      // host mid-race). Guest and unverifiable bindings send nothing.
      const submitScore = await createScoreSubmitter(settledUserId)
      if (cancelled) {
        return
      }
      const createdGame = port.createGame({
        submitScore,
        platform: Platform.OS as ScorePlatform,
      })
      const nextSession = createBaseGameSession(
        createdGame,
        createStableProjector((state: BaseGameState) =>
          port.project(state, createdGame)
        )
      )
      setGame(createdGame)
      setSession(nextSession)
      // A bare 'start' is the model's own new-run boundary: clear the
      // previous run's already-delivered banner here so its rewards never
      // merge into a newer run's delivery, while a stale same-account save
      // that settles mid-run still delivers exactly once afterwards. The
      // clearing is idempotent (BaseGame emits 'start' once per timer
      // start plus once directly) and stays LOCAL to this host: the
      // shared forwarder keeps its end-only contract.
      const clearBannerOnRunStart = (): void => setRewardBanner(null)
      createdGame.on('start', clearBannerOnRunStart)
      const removeForwarder = forwardBaseGameResults(createdGame, {
        // One banner merges both deliveries of a single end payload.
        onAchievements: achievements =>
          setRewardBanner(current => ({ ...current, achievements })),
        onChallenges: challenges =>
          setRewardBanner(current => ({ ...current, challenges })),
      })
      teardown = () => {
        // Order matters: no new rewards, then session listeners, then
        // the game (its timer and listeners) last.
        createdGame.off('start', clearBannerOnRunStart)
        removeForwarder()
        nextSession.dispose()
        createdGame.destroy()
        // Dropping the state here keeps an unkeyed settled-identity swap
        // honest while the next binding is in flight: no destroyed game's
        // board, controls or banner can linger (production never hits this
        // path — the play route remounts the host by identity key). On a
        // real unmount these are plain no-ops; StrictMode's effect
        // re-run just re-creates the binding.
        setGame(null)
        setSession(null)
        setRewardBanner(null)
      }
    })()
    return () => {
      cancelled = true
      teardown?.()
    }
  }, [port, settledUserId])

  const { snapshot, actions, capabilities } = useGameSession(
    session,
    IDLE_NATIVE_SNAPSHOT
  )

  if (!port) {
    // Defensive: every production entry ships a port, but a portless entry
    // still fails honestly — no session, no saves, just the notice.
    return (
      <View className="flex-1 bg-cetus-canvas">
        <NativeBoardPending />
      </View>
    )
  }

  const BoardView = port.view
  const outcomeLabel =
    port.resultOutcomeLabel && snapshot.result
      ? port.resultOutcomeLabel(snapshot.result.stats)
      : null
  return (
    <View className="flex-1 bg-cetus-canvas">
      <NativeGameChrome
        snapshot={snapshot}
        actions={actions}
        capabilities={capabilities}
        rewardBanner={rewardBanner}
        outcomeLabel={outcomeLabel}
        onSignIn={() => router.push('/sign-in')}
        bindingPending={!session}
      />
      {session && game ? (
        BoardView ? (
          <BoardView projected={snapshot.projected} game={game} />
        ) : (
          <NativeBoardPending />
        )
      ) : null}
    </View>
  )
}

/**
 * Placeholder board area for ports whose Stage 2/3 view has not landed;
 * the session above it is fully live (start, save, rewards).
 */
function NativeBoardPending() {
  return (
    <View className="flex-1 items-center justify-center gap-2.5 p-6">
      <Heading level={4} variant="section" align="center">
        Native board in progress
      </Heading>
      <Text className="text-center font-sans text-sm text-cetus-ink-muted">
        This game's native board lands later in this release wave.
      </Text>
    </View>
  )
}
