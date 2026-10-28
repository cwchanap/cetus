import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import { formatTime } from '@cetus/games/memory-matrix/utils'
import type {
  MemoryMatrixState,
  MemoryMatrixStats,
} from '@cetus/games/memory-matrix/frameworkTypes'
import { GameScreen } from '@/components/games/GameScreen'
import type { MemoryMatrixInitResult } from '@/lib/games/memory-matrix/initFramework'

interface MemoryMatrixProjected {
  matchedPairs: number
  totalPairs: number
  accuracy: number
  matchesFound: number
  totalAttempts: number
}

type WindowWithMemoryMatrixGame = Window & {
  memoryMatrixGame?: MemoryMatrixInitResult
}

const INITIAL_TIME = 60

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_MEMORY_MATRIX_SNAPSHOT: GameSessionSnapshot<MemoryMatrixProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: {
      matchedPairs: 0,
      totalPairs: 24,
      accuracy: 0,
      matchesFound: 0,
      totalAttempts: 0,
    },
    result: null,
  }

/**
 * Project the Memory Matrix HUD fields with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 */
function createMemoryMatrixProjector() {
  let cached: MemoryMatrixProjected = IDLE_MEMORY_MATRIX_SNAPSHOT.projected
  return (state: BaseGameState): MemoryMatrixProjected => {
    const memoryMatrixState = state as MemoryMatrixState
    if (
      cached.matchedPairs !== memoryMatrixState.matchedPairs ||
      cached.totalPairs !== memoryMatrixState.totalPairs ||
      cached.accuracy !== memoryMatrixState.accuracy ||
      cached.matchesFound !== memoryMatrixState.matchesFound ||
      cached.totalAttempts !== memoryMatrixState.totalAttempts
    ) {
      cached = {
        matchedPairs: memoryMatrixState.matchedPairs,
        totalPairs: memoryMatrixState.totalPairs,
        accuracy: memoryMatrixState.accuracy,
        matchesFound: memoryMatrixState.matchesFound,
        totalAttempts: memoryMatrixState.totalAttempts,
      }
    }
    return cached
  }
}

// Same color tiers the renderer used to apply to the game-time span.
function gameTimeClass(timeRemaining: number): string {
  if (timeRemaining <= 10) {
    return 'text-red-400 font-bold'
  }
  if (timeRemaining <= 30) {
    return 'text-yellow-400'
  }
  return 'text-white'
}

/**
 * Memory Matrix route island (HPA-393 Stage 2). React owns the HUD,
 * buttons and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.memoryMatrixGame`. Teardown disposes the session, runs the
 * initializer cleanup (card listeners, unload warning, renderer) once and
 * clears the debug handle only if it still points at this instance.
 */
export default function MemoryMatrixScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<MemoryMatrixInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<MemoryMatrixProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_MEMORY_MATRIX_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<MemoryMatrixProjected> | null = null
    let init: MemoryMatrixInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initMemoryMatrixGameFramework } =
        await import('@/lib/games/memory-matrix/initFramework')
      if (disposed) {
        return
      }
      const result = await initMemoryMatrixGameFramework(container)
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
        createMemoryMatrixProjector()
      )
      ;(window as WindowWithMemoryMatrixGame).memoryMatrixGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithMemoryMatrixGame)
        .memoryMatrixGame
      if (debugHandle === init) {
        delete (window as WindowWithMemoryMatrixGame).memoryMatrixGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (legacy behavior).
  const startRun = () => {
    actions.start()
  }
  const handleEnd = () => {
    void initRef.current?.endGame()
  }
  // Legacy reset/play-again reset the run and restore the idle board;
  // reset() emits no game event, so refresh the cache explicitly.
  const resetRun = () => {
    initRef.current?.restart()
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as MemoryMatrixStats | undefined
  const overlayTitle = resultStats
    ? resultStats.gameWon
      ? 'VICTORY!'
      : "TIME'S UP!"
    : 'Game Over'

  return (
    <GameScreen
      gameId="memory-matrix"
      title="Memory Matrix"
      description="Test your memory by matching pairs of shapes in this grid-based puzzle game"
      icon="🧠"
      board={
        <div
          ref={boardRef}
          id="memory-matrix-container"
          className="border-2 border-cetus-hairline bg-black/50 rounded-lg"
          style={{ width: 640, height: 480 }}
        >
          <div
            id="memory-board"
            className="w-full h-full grid grid-cols-8 grid-rows-6 gap-2 p-2"
          />
        </div>
      }
      statsProps={{
        showScore: false,
        showTime: false,
        initialTime: INITIAL_TIME,
        children: (
          <>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Score: <span id="game-score">{snapshot.score}</span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Time:{' '}
                <span
                  id="game-time"
                  className={gameTimeClass(snapshot.timeRemaining)}
                >
                  {formatTime(snapshot.timeRemaining)}
                </span>
              </span>
            </Badge>
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Pairs:{' '}
                <span id="game-pairs">
                  {snapshot.projected.matchedPairs}/
                  {snapshot.projected.totalPairs}
                </span>
              </span>
            </Badge>
          </>
        ),
      }}
      controlsProps={{
        showPause: false,
        running,
        onStart: startRun,
        onEnd: handleEnd,
        onReset: resetRun,
      }}
      sidebarExtras={
        <>
          {/* Game Rules */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink-muted">
              <p>• Click on cards to flip them over</p>
              <p>• Find matching pairs of shapes</p>
              <p>• Match all pairs before time runs out</p>
              <p>• Faster matches = higher score</p>
              <p>• You have 60 seconds to complete the grid</p>
            </div>
          </Card>

          {/* Game Statistics */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ STATISTICS
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Accuracy:</span>
                <span id="game-accuracy" className="text-white">
                  {snapshot.projected.accuracy}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Pairs Found:</span>
                <span id="pairs-found" className="text-green-400">
                  {snapshot.projected.matchesFound}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Total Attempts:</span>
                <span id="total-attempts" className="text-white">
                  {snapshot.projected.totalAttempts}
                </span>
              </div>
            </div>
          </Card>

          {/* Scoring System */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Per Match:</span>
                <span className="text-green-400">+100 points</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Time Bonus:</span>
                <span className="text-yellow-400">+5 per second left</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Total Pairs:</span>
                <span className="text-white">24 pairs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Maximum Score:</span>
                <span className="text-cetus-accent">2,700 points</span>
              </div>
            </div>
          </Card>

          {/* Game Shapes Preview */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SHAPES
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                🔵
              </div>
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                🔺
              </div>
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                🔶
              </div>
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                ⭐
              </div>
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                ❤️
              </div>
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                🟢
              </div>
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                🔴
              </div>
              <div className="text-2xl text-center p-2 bg-black/30 rounded">
                🟡
              </div>
            </div>
            <p className="text-xs text-cetus-ink-muted mt-2 text-center">
              Each shape appears 6 times (3 pairs each)
            </p>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        showScore: false,
        defaultTitle: overlayTitle,
        onButtonClick: resetRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Final Score:{' '}
            <span id="final-score" className="text-cetus-accent">
              {snapshot.result?.score ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Pairs Found:{' '}
            <span id="final-pairs" className="text-cetus-accent">
              {resultStats?.matchesFound ?? 0}/{snapshot.projected.totalPairs}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Accuracy:{' '}
            <span id="final-accuracy" className="text-cetus-accent">
              {resultStats ? `${Math.round(resultStats.accuracy)}%` : '0%'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Time Remaining:{' '}
            <span id="final-time" className="text-cetus-accent-3">
              {snapshot.status === 'finished'
                ? `${snapshot.timeRemaining}s`
                : '0s'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Total Attempts:{' '}
            <span id="final-attempts" className="text-cetus-accent-2">
              {resultStats?.totalAttempts ?? 0}
            </span>
          </div>
        </>
      }
    />
  )
}
