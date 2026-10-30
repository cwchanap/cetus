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
  RHYTHM_REACTOR_RULES,
  type RhythmReactorState,
  type RhythmReactorStats,
} from '@cetus/games/rhythm-reactor/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { RhythmReactorInitResult } from '@/lib/games/rhythm-reactor/initFramework'

interface RhythmReactorProjected {
  combo: number
  hits: number
  judgment: string
  stability: number
}

type WindowWithRhythmReactorGame = Window & {
  rhythmReactorGame?: RhythmReactorInitResult
}

const INITIAL_TIME = RHYTHM_REACTOR_RULES.duration

// Static pre-hydration lane copy: every lane starts disabled; the
// initializer owns updates once hydrated.
const INITIAL_LANES = ['Lane 1 · D', 'Lane 2 · F', 'Lane 3 · J', 'Lane 4 · K']

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_RHYTHM_REACTOR_SNAPSHOT: GameSessionSnapshot<RhythmReactorProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: {
      combo: 0,
      hits: 0,
      judgment: 'READY',
      stability: RHYTHM_REACTOR_RULES.initialStability,
    },
    result: null,
  }

/**
 * Project the Rhythm Reactor HUD badges with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 * Same formulas as the legacy syncHud.
 */
function createRhythmReactorProjector() {
  let cached: RhythmReactorProjected = IDLE_RHYTHM_REACTOR_SNAPSHOT.projected
  return (state: BaseGameState): RhythmReactorProjected => {
    const rhythmState = state as RhythmReactorState
    const hits = rhythmState.perfectHits + rhythmState.goodHits
    const judgment = rhythmState.lastJudgment?.toUpperCase() ?? 'READY'
    if (
      cached.combo !== rhythmState.combo ||
      cached.hits !== hits ||
      cached.judgment !== judgment ||
      cached.stability !== rhythmState.stability
    ) {
      cached = {
        combo: rhythmState.combo,
        hits,
        judgment,
        stability: rhythmState.stability,
      }
    }
    return cached
  }
}

/**
 * Rhythm Reactor route island (HPA-393 Stage 2). React owns the HUD
 * badges, the start/reset control card with the bespoke lane-button
 * markup and the overlay via `useGameSession`; the effect imports the
 * browser initializer, mounts it on the board ref and publishes
 * `window.rhythmReactorGame`. The Pixi canvas, the D/F/J/K keyboard
 * input, the delegated lane-button clicks, the polite live announcer and
 * the single rAF loop stay initializer-owned (lane controls are bespoke,
 * not the shared chrome). Reset re-syncs those bespoke lane buttons
 * through the initializer's `restart()`. Teardown disposes the session,
 * runs the initializer cleanup once and clears the debug handle only if
 * it still points at this instance.
 */
export default function RhythmReactorScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<RhythmReactorInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<RhythmReactorProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_RHYTHM_REACTOR_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<RhythmReactorProjected> | null = null
    let init: RhythmReactorInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initRhythmReactorGameFramework } =
        await import('@/lib/games/rhythm-reactor/initFramework')
      if (disposed) {
        return
      }
      const result = await initRhythmReactorGameFramework(container)
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
        createRhythmReactorProjector()
      )
      ;(window as WindowWithRhythmReactorGame).rhythmReactorGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithRhythmReactorGame)
        .rhythmReactorGame
      if (debugHandle === init) {
        delete (window as WindowWithRhythmReactorGame).rhythmReactorGame
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
  // reset() emits no event, so the bespoke lane buttons (initializer-wired)
  // must be re-synced explicitly through the initializer's restart().
  const handleReset = () => {
    actions.reset()
    initRef.current?.restart()
  }

  const resultStats = snapshot.result?.stats as RhythmReactorStats | undefined

  return (
    <GameScreen
      gameId="rhythm-reactor"
      title="Rhythm Reactor"
      description="Hit each falling beat in time to keep the reactor stable."
      icon="🎵"
      board={
        <div
          ref={boardRef}
          id="rhythm-reactor-container"
          className="w-full max-w-[800px]"
        >
          {/* The PixiJS canvas box is reserved from the SSR byte by the
              route style block (#rhythm-reactor-canvas min-height) — the
              pre-hydration column flex leaves this div 0-width, so
              aspect-ratio cannot size it and the late canvas mount shifted
              the controls mid-test. */}
          <div
            id="rhythm-reactor-canvas"
            className="overflow-hidden rounded-lg bg-black/30"
          ></div>
          <p
            id="rhythm-reactor-status"
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
                Combo:{' '}
                <span id="rhythm-reactor-combo">
                  {snapshot.projected.combo}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Hits:{' '}
                <span id="rhythm-reactor-hits">{snapshot.projected.hits}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Judgment:{' '}
                <span id="rhythm-reactor-judgment">
                  {snapshot.projected.judgment}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Stability:{' '}
                <span id="rhythm-reactor-stability">
                  {snapshot.projected.stability}
                </span>
              </span>
            </Badge>
          </>
        ),
      }}
      controls={
        /* Legacy custom controls card: start/reset pair plus the bespoke
           initializer-wired rhythm lanes (#rhythm-reactor-controls). */
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
              id="rhythm-reactor-controls"
              role="group"
              aria-label="Rhythm lanes"
              className="grid w-full grid-cols-2 gap-2"
            >
              {INITIAL_LANES.map((laneLabel, index) => (
                <button
                  key={index}
                  type="button"
                  data-rhythm-lane={index}
                  className="rhythm-lane-button"
                  disabled
                >
                  {laneLabel}
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
              <p>Beats fall down four lanes toward the reactor line.</p>
              <p>Press D, F, J, or K when a beat reaches its lane.</p>
              <p>
                Tap a lane button on touch devices for the same timing window.
              </p>
              <p>Keep your combo alive and protect reactor stability.</p>
            </div>
          </Card>

          {/* Scoring */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Perfect hits score 100 points; Good hits score 60.</p>
              <p>Combo milestones increase the score multiplier.</p>
              <p>
                Missed notes and stray presses reduce stability and accuracy.
              </p>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        // The legacy route shipped a static overlay title; its end handler
        // never rewrote #game-over-title.
        defaultTitle: 'RHYTHM RUN COMPLETE',
        onButtonClick: startRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Hits:{' '}
            <span id="final-hits" className="text-cetus-accent">
              {resultStats?.hits ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Misses:{' '}
            <span id="final-misses" className="text-cetus-accent-2">
              {resultStats?.misses ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Stray presses:{' '}
            <span id="final-stray-presses" className="text-cetus-accent-3">
              {resultStats?.strayPresses ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Perfect:{' '}
            <span id="final-perfect" className="text-cetus-accent">
              {resultStats?.perfectHits ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Good:{' '}
            <span id="final-good" className="text-cetus-accent-2">
              {resultStats?.goodHits ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Max combo:{' '}
            <span id="final-max-combo" className="text-cetus-accent">
              {resultStats?.maxCombo ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Accuracy:{' '}
            <span id="final-accuracy" className="text-cetus-accent-2">
              {(resultStats?.accuracy ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Stability:{' '}
            <span id="final-stability" className="text-cetus-accent-3">
              {resultStats?.finalStability ??
                RHYTHM_REACTOR_RULES.initialStability}
            </span>
          </div>
        </>
      }
    />
  )
}
