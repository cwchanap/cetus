import { memo, type ComponentType } from 'react'
import {
  createBaseGameSession,
  createHandleSession,
  createStableProjector,
  forwardBaseGameResults,
  type GameSession,
  type GameSessionResult,
} from '@cetus/app-core'
import type { BaseGameState } from '@cetus/games'

import { createHandleResult } from './handleResult'
import type {
  NativeGameHostDeps,
  NativeGamePort,
  NativeGameProjection,
  NativeHandlePort,
} from './registry'
import type { NativeRewardDelivery } from './rewards'

/** Props every runtime's board receives: the serializable projection plus
 *  the producer's stable binding (a BaseGame instance or a handle-game
 *  controller — never an assumed raw model). */
export interface NativeGameRuntimeViewProps {
  projected: NativeGameProjection
  binding: unknown
}

/**
 * The one normalized shape both native producers yield, so
 * `NativeGameHost` never branches on BaseGame vs handle games:
 * - `session` drives the single `useGameSession` + `NativeGameChrome`
 * - `binding` is handed to the board
 * - `outcomeLabel` maps a finished session result to a display label
 * - `onRewards`/`onRunStart` are the banner sinks the host wires once
 * - `dispose` tears down in producer-specific order.
 */
export interface NativeGameRuntime {
  session: GameSession<NativeGameProjection>
  binding: unknown
  view: ComponentType<NativeGameRuntimeViewProps> | null
  outcomeLabel?: (result: GameSessionResult) => string | null
  onRewards: (handler: (delivery: NativeRewardDelivery) => void) => () => void
  onRunStart: (handler: () => void) => () => void
  dispose: () => void
}

/**
 * BaseGame producer: constructs the port's concrete game, adapts it with
 * `createBaseGameSession`, and attaches exactly one
 * `forwardBaseGameResults` forwarder plus the model's own `start` boundary.
 * Teardown keeps the tested order — forwarder removed, session disposed,
 * game destroyed.
 */
export function createBaseGameRuntime(
  port: NativeGamePort,
  deps: NativeGameHostDeps
): NativeGameRuntime {
  const game = port.createGame(deps)
  // A projector (or the session's initial projection) can throw. Roll the
  // partially-built runtime back before rethrowing so the host's setup
  // error path never leaks a live game/timer.
  let session: GameSession<NativeGameProjection>
  try {
    const projector = port.createProjector
      ? port.createProjector(game)
      : createStableProjector((state: BaseGameState) =>
          port.project(state, game)
        )
    session = createBaseGameSession(game, projector)
  } catch (error) {
    game.destroy()
    throw error
  }
  const rewardHandlers = new Set<(delivery: NativeRewardDelivery) => void>()
  const runStartHandlers = new Set<() => void>()
  let disposed = false

  const emitRewards = (delivery: NativeRewardDelivery): void => {
    for (const handler of [...rewardHandlers]) {
      handler(delivery)
    }
  }
  const emitRunStart = (): void => {
    for (const handler of [...runStartHandlers]) {
      handler()
    }
  }

  const removeForwarder = forwardBaseGameResults(game, {
    onAchievements: achievements => emitRewards({ achievements }),
    onChallenges: challenges => emitRewards({ challenges }),
  })
  game.on('start', emitRunStart)

  const BaseView = port.view
  const RuntimeView = BaseView
    ? memo(function NativeBaseGameView({
        projected,
      }: NativeGameRuntimeViewProps) {
        return <BaseView projected={projected} game={game} />
      })
    : null

  const label = port.resultOutcomeLabel

  return {
    session,
    binding: game,
    view: RuntimeView,
    outcomeLabel: label
      ? (result: GameSessionResult) => label(result.stats)
      : undefined,
    onRewards: handler => {
      rewardHandlers.add(handler)
      return () => {
        rewardHandlers.delete(handler)
      }
    },
    onRunStart: handler => {
      runStartHandlers.add(handler)
      return () => {
        runStartHandlers.delete(handler)
      }
    },
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      game.off('start', emitRunStart)
      removeForwarder()
      session.dispose()
      game.destroy()
      rewardHandlers.clear()
      runStartHandlers.clear()
    },
  }
}

/**
 * Handle-game producer (Circuit Hacker, Satellite Sync, Ice Slide): builds
 * one `createHandleSession` plus the shared handle-result helper and the
 * port's per-host controller. The controller IS the board binding and owns
 * its model's timer/listeners; the host's zero-argument
 * `actions.start()`/Replay delegates to it. No BaseGame is faked, no
 * pause is fabricated (`pausable:false`), and no second score client is
 * created.
 */
export function createHandleGameRuntime(
  handlePort: NativeHandlePort,
  deps: NativeGameHostDeps
): NativeGameRuntime {
  const rewardHandlers = new Set<(delivery: NativeRewardDelivery) => void>()
  const runStartHandlers = new Set<() => void>()
  let disposed = false
  let binding: ReturnType<NativeHandlePort['createBinding']> | null = null

  const emitRewards = (delivery: NativeRewardDelivery): void => {
    for (const handler of [...rewardHandlers]) {
      handler(delivery)
    }
  }
  const emitRunStart = (): void => {
    for (const handler of [...runStartHandlers]) {
      handler()
    }
  }

  const { session, handlers } = createHandleSession<NativeGameProjection>({
    capabilities: { pausable: false, resettable: false },
    snapshot: handlePort.initialSnapshot,
    actions: {
      // Chrome Start/Replay are zero-argument: the controller resolves its
      // pre-run selection (difficulty/mode/retained seed) here.
      start: () => binding?.start(),
    },
  })

  const results = createHandleResult({
    gameId: handlePort.gameId,
    platform: deps.platform,
    submitScore: deps.submitScore,
    handlers,
    onRewards: emitRewards,
    onRunStart: emitRunStart,
    isDisposed: () => disposed,
  })

  binding = handlePort.createBinding({ ...deps, handlers, results })

  const PortView = handlePort.view
  const RuntimeView = memo(function NativeHandleGameView({
    projected,
    binding: boardBinding,
  }: NativeGameRuntimeViewProps) {
    return <PortView projected={projected} binding={boardBinding} />
  })

  const label = handlePort.resultOutcomeLabel

  return {
    session,
    binding,
    view: RuntimeView,
    outcomeLabel: label
      ? (result: GameSessionResult) => label(result)
      : undefined,
    onRewards: handler => {
      rewardHandlers.add(handler)
      return () => {
        rewardHandlers.delete(handler)
      }
    },
    onRunStart: handler => {
      runStartHandlers.add(handler)
      return () => {
        runStartHandlers.delete(handler)
      }
    },
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      rewardHandlers.clear()
      runStartHandlers.clear()
      session.dispose()
      const active = binding
      binding = null
      active?.cleanup()
    },
  }
}
