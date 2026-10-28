import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import type {
  PatternPulseState,
  PatternPulseStats,
} from '@cetus/games/pattern-pulse/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { PatternPulseInitResult } from '@/lib/games/pattern-pulse/initFramework'

interface PatternPulseProjected {
  status: string
  sequenceLength: number
  completedRounds: number
  streak: number
  mistakes: number
}

type WindowWithPatternPulseGame = Window & {
  patternPulseGame?: PatternPulseInitResult
}

const INITIAL_TIME = 60

/** Idle status text — same mapping the initializer's syncHud used. */
function statusText(state: PatternPulseState): string {
  if (state.outcome === 'timeout') {
    return 'TIME'
  }
  if (state.outcome === 'mistakes') {
    return 'SIGNAL LOST'
  }
  if (state.phase === 'idle') {
    return 'READY'
  }
  if (state.phase === 'watch') {
    return 'WATCH'
  }
  if (state.phase === 'input') {
    return 'REPEAT'
  }
  if (state.feedback === 'correct') {
    return 'CORRECT'
  }
  if (state.feedback === 'wrong') {
    return 'WRONG — WATCH AGAIN'
  }
  return 'READY'
}

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_PATTERN_PULSE_SNAPSHOT: GameSessionSnapshot<PatternPulseProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: {
      status: 'READY',
      sequenceLength: 3,
      completedRounds: 0,
      streak: 0,
      mistakes: 0,
    },
    result: null,
  }

/**
 * Project the Pattern Pulse HUD fields with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 */
function createPatternPulseProjector() {
  let cached: PatternPulseProjected = IDLE_PATTERN_PULSE_SNAPSHOT.projected
  return (state: BaseGameState): PatternPulseProjected => {
    const patternPulseState = state as PatternPulseState
    const next = {
      status: statusText(patternPulseState),
      sequenceLength: patternPulseState.sequence.length,
      completedRounds: patternPulseState.completedRounds,
      streak: patternPulseState.streak,
      mistakes: patternPulseState.mistakes,
    }
    if (
      cached.status !== next.status ||
      cached.sequenceLength !== next.sequenceLength ||
      cached.completedRounds !== next.completedRounds ||
      cached.streak !== next.streak ||
      cached.mistakes !== next.mistakes
    ) {
      cached = next
    }
    return cached
  }
}

function getOutcomeLabel(outcome: PatternPulseStats['outcome']): string {
  switch (outcome) {
    case 'timeout':
      return 'Timeout'
    case 'mistakes':
      return 'Mistake Limit'
    default:
      return 'Game Over'
  }
}

function getOutcomeTitle(outcome: PatternPulseStats['outcome']): string {
  switch (outcome) {
    case 'timeout':
      return 'TIME UP!'
    case 'mistakes':
      return 'SIGNAL LOST!'
    default:
      return 'GAME OVER!'
  }
}

/**
 * Pattern Pulse route island (HPA-393 Stage 2). React owns the HUD, shared
 * buttons and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.patternPulseGame`. The static pads are island markup; the
 * renderer only toggles their data attributes (never React-managed props).
 * Teardown disposes the session, runs the initializer cleanup (pad/keyboard
 * listeners, unload warning, renderer) once and clears the debug handle
 * only if it still points at this instance.
 */
export default function PatternPulseScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<PatternPulseInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<PatternPulseProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_PATTERN_PULSE_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<PatternPulseProjected> | null = null
    let init: PatternPulseInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initPatternPulseGameFramework } =
        await import('@/lib/games/pattern-pulse/initFramework')
      if (disposed) {
        return
      }
      const result = await initPatternPulseGameFramework(container)
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
        createPatternPulseProjector()
      )
      ;(window as WindowWithPatternPulseGame).patternPulseGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithPatternPulseGame)
        .patternPulseGame
      if (debugHandle === init) {
        delete (window as WindowWithPatternPulseGame).patternPulseGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (legacy behavior).
  const startRun = () => {
    actions.start()
  }
  // Legacy reset/play-again restored the idle board; reset() emits no
  // game event, so refresh the cache explicitly after the restart.
  const resetRun = () => {
    initRef.current?.restart()
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as PatternPulseStats | undefined
  const overlayTitle = resultStats
    ? getOutcomeTitle(resultStats.outcome)
    : 'Game Over'

  return (
    <GameScreen
      gameId="pattern-pulse"
      title="Pattern Pulse"
      description="Watch the signal, then repeat the growing pattern before time runs out"
      icon="🔁"
      board={
        <div
          ref={boardRef}
          id="pattern-pulse-container"
          className="w-[min(520px,calc(100vw-2rem))]"
        >
          <div
            id="pattern-pulse-board"
            className="grid grid-cols-2 gap-3 aspect-square"
            role="group"
            aria-label="Pattern Pulse signal pads"
          >
            <button
              type="button"
              className="pattern-pulse-pad"
              data-pattern-pad="0"
              aria-label="Pad 1, triangle"
            >
              <span aria-hidden="true">▲</span>
              <span>1</span>
            </button>
            <button
              type="button"
              className="pattern-pulse-pad"
              data-pattern-pad="1"
              aria-label="Pad 2, circle"
            >
              <span aria-hidden="true">●</span>
              <span>2</span>
            </button>
            <button
              type="button"
              className="pattern-pulse-pad"
              data-pattern-pad="2"
              aria-label="Pad 3, diamond"
            >
              <span aria-hidden="true">◆</span>
              <span>3</span>
            </button>
            <button
              type="button"
              className="pattern-pulse-pad"
              data-pattern-pad="3"
              aria-label="Pad 4, star"
            >
              <span aria-hidden="true">✦</span>
              <span>4</span>
            </button>
          </div>
          <p id="pattern-status" aria-live="polite">
            {snapshot.projected.status}
          </p>
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
                Length:{' '}
                <span id="sequence-length">
                  {snapshot.projected.sequenceLength}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Rounds:{' '}
                <span id="completed-rounds">
                  {snapshot.projected.completedRounds}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Streak: <span id="streak">{snapshot.projected.streak}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Mistakes:{' '}
                <span id="mistakes">{snapshot.projected.mistakes}</span>
              </span>
            </Badge>
          </>
        ),
      }}
      controlsProps={{
        showPause: false,
        showEnd: false,
        running,
        onStart: startRun,
        onReset: resetRun,
      }}
      sidebarExtras={
        <>
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Watch the pads light up, then repeat the sequence.</p>
              <p>Click the pads or press keys 1–4 to answer.</p>
              <p>Each completed round adds one pad to the sequence.</p>
              <p>Three mistakes or running out of time ends the run.</p>
            </div>
          </Card>

          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Each completed pad is worth 100 points.</p>
              <p>Answer quickly for a speed bonus of up to 200 points.</p>
              <p>Consecutive rounds add a +50 streak bonus each.</p>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        defaultTitle: overlayTitle,
        onButtonClick: resetRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Outcome:{' '}
            <span id="final-outcome" className="text-cetus-accent">
              {resultStats ? getOutcomeLabel(resultStats.outcome) : '—'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Rounds Cleared:{' '}
            <span id="final-rounds" className="text-cetus-accent-2">
              {resultStats?.completedRounds ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Longest Sequence:{' '}
            <span id="final-longest-sequence" className="text-cetus-accent-3">
              {resultStats?.longestSequence ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Max Streak:{' '}
            <span id="final-max-streak" className="text-cetus-accent">
              {resultStats?.maxStreak ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Mistakes:{' '}
            <span id="final-mistakes" className="text-cetus-accent-2">
              {resultStats?.mistakes ?? 0}
            </span>
          </div>
        </>
      }
    />
  )
}
