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
  ASTEROID_DRIFT_RULES,
  type AsteroidDriftOutcome,
  type AsteroidDriftState,
  type AsteroidDriftStats,
} from '@cetus/games/asteroid-drift/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { AsteroidDriftInitResult } from '@/lib/games/asteroid-drift/initFramework'

interface AsteroidDriftProjected {
  orbs: number
  speed: number
}

type WindowWithAsteroidDriftGame = Window & {
  asteroidDriftGame?: AsteroidDriftInitResult
}

const INITIAL_TIME = ASTEROID_DRIFT_RULES.duration

/** Outcome headline inside the overlay title (legacy outcomeTitle). */
function outcomeTitle(outcome: AsteroidDriftOutcome): string {
  if (outcome === 'survived') {
    return 'DRIFT COMPLETE'
  }
  if (outcome === 'expired') {
    return 'DRIFT ENDED'
  }
  return 'SHIP LOST'
}

/** Outcome line in the final-stats slot (legacy outcomeLabel). */
function outcomeLabel(outcome: AsteroidDriftOutcome): string {
  if (outcome === 'survived') {
    return 'Survived'
  }
  if (outcome === 'expired') {
    return 'Expired'
  }
  return 'Collision'
}

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_ASTEROID_DRIFT_SNAPSHOT: GameSessionSnapshot<AsteroidDriftProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: { orbs: 0, speed: 0 },
    result: null,
  }

/**
 * Project the Asteroid Drift HUD badges with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 * Same formulas as the legacy syncHud.
 */
function createAsteroidDriftProjector() {
  let cached: AsteroidDriftProjected = IDLE_ASTEROID_DRIFT_SNAPSHOT.projected
  return (state: BaseGameState): AsteroidDriftProjected => {
    const driftState = state as AsteroidDriftState
    const speed = Math.round(
      Math.hypot(driftState.player.velocityX, driftState.player.velocityY)
    )
    if (cached.orbs !== driftState.orbsCollected || cached.speed !== speed) {
      cached = { orbs: driftState.orbsCollected, speed }
    }
    return cached
  }
}

/**
 * Asteroid Drift route island (HPA-393 Stage 2). React owns the HUD
 * badges, the start/reset control card with the touch D-pad markup and
 * the overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.asteroidDriftGame`. The Pixi canvas, the arrows/WASD handlers,
 * the D-pad pointer listeners, the blur release and the single rAF loop
 * stay initializer-owned. Teardown disposes the session, runs the
 * initializer cleanup once and clears the debug handle only if it still
 * points at this instance.
 */
export default function AsteroidDriftScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<AsteroidDriftInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<AsteroidDriftProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_ASTEROID_DRIFT_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<AsteroidDriftProjected> | null = null
    let init: AsteroidDriftInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initAsteroidDriftGameFramework } =
        await import('@/lib/games/asteroid-drift/initFramework')
      if (disposed) {
        return
      }
      const result = await initAsteroidDriftGameFramework(container)
      if (disposed) {
        result?.cleanup()
        return
      }
      if (!result) {
        return
      }
      init = result
      initRef.current = result
      createdSession = createBaseGameSession(
        result.game,
        createAsteroidDriftProjector()
      )
      ;(window as WindowWithAsteroidDriftGame).asteroidDriftGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithAsteroidDriftGame)
        .asteroidDriftGame
      if (debugHandle === init) {
        delete (window as WindowWithAsteroidDriftGame).asteroidDriftGame
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
  const handleReset = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as AsteroidDriftStats | undefined

  return (
    <GameScreen
      gameId="asteroid-drift"
      title="Asteroid Drift"
      description="Thrust a momentum-bound ship through 90 seconds of rising asteroid traffic and grab energy orbs for bonus score."
      icon="☄️"
      board={
        <div
          ref={boardRef}
          id="asteroid-drift-container"
          className="w-full max-w-[800px]"
        >
          <div
            id="asteroid-drift-canvas"
            className="overflow-hidden rounded-lg bg-black/30"
          ></div>
          <p
            id="asteroid-drift-status"
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
                Orbs: <span id="orbs-collected">{snapshot.projected.orbs}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Speed: <span id="ship-speed">{snapshot.projected.speed}</span>
              </span>
            </Badge>
          </>
        ),
      }}
      controls={
        /* Legacy custom controls card: start/reset pair plus the touch
           D-pad (initializer-wired pointer handlers). */
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
              id="asteroid-drift-dpad"
              className="grid grid-cols-3 gap-2 select-none"
              style={{
                gridTemplateAreas: "'. up .' 'left . right' '. down .'",
              }}
            >
              <button
                type="button"
                data-direction="up"
                aria-label="Thrust up"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'up' }}
              >
                ↑
              </button>
              <button
                type="button"
                data-direction="left"
                aria-label="Thrust left"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'left' }}
              >
                ←
              </button>
              <button
                type="button"
                data-direction="right"
                aria-label="Thrust right"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'right' }}
              >
                →
              </button>
              <button
                type="button"
                data-direction="down"
                aria-label="Thrust down"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'down' }}
              >
                ↓
              </button>
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
              <p>
                Hold arrows or WASD to thrust — the ship drifts with momentum.
              </p>
              <p>Asteroids pour in from every edge as the run ramps up.</p>
              <p>Grab energy orbs before they fade for bonus score.</p>
              <p>
                Survive the full {ASTEROID_DRIFT_RULES.duration} seconds to win.
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
                Survival earns {ASTEROID_DRIFT_RULES.survivalPointsPerSecond}{' '}
                points per second.
              </p>
              <p>
                Each energy orb adds {ASTEROID_DRIFT_RULES.orbPoints} points.
              </p>
              <p>An asteroid collision ends the run immediately.</p>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        defaultTitle: resultStats
          ? outcomeTitle(resultStats.outcome)
          : 'SHIP LOST',
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
            Survival:{' '}
            <span id="final-survival" className="text-cetus-accent-2">
              {resultStats?.survivalSeconds ?? 0}
            </span>
            s
          </div>
          <div className="text-lg text-cetus-ink">
            Orbs:{' '}
            <span id="final-orbs" className="text-cetus-accent-3">
              {resultStats?.orbsCollected ?? 0}
            </span>
          </div>
        </>
      }
    />
  )
}
