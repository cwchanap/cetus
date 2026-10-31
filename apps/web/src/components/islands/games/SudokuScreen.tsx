import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import { DEFAULT_SUDOKU_CONFIG } from '@cetus/games/sudoku/SudokuGame'
import type {
  SudokuState,
  SudokuStats,
} from '@cetus/games/sudoku/frameworkTypes'
import { GameScreen } from '@/components/games/GameScreen'
import type { SudokuInitResult } from '@/lib/games/sudoku/initFramework'

interface SudokuProjected {
  difficulty: 'easy' | 'medium' | 'hard'
}

type WindowWithSudokuGame = Window & {
  sudokuGame?: SudokuInitResult
}

// Sudoku has no countdown — its shared Time badge is hidden (showTime false)
// and the bespoke #game-time span counts elapsed time in MM:SS.
const INITIAL_TIME = DEFAULT_SUDOKU_CONFIG.duration

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_SUDOKU_SNAPSHOT: GameSessionSnapshot<SudokuProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: { difficulty: 'medium' },
  result: null,
}

/**
 * Project the Sudoku HUD fields with a stable reference for unchanged
 * values — the session adapter requires it to keep `useSyncExternalStore`
 * from notifying on every fresh `getState()`.
 */
function createSudokuProjector() {
  let cached: SudokuProjected = IDLE_SUDOKU_SNAPSHOT.projected
  return (state: BaseGameState): SudokuProjected => {
    const sudokuState = state as SudokuState
    if (cached.difficulty !== sudokuState.difficulty) {
      cached = { difficulty: sudokuState.difficulty }
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

/**
 * Sudoku route island (HPA-393 Stage 2). React owns the HUD, shared buttons
 * and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes `window.sudokuGame`.
 * The difficulty buttons stay initializer-wired bespoke controls (Mine Grid
 * precedent): the island renders their exact legacy markup and the
 * initializer keeps managing the disabled lock during a run and the
 * selected-button classes; the bespoke #game-time elapsed span is also
 * initializer-written. Teardown disposes the session, runs the initializer
 * cleanup (cell/keyboard/unload listeners, renderer) once and clears the
 * debug handle only if it still points at this instance.
 */
export default function SudokuScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<SudokuInitResult | null>(null)
  const [session, setSession] = useState<GameSession<SudokuProjected> | null>(
    null
  )
  const { snapshot, actions } = useGameSession(session, IDLE_SUDOKU_SNAPSHOT)

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<SudokuProjected> | null = null
    let init: SudokuInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initSudokuGameFramework } =
        await import('@/lib/games/sudoku/initFramework')
      if (disposed) {
        return
      }
      const result = await initSudokuGameFramework(container)
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
        createSudokuProjector()
      )
      ;(window as WindowWithSudokuGame).sudokuGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithSudokuGame).sudokuGame
      if (debugHandle === init) {
        delete (window as WindowWithSudokuGame).sudokuGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  const paused = snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself (fresh puzzle via
  // createInitialState), so a single start covers both first run and
  // post-game-over restart — the legacy handler's extra newGame() call was
  // redundant with it.
  const startRun = () => {
    actions.start()
  }
  const handlePause = () => {
    if (paused) {
      actions.resume()
    } else {
      actions.pause()
    }
  }
  const handleEnd = () => {
    void initRef.current?.endGame()
  }
  // One reset only: onGameReset emits state-change, so the initializer's
  // callback re-renders the fresh puzzle (and releases the difficulty lock)
  // while the session adapter refreshes to idle off the same final state.
  const resetRun = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as SudokuStats | undefined
  const overlayTitle = resultStats
    ? resultStats.isComplete
      ? 'PUZZLE SOLVED!'
      : 'GAME OVER'
    : 'Game Over'

  return (
    <GameScreen
      gameId="sudoku"
      title="Sudoku Challenge"
      description="Fill the grid so each row, column, and 3x3 box contains digits 1-9"
      icon="🔢"
      board={
        <div>
          <div
            ref={boardRef}
            id="sudoku-container"
            className="border-2 border-cetus-hairline bg-black/50 rounded-lg"
            style={{ width: 450, height: 450 }}
          />
        </div>
      }
      statsProps={{
        showTime: false,
        score: snapshot.score,
        initialTime: INITIAL_TIME,
        children: (
          <>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Time: <span id="game-time">00:00</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Difficulty:{' '}
                <span id="difficulty">
                  {capitalize(snapshot.projected.difficulty)}
                </span>
              </span>
            </Badge>
          </>
        ),
      }}
      controlsProps={{
        running,
        paused,
        onStart: startRun,
        onPause: handlePause,
        onEnd: handleEnd,
        onReset: resetRun,
      }}
      sidebarExtras={
        <>
          {/* Difficulty Settings */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ DIFFICULTY
            </h3>
            {/* Wired by the initializer (bespoke custom control): clicking
                generates a fresh puzzle at that difficulty; disabled while a
                run is active; selection swaps the button variant classes. */}
            <div className="space-y-3">
              <Button id="easy-btn" className="w-full justify-start">
                <span className="mr-2">🟢</span>
                Easy (40 clues)
              </Button>
              <Button id="medium-btn" className="w-full justify-start">
                <span className="mr-2">🟡</span>
                Medium (30 clues)
              </Button>
              <Button id="hard-btn" className="w-full justify-start">
                <span className="mr-2">🔴</span>
                Hard (20 clues)
              </Button>
            </div>
          </Card>

          {/* Controls Guide */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ CONTROLS
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Select Cell:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Click
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Enter Number:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  1-9
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Clear Cell:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Delete
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Navigate:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Arrow Keys
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Pause:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  P
                </Badge>
              </div>
            </div>
          </Card>

          {/* How to Play */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <p>• Click on any empty cell to select it</p>
              <p>• Type numbers 1-9 to fill cells</p>
              <p>• Each row, column, and 3×3 box must contain all digits 1-9</p>
              <p>• Use Delete/Backspace to clear cells</p>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        buttonId: 'restart-btn',
        defaultTitle: overlayTitle,
        onButtonClick: resetRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Time Played:{' '}
            <span id="final-time" className="text-cetus-accent">
              {resultStats ? formatTime(resultStats.timeElapsed) : '00:00'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Difficulty:{' '}
            <span id="final-difficulty" className="text-cetus-accent-3">
              {resultStats ? capitalize(resultStats.difficulty) : 'Medium'}
            </span>
          </div>
        </>
      }
    />
  )
}
