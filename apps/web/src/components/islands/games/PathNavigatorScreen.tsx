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
  PathNavigatorState,
  PathNavigatorStats,
} from '@cetus/games/path-navigator/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { PathNavigatorInitResult } from '@/lib/games/path-navigator/initFramework'

interface PathNavigatorProjected {
  level: number
}

type WindowWithPathNavigatorGame = Window & {
  pathNavigatorGame?: PathNavigatorInitResult
}

const INITIAL_TIME = 60

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_PATH_NAVIGATOR_SNAPSHOT: GameSessionSnapshot<PathNavigatorProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: { level: 1 },
    result: null,
  }

/**
 * Project the Path Navigator HUD fields with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()` object.
 */
function createPathNavigatorProjector() {
  let cached: PathNavigatorProjected = IDLE_PATH_NAVIGATOR_SNAPSHOT.projected
  return (state: BaseGameState): PathNavigatorProjected => {
    const navigatorState = state as PathNavigatorState
    if (cached.level !== navigatorState.currentLevel) {
      cached = { level: navigatorState.currentLevel }
    }
    return cached
  }
}

/**
 * Path Navigator route island (HPA-393 Stage 2). React owns the HUD, the
 * start/end buttons (showPause/showReset off, mirroring the legacy
 * GamePage props) and the overlay via `useGameSession`; the effect imports
 * the browser initializer, mounts it on the board ref and publishes
 * `window.pathNavigatorGame`. The Pixi canvas, the arrow-key input and the
 * single rAF loop stay initializer-owned. Teardown disposes the session,
 * runs the initializer cleanup once and clears the debug handle only if it
 * still points at this instance.
 */
export default function PathNavigatorScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<PathNavigatorInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<PathNavigatorProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_PATH_NAVIGATOR_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<PathNavigatorProjected> | null = null
    let init: PathNavigatorInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initPathNavigatorGameFramework } =
        await import('@/lib/games/path-navigator/initFramework')
      if (disposed) {
        return
      }
      const result = await initPathNavigatorGameFramework(container)
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
        createPathNavigatorProjector()
      )
      ;(window as WindowWithPathNavigatorGame).pathNavigatorGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithPathNavigatorGame)
        .pathNavigatorGame
      if (debugHandle === init) {
        delete (window as WindowWithPathNavigatorGame).pathNavigatorGame
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
  // Legacy play-again returned to idle (overlay hidden, buttons reset); it
  // never auto-restarted.
  const resetRun = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as PathNavigatorStats | undefined

  return (
    <GameScreen
      gameId="path-navigator"
      title="Path Navigator"
      description="Guide your cursor through 4 challenging paths without touching the edges!"
      icon="🎯"
      board={
        <div
          ref={boardRef}
          id="path-navigator-container"
          className="relative bg-black/50 rounded-lg"
          style={{ width: 800, height: 600 }}
        />
      }
      statsProps={{
        score: snapshot.score,
        time: snapshot.timeRemaining,
        initialTime: INITIAL_TIME,
        children: (
          <Badge variant="outline" className="px-4 py-2">
            <span className="font-mono">
              Level: <span id="level">{snapshot.projected.level}</span>
            </span>
          </Badge>
        ),
      }}
      controlsProps={{
        showPause: false,
        showReset: false,
        running,
        onStart: startRun,
        onEnd: handleEnd,
      }}
      sidebarExtras={
        <>
          {/* Instructions */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <div className="space-y-3 text-sm text-cetus-ink">
              <div className="flex items-start space-x-2">
                <span className="text-cetus-accent">•</span>
                <span>Move your mouse to control the cursor</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-cetus-accent">•</span>
                <span>Stay within the cyan path boundaries</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-cetus-accent">•</span>
                <span>Reach the green goal to complete each level</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-cetus-accent">•</span>
                <span>Complete all 4 levels before time runs out</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-red-400">•</span>
                <span>Game over if you leave the path!</span>
              </div>
            </div>
          </Card>

          {/* Level Information */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ LEVELS
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 1:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Easy Path
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 2:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Curved Path
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 3:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Zigzag Path
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 4:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Spiral Path
                </Badge>
              </div>
            </div>
          </Card>

          {/* Controls Guide */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ CONTROLS
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Mouse Movement:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Navigate
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Start Game:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Button
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Time Limit:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  60 seconds
                </Badge>
              </div>
              <div className="pt-2 border-t border-cetus-hairline">
                <div className="text-cetus-ink-muted text-xs">
                  💡 Move smoothly and avoid sudden movements for better
                  control!
                </div>
              </div>
            </div>
          </Card>

          {/* Scoring */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 1:</span>
                <span className="text-cetus-accent">100 + time bonus</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 2:</span>
                <span className="text-cetus-accent">200 + time bonus</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 3:</span>
                <span className="text-cetus-accent">300 + time bonus</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Level 4:</span>
                <span className="text-cetus-accent">500 + time bonus</span>
              </div>
              <div className="pt-2 border-t border-cetus-hairline">
                <div className="text-cetus-ink-muted text-xs">
                  Time bonus = (15 - level_time) × level_multiplier
                </div>
              </div>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        defaultTitle: 'GAME OVER',
        onButtonClick: resetRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Levels Completed:{' '}
            <span id="levels-completed" className="text-cetus-accent">
              {resultStats?.levelsCompleted ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Total Time:{' '}
            <span id="total-time" className="text-cetus-accent">
              {resultStats ? Math.round(resultStats.totalTime) : 0}
            </span>
            s
          </div>
        </>
      }
    />
  )
}
