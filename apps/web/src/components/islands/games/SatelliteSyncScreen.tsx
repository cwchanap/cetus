import { useEffect, useRef, useState } from 'react'
import {
  createHandleSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
  type HandleSessionHandlers,
} from '@cetus/app-core'
import { Button, Card } from '@cetus/ui'
import type { BaseGameStats } from '@cetus/games'
import { SATELLITE_SYNC_LEVELS } from '@cetus/games/satellite-sync/levels'
import { GameScreen } from '@/components/games/GameScreen'
import type { SatelliteSyncHandle } from '@/lib/games/satellite-sync/init'
import { cn } from '@/lib/utils'

type WindowWithSatelliteSyncGame = Window & {
  satelliteSyncGame?: SatelliteSyncHandle
}

interface SatelliteSyncProjected {
  level: number
  multiplier: number
}

const INITIAL_TIME = 60

/** Overlay headlines byte-equal to the legacy initializer branches. */
const WIN_TITLE = 'MISSION COMPLETE!'
const FAIL_TITLE = "TIME'S UP!"

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_SATELLITE_SNAPSHOT: GameSessionSnapshot<SatelliteSyncProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: { level: 1, multiplier: 1 },
  result: null,
}

/**
 * Satellite Sync route island (HPA-393 Stage 3.2, HANDLE-game pattern).
 * React owns the HUD (score/time/level/combo), start/end pair, error
 * surface and overlay; the effect imports the browser initializer,
 * mounts it on the board ref with callbacks that drive the
 * `createHandleSession` handlers, and publishes `window.satelliteSyncGame`.
 * The Pixi board, pointer/keyboard aiming and level progression stay
 * imperative and `saveGameScore` inside the initializer keeps owning
 * persistence plus achievement/challenge toasts — the session's end
 * result is display-only. The legacy end button fires no game callback,
 * so the island drives the idle transition via the seam's `onIdle`.
 * Teardown disposes the session, runs the handle cleanup once and clears
 * the debug handle only if it still points at this instance.
 */
export default function SatelliteSyncScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<SatelliteSyncHandle | null>(null)
  const handlersRef =
    useRef<HandleSessionHandlers<SatelliteSyncProjected> | null>(null)
  // Reference-stable projected object: reallocate only when the level or
  // combo multiplier actually changes (handle-session setProjected
  // compares by reference to keep no-change bursts from notifying).
  const projectedRef = useRef<SatelliteSyncProjected>({
    level: 1,
    multiplier: 1,
  })
  const [session, setSession] =
    useState<GameSession<SatelliteSyncProjected> | null>(null)
  const [pending, setPending] = useState(false)
  const [overlay, setOverlay] = useState<{ title: string } | null>(null)
  // Legacy error surface shows the message only (the "Score Not Saved"
  // title is dropped) as an inline banner beneath the board.
  const [error, setError] = useState<{ message: string } | null>(null)
  const { snapshot } = useGameSession(session, IDLE_SATELLITE_SNAPSHOT)

  // Legacy combo resets to ×1 on onComboReset, run end (win/fail) and the
  // manual stop. (Game start and level clears reset it inline below, where
  // they also touch the level value.) Level advances to min(level + 1,
  // level count) on a clear — byte-equal to the deleted init DOM write.
  const resetMultiplier = () => {
    if (projectedRef.current.multiplier !== 1) {
      projectedRef.current = { ...projectedRef.current, multiplier: 1 }
    }
    handlersRef.current?.setProjected(projectedRef.current)
  }

  useEffect(() => {
    let disposed = false
    let handle: SatelliteSyncHandle | null = null
    const bundle = createHandleSession<SatelliteSyncProjected>({
      capabilities: { pausable: false, resettable: false },
      snapshot: IDLE_SATELLITE_SNAPSHOT,
    })

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initializeSatelliteSync } =
        await import('@/lib/games/satellite-sync/init')
      if (disposed) {
        return
      }
      try {
        handle = await initializeSatelliteSync(container, {
          onGameStart: () => {
            bundle.handlers.onStart()
            setOverlay(null)
            setError(null)
          },
          onTimeUpdate: t => {
            bundle.handlers.onTime?.(t)
          },
          onScoreUpdate: score => {
            bundle.handlers.onScore?.(score)
          },
          onLock: info => {
            if (projectedRef.current.multiplier !== info.multiplier) {
              projectedRef.current = {
                ...projectedRef.current,
                multiplier: info.multiplier,
              }
            }
            bundle.handlers.setProjected(projectedRef.current)
          },
          onComboReset: () => {
            resetMultiplier()
          },
          onLevelClear: level => {
            const nextLevel = Math.min(level + 1, SATELLITE_SYNC_LEVELS.length)
            if (
              projectedRef.current.level !== nextLevel ||
              projectedRef.current.multiplier !== 1
            ) {
              projectedRef.current = { level: nextLevel, multiplier: 1 }
            }
            bundle.handlers.setProjected(projectedRef.current)
          },
          onFail: (_level, finalScore) => {
            resetMultiplier()
            bundle.handlers.onEnd({
              score: finalScore,
              // Display-only projection into the session result shape;
              // never re-submitted, never a toast source. The legacy
              // overlay showed only the score, so timeElapsed is unknown.
              stats: {
                finalScore,
                timeElapsed: 0,
                gameCompleted: false,
              } satisfies BaseGameStats,
            })
            setOverlay({ title: FAIL_TITLE })
          },
          onWin: finalScore => {
            resetMultiplier()
            bundle.handlers.onEnd({
              score: finalScore,
              stats: {
                finalScore,
                timeElapsed: 0,
                gameCompleted: true,
              } satisfies BaseGameStats,
            })
            setOverlay({ title: WIN_TITLE })
          },
          onError: (_title, message) => {
            // Legacy semantics: show the message banner; the overlay (if
            // open from a just-finished run) stays up underneath.
            setError({ message })
          },
        })
      } catch (error) {
        if (!disposed) {
          // Legacy init-failure message, byte-equal including the
          // non-Error fallback.
          setError({
            message:
              error instanceof Error
                ? error.message
                : 'Failed to initialize the game. Please refresh the page.',
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
      ;(window as WindowWithSatelliteSyncGame).satelliteSyncGame = handle
      setSession(bundle.session)
    }
    void mount()

    return () => {
      disposed = true
      bundle.session.dispose()
      initRef.current?.cleanup()
      initRef.current = null
      handlersRef.current = null
      const debugHandle = (window as WindowWithSatelliteSyncGame)
        .satelliteSyncGame
      if (debugHandle === handle) {
        delete (window as WindowWithSatelliteSyncGame).satelliteSyncGame
      }
    }
  }, [])

  const running = snapshot.status === 'running'

  // Legacy start click: hide the start button synchronously (double-click
  // guard while Pixi setup is pending) and reset level + combo — the
  // initializer used to write those values at the end of start().
  const startGame = async () => {
    const handle = initRef.current
    if (!handle) {
      return
    }
    projectedRef.current = { level: 1, multiplier: 1 }
    handlersRef.current?.setProjected(projectedRef.current)
    setPending(true)
    try {
      await handle.start()
    } catch (error) {
      setError({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to start the game. Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  // Legacy end click: stop the run and return to the pre-start prompt.
  // The game fires no callback on a manual stop, so drive the idle
  // transition here; level keeps its value (only the combo resets).
  const stopGame = () => {
    initRef.current?.stop()
    resetMultiplier()
    handlersRef.current?.onIdle?.()
  }

  // Legacy play-again click: close overlay + error, prompt returns via
  // the not-running state. Final stats keep their last values until the
  // next end (legacy behavior).
  const playAgain = () => {
    setOverlay(null)
    setError(null)
  }

  return (
    <GameScreen
      gameId="satellite-sync"
      title="Satellite Sync"
      description="Drag each satellite beam onto its matching target to lock on before the timer expires!"
      icon="🛰️"
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
              <div className="text-6xl mb-4">🛰️</div>
              <div
                className="text-xl font-mono font-bold mb-2 cetus-wordmark cetus-wordmark--glow"
                style={{ fontFamily: 'var(--cetus-display-font)' }}
              >
                SATELLITE SYNC
              </div>
              <div className="text-cetus-ink-muted">
                Press Start to begin the mission!
              </div>
            </div>
          </div>

          {/* Legacy inline error banner: message only, no title element. */}
          <div
            id="game-error"
            className={cn(
              'text-sm text-amber-400 bg-amber-950/40 border border-amber-700/50 rounded-md px-3 py-2 text-center',
              error === null && 'hidden'
            )}
          >
            {error?.message}
          </div>
        </div>
      }
      statsProps={{
        score: snapshot.score,
        time: snapshot.timeRemaining,
        initialTime: INITIAL_TIME,
        children: (
          <>
            <div className="font-mono text-cetus-accent border border-cetus-hairline rounded-lg px-4 py-2">
              Level: <span id="level">{snapshot.projected.level}</span>
            </div>
            <div className="font-mono text-cetus-accent border border-cetus-hairline rounded-lg px-4 py-2">
              Combo: <span id="combo">×{snapshot.projected.multiplier}</span>
            </div>
          </>
        ),
      }}
      controls={
        <Card variant="glass" className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex space-x-2">
              {/* The legacy start click hid the button synchronously while
                  setup was pending — both buttons hidden during that
                  window, so the shared GameControls tri-state can't express
                  it and the pair is styled directly. */}
              <Button
                id="start-btn"
                variant="primary"
                size="sm"
                style={running || pending ? { display: 'none' } : undefined}
                onClick={startGame}
              >
                Start Game
              </Button>
              <Button
                id="end-btn"
                variant="outline"
                size="sm"
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
              <li>• Drag a satellite to aim its beam</li>
              <li>• Release near a matching-color target to lock on</li>
              <li>• Asteroids block the beam — find a clear path</li>
              <li>• Lock targets quickly to build a combo multiplier</li>
              <li>• Clear every target before the timer hits zero</li>
            </ul>
          </Card>

          {/* Scoring */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Lock:</span>
                <span>100 × combo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Combo:</span>
                <span>+0.5 per chain (max ×3)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Level clear:</span>
                <span>250 × level</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Time bonus:</span>
                <span>×10 / sec left</span>
              </div>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: overlay !== null,
        score: snapshot.result?.score ?? 0,
        defaultTitle: overlay?.title ?? WIN_TITLE,
        buttonText: 'Play Again',
        onButtonClick: playAgain,
      }}
    />
  )
}
