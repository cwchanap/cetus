import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import { POTION_SORTER_PRESETS } from '@cetus/games/potion-sorter/levels'
import {
  POTION_TUBE_CAPACITY,
  type PotionSorterDifficulty,
  type PotionSorterState,
  type PotionSorterStats,
} from '@cetus/games/potion-sorter/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { PotionSorterInitResult } from '@/lib/games/potion-sorter/initFramework'

interface PotionSorterProjected {
  difficulty: PotionSorterDifficulty
  movesMade: number
  undosUsed: number
}

type WindowWithPotionSorterGame = Window & {
  potionSorterGame?: PotionSorterInitResult
}

const INITIAL_TIME = 300

// Static tube skeleton: PotionSorterRenderer updates these in place
// (visibility, layers, state attributes) and never recreates them.
const MAX_TUBES = Math.max(
  ...Object.values(POTION_SORTER_PRESETS).map(
    preset => preset.initialTubes.length
  )
)

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_POTION_SORTER_SNAPSHOT: GameSessionSnapshot<PotionSorterProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: { difficulty: 'medium', movesMade: 0, undosUsed: 0 },
    result: null,
  }

/**
 * Project the Potion Sorter HUD fields with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 */
function createPotionSorterProjector() {
  let cached: PotionSorterProjected = IDLE_POTION_SORTER_SNAPSHOT.projected
  return (state: BaseGameState): PotionSorterProjected => {
    const potionSorterState = state as PotionSorterState
    if (
      cached.difficulty !== potionSorterState.difficulty ||
      cached.movesMade !== potionSorterState.movesMade ||
      cached.undosUsed !== potionSorterState.undosUsed
    ) {
      cached = {
        difficulty: potionSorterState.difficulty,
        movesMade: potionSorterState.movesMade,
        undosUsed: potionSorterState.undosUsed,
      }
    }
    return cached
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function getOutcomeLabel(result: PotionSorterStats['result']): string {
  switch (result) {
    case 'solved':
      return 'Solved'
    case 'timeout':
      return 'Timeout'
    default:
      return 'Game Over'
  }
}

function getOutcomeTitle(result: PotionSorterStats['result']): string {
  switch (result) {
    case 'solved':
      return 'SOLVED!'
    case 'timeout':
      return 'TIME UP!'
    default:
      return 'GAME OVER!'
  }
}

/**
 * Potion Sorter route island (HPA-393 Stage 2). React owns the HUD, shared
 * buttons and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.potionSorterGame`. The difficulty/preset buttons and the Undo
 * button (with its dead-end emphasis) stay initializer-wired bespoke
 * controls (Mine Grid precedent): the island renders their exact legacy
 * markup and the initializer keeps managing `aria-pressed`, `disabled` and
 * `data-dead-end`, plus the `#potion-sorter-status` action announcer.
 * Teardown disposes the session, runs the initializer cleanup (tube
 * listeners, selectors, unload warning, renderer) once and clears the
 * debug handle only if it still points at this instance.
 */
export default function PotionSorterScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<PotionSorterInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<PotionSorterProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_POTION_SORTER_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<PotionSorterProjected> | null = null
    let init: PotionSorterInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initPotionSorterGameFramework } =
        await import('@/lib/games/potion-sorter/initFramework')
      if (disposed) {
        return
      }
      const result = await initPotionSorterGameFramework(container)
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
        createPotionSorterProjector()
      )
      ;(window as WindowWithPotionSorterGame).potionSorterGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithPotionSorterGame)
        .potionSorterGame
      if (debugHandle === init) {
        delete (window as WindowWithPotionSorterGame).potionSorterGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (legacy behavior).
  const startRun = () => {
    actions.start()
  }
  // Legacy reset/play-also restored the idle board; reset() emits no game
  // event, so refresh the cache explicitly after the restart.
  const resetRun = () => {
    initRef.current?.restart()
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as PotionSorterStats | undefined
  const overlayTitle = resultStats
    ? getOutcomeTitle(resultStats.result)
    : 'Game Over'

  return (
    <GameScreen
      gameId="potion-sorter"
      title="Potion Sorter"
      description="Sort layered lab potions into matching tubes before time runs out"
      icon="🧪"
      board={
        <div ref={boardRef} id="potion-sorter-container" className="w-full">
          <div
            id="potion-sorter-board"
            className="potion-sorter-board"
            aria-label="Potion tubes"
          >
            {Array.from({ length: MAX_TUBES }, (_, index) => (
              <button
                type="button"
                className="potion-tube"
                data-tube-index={index}
                hidden
                key={index}
              >
                {Array.from({ length: POTION_TUBE_CAPACITY }, (_, layer) => (
                  <span
                    className="potion-layer"
                    aria-hidden="true"
                    key={layer}
                  />
                ))}
              </button>
            ))}
          </div>
          <p id="potion-sorter-status" className="sr-only" aria-live="polite" />
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
                Difficulty:{' '}
                <span id="difficulty">
                  {capitalize(snapshot.projected.difficulty)}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Moves: <span id="moves">{snapshot.projected.movesMade}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Undos: <span id="undos">{snapshot.projected.undosUsed}</span>
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
              ▸ DIFFICULTY
            </h3>
            {/* Wired by the initializer (bespoke custom control): clicking
                swaps the idle preset through game.newGame; disabled while a
                run is active. */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                id="easy-btn"
                variant="outline"
                size="sm"
                aria-pressed="false"
                className="potion-sorter-difficulty hover-glow-cyan"
              >
                Easy
              </Button>
              <Button
                id="medium-btn"
                variant="outline"
                size="sm"
                aria-pressed="true"
                className="potion-sorter-difficulty hover-glow-cyan"
              >
                Medium
              </Button>
              <Button
                id="hard-btn"
                variant="outline"
                size="sm"
                aria-pressed="false"
                className="potion-sorter-difficulty hover-glow-cyan"
              >
                Hard
              </Button>
            </div>
            <div className="mt-2">
              {/* Wired by the initializer (bespoke custom control): it keeps
                  `disabled`/`data-dead-end` in sync with undo history and
                  dead-end detection. */}
              <Button
                id="undo-btn"
                type="button"
                variant="outline"
                size="sm"
                disabled
                data-dead-end="false"
              >
                Undo
              </Button>
            </div>
            <p className="mt-3 text-xs text-cetus-ink-muted">
              Undo reverses your last pour. When no legal pour remains, Undo is
              highlighted — use it to back out of a dead end.
            </p>
          </Card>

          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>
                Select a tube, then select a second tube to pour its top liquid.
              </p>
              <p>Pour only onto an empty tube or a matching top liquid.</p>
              <p>Stack four layers of one liquid into a tube to complete it.</p>
              <p>Complete every tube before the timer runs out.</p>
            </div>
          </Card>

          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>
                Solving banks the completion base: Easy 1,000 / Medium 2,000 /
                Hard 3,000.
              </p>
              <p>
                Finish under twice the move target for 40 points per unused
                move.
              </p>
              <p>Each second remaining on the clock adds 5 points.</p>
              <p>Timing out scores zero.</p>
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
              {resultStats ? getOutcomeLabel(resultStats.result) : '—'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Difficulty:{' '}
            <span id="final-difficulty" className="text-cetus-accent-3">
              {resultStats ? capitalize(resultStats.difficulty) : 'Medium'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Moves:{' '}
            <span id="final-moves" className="text-cetus-accent-2">
              {resultStats?.movesMade ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Undos:{' '}
            <span id="final-undos" className="text-cetus-accent-2">
              {resultStats?.undosUsed ?? 0}
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
