import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import {
  SIGNAL_SWITCH_SIGNALS,
  SIGNAL_SWITCH_RULES,
  type SignalSwitchState,
  type SignalSwitchStats,
} from '@cetus/games/signal-switch/types'
import {
  SIGNAL_SWITCH_BASE_PASS_POINTS,
  SIGNAL_SWITCH_COMBO_BONUS_CAP,
  SIGNAL_SWITCH_COMBO_STEP_POINTS,
} from '@cetus/games/signal-switch/scoring'
import { GameScreen } from '@/components/games/GameScreen'
import type { SignalSwitchInitResult } from '@/lib/games/signal-switch/initFramework'

interface SignalSwitchProjected {
  integrity: number
  combo: number
  safePasses: number
  lanes: string
  speed: number
}

type WindowWithSignalSwitchGame = Window & {
  signalSwitchGame?: SignalSwitchInitResult
}

const INITIAL_TIME = SIGNAL_SWITCH_RULES.duration
const TOTAL_LANES = SIGNAL_SWITCH_RULES.laneUnlockSeconds.length
const STARTING_LANES = SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
  unlockAt => unlockAt <= 0
).length
const COMBO_BONUS_MAX =
  SIGNAL_SWITCH_COMBO_BONUS_CAP * SIGNAL_SWITCH_COMBO_STEP_POINTS
// Static pre-hydration gate copy: every gate starts on the deterministic
// Cyan state; the initializer owns updates once hydrated.
const INITIAL_GATES = Array.from({ length: TOTAL_LANES }, (_, index) => {
  const { glyph, label } = SIGNAL_SWITCH_SIGNALS.cyan
  return `Lane ${index + 1}: ${glyph} ${label}`
})

/** Outcome headline inside the overlay title (legacy outcomeTitle). */
function outcomeTitle(outcome: SignalSwitchStats['outcome']): string {
  return outcome === 'survived' ? 'SHIFT COMPLETE' : 'SIGNAL LOST'
}

/** Outcome line in the final-stats slot (legacy outcomeLabel). */
function outcomeLabel(outcome: SignalSwitchStats['outcome']): string {
  return outcome === 'survived' ? 'Survived' : 'Systems failed'
}

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_SIGNAL_SWITCH_SNAPSHOT: GameSessionSnapshot<SignalSwitchProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: {
      integrity: SIGNAL_SWITCH_RULES.startingIntegrity,
      combo: 0,
      safePasses: 0,
      lanes: `${STARTING_LANES} / ${TOTAL_LANES}`,
      speed: SIGNAL_SWITCH_RULES.initialDroneSpeed,
    },
    result: null,
  }

/**
 * Project the Signal Switch HUD badges with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 * Same formulas as the legacy syncHud.
 */
function createSignalSwitchProjector() {
  let cached: SignalSwitchProjected = IDLE_SIGNAL_SWITCH_SNAPSHOT.projected
  return (state: BaseGameState): SignalSwitchProjected => {
    const signalState = state as SignalSwitchState
    const lanes = `${signalState.activeLaneCount} / ${TOTAL_LANES}`
    const speed = Math.round(signalState.droneSpeed)
    if (
      cached.integrity !== signalState.integrity ||
      cached.combo !== signalState.combo ||
      cached.safePasses !== signalState.safePasses ||
      cached.lanes !== lanes ||
      cached.speed !== speed
    ) {
      cached = {
        integrity: signalState.integrity,
        combo: signalState.combo,
        safePasses: signalState.safePasses,
        lanes,
        speed,
      }
    }
    return cached
  }
}

/**
 * Signal Switch route island (HPA-393 Stage 2). React owns the HUD badges,
 * the start/reset control card and the overlay via `useGameSession`; the
 * effect imports the browser initializer, mounts it on the board ref and
 * publishes `window.signalSwitchGame`. The Pixi canvas, the 1-4 keyboard
 * input, the delegated gate-button clicks, the polite live announcer and
 * the single rAF loop stay initializer-owned (gate controls are bespoke,
 * not the shared chrome). Reset re-syncs those bespoke gates through the
 * `state-change` the reset emits. Teardown disposes the session, runs the
 * initializer cleanup once and clears the debug handle only if it still
 * points at this instance.
 */
export default function SignalSwitchScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const [session, setSession] =
    useState<GameSession<SignalSwitchProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_SIGNAL_SWITCH_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<SignalSwitchProjected> | null = null
    let init: SignalSwitchInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initSignalSwitchGameFramework } =
        await import('@/lib/games/signal-switch/initFramework')
      if (disposed) {
        return
      }
      const result = await initSignalSwitchGameFramework(container)
      if (disposed) {
        result?.cleanup()
        return
      }
      if (!result) {
        return
      }
      init = result
      createdSession = createBaseGameSession(
        result.game,
        createSignalSwitchProjector()
      )
      ;(window as WindowWithSignalSwitchGame).signalSwitchGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      const debugHandle = (window as WindowWithSignalSwitchGame)
        .signalSwitchGame
      if (debugHandle === init) {
        delete (window as WindowWithSignalSwitchGame).signalSwitchGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (legacy behavior —
  // including the overlay Play Again, which legacy wired straight to
  // game.start() so the next run is active as soon as it is pressed).
  const startRun = () => {
    actions.start()
  }
  // One reset only: onGameReset emits state-change, so the initializer's
  // callback re-syncs the bespoke gate controls while the session adapter
  // refreshes to idle (the rAF loop repaints the canvas as usual).
  const handleReset = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as SignalSwitchStats | undefined

  return (
    <GameScreen
      gameId="signal-switch"
      title="Signal Switch"
      description="Switch each lane gate to match incoming drone signals before impact."
      icon="🚦"
      board={
        <div
          ref={boardRef}
          id="signal-switch-container"
          className="w-full max-w-[800px]"
        >
          <div
            id="signal-switch-canvas"
            className="overflow-hidden rounded-lg bg-black/30"
          ></div>
          <p
            id="signal-switch-status"
            className="sr-only"
            aria-live="polite"
          ></p>
        </div>
      }
      statsProps={{
        score: snapshot.score,
        time: snapshot.timeRemaining,
        initialTime: INITIAL_TIME,
        children: (
          <>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Integrity:{' '}
                <span id="signal-switch-integrity">
                  {snapshot.projected.integrity}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Combo:{' '}
                <span id="signal-switch-combo">{snapshot.projected.combo}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Safe passes:{' '}
                <span id="signal-switch-safe-passes">
                  {snapshot.projected.safePasses}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Lanes:{' '}
                <span id="signal-switch-lanes">{snapshot.projected.lanes}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Speed:{' '}
                <span id="signal-switch-speed">{snapshot.projected.speed}</span>
              </span>
            </Badge>
          </>
        ),
      }}
      controls={
        /* Legacy custom controls card: start/reset pair plus the bespoke
           initializer-wired lane gates (#gate-controls). */
        <Card variant="glass" className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                id="start-btn"
                variant="primary"
                style={running ? { display: 'none' } : undefined}
                onClick={startRun}
              >
                Start Game
              </Button>
              <Button id="reset-btn" variant="outline" onClick={handleReset}>
                Reset
              </Button>
            </div>
            <div
              id="gate-controls"
              role="group"
              aria-label="Lane gates"
              className="grid w-full grid-cols-2 gap-2"
            >
              {INITIAL_GATES.map((gateLabel, index) => (
                <button
                  key={index}
                  type="button"
                  data-signal-lane={index}
                  className="gate-button"
                  disabled
                >
                  {gateLabel}
                </button>
              ))}
            </div>
          </div>
        </Card>
      }
      sidebarExtras={
        <>
          {/* How To Play */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Drones speed down four lanes toward your gate line.</p>
              <p>Switch each lane's gate to match the incoming drone signal.</p>
              <p>Lanes come online as the shift progresses — stay sharp.</p>
              <p>
                Click a gate or press keys 1–4. Three crashes end the shift.
              </p>
            </div>
          </Card>

          {/* Scoring */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>
                Each safe pass earns {SIGNAL_SWITCH_BASE_PASS_POINTS} points.
              </p>
              <p>
                Each combo step adds {SIGNAL_SWITCH_COMBO_STEP_POINTS} more
                points, up to a +{COMBO_BONUS_MAX} bonus.
              </p>
              <p>A mismatched signal costs integrity; at zero, systems fail.</p>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        defaultTitle: resultStats
          ? outcomeTitle(resultStats.outcome)
          : 'SIGNAL LOST',
        onButtonClick: startRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Outcome:{' '}
            <span id="final-outcome" className="text-cetus-accent">
              {resultStats ? outcomeLabel(resultStats.outcome) : '—'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Safe passes:{' '}
            <span id="final-safe-passes" className="text-cetus-accent-2">
              {resultStats?.safePasses ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Crashes:{' '}
            <span id="final-crashes" className="text-cetus-accent-3">
              {resultStats?.crashes ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Max combo:{' '}
            <span id="final-max-combo" className="text-cetus-accent">
              {resultStats?.maxCombo ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Integrity remaining:{' '}
            <span id="final-integrity" className="text-cetus-accent-2">
              {resultStats?.integrityRemaining ??
                SIGNAL_SWITCH_RULES.startingIntegrity}
            </span>
          </div>
        </>
      }
    />
  )
}
