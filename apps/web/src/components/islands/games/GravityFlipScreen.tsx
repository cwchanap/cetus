import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import { GRAVITY_FLIP_STAR_POINTS } from '@cetus/games/gravity-flip/scoring'
import type {
  GravityFlipOutcome,
  GravityFlipState,
  GravityFlipStats,
} from '@cetus/games/gravity-flip/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { GravityFlipInitResult } from '@/lib/games/gravity-flip/initFramework'

interface GravityFlipProjected {
  gravityLabel: string
  distance: number
  stars: number
  flips: number
  speed: string
}

type WindowWithGravityFlipGame = Window & {
  gravityFlipGame?: GravityFlipInitResult
}

const INITIAL_TIME = 60

/** Outcome headline inside the overlay title (legacy outcomeTitle). */
function outcomeTitle(outcome: GravityFlipOutcome): string {
  return outcome === 'survived' ? 'RUN COMPLETE' : 'GRAVITY LOST'
}

/** Outcome line in the final-stats slot (legacy outcomeLabel). */
function outcomeLabel(outcome: GravityFlipOutcome): string {
  return outcome === 'survived' ? 'Survived' : 'Collision'
}

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_GRAVITY_FLIP_SNAPSHOT: GameSessionSnapshot<GravityFlipProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: {
    gravityLabel: 'FLOOR ↓',
    distance: 0,
    stars: 0,
    flips: 0,
    speed: '—',
  },
  result: null,
}

/**
 * Project the Gravity Flip HUD badges with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 * Same formulas as the legacy syncHud.
 */
function createGravityFlipProjector() {
  let cached: GravityFlipProjected = IDLE_GRAVITY_FLIP_SNAPSHOT.projected
  return (state: BaseGameState): GravityFlipProjected => {
    const gravityState = state as GravityFlipState
    const gravityLabel =
      gravityState.gravity === 'down' ? 'FLOOR ↓' : 'CEILING ↑'
    const distance = Math.floor(gravityState.distance)
    const speed = String(Math.round(gravityState.worldSpeed))
    if (
      cached.gravityLabel !== gravityLabel ||
      cached.distance !== distance ||
      cached.stars !== gravityState.starsCollected ||
      cached.flips !== gravityState.flips ||
      cached.speed !== speed
    ) {
      cached = {
        gravityLabel,
        distance,
        stars: gravityState.starsCollected,
        flips: gravityState.flips,
        speed,
      }
    }
    return cached
  }
}

/**
 * Gravity Flip route island (HPA-393 Stage 2). React owns the HUD badges,
 * the start/reset control card with the bespoke #flip-btn markup and the
 * overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.gravityFlipGame`. The Pixi canvas, the Space/Arrow key flips,
 * the #flip-btn + canvas-pointerdown wiring and the single rAF loop stay
 * initializer-owned. Teardown disposes the session, runs the initializer
 * cleanup once and clears the debug handle only if it still points at
 * this instance.
 */
export default function GravityFlipScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<GravityFlipInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<GravityFlipProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_GRAVITY_FLIP_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<GravityFlipProjected> | null = null
    let init: GravityFlipInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initGravityFlipGameFramework } =
        await import('@/lib/games/gravity-flip/initFramework')
      if (disposed) {
        return
      }
      const result = await initGravityFlipGameFramework(container)
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
        createGravityFlipProjector()
      )
      ;(window as WindowWithGravityFlipGame).gravityFlipGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithGravityFlipGame).gravityFlipGame
      if (debugHandle === init) {
        delete (window as WindowWithGravityFlipGame).gravityFlipGame
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

  const resultStats = snapshot.result?.stats as GravityFlipStats | undefined

  return (
    <GameScreen
      gameId="gravity-flip"
      title="Gravity Flip"
      description="Flip gravity to dodge hazards and collect stars for 60 seconds."
      icon="🌗"
      board={
        <div
          ref={boardRef}
          id="gravity-flip-container"
          className="w-full max-w-[800px]"
        >
          <div
            id="gravity-flip-canvas"
            className="overflow-hidden rounded-lg bg-black/30"
          ></div>
          <p
            id="gravity-flip-status"
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
                Gravity:{' '}
                <span id="gravity-direction">
                  {snapshot.projected.gravityLabel}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Distance:{' '}
                <span id="distance-traveled">
                  {snapshot.projected.distance}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Stars:{' '}
                <span id="stars-collected">{snapshot.projected.stars}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Flips: <span id="flip-count">{snapshot.projected.flips}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Speed: <span id="world-speed">{snapshot.projected.speed}</span>
              </span>
            </Badge>
          </>
        ),
      }}
      controls={
        /* Legacy custom controls card: start/reset pair plus the bespoke
           initializer-wired gravity flip button. */
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
            <Button
              id="flip-btn"
              variant="primary"
              size="lg"
              aria-label="Flip gravity"
            >
              FLIP GRAVITY
            </Button>
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
                Auto-run through the corridor while gravity pulls toward a rail.
              </p>
              <p>Flip gravity to avoid spikes, gaps, and moving hazards.</p>
              <p>
                Collect stars for bonus points, then survive the full minute.
              </p>
            </div>
          </Card>

          {/* Scoring */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Distance earns points as the world scrolls.</p>
              <p>Each collected star adds {GRAVITY_FLIP_STAR_POINTS} points.</p>
              <p>A collision ends the run immediately.</p>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        defaultTitle: resultStats
          ? outcomeTitle(resultStats.outcome)
          : 'GRAVITY LOST',
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
            Distance:{' '}
            <span id="final-distance" className="text-cetus-accent-2">
              {resultStats?.distance ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Stars:{' '}
            <span id="final-stars" className="text-cetus-accent-3">
              {resultStats?.starsCollected ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Flips:{' '}
            <span id="final-flips" className="text-cetus-accent">
              {resultStats?.flips ?? 0}
            </span>
          </div>
        </>
      }
    />
  )
}
