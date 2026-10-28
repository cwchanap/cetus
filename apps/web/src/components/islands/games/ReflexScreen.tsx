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
  ReflexState,
  ReflexStats,
} from '@cetus/games/reflex/frameworkTypes'
import { GameScreen } from '@/components/games/GameScreen'
import type { ReflexInitResult } from '@/lib/games/reflex/initFramework'

interface ReflexProjected {
  coins: number
  bombs: number
  accuracy: number
}

type WindowWithReflexGame = Window & {
  reflexGame?: ReflexInitResult
}

const INITIAL_TIME = 60

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_REFLEX_SNAPSHOT: GameSessionSnapshot<ReflexProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: { coins: 0, bombs: 0, accuracy: 0 },
  result: null,
}

/**
 * Project the Reflex session HUD fields with a stable reference for
 * unchanged values — the session adapter requires it to keep
 * `useSyncExternalStore` from notifying on every fresh `getState()`.
 * ReflexGame emits `state-change` on every click, so the sidebar card
 * updates live (same formula the legacy updateLiveStats used).
 */
function createReflexProjector() {
  let cached: ReflexProjected = IDLE_REFLEX_SNAPSHOT.projected
  return (state: BaseGameState): ReflexProjected => {
    const reflexState = state as ReflexState
    const accuracy =
      reflexState.totalClicks > 0
        ? Math.round(
            (reflexState.correctClicks / reflexState.totalClicks) * 100
          )
        : 0
    if (
      cached.coins !== reflexState.coinsCollected ||
      cached.bombs !== reflexState.bombsHit ||
      cached.accuracy !== accuracy
    ) {
      cached = {
        coins: reflexState.coinsCollected,
        bombs: reflexState.bombsHit,
        accuracy,
      }
    }
    return cached
  }
}

/**
 * Reflex route island (HPA-393 Stage 2). React owns the HUD, the bespoke
 * start/stop control card (#stop-btn replaces #end-btn, mirroring the
 * legacy controls slot) and the overlay via `useGameSession`; the effect
 * imports the browser initializer, mounts it on the board ref and
 * publishes `window.reflexGame`. The Pixi canvas, its pointer handler and
 * the single rAF render loop stay initializer-owned. Teardown disposes the
 * session, runs the initializer cleanup (canvas listener, unload warning,
 * render loop, Pixi renderer) once and clears the debug handle only if it
 * still points at this instance.
 */
export default function ReflexScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<ReflexInitResult | null>(null)
  const [session, setSession] = useState<GameSession<ReflexProjected> | null>(
    null
  )
  const { snapshot, actions } = useGameSession(session, IDLE_REFLEX_SNAPSHOT)

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<ReflexProjected> | null = null
    let init: ReflexInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initReflexGameFramework } =
        await import('@/lib/games/reflex/initFramework')
      if (disposed) {
        return
      }
      try {
        const result = await initReflexGameFramework(container)
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
          createReflexProjector()
        )
        ;(window as WindowWithReflexGame).reflexGame = result
        setSession(createdSession)
      } catch (error) {
        console.error('Failed to initialize Reflex game:', error)
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
      const debugHandle = (window as WindowWithReflexGame).reflexGame
      if (debugHandle === init) {
        delete (window as WindowWithReflexGame).reflexGame
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
  // #stop-btn is Reflex's end button (frozen deviation: there is no
  // #end-btn on this page).
  const handleStop = () => {
    void initRef.current?.endGame()
  }
  // Legacy play-again returned to idle (overlay hidden, buttons reset); it
  // never auto-restarted.
  const resetRun = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as ReflexStats | undefined

  return (
    <GameScreen
      gameId="reflex"
      title="Reflex Coin Collection"
      description="Click coins to score points, avoid bombs! React fast in 60 seconds!"
      icon="⚡"
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
              <div className="text-6xl mb-4">⚡</div>
              <div
                className="text-xl font-mono font-bold mb-2 cetus-wordmark cetus-wordmark--glow"
                style={{ fontFamily: 'var(--cetus-display-font)' }}
              >
                REFLEX TEST
              </div>
              <div className="text-cetus-ink-muted">
                Click the button below to start!
              </div>
            </div>
          </div>

          {/* Pre-rendered error state (safe textContent updates) */}
          <div
            id="game-error"
            className="hidden absolute inset-0 items-center justify-center bg-black/70 rounded-lg"
          >
            <div className="text-center">
              <div className="text-cetus-accent-3 text-xl mb-2">
                Failed to Load Game
              </div>
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
                <div
                  id="coins-collected"
                  className="text-cetus-accent font-bold"
                >
                  {snapshot.projected.coins}
                </div>
              </div>
              <div className="text-center">
                <div className="text-cetus-ink-muted">Bombs Hit</div>
                <div id="bombs-hit" className="text-cetus-accent-3 font-bold">
                  {snapshot.projected.bombs}
                </div>
              </div>
              <div className="text-center">
                <div className="text-cetus-ink-muted">Accuracy</div>
                <div id="accuracy" className="text-cetus-accent font-bold">
                  {snapshot.projected.accuracy}%
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
                <span className="text-cetus-accent">✓</span>
                <span>Click gold coins to earn +10 points</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-cetus-accent-3">✗</span>
                <span>Avoid red bombs (-15 points)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-cetus-accent-2">⚠</span>
                <span>Missed coins cost -5 points</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-cetus-accent">⏱</span>
                <span>Objects appear for 2 seconds</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-cetus-accent-3">📊</span>
                <span>2:1 coin to bomb ratio</span>
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
                <span className="text-cetus-accent">Collect Coin:</span>
                <span className="font-bold">+10 pts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-accent-3">Hit Bomb:</span>
                <span className="font-bold">-15 pts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-accent-2">Miss Coin:</span>
                <span className="font-bold">-5 pts</span>
              </div>
              <div className="border-t border-cetus-hairline pt-3 mt-3">
                <div className="text-cetus-ink-muted text-xs mb-2">
                  Strategy Tips:
                </div>
                <div className="text-xs space-y-1">
                  <div>• Focus on accuracy over speed</div>
                  <div>• Watch for bomb patterns</div>
                  <div>• React quickly to maximize score</div>
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
                <span className="text-cetus-ink-muted">Click Objects:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Mouse
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Start Game:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Button
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Grid Size:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  12×12
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
            <span id="final-bombs" className="text-cetus-accent-3">
              {resultStats?.bombsHit ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Accuracy:{' '}
            <span id="final-accuracy" className="text-cetus-accent">
              {resultStats ? `${Math.round(resultStats.accuracy)}%` : '0%'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Avg Reaction:{' '}
            <span id="avg-reaction" className="text-cetus-accent-3">
              {resultStats
                ? `${Math.round(resultStats.averageReactionTime)}ms`
                : '0ms'}
            </span>
          </div>
        </>
      }
    />
  )
}
