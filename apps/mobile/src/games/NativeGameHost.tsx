import { memo, useEffect, useMemo, useState } from 'react'
import {
  AppState,
  Platform,
  Text,
  View,
  type AppStateStatus,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Button, Heading } from '@cetus/ui'
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
  const [setupError, setSetupError] = useState(false)
  const [setupAttempt, setSetupAttempt] = useState(0)

  useEffect(() => {
    if (!port) {
      return
    }
    let cancelled = false
    let teardown: (() => void) | null = null
    setSetupError(false)
    void (async () => {
      let createdGame: BaseGame | null = null
      let nextSession: GameSession<NativeGameProjection> | null = null
      let clearBannerOnRunStart: (() => void) | null = null
      let removeForwarder: (() => void) | null = null
      try {
        // ONE credential snapshot per mount, pinned against this host's
        // settled identity; guest and unverifiable bindings never send
        // another account's cookie.
        const submitScore = await createScoreSubmitter(settledUserId)
        if (cancelled) {
          return
        }
        createdGame = port.createGame({
          submitScore,
          platform: Platform.OS as ScorePlatform,
        })
        const builtGame = createdGame
        const projector = port.createProjector
          ? port.createProjector(builtGame)
          : createStableProjector((state: BaseGameState) =>
              port.project(state, builtGame)
            )
        nextSession = createBaseGameSession(builtGame, projector)
        const builtSession = nextSession
        // A bare 'start' is the model's own new-run boundary: clear the
        // previous run's already-delivered banner here so its rewards never
        // merge into a newer run's delivery, while a stale same-account save
        // that settles mid-run still delivers and merges with any awards
        // earned on the current run.
        clearBannerOnRunStart = (): void => setRewardBanner(null)
        builtGame.on('start', clearBannerOnRunStart)
        removeForwarder = forwardBaseGameResults(builtGame, {
          onAchievements: achievements =>
            setRewardBanner(current => {
              const existing = current?.achievements ?? []
              const seen = new Set(existing.map(a => a.id))
              const merged = [
                ...existing,
                ...achievements.filter(a => !seen.has(a.id)),
              ]
              return { ...current, achievements: merged }
            }),
          onChallenges: challenges =>
            setRewardBanner(current => {
              const existing = current?.challenges?.completedChallenges ?? []
              const seen = new Set(existing.map(c => c.id))
              const merged = [
                ...existing,
                ...challenges.completedChallenges.filter(c => !seen.has(c.id)),
              ]
              return {
                ...current,
                challenges: {
                  ...challenges,
                  completedChallenges: merged,
                },
              }
            }),
        })
        setGame(builtGame)
        setSession(builtSession)
        teardown = () => {
          // Order matters: no new rewards, then session listeners, then
          // the game (its timer and listeners) last.
          if (clearBannerOnRunStart) {
            builtGame.off('start', clearBannerOnRunStart)
          }
          removeForwarder?.()
          builtSession.dispose()
          builtGame.destroy()
          setGame(null)
          setSession(null)
          setRewardBanner(null)
        }
      } catch {
        if (clearBannerOnRunStart && createdGame) {
          createdGame.off('start', clearBannerOnRunStart)
        }
        removeForwarder?.()
        nextSession?.dispose()
        createdGame?.destroy()
        if (!cancelled) {
          setGame(null)
          setSession(null)
          setRewardBanner(null)
          setSetupError(true)
        }
      }
    })()
    return () => {
      cancelled = true
      teardown?.()
    }
  }, [port, settledUserId, setupAttempt])

  const { snapshot, actions, capabilities } = useGameSession(
    session,
    IDLE_NATIVE_SNAPSHOT
  )

  useEffect(() => {
    if (!session) {
      return
    }
    let previousState: AppStateStatus = 'active'
    const subscription = AppState.addEventListener('change', next => {
      const leavingActive = previousState === 'active' && next !== 'active'
      previousState = next
      if (leavingActive && session.capabilities.pausable) {
        session.actions.pause()
      }
    })
    return () => subscription.remove()
  }, [session])

  const BoardView = port?.view
  const MemoBoardView = useMemo(
    () => (BoardView ? memo(BoardView) : null),
    [BoardView]
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

  if (setupError) {
    return (
      <View
        testID="host-setup-error"
        className="flex-1 items-center justify-center gap-3 bg-cetus-canvas p-6"
      >
        <Heading level={4} variant="section" align="center">
          Unable to prepare game
        </Heading>
        <Text className="text-center font-sans text-sm text-cetus-ink-muted">
          Something went wrong while setting up this session.
        </Text>
        <Button
          variant="outline"
          accessibilityLabel="Try again"
          onPress={() => setSetupAttempt(attempt => attempt + 1)}
        >
          Try again
        </Button>
      </View>
    )
  }

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
        onSignIn={() =>
          router.push({
            pathname: '/sign-in',
            params: { returnTo: `/games/${gameId}/play` },
          })
        }
        bindingPending={!session}
      />
      {session && game ? (
        MemoBoardView ? (
          <MemoBoardView projected={snapshot.projected} game={game} />
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
