import { useEffect, useState } from 'react'
import {
  AppState,
  Platform,
  Text,
  View,
  type AppStateStatus,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Button, Heading } from '@cetus/ui'
import { useGameSession, type GameSessionSnapshot } from '@cetus/app-core'
import type { GameID } from '@cetus/shared/games'
import type { ScorePlatform } from '@cetus/shared/validations'

import { createScoreSubmitter } from '../lib/api'
import { getNativeGameEntry, type NativeGameProjection } from './registry'
import { NativeGameChrome } from './NativeGameChrome'
import { mergeRewardBanner, type NativeRewardBanner } from './rewards'
import {
  createBaseGameRuntime,
  createHandleGameRuntime,
  type NativeGameRuntime,
} from './runtime'

/** Stable null-session default for the pre-effect render. */
const IDLE_NATIVE_SNAPSHOT: GameSessionSnapshot<NativeGameProjection> = {
  status: 'idle',
  score: 0,
  timeRemaining: 0,
  projected: {},
  result: null,
}

/**
 * Generic native session host (HPA-425 Stage 1, normalized for HPA-535).
 * Creates the entry's runtime ONCE with a score transport pinned to one
 * identity-verified cookie snapshot (see `createScoreSubmitter`) and the OS
 * platform label. The producer decides whether that runtime wraps a
 * BaseGame (`port`) or a handle-game controller (`handlePort`); this host
 * consumes the common `{ session, binding, view, outcomeLabel, onRewards,
 * onRunStart, dispose }` and keeps ONE `useGameSession` + ONE
 * `NativeGameChrome` with no per-variant branches. Rewards merge through
 * one reducer, a bare model start clears the previous run's banner, and
 * unmount disposes the producer (BaseGame order: forwarder removed →
 * session disposed → model destroyed). The play route's `key` (settled
 * identity) remounts this host, dropping old-account banners and game UI
 * wholesale.
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
  const handlePort = entry?.handlePort
  const [runtime, setRuntime] = useState<NativeGameRuntime | null>(null)
  const [rewardBanner, setRewardBanner] = useState<NativeRewardBanner | null>(
    null
  )
  const [setupError, setSetupError] = useState(false)
  const [setupAttempt, setSetupAttempt] = useState(0)

  useEffect(() => {
    if (!port && !handlePort) {
      return
    }
    let cancelled = false
    let teardown: (() => void) | null = null
    setSetupError(false)
    void (async () => {
      let created: NativeGameRuntime | null = null
      try {
        // ONE credential snapshot per mount, pinned against this host's
        // settled identity; guest and unverifiable bindings never send
        // another account's cookie.
        const submitScore = await createScoreSubmitter(settledUserId)
        if (cancelled) {
          return
        }
        const deps = {
          submitScore,
          platform: Platform.OS as ScorePlatform,
        }
        created = port
          ? createBaseGameRuntime(port, deps)
          : createHandleGameRuntime(
              handlePort as NonNullable<typeof handlePort>,
              deps
            )
        // A bare model start is the new-run boundary: clear the previous
        // run's already-delivered banner so its rewards never merge into a
        // newer run's delivery, while a stale same-account save that
        // settles mid-run still delivers and merges with current awards.
        created.onRunStart(() => setRewardBanner(null))
        created.onRewards(delivery =>
          setRewardBanner(current => mergeRewardBanner(current, delivery))
        )
        if (cancelled) {
          created.dispose()
          return
        }
        setRuntime(created)
        teardown = () => {
          created?.dispose()
          setRuntime(null)
          setRewardBanner(null)
        }
      } catch {
        created?.dispose()
        if (!cancelled) {
          setRuntime(null)
          setRewardBanner(null)
          setSetupError(true)
        }
      }
    })()
    return () => {
      cancelled = true
      teardown?.()
    }
  }, [port, handlePort, settledUserId, setupAttempt])

  const { snapshot, actions, capabilities } = useGameSession(
    runtime?.session ?? null,
    IDLE_NATIVE_SNAPSHOT
  )

  const session = runtime?.session ?? null
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

  if (!port && !handlePort) {
    // Defensive: every production entry ships a runtime source, but a
    // portless entry still fails honestly — no session, no saves.
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

  const BoardView = runtime?.view ?? null
  const outcomeLabel =
    runtime?.outcomeLabel && snapshot.result
      ? runtime.outcomeLabel(snapshot.result)
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
        bindingPending={!runtime}
      />
      {runtime ? (
        BoardView ? (
          <BoardView projected={snapshot.projected} binding={runtime.binding} />
        ) : (
          <NativeBoardPending />
        )
      ) : null}
    </View>
  )
}

/**
 * Placeholder board area for ports whose native view has not landed; the
 * session above it is fully live (start, save, rewards).
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
