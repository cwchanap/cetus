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
  CHROMATIC_TIDE_RULES,
  type ChromaticTideColor,
  type ChromaticTideState,
  type ChromaticTideStats,
} from '@cetus/games/chromatic-tide/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { ChromaticTideInitResult } from '@/lib/games/chromatic-tide/initFramework'

interface ChromaticTideProjected {
  movesUsed: number
  capturedCells: number
}

type WindowWithChromaticTideGame = Window & {
  chromaticTideGame?: ChromaticTideInitResult
}

const INITIAL_TIME = 90

const TOTAL_CELLS = CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols

const TIDE_COLORS: Array<{ color: ChromaticTideColor; label: string }> = [
  { color: 'teal', label: '1 Teal' },
  { color: 'amber', label: '2 Amber' },
  { color: 'magenta', label: '3 Magenta' },
  { color: 'ice', label: '4 Ice' },
  { color: 'green', label: '5 Green' },
]

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_CHROMATIC_TIDE_SNAPSHOT: GameSessionSnapshot<ChromaticTideProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: { movesUsed: 0, capturedCells: 0 },
    result: null,
  }

/**
 * Project the Chromatic Tide HUD fields with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 */
function createChromaticTideProjector() {
  let cached: ChromaticTideProjected = IDLE_CHROMATIC_TIDE_SNAPSHOT.projected
  return (state: BaseGameState): ChromaticTideProjected => {
    const tideState = state as ChromaticTideState
    if (
      cached.movesUsed !== tideState.movesUsed ||
      cached.capturedCells !== tideState.capturedCells
    ) {
      cached = {
        movesUsed: tideState.movesUsed,
        capturedCells: tideState.capturedCells,
      }
    }
    return cached
  }
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function getOutcomeLabel(outcome: ChromaticTideStats['outcome']): string {
  switch (outcome) {
    case 'cleared':
      return 'Cleared'
    case 'timeout':
      return 'Timeout'
    case 'playing':
      return '—'
  }
}

function getOutcomeTitle(outcome: ChromaticTideStats['outcome']): string {
  switch (outcome) {
    case 'cleared':
      return 'TIDE COMPLETE!'
    case 'timeout':
      return 'TIME UP!'
    case 'playing':
      return 'GAME OVER!'
  }
}

/**
 * Chromatic Tide route island (HPA-393 Stage 2). React owns the HUD, shared
 * buttons and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.chromaticTideGame`. The five color buttons stay initializer-wired
 * bespoke controls (Mine Grid precedent): the island renders their exact
 * legacy markup and the initializer keeps managing `disabled`/`aria-pressed`
 * plus the `#chromatic-tide-status` live announcer and the 1–5 number-key
 * shortcuts. Teardown disposes the session, runs the initializer cleanup
 * (color/keyboard listeners, unload warning, renderer) once and clears the
 * debug handle only if it still points at this instance.
 */
export default function ChromaticTideScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const [session, setSession] =
    useState<GameSession<ChromaticTideProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_CHROMATIC_TIDE_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<ChromaticTideProjected> | null = null
    let init: ChromaticTideInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initChromaticTideGameFramework } =
        await import('@/lib/games/chromatic-tide/initFramework')
      if (disposed) {
        return
      }
      const result = await initChromaticTideGameFramework(container)
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
        createChromaticTideProjector()
      )
      ;(window as WindowWithChromaticTideGame).chromaticTideGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      const debugHandle = (window as WindowWithChromaticTideGame)
        .chromaticTideGame
      if (debugHandle === init) {
        delete (window as WindowWithChromaticTideGame).chromaticTideGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (legacy behavior).
  const startRun = () => {
    actions.start()
  }
  // One reset only: onGameReset emits state-change, so the initializer's
  // callback re-renders the fresh board while the session adapter refreshes
  // to idle off the same final state (a second reset would generate a
  // hidden replacement board).
  const resetRun = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as ChromaticTideStats | undefined
  const overlayTitle = resultStats
    ? getOutcomeTitle(resultStats.outcome)
    : 'Game Over'

  return (
    <GameScreen
      gameId="chromatic-tide"
      title="Chromatic Tide"
      description="Shift your territory color and flood the whole board before time runs out"
      icon="🌈"
      board={
        <div
          ref={boardRef}
          id="chromatic-tide-container"
          className="w-[min(560px,calc(100vw-2rem))] space-y-4"
        >
          <div
            id="chromatic-tide-board"
            className="grid w-full aspect-square gap-px sm:gap-1"
            aria-hidden="true"
          />
          <p
            id="chromatic-tide-status"
            className="sr-only"
            aria-live="polite"
          />
          <div
            id="chromatic-tide-colors"
            className="grid grid-cols-2 gap-2 sm:grid-cols-5"
            role="group"
            aria-label="Choose territory color"
          >
            {/* Wired by the initializer (bespoke custom control): it keeps
                `disabled`/`aria-pressed` in sync with the run state and
                territory color. */}
            {TIDE_COLORS.map(({ color, label }) => (
              <Button
                key={color}
                data-tide-color={color}
                type="button"
                aria-pressed="false"
                disabled
                className="chromatic-tide-color"
              >
                {label}
              </Button>
            ))}
          </div>
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
                Moves: <span id="moves">{snapshot.projected.movesUsed}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Captured:{' '}
                <span id="captured">
                  {snapshot.projected.capturedCells} / {TOTAL_CELLS}
                </span>
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
            <h3 className="mb-4 font-mono text-sm tracking-wide text-cetus-accent">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Your territory begins in the top-left corner.</p>
              <p>Choose a new color to absorb matching cells along its edge.</p>
              <p>Flood all 144 cells before the 90-second tide expires.</p>
              <p>Use the color buttons or number keys 1–5.</p>
            </div>
          </Card>

          <Card variant="glass" className="p-6">
            <h3 className="mb-4 font-mono text-sm tracking-wide text-cetus-accent">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Earn points for every new cell captured.</p>
              <p>Clear efficiently for a move bonus.</p>
              <p>Remaining time adds to a completed board's score.</p>
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
            Moves:{' '}
            <span id="final-moves" className="text-cetus-accent-2">
              {resultStats?.movesUsed ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Captured:{' '}
            <span id="final-captured" className="text-cetus-accent-3">
              {resultStats
                ? `${resultStats.capturedCells} / ${TOTAL_CELLS}`
                : `0 / ${TOTAL_CELLS}`}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Time:{' '}
            <span id="final-time" className="text-cetus-accent">
              {resultStats ? formatTime(resultStats.timeElapsed) : '00:00'}
            </span>
          </div>
        </>
      }
    />
  )
}
