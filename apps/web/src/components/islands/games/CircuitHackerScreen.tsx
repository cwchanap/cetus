import { useEffect, useRef, useState } from 'react'
import {
  createHandleSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
  type HandleSessionHandlers,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameStats } from '@cetus/games'
import type {
  CircuitHackerStats,
  Difficulty,
} from '@cetus/games/circuit-hacker/types'
import { GameScreen } from '@/components/games/GameScreen'
import type { CircuitHackerHandle } from '@/lib/games/circuit-hacker/init'
import { cn } from '@/lib/utils'

type WindowWithCircuitHackerGame = Window & {
  circuitHackerGame?: CircuitHackerHandle
}

interface CircuitHackerProjected {
  rotations: number
}

const INITIAL_TIME = 180

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_CIRCUIT_SNAPSHOT: GameSessionSnapshot<CircuitHackerProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: { rotations: 0 },
  result: null,
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unexpected error. Please try again.'
}

/**
 * Circuit Hacker route island (HPA-393 Stage 3.1, HANDLE-game pattern).
 * React owns the HUD, difficulty select, start/stop pair, error surface
 * and overlay; the effect imports the browser initializer, mounts it on
 * the board ref with callbacks that drive the `createHandleSession`
 * handlers, and publishes `window.circuitHackerGame`. The Pixi board stays
 * imperative and `saveGameScore` inside the initializer keeps owning
 * persistence plus achievement/challenge toasts — the session's end
 * result is display-only. Teardown disposes the session, runs the handle
 * cleanup (renderer, pointer listener) once and clears the debug handle
 * only if it still points at this instance.
 */
export default function CircuitHackerScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const difficultyRef = useRef<HTMLSelectElement>(null)
  const initRef = useRef<CircuitHackerHandle | null>(null)
  const handlersRef =
    useRef<HandleSessionHandlers<CircuitHackerProjected> | null>(null)
  // Reference-stable projected object: reallocate only when the rotation
  // count actually changes (handle-session setProjected compares by
  // reference to keep no-change bursts from notifying).
  const projectedRef = useRef<CircuitHackerProjected>({ rotations: 0 })
  const [session, setSession] =
    useState<GameSession<CircuitHackerProjected> | null>(null)
  const [pending, setPending] = useState(false)
  const [overlay, setOverlay] = useState<{ title: string } | null>(null)
  const [error, setError] = useState<{ title: string; message: string } | null>(
    null
  )
  const { snapshot } = useGameSession(session, IDLE_CIRCUIT_SNAPSHOT)

  useEffect(() => {
    let disposed = false
    let handle: CircuitHackerHandle | null = null
    const bundle = createHandleSession<CircuitHackerProjected>({
      capabilities: { pausable: false, resettable: false },
      snapshot: IDLE_CIRCUIT_SNAPSHOT,
    })

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initializeCircuitHackerGame } =
        await import('@/lib/games/circuit-hacker/init')
      if (disposed) {
        return
      }
      try {
        handle = await initializeCircuitHackerGame(container, {
          onTimeUpdate: t => {
            bundle.handlers.onTime?.(t)
          },
          onRotation: n => {
            if (projectedRef.current.rotations !== n) {
              projectedRef.current = { rotations: n }
            }
            bundle.handlers.setProjected(projectedRef.current)
          },
          onStart: () => {
            bundle.handlers.onStart()
            setOverlay(null)
            setError(null)
          },
          onEnd: (stats, outcome) => {
            bundle.handlers.onEnd({
              score: stats.finalScore,
              // Display-only projection into the session result shape;
              // never re-submitted, never a toast source.
              stats: stats as unknown as BaseGameStats,
            })
            setOverlay({ title: outcome.title })
          },
          onError: (title, message) => {
            // Legacy showError cleared the overlay first: on the
            // score-save-failure-after-solve path onEnd has already opened
            // it, and the error surface renders underneath the z-50 layer.
            setOverlay(null)
            setError({ title, message })
          },
        })
      } catch (error) {
        if (!disposed) {
          setError({
            title: 'Failed to Load Game',
            message: formatError(error),
          })
        }
        return
      }
      if (disposed) {
        handle.cleanup()
        return
      }
      initRef.current = handle
      handlersRef.current = bundle.handlers
      ;(window as WindowWithCircuitHackerGame).circuitHackerGame = handle
      setSession(bundle.session)
    }
    void mount()

    return () => {
      disposed = true
      bundle.session.dispose()
      initRef.current?.cleanup()
      initRef.current = null
      handlersRef.current = null
      const debugHandle = (window as WindowWithCircuitHackerGame)
        .circuitHackerGame
      if (debugHandle === handle) {
        delete (window as WindowWithCircuitHackerGame).circuitHackerGame
      }
    }
  }, [])

  const running = snapshot.status === 'running'

  // Legacy start click: hide the start button synchronously (double-click
  // guard while setupPixiJS is pending), reset the rotation count, and
  // restore the buttons if start() throws.
  const startGame = async () => {
    const handle = initRef.current
    if (!handle) {
      return
    }
    setError(null)
    projectedRef.current = { rotations: 0 }
    handlersRef.current?.setProjected(projectedRef.current)
    setPending(true)
    try {
      await handle.start(
        (difficultyRef.current?.value ?? 'medium') as Difficulty
      )
    } catch (error) {
      setError({ title: 'Failed to Start Game', message: formatError(error) })
    } finally {
      setPending(false)
    }
  }

  const stopGame = () => {
    initRef.current?.stop()
  }

  const playAgain = () => {
    setOverlay(null)
  }

  const resultStats = snapshot.result?.stats as CircuitHackerStats | undefined

  return (
    <GameScreen
      gameId="circuit-hacker"
      title="Circuit Hacker"
      description="Rotate the tiles to connect the source to every core before the timer expires!"
      icon="🔌"
      board={
        <div className="relative w-full">
          <div
            ref={boardRef}
            id="game-canvas-container"
            className="bg-black/30 rounded-lg min-w-[240px] min-h-[240px] w-full"
          />

          {/* Pre-start prompt: hidden while a run is live, an overlay is
              open, or an error surfaces — exactly the legacy class toggles. */}
          <div
            id="game-status"
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg',
              (running || overlay !== null || error !== null) && 'hidden'
            )}
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🔌</div>
              <div
                className="text-xl font-mono font-bold mb-2 cetus-wordmark cetus-wordmark--glow"
                style={{ fontFamily: 'var(--cetus-display-font)' }}
              >
                CIRCUIT HACKER
              </div>
              <div className="text-cetus-ink-muted">
                Pick a difficulty and start!
              </div>
            </div>
          </div>

          <div
            id="game-error"
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg',
              error === null && 'hidden'
            )}
          >
            <div className="text-center">
              <div id="game-error-title" className="text-red-400 text-xl mb-2">
                {error?.title}
              </div>
              <div
                id="game-error-message"
                className="text-cetus-ink-muted text-sm"
              >
                {error?.message}
              </div>
            </div>
          </div>
        </div>
      }
      statsProps={{
        showScore: false,
        initialTime: INITIAL_TIME,
        time: snapshot.timeRemaining,
        children: (
          <Badge variant="outline" className="px-4 py-2">
            <span className="font-mono">
              Rotations:{' '}
              <span id="rotation-count">{snapshot.projected.rotations}</span>
            </span>
          </Badge>
        ),
      }}
      controls={
        <Card variant="glass" className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-cetus-ink-muted text-sm">Difficulty:</span>
              <select
                ref={difficultyRef}
                id="difficulty-select"
                defaultValue="medium"
                disabled={running || pending}
                className="bg-slate-800 border border-cetus-hairline rounded-md px-3 py-1 text-sm text-white"
              >
                <option value="easy">Easy (5×5)</option>
                <option value="medium">Medium (7×7)</option>
                <option value="hard">Hard (9×9)</option>
                <option value="expert">Expert (11×11)</option>
              </select>
            </div>
            <div className="flex space-x-3">
              <Button
                id="start-btn"
                variant="primary"
                style={running || pending ? { display: 'none' } : undefined}
                onClick={startGame}
              >
                Start Game
              </Button>
              <Button
                id="stop-btn"
                variant="outline"
                style={
                  running ? { display: 'inline-flex' } : { display: 'none' }
                }
                onClick={stopGame}
              >
                End Game
              </Button>
            </div>
          </div>
        </Card>
      }
      sidebarExtras={
        <>
          {/* How to Play */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ HOW TO PLAY
            </h3>
            <ul className="space-y-2 text-sm text-cetus-ink-muted">
              <li>• Tap/click a tile to rotate it 90° clockwise</li>
              <li>• Connect the source node to every core</li>
              <li>• Powered wires glow cyan</li>
              <li>• Solve before the timer runs out</li>
              <li>• Fewer rotations and more time left = higher score</li>
            </ul>
          </Card>

          {/* Scoring */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Base:</span>
                <span>1000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Time bonus:</span>
                <span>×15 / sec left</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Rotation bonus:</span>
                <span>×25 / unused rotation</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Harder tier:</span>
                <span>bigger multiplier</span>
              </div>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: overlay !== null,
        showScore: false,
        defaultTitle: overlay?.title ?? 'CIRCUIT POWERED!',
        buttonText: 'Play Again',
        onButtonClick: playAgain,
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
            Time Left:{' '}
            <span id="final-time" className="text-cetus-accent">
              {resultStats ? `${resultStats.secondsRemaining}s` : '0s'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Rotations:{' '}
            <span id="final-rotations" className="text-cetus-accent-3">
              {resultStats?.rotationsUsed ?? 0}
            </span>
          </div>
        </>
      }
    />
  )
}
