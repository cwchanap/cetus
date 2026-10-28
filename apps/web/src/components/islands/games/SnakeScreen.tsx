import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import type { SnakeState, SnakeStats } from '@cetus/games/snake/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { SnakeInitResult } from '@/lib/games/snake/initFramework'

interface SnakeProjected {
  length: number
  foodsEaten: number
}

type WindowWithSnakeGame = Window & { snakeGame?: SnakeInitResult }

const INITIAL_TIME = 60

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_SNAKE_SNAPSHOT: GameSessionSnapshot<SnakeProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: { length: 3, foodsEaten: 0 },
  result: null,
}

/**
 * Project the Snake HUD fields with a stable reference for unchanged
 * values — the session adapter requires it to keep `useSyncExternalStore`
 * from notifying on every fresh `getState()` object.
 */
function createSnakeProjector() {
  let cached: SnakeProjected = IDLE_SNAKE_SNAPSHOT.projected
  return (state: BaseGameState): SnakeProjected => {
    const snakeState = state as SnakeState
    if (
      cached.length !== snakeState.snake.length ||
      cached.foodsEaten !== snakeState.foodsEaten
    ) {
      cached = {
        length: snakeState.snake.length,
        foodsEaten: snakeState.foodsEaten,
      }
    }
    return cached
  }
}

/**
 * Snake route island (HPA-393 Stage 1 pilot). React owns the HUD, buttons
 * and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes `window.snakeGame`.
 * Teardown disposes the session, runs the initializer cleanup (render loop,
 * keyboard/unload listeners, Pixi renderer) once and clears the debug
 * handle only if it still points at this instance.
 */
export default function SnakeScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<SnakeInitResult | null>(null)
  const [session, setSession] = useState<GameSession<SnakeProjected> | null>(
    null
  )
  const { snapshot, actions } = useGameSession(session, IDLE_SNAKE_SNAPSHOT)

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<SnakeProjected> | null = null
    let init: SnakeInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initSnakeGameFramework } =
        await import('@/lib/games/snake/initFramework')
      if (disposed) {
        return
      }
      const result = await initSnakeGameFramework(container)
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
        createSnakeProjector()
      )
      ;(window as WindowWithSnakeGame).snakeGame = result
      setSession(createdSession)
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithSnakeGame).snakeGame
      if (debugHandle === init) {
        delete (window as WindowWithSnakeGame).snakeGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  const paused = snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (legacy behavior).
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
  const handleReset = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as SnakeStats | undefined

  return (
    <GameScreen
      gameId="snake"
      title="Snake"
      description="Grow your snake by eating food - survive for 60 seconds!"
      icon="🐍"
      board={
        <div
          ref={boardRef}
          id="snake-container"
          className="border-2 border-cetus-hairline bg-black/50 rounded-lg"
          style={{ width: 500, height: 500 }}
        />
      }
      statsProps={{
        score: snapshot.score,
        time: snapshot.timeRemaining,
        initialTime: INITIAL_TIME,
        children: (
          <Badge variant="outline" className="px-4 py-2">
            <span className="font-mono">
              Length: <span id="snake-length">{snapshot.projected.length}</span>
            </span>
          </Badge>
        ),
      }}
      controlsProps={{
        running,
        paused,
        onStart: startRun,
        onPause: handlePause,
        onEnd: handleEnd,
        onReset: handleReset,
      }}
      sidebarExtras={
        <>
          {/* Controls Guide */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ CONTROLS
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Move Up:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  ↑ / W
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Move Down:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  ↓ / S
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Move Left:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  ← / A
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Move Right:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  → / D
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

          {/* Game Info */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ GAME INFO
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Duration:</span>
                <span className="text-white">60 seconds</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Food Spawn:</span>
                <span className="text-white">Every 1s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Points per Food:</span>
                <span className="text-white">10</span>
              </div>
            </div>
          </Card>

          {/* Statistics */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ STATISTICS
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Foods Eaten:</span>
                <span id="foods-eaten" className="text-white">
                  {snapshot.projected.foodsEaten}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Current Length:</span>
                <span id="snake-length-stats" className="text-cetus-accent">
                  {snapshot.projected.length}
                </span>
              </div>
            </div>
          </Card>

          {/* How to Play */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <ul className="space-y-2 text-sm text-cetus-ink-muted">
              <li>• Use arrow keys or WASD to move</li>
              <li>• Eat food to grow longer</li>
              <li>• Don't hit walls or yourself</li>
              <li>• Survive for 60 seconds</li>
              <li>• +10 points per food eaten</li>
            </ul>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        onButtonClick: startRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Max Length:{' '}
            <span id="final-length" className="text-cetus-accent">
              {resultStats?.maxLength ?? 3}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Foods Eaten:{' '}
            <span id="final-foods" className="text-cetus-accent">
              {resultStats?.foodsEaten ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Time Survived:{' '}
            <span id="final-time" className="text-cetus-accent-3">
              {Math.floor(resultStats?.timeElapsed ?? 0)}s
            </span>
          </div>
        </>
      }
    />
  )
}
