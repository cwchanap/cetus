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
  MINE_GRID_PRESETS,
  type MineGridDifficulty,
  type MineGridState,
  type MineGridStats,
} from '@cetus/games/mine-grid/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { MineGridInitResult } from '@/lib/games/mine-grid/initFramework'

interface MineGridProjected {
  difficulty: MineGridDifficulty
  flagsPlaced: number
  revealedSafeCells: number
}

type WindowWithMineGridGame = Window & {
  mineGridGame?: MineGridInitResult
}

const INITIAL_TIME = 300

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_MINE_GRID_SNAPSHOT: GameSessionSnapshot<MineGridProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: { difficulty: 'medium', flagsPlaced: 0, revealedSafeCells: 0 },
  result: null,
}

/**
 * Project the Mine Grid HUD fields with a stable reference for unchanged
 * values — the session adapter requires it to keep `useSyncExternalStore`
 * from notifying on every fresh `getState()` object.
 */
function createMineGridProjector() {
  let cached: MineGridProjected = IDLE_MINE_GRID_SNAPSHOT.projected
  return (state: BaseGameState): MineGridProjected => {
    const mineGridState = state as MineGridState
    if (
      cached.difficulty !== mineGridState.difficulty ||
      cached.flagsPlaced !== mineGridState.flagsPlaced ||
      cached.revealedSafeCells !== mineGridState.revealedSafeCells
    ) {
      cached = {
        difficulty: mineGridState.difficulty,
        flagsPlaced: mineGridState.flagsPlaced,
        revealedSafeCells: mineGridState.revealedSafeCells,
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

function getOutcomeLabel(result: MineGridStats['result']): string {
  switch (result) {
    case 'cleared':
      return 'Cleared'
    case 'mine':
      return 'Mine Detonated'
    case 'timeout':
      return 'Timeout'
    default:
      return 'Game Over'
  }
}

function getOutcomeTitle(result: MineGridStats['result']): string {
  switch (result) {
    case 'cleared':
      return 'GRID CLEARED!'
    case 'mine':
      return 'MINE DETONATED'
    case 'timeout':
      return 'TIMEOUT'
    default:
      return 'GAME OVER!'
  }
}

/**
 * Mine Grid route island (HPA-393 Stage 2). React owns the HUD, shared
 * buttons and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.mineGridGame`. The difficulty/mode selectors stay initializer-
 * wired custom controls (HPA-393 recipe: bespoke interactive controls are
 * not shared chrome) — the island renders their exact legacy markup and
 * the `aria-pressed`/disabled state keeps being managed by the
 * initializer. Teardown disposes the session, runs the initializer
 * cleanup (cell listeners, selectors, unload warning, renderer) once and
 * clears the debug handle only if it still points at this instance.
 */
export default function MineGridScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<MineGridInitResult | null>(null)
  const [session, setSession] = useState<GameSession<MineGridProjected> | null>(
    null
  )
  const { snapshot, actions } = useGameSession(session, IDLE_MINE_GRID_SNAPSHOT)

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<MineGridProjected> | null = null
    let init: MineGridInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initMineGridGameFramework } =
        await import('@/lib/games/mine-grid/initFramework')
      if (disposed) {
        return
      }
      const result = await initMineGridGameFramework(container)
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
        createMineGridProjector()
      )
      ;(window as WindowWithMineGridGame).mineGridGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithMineGridGame).mineGridGame
      if (debugHandle === init) {
        delete (window as WindowWithMineGridGame).mineGridGame
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
  // to idle; the render-only sync then restores Reveal mode and unlocks
  // difficulty without a second reset.
  const resetRun = () => {
    actions.reset()
    initRef.current?.syncPresentation()
  }

  const resultStats = snapshot.result?.stats as MineGridStats | undefined
  const overlayTitle = resultStats
    ? getOutcomeTitle(resultStats.result)
    : 'Game Over'
  const preset = MINE_GRID_PRESETS[snapshot.projected.difficulty]

  return (
    <GameScreen
      gameId="mine-grid"
      title="Mine Grid"
      description="Scan the field, flag hidden mines, and reveal every safe cell"
      icon="💣"
      board={
        <div className="w-[min(560px,calc(100vw-2rem))]">
          <div
            ref={boardRef}
            id="mine-grid-container"
            className="w-full max-w-[560px] aspect-square"
          >
            <div
              id="mine-grid-board"
              className="grid w-full h-full gap-1"
              role="grid"
              aria-label="Mine Grid board"
            />
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
                Difficulty:{' '}
                <span id="difficulty">
                  {capitalize(snapshot.projected.difficulty)}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Flags: <span id="flags">{snapshot.projected.flagsPlaced}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Safe:{' '}
                <span id="safe-progress">
                  {snapshot.projected.revealedSafeCells} /{' '}
                  {preset.rows * preset.cols - preset.mines}
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
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ DIFFICULTY
            </h3>
            {/* Wired by the initializer (bespoke custom control):
                            clicking swaps the idle preset through
                            game.newGame; disabled while a run is active.
                            They also START disabled: the initializer wires
                            them only after its async mount, so an eager
                            pre-init click would be silently lost — init
                            enables them (setDifficultyButtonsDisabled(false))
                            as soon as the handlers are attached. */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                id="easy-btn"
                variant="outline"
                size="sm"
                aria-pressed="false"
                disabled
                className="mine-grid-difficulty hover-glow-cyan"
              >
                Easy
              </Button>
              <Button
                id="medium-btn"
                variant="outline"
                size="sm"
                aria-pressed="true"
                disabled
                className="mine-grid-difficulty hover-glow-cyan"
              >
                Medium
              </Button>
              <Button
                id="hard-btn"
                variant="outline"
                size="sm"
                aria-pressed="false"
                disabled
                className="mine-grid-difficulty hover-glow-cyan"
              >
                Hard
              </Button>
            </div>
          </Card>

          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ ACTION MODE
            </h3>
            {/* Wired by the initializer (bespoke custom control). */}
            <div className="flex gap-2">
              <Button
                id="reveal-mode-btn"
                variant="outline"
                size="sm"
                aria-pressed="true"
                className="mine-grid-mode hover-glow-cyan"
              >
                Reveal
              </Button>
              <Button
                id="flag-mode-btn"
                variant="outline"
                size="sm"
                aria-pressed="false"
                className="mine-grid-mode hover-glow-cyan"
              >
                Flag
              </Button>
            </div>
            <p className="mt-3 text-xs text-cetus-ink-muted">
              Right-click any cell to flag it regardless of the selected mode.
            </p>
          </Card>

          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Reveal every safe cell without detonating a mine.</p>
              <p>Use adjacent numbers to locate hidden mines.</p>
              <p>Flag suspected mines with Flag mode or right-click.</p>
            </div>
          </Card>

          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>Safe cells are worth points when the field is cleared.</p>
              <p>
                Correct flags add bonus points; incorrect flags cost points.
              </p>
              <p>Clear the grid quickly for a larger time bonus.</p>
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
            Time:{' '}
            <span id="final-time" className="text-cetus-accent">
              {resultStats ? formatTime(resultStats.timeElapsed) : '00:00'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Incorrect Flags:{' '}
            <span id="final-incorrect-flags" className="text-cetus-accent-2">
              {resultStats?.incorrectFlagActions ?? 0}
            </span>
          </div>
        </>
      }
    />
  )
}
