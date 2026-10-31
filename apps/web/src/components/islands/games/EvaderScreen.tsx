import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import type {
  EvaderState,
  EvaderStats,
} from '@cetus/games/evader/frameworkTypes'
import { GameScreen } from '@/components/games/GameScreen'
import type { EvaderInitResult } from '@/lib/games/evader/initFramework'

interface EvaderProjected {
  coins: number
  bombs: number
}

type WindowWithEvaderGame = Window & {
  evaderGame?: EvaderInitResult
}

const INITIAL_TIME = 60

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_EVADER_SNAPSHOT: GameSessionSnapshot<EvaderProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: { coins: 0, bombs: 0 },
  result: null,
}

/**
 * Project the Evader HUD fields with a stable reference for unchanged
 * values — the session adapter requires it to keep `useSyncExternalStore`
 * from notifying on every fresh `getState()` object.
 */
function createEvaderProjector() {
  let cached: EvaderProjected = IDLE_EVADER_SNAPSHOT.projected
  return (state: BaseGameState): EvaderProjected => {
    const evaderState = state as EvaderState
    if (
      cached.coins !== evaderState.coinsCollected ||
      cached.bombs !== evaderState.bombsHit
    ) {
      cached = {
        coins: evaderState.coinsCollected,
        bombs: evaderState.bombsHit,
      }
    }
    return cached
  }
}

/**
 * Evader route island (HPA-393 Stage 2). React owns the HUD, the bespoke
 * start/stop control card (#stop-btn replaces #end-btn, mirroring the
 * legacy controls slot), the touch D-pad markup and the overlay via
 * `useGameSession`; the effect imports the browser initializer, mounts it
 * on the board ref and publishes `window.evaderGame`. The Pixi canvas, the
 * keyboard/WASD handlers, the D-pad pointer listeners and the single rAF
 * loop stay initializer-owned. Teardown disposes the session, runs the
 * initializer cleanup once and clears the debug handle only if it still
 * points at this instance.
 */
export default function EvaderScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<EvaderInitResult | null>(null)
  const [session, setSession] = useState<GameSession<EvaderProjected> | null>(
    null
  )
  const { snapshot, actions } = useGameSession(session, IDLE_EVADER_SNAPSHOT)

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<EvaderProjected> | null = null
    let init: EvaderInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initEvaderGameFramework } =
        await import('@/lib/games/evader/initFramework')
      if (disposed) {
        return
      }
      try {
        const result = await initEvaderGameFramework(container)
        if (disposed) {
          result?.cleanup()
          return
        }
        if (!result) {
          // Renderer failed to start: surface it instead of leaving a
          // blank board that silently ignores Start.
          throw new Error('Evader renderer failed to initialize')
        }
        init = result
        initRef.current = result
        createdSession = createBaseGameSession(
          result.game,
          createEvaderProjector()
        )
        ;(window as WindowWithEvaderGame).evaderGame = result
        setSession(createdSession)
      } catch (error) {
        console.error('Failed to initialize Evader game:', error)
        const errorTitle = document.getElementById('game-error-title')
        if (errorTitle) {
          errorTitle.textContent = 'Failed to Load Game'
        }
        const errorMessage = document.getElementById('game-error-message')
        if (errorMessage) {
          errorMessage.textContent = String(error)
        }
        const errorContainer = document.getElementById('game-error')
        if (errorContainer) {
          errorContainer.style.display = 'flex'
        }
      }
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithEvaderGame).evaderGame
      if (debugHandle === init) {
        delete (window as WindowWithEvaderGame).evaderGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (the legacy handler's
  // explicit reset guard was redundant with it).
  const startRun = () => {
    actions.start()
  }
  // #stop-btn is Evader's end button (frozen deviation: there is no
  // #end-btn on this page).
  const handleStop = () => {
    void initRef.current?.endGame()
  }
  // Legacy play-again (overlay "Close") returned to idle (overlay hidden,
  // buttons reset); it never auto-restarted.
  const resetRun = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as EvaderStats | undefined

  return (
    <GameScreen
      gameId="evader"
      title="Evader"
      description="Move in all directions to collect coins (+100) and avoid bombs (-100) in 60 seconds!"
      icon="🚀"
      board={
        <div className="relative">
          <div
            ref={boardRef}
            id="game-canvas-container"
            className="bg-black/30 rounded-lg"
          />

          {/* Game Status Message (legacy hidden-by-default overlay) */}
          <div
            id="game-status"
            className="hidden absolute inset-0 items-center justify-center bg-black/70 rounded-lg"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🚀</div>
              <div
                className="text-xl font-mono font-bold mb-2 cetus-wordmark cetus-wordmark--glow"
                style={{ fontFamily: 'var(--cetus-display-font)' }}
              >
                EVADER
              </div>
              <div className="text-cetus-ink-muted">
                Click the button below to start!
              </div>
            </div>
          </div>

          {/* Error Message (hidden by default) */}
          <div
            id="game-error"
            className="hidden absolute inset-0 items-center justify-center bg-black/70 rounded-lg"
          >
            <div className="text-center">
              <div
                id="game-error-title"
                className="text-red-400 text-xl mb-2"
              ></div>
              <div
                id="game-error-message"
                className="text-cetus-ink-muted text-sm"
              ></div>
            </div>
          </div>
        </div>
      }
      statsProps={{
        score: snapshot.score,
        time: snapshot.timeRemaining,
        initialTime: INITIAL_TIME,
      }}
      controls={
        /* Legacy custom controls card: #stop-btn acts as the end button;
           there is no #end-btn (frozen e2e deviation). */
        <Card variant="glass" className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex space-x-3">
              <Button
                id="start-btn"
                variant="primary"
                style={running ? { display: 'none' } : undefined}
                onClick={startRun}
              >
                Start Game
              </Button>
              <Button
                id="stop-btn"
                variant="outline"
                style={running ? undefined : { display: 'none' }}
                onClick={handleStop}
              >
                End Game
              </Button>
            </div>

            {/* Touch / pointer D-pad for mobile devices */}
            <div
              id="dpad"
              className="grid grid-cols-3 gap-2 select-none"
              style={{
                gridTemplateAreas: "'. up .' 'left . right' '. down .'",
              }}
            >
              <button
                type="button"
                data-key="ArrowUp"
                aria-label="Move up"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'up' }}
              >
                ↑
              </button>
              <button
                type="button"
                data-key="ArrowLeft"
                aria-label="Move left"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'left' }}
              >
                ←
              </button>
              <button
                type="button"
                data-key="ArrowRight"
                aria-label="Move right"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'right' }}
              >
                →
              </button>
              <button
                type="button"
                data-key="ArrowDown"
                aria-label="Move down"
                className="dpad-btn"
                tabIndex={-1}
                style={{ gridArea: 'down' }}
              >
                ↓
              </button>
            </div>
          </div>
        </Card>
      }
      sidebarExtras={
        <>
          {/* Current Session Stats */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SESSION
            </h3>
            <div className="flex justify-center space-x-6 text-sm">
              <div className="text-center">
                <div className="text-cetus-ink-muted">Coins</div>
                <div id="coins-collected" className="text-green-400 font-bold">
                  {snapshot.projected.coins}
                </div>
              </div>
              <div className="text-center">
                <div className="text-cetus-ink-muted">Bombs Hit</div>
                <div id="bombs-hit" className="text-red-400 font-bold">
                  {snapshot.projected.bombs}
                </div>
              </div>
            </div>
          </Card>

          {/* Game Rules */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ GAME RULES
            </h3>
            <div className="space-y-3 text-sm text-cetus-ink">
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Collect coins for +100 points</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-red-400">✗</span>
                <span>Avoid bombs (-100 points)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-cetus-accent">⏱</span>
                <span>60 second time limit</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-purple-400">📊</span>
                <span>2:1 bomb to coin ratio</span>
              </div>
            </div>
          </Card>

          {/* Scoring System */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-3 text-sm text-cetus-ink">
              <div className="flex justify-between items-center">
                <span className="text-green-400">Collect Coin:</span>
                <span className="font-bold">+100 pts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-red-400">Hit Bomb:</span>
                <span className="font-bold">-100 pts</span>
              </div>
              <div className="border-t border-cetus-hairline pt-3 mt-3">
                <div className="text-cetus-ink-muted text-xs mb-2">
                  Strategy Tips:
                </div>
                <div className="text-xs space-y-1">
                  <div>• Time your movements</div>
                  <div>• Watch patterns</div>
                  <div>• Stay centered</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Controls */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ CONTROLS
            </h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Move Up:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  ↑ / W
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Move Down:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  ↓ / S
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Move Left:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  ← / A
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Move Right:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  → / D
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Start Game:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Button
                </Badge>
              </div>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        defaultTitle: "TIME'S UP!",
        buttonText: 'Close',
        onButtonClick: resetRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Coins Collected:{' '}
            <span id="final-coins" className="text-cetus-accent">
              {resultStats?.coinsCollected ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Bombs Hit:{' '}
            <span id="final-bombs" className="text-red-400">
              {resultStats?.bombsHit ?? 0}
            </span>
          </div>
        </>
      }
    />
  )
}
