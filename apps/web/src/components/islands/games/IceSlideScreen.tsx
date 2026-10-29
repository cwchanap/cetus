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
import {
  createIceSlideDailyCompetitionKey,
  toIceSlideUtcDateKey,
} from '@cetus/games/ice-slide/daily'
import { ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS } from '@cetus/games/ice-slide/expedition'
import type { IceSlidePlayableMode } from '@cetus/games/ice-slide/types'
import { GameScreen } from '@/components/games/GameScreen'
import { createDailyLeaderboardController } from '@/lib/games/ice-slide/daily-leaderboard'
import type {
  IceSlideHandle,
  IceSlideHudSnapshot,
} from '@/lib/games/ice-slide/init'
import { cn } from '@/lib/utils'

type WindowWithIceSlideGame = Window & {
  iceSlideGame?: IceSlideHandle
}

type IceSlideProjected = IceSlideHudSnapshot

/** Overlay headlines byte-equal to the legacy initializer branches. */
const WIN_TITLE = 'MISSION COMPLETE!'

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_ICE_SLIDE_SNAPSHOT: GameSessionSnapshot<IceSlideProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: 0,
  projected: {
    score: 0,
    level: 1,
    moves: 0,
    crystals: 0,
    timeText: '0',
    levelName: '—',
  },
  result: null,
}

// Mirrors the initializer's HUD clock format (m:ss). Kept local to avoid a
// static init import (which would pull the Pixi renderer into the island
// bundle); the initializer keeps its own copy for the same string.
function formatHudTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const expeditionRiskMultiplier = (
  ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS / 10_000
).toFixed(2)

/**
 * Ice Slide route island (HPA-393 Stage 3.3, HANDLE-game pattern — the
 * heavy multi-mode game). Ownership split follows single-owner-per-node:
 * React owns the shared chrome the initializer used to write through
 * showOverlay/resetButtons/syncHud — the run-result overlay (+ Play
 * Again/New Expedition result actions), the start/end pair, the prompt,
 * and the shared HUD projection (score/level/moves/crystals/time/level
 * name) pushed via onHudSync. The bespoke deep UI stays
 * initializer-imperative over static island markup: mode selector panel
 * behavior (checked/disabled/focus), stage-clear overlay, expedition
 * route-choice overlay + summaries (route-choice and undo button clicks
 * are init-wired tracked listeners — the Signal Switch gate precedent —
 * so their disabled/label writes keep one owner), daily/expedition meta
 * panels, run-final stars, and the per-day leaderboard controller. The mode
 * radios are uncontrolled (defaultChecked from the route's URL param) so
 * no re-render ever fights their imperative writes. `saveGameScore` with
 * its stale-run guards stays the ONE toast owner inside the initializer —
 * the session's end result is display-only. Teardown disposes the
 * session, runs the handle cleanup once and clears the debug handle only
 * if it still points at this instance.
 */
export default function IceSlideScreen({
  initialMode = 'campaign',
}: {
  initialMode?: IceSlidePlayableMode
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<IceSlideHandle | null>(null)
  const handlersRef = useRef<HandleSessionHandlers<IceSlideProjected> | null>(
    null
  )
  // Reference-stable projected object: reallocated only when a HUD value
  // actually changes (handle-session setProjected compares by reference).
  const projectedRef = useRef<IceSlideProjected>({
    score: 0,
    level: 1,
    moves: 0,
    crystals: 0,
    timeText: '0',
    levelName: '—',
  })
  const [session, setSession] = useState<GameSession<IceSlideProjected> | null>(
    null
  )
  // Legacy start click hid #start-btn synchronously (double-click guard
  // while Pixi setup is pending) with the end button staying hidden.
  const [startPending, setStartPending] = useState(false)
  // Legacy Play Again / New Expedition clicks showed the end button while
  // the restart was in flight (start stays hidden).
  const [restartPending, setRestartPending] = useState(false)
  // #game-status prompt: hidden on game start, re-shown only by Change Mode.
  const [promptHidden, setPromptHidden] = useState(false)
  const [overlay, setOverlay] = useState<{
    title: string
    score: number
  } | null>(null)
  // Legacy result actions (syncResultActions): Play Again label and the
  // New Expedition button visibility follow the current run's mode.
  const [playAgainLabel, setPlayAgainLabel] = useState('Play Again')
  const [showNewExpedition, setShowNewExpedition] = useState(false)
  // Synchronous mirrors for legacy-sequence handlers that read state the
  // render hasn't flushed yet (stop's zero-score branch, error guard).
  const overlayOpenRef = useRef(false)
  const runEndedRef = useRef(false)
  // Bespoke imperative nodes (initializer/route-script written, never
  // state-driven): error banner, mode selector, meta panels, result rows.
  const errorRef = useRef<HTMLDivElement>(null)
  const modeSelectorRef = useRef<HTMLFieldSetElement>(null)
  const dailyMetaRef = useRef<HTMLDivElement>(null)
  const expeditionMetaRef = useRef<HTMLDivElement>(null)
  const runFinalRef = useRef<HTMLDivElement>(null)
  const routeChoiceRef = useRef<HTMLDivElement>(null)
  const leaderboardPanelRef = useRef<HTMLDivElement>(null)
  const leaderboardDateRef = useRef<HTMLSpanElement>(null)
  const leaderboardSignedOutRef = useRef<HTMLParagraphElement>(null)
  const leaderboardLoadingRef = useRef<HTMLParagraphElement>(null)
  const leaderboardEmptyRef = useRef<HTMLParagraphElement>(null)
  const leaderboardUnavailableRef = useRef<HTMLParagraphElement>(null)
  const leaderboardRowsRef = useRef<HTMLDivElement>(null)
  const leaderboardRef = useRef<ReturnType<
    typeof createDailyLeaderboardController
  > | null>(null)
  const activeDailyRunKeyRef = useRef<string | undefined>(undefined)
  const { snapshot } = useGameSession(session, IDLE_ICE_SLIDE_SNAPSHOT)

  const showError = (message: string) => {
    const el = errorRef.current
    if (el) {
      el.textContent = message
      el.classList.remove('hidden')
    }
  }

  const hideError = () => {
    errorRef.current?.classList.add('hidden')
  }

  const closeOverlay = () => {
    overlayOpenRef.current = false
    setOverlay(null)
  }

  const getModeRadios = (): HTMLInputElement[] =>
    modeSelectorRef.current
      ? Array.from(
          modeSelectorRef.current.querySelectorAll<HTMLInputElement>(
            'input[name="ice-slide-mode"]'
          )
        )
      : []

  const toPlayableMode = (value: string | null): IceSlidePlayableMode =>
    value === 'daily'
      ? 'daily'
      : value === 'expedition'
        ? 'expedition'
        : 'campaign'

  const readSelectedMode = (): IceSlidePlayableMode =>
    toPlayableMode(getModeRadios().find(radio => radio.checked)?.value ?? null)

  const setModeControlsDisabled = (disabled: boolean) => {
    getModeRadios().forEach(radio => {
      radio.disabled = disabled
    })
    modeSelectorRef.current?.toggleAttribute('aria-disabled', disabled)
  }

  const focusIdleControl = () => {
    const checkedModeRadio = getModeRadios().find(
      radio =>
        radio.checked && !radio.disabled && radio.getClientRects().length > 0
    )
    ;(
      checkedModeRadio ??
      (document.getElementById('start-btn') as HTMLButtonElement | null)
    )?.focus()
  }

  const restoreIdleModeControlsIfNoResult = () => {
    if (overlayOpenRef.current) {
      return
    }
    setModeControlsDisabled(false)
    focusIdleControl()
  }

  const loadDailyLeaderboard = (runKey: string) => {
    activeDailyRunKeyRef.current = runKey
    void leaderboardRef.current?.load(runKey)
  }

  const hideDailyLeaderboard = () => {
    activeDailyRunKeyRef.current = undefined
    leaderboardRef.current?.hide()
  }

  const currentUtcDailyKey = () =>
    createIceSlideDailyCompetitionKey(toIceSlideUtcDateKey(new Date()))

  const syncResultActions = () => {
    const isExpedition =
      initRef.current?.getGame()?.getState().mode === 'expedition'
    setPlayAgainLabel(isExpedition ? 'Retry Seed' : 'Play Again')
    setShowNewExpedition(isExpedition)
  }

  const pushProjected = (patch: Partial<IceSlideProjected>) => {
    const current = projectedRef.current
    const next = { ...current, ...patch }
    const changed =
      next.score !== current.score ||
      next.level !== current.level ||
      next.moves !== current.moves ||
      next.crystals !== current.crystals ||
      next.timeText !== current.timeText ||
      next.levelName !== current.levelName
    if (changed) {
      projectedRef.current = next
      handlersRef.current?.setProjected(next)
    }
  }

  useEffect(() => {
    let disposed = false
    let handle: IceSlideHandle | null = null
    const bundle = createHandleSession<IceSlideProjected>({
      capabilities: { pausable: false, resettable: false },
      snapshot: IDLE_ICE_SLIDE_SNAPSHOT,
    })

    // Legacy mode-radio listeners: the leaderboard follows the selected
    // mode the moment a radio changes (wired at effect scope so cleanup
    // can detach them).
    const modeRadios = Array.from(
      modeSelectorRef.current?.querySelectorAll<HTMLInputElement>(
        'input[name="ice-slide-mode"]'
      ) ?? []
    )
    const onModeChange = () => {
      if (readSelectedMode() === 'daily') {
        loadDailyLeaderboard(currentUtcDailyKey())
      } else {
        hideDailyLeaderboard()
      }
    }
    modeRadios.forEach(radio => {
      radio.addEventListener('change', onModeChange)
    })

    const mount = async () => {
      const container = boardRef.current
      const panel = leaderboardPanelRef.current
      const date = leaderboardDateRef.current
      const signedOut = leaderboardSignedOutRef.current
      const loading = leaderboardLoadingRef.current
      const empty = leaderboardEmptyRef.current
      const unavailable = leaderboardUnavailableRef.current
      const rows = leaderboardRowsRef.current
      if (
        !container ||
        !panel ||
        !date ||
        !signedOut ||
        !loading ||
        !empty ||
        !unavailable ||
        !rows
      ) {
        return
      }
      leaderboardRef.current = createDailyLeaderboardController({
        panel,
        date,
        signedOut,
        loading,
        empty,
        unavailable,
        rows,
      })
      const { initializeIceSlide } = await import('@/lib/games/ice-slide/init')
      if (disposed) {
        return
      }
      try {
        handle = await initializeIceSlide(container, {
          onGameStart: () => {
            bundle.handlers.onStart()
            // Legacy onGameStart toggles: prompt/error/overlay hidden,
            // mode controls locked. restartPending clears once a run is
            // actually live (running dominates the button styles).
            setPromptHidden(true)
            hideError()
            closeOverlay()
            setRestartPending(false)
            setModeControlsDisabled(true)
          },
          onMove: () => {},
          onCrystal: () => {},
          onLevelClear: () => {},
          onHazard: () => {},
          onScoreUpdate: () => {},
          onTimeUpdate: seconds => {
            // Legacy in-run clock: setText('time-remaining', m:ss).
            pushProjected({ timeText: formatHudTime(seconds) })
          },
          onWin: () => {
            // Button reset + result actions moved to onRunEnded below.
          },
          onHudSync: hud => {
            pushProjected(hud)
          },
          onRunEnded: (title, finalScore, completed) => {
            runEndedRef.current = true
            overlayOpenRef.current = true
            setOverlay({ title, score: finalScore })
            bundle.handlers.onEnd({
              score: finalScore,
              // Display-only projection into the session result shape;
              // never re-submitted, never a toast source.
              stats: {
                finalScore,
                timeElapsed: 0,
                gameCompleted: completed,
              } satisfies BaseGameStats,
            })
            syncResultActions()
          },
          onError: (_title, message) => {
            // Legacy route glue: message-only banner, then the failRun
            // button reset (now the island's onIdle) and the mode-control
            // restore guard.
            showError(message)
            bundle.handlers.onIdle?.()
            restoreIdleModeControlsIfNoResult()
          },
          onScoreSaved: gameData => {
            if (
              gameData.mode === 'daily' &&
              gameData.runKey === activeDailyRunKeyRef.current
            ) {
              loadDailyLeaderboard(gameData.runKey)
            }
          },
        })
      } catch (error) {
        if (!disposed) {
          showError(
            error instanceof Error ? error.message : 'Failed to load Ice Slide'
          )
        }
        return
      }
      if (disposed) {
        handle.cleanup()
        return
      }
      initRef.current = handle
      handlersRef.current = bundle.handlers
      ;(window as WindowWithIceSlideGame).iceSlideGame = handle
      setSession(bundle.session)

      // Legacy init() tail: the leaderboard panel follows the preselected
      // mode (radios already reflect initialMode).
      if (readSelectedMode() === 'daily') {
        loadDailyLeaderboard(currentUtcDailyKey())
      } else {
        hideDailyLeaderboard()
      }
    }
    void mount()

    return () => {
      disposed = true
      bundle.session.dispose()
      initRef.current?.cleanup()
      initRef.current = null
      handlersRef.current = null
      leaderboardRef.current = null
      activeDailyRunKeyRef.current = undefined
      for (const radio of Array.from(
        modeSelectorRef.current?.querySelectorAll<HTMLInputElement>(
          'input[name="ice-slide-mode"]'
        ) ?? []
      )) {
        radio.removeEventListener('change', onModeChange)
      }
      const debugHandle = (window as WindowWithIceSlideGame).iceSlideGame
      if (debugHandle === handle) {
        delete (window as WindowWithIceSlideGame).iceSlideGame
      }
    }
    // Mount-once effect (StrictMode-tolerant): the init callback closures
    // read refs, never stale render state.
  }, [])

  const running = snapshot.status === 'running'

  // Legacy start click: hide the start button synchronously (double-click
  // guard while Pixi setup is pending) and lock the mode controls; the
  // end button only appears once the run reports onGameStart.
  const startGame = async () => {
    const handle = initRef.current
    if (!handle) {
      return
    }
    const mode = readSelectedMode()
    setStartPending(true)
    setModeControlsDisabled(true)
    try {
      await handle.start(mode)
      if (mode === 'daily') {
        const runKey = handle.getGame()?.getState().runKey
        if (runKey) {
          loadDailyLeaderboard(runKey)
        }
      } else {
        hideDailyLeaderboard()
      }
      syncResultActions()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to start')
      handlersRef.current?.onIdle?.()
      restoreIdleModeControlsIfNoResult()
    } finally {
      setStartPending(false)
    }
  }

  // Legacy end click: stop the run; a shown result (expedition/daily/
  // scoring campaign stop) already transitioned the session to finished
  // via onRunEnded, so only a local zero-score stop falls back to idle.
  const stopGame = () => {
    runEndedRef.current = false
    initRef.current?.stop()
    syncResultActions()
    if (!runEndedRef.current) {
      handlersRef.current?.onIdle?.()
      restoreIdleModeControlsIfNoResult()
    }
  }

  // Legacy Play Again click: close the overlay, show the end button while
  // the retry starts, then follow the replayed run's mode for the
  // leaderboard.
  const playAgain = async () => {
    closeOverlay()
    setRestartPending(true)
    setModeControlsDisabled(true)
    try {
      await initRef.current?.playAgain()
      if (initRef.current?.getGame()?.getState().mode === 'daily') {
        const runKey = initRef.current.getGame()?.getState().runKey
        if (runKey) {
          loadDailyLeaderboard(runKey)
        }
      } else {
        hideDailyLeaderboard()
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to restart')
      setRestartPending(false)
      handlersRef.current?.onIdle?.()
      restoreIdleModeControlsIfNoResult()
      syncResultActions()
    }
  }

  // Legacy New Expedition click: close the overlay, restart chrome, drop
  // the leaderboard, and draw a fresh seeded expedition run.
  const startNewExpedition = async () => {
    closeOverlay()
    setRestartPending(true)
    setModeControlsDisabled(true)
    hideDailyLeaderboard()
    try {
      await initRef.current?.start('expedition')
    } catch (error) {
      showError(
        error instanceof Error ? error.message : 'Failed to start Expedition'
      )
      setRestartPending(false)
      handlersRef.current?.onIdle?.()
      restoreIdleModeControlsIfNoResult()
    }
  }

  // Legacy Change Mode click: abort an open route choice (its stop may
  // submit/finish the run), then reset every surface back to the idle
  // mode selector.
  const changeMode = () => {
    const routeChoice = routeChoiceRef.current
    if (routeChoice && !routeChoice.classList.contains('hidden')) {
      initRef.current?.stop()
    }
    closeOverlay()
    dailyMetaRef.current?.classList.add('hidden')
    expeditionMetaRef.current?.classList.add('hidden')
    runFinalRef.current?.classList.add('hidden')
    setPromptHidden(false)
    hideError()
    setRestartPending(false)
    handlersRef.current?.onIdle?.()
    setPlayAgainLabel('Play Again')
    setShowNewExpedition(false)
    setModeControlsDisabled(false)
    focusIdleControl()
    if (readSelectedMode() === 'daily') {
      loadDailyLeaderboard(currentUtcDailyKey())
    } else {
      hideDailyLeaderboard()
    }
  }

  return (
    <GameScreen
      gameId="ice-slide"
      title="Ice Slide"
      description="Slide across slippery ice until you hit a wall — reach the goal in the fewest moves!"
      icon="🧊"
      board={
        <div className="w-full max-w-xl space-y-4">
          {/* Mode selector: static, uncontrolled radios — the island
              mutates checked/disabled/focus imperatively (legacy route
              glue); React never re-renders these nodes. */}
          <fieldset
            ref={modeSelectorRef}
            id="ice-slide-mode-selector"
            className="rounded-lg border border-cetus-hairline bg-cetus-surface/70 px-4 py-3"
          >
            <legend className="px-1 font-mono text-xs tracking-wide text-cetus-accent">
              MODE
            </legend>
            <div className="flex flex-col gap-2 text-sm text-cetus-ink sm:flex-row sm:gap-5">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="ice-slide-mode"
                  value="campaign"
                  defaultChecked={initialMode === 'campaign'}
                  className="accent-cetus-accent"
                />
                Campaign
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="ice-slide-mode"
                  value="daily"
                  defaultChecked={initialMode === 'daily'}
                  className="accent-cetus-accent"
                />
                Daily
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="ice-slide-mode"
                  value="expedition"
                  defaultChecked={initialMode === 'expedition'}
                  className="accent-cetus-accent"
                />
                Expedition
              </label>
            </div>
          </fieldset>

          <div className="relative w-full">
            <div
              ref={boardRef}
              id="game-canvas-container"
              className="bg-black/30 rounded-lg min-w-[240px] min-h-[240px] w-full flex items-center justify-center"
            />

            <div
              id="game-status"
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg',
                promptHidden && 'hidden'
              )}
            >
              <div className="text-center">
                <div className="text-6xl mb-4">🧊</div>
                <div
                  className="text-xl font-mono font-bold mb-2 cetus-wordmark cetus-wordmark--glow"
                  style={{ fontFamily: 'var(--cetus-display-font)' }}
                >
                  ICE SLIDE
                </div>
                <div className="text-cetus-ink-muted">
                  Choose a mode, then press Start to begin.
                </div>
              </div>
            </div>

            {/* Legacy message-only error banner (init/route-glue written
                imperatively — not state-driven). */}
            <div
              ref={errorRef}
              id="game-error"
              className="hidden text-sm text-amber-400 bg-amber-950/40 border border-amber-700/50 rounded-md px-3 py-2 text-center mt-2"
            />

            {/* Stage-clear overlay: initializer-imperative (bespoke). */}
            <div
              id="stage-clear-overlay"
              className="absolute inset-0 z-40 hidden flex items-center justify-center bg-black/90 rounded-lg p-4"
            >
              <div className="w-full max-w-md rounded-2xl border border-cetus-accent/50 bg-cetus-surface p-6 text-center shadow-2xl">
                <h2
                  id="stage-clear-title"
                  className="cetus-wordmark cetus-wordmark--glow text-2xl"
                >
                  Stage clear
                </h2>
                <p id="stage-clear-score" className="mt-2 text-cetus-accent">
                  +0
                </p>
                <div className="mt-5 space-y-2 text-left text-sm text-cetus-ink">
                  <div id="stage-clear-clear">— Clear</div>
                  <div id="stage-clear-efficient">— Efficient</div>
                  <div id="stage-clear-bonus">— Bonus</div>
                </div>
                <Button
                  id="stage-clear-continue-btn"
                  type="button"
                  className="mt-6 w-full"
                  size="lg"
                >
                  Continue
                </Button>
              </div>
            </div>

            {/* Expedition route-choice overlay: initializer-imperative. */}
            <div
              ref={routeChoiceRef}
              id="expedition-route-choice-overlay"
              className="absolute inset-0 z-50 hidden flex items-center justify-center rounded-lg bg-black/90 p-4"
            >
              <div className="w-full max-w-md rounded-2xl border border-cetus-accent/50 bg-cetus-surface p-6 text-center shadow-2xl">
                <h2 className="cetus-wordmark cetus-wordmark--glow text-2xl">
                  Choose your route
                </h2>
                <p className="mt-2 text-sm text-cetus-ink-muted">
                  Pick a protocol for the next stage.
                </p>
                <div className="mt-5 grid gap-3">
                  {/* No React onClick: the initializer wires these clicks
                      (tracked listeners) — Signal Switch gate precedent. */}
                  <Button id="expedition-safe-btn" type="button">
                    Safe Cache — Gain 1 Undo charge · next stage ×1.00
                  </Button>
                  <Button id="expedition-risk-btn" type="button">
                    Risk Protocol — Extra bonus objective · next stage ×
                    {expeditionRiskMultiplier}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Daily meta panel: initializer-imperative (bespoke). Same
              classes as Card variant="glass" — a plain div so the ref
              works without Card ref-forwarding plumbing. */}
          <div
            ref={dailyMetaRef}
            id="daily-meta"
            className="hidden rounded-2xl border border-cetus-hairline bg-cetus-surface p-4 backdrop-blur-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="font-mono text-sm text-cetus-accent">
                Daily <span id="daily-date">—</span>
              </div>
              <div id="daily-reset" className="text-xs text-cetus-ink-muted">
                —
              </div>
              <div
                id="daily-stage-progress"
                className="w-full text-xs font-mono text-cetus-ink-muted"
              >
                Stage 1 / 5
              </div>
            </div>
            <div className="mt-3 grid gap-1 text-xs text-cetus-ink-muted sm:grid-cols-3">
              <span id="daily-objective-clear">Clear the stage</span>
              <span id="daily-objective-efficient">Efficient: —</span>
              <span id="daily-objective-bonus">Bonus: —</span>
            </div>
          </div>

          {/* Expedition meta panel: initializer-imperative (bespoke). */}
          <div
            ref={expeditionMetaRef}
            id="expedition-meta"
            className="hidden rounded-2xl border border-cetus-hairline bg-cetus-surface p-4 backdrop-blur-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="font-mono text-sm text-cetus-accent">
                Expedition <span id="expedition-seed">—</span>
              </div>
              <div
                id="expedition-stage-progress"
                className="w-full text-xs font-mono text-cetus-ink-muted"
              >
                Stage 1 / 6
              </div>
            </div>
            <div className="mt-3 grid gap-1 text-xs text-cetus-ink-muted sm:grid-cols-2">
              <span id="expedition-stars">Stars 0 / —</span>
              <span id="expedition-attempts">Falls 0 · Resets 0</span>
            </div>
            <div className="mt-3 grid gap-1 text-xs text-cetus-ink-muted sm:grid-cols-3">
              <span id="expedition-objective-clear">Clear the stage</span>
              <span id="expedition-objective-efficient">Efficient: —</span>
              <span id="expedition-objective-bonus">Bonus: —</span>
            </div>
            {/* No React onClick: init-wired; the initializer imperatively
                toggles this button's disabled state + label. */}
            <Button
              id="expedition-undo-btn"
              type="button"
              variant="outline"
              size="sm"
              disabled
              className="mt-3"
            >
              Undo (0)
            </Button>
          </div>

          {/* Daily leaderboard panel: controller-driven (imperative). */}
          <div
            ref={leaderboardPanelRef}
            id="daily-leaderboard"
            className="hidden rounded-2xl border border-cetus-hairline bg-cetus-surface p-4 backdrop-blur-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-mono text-sm tracking-wide text-cetus-accent">
                ▸ DAILY RANKING
              </h3>
              <span
                ref={leaderboardDateRef}
                id="daily-leaderboard-date"
                className="text-xs text-cetus-ink-muted"
              >
                —
              </span>
            </div>
            <p
              ref={leaderboardSignedOutRef}
              id="daily-leaderboard-signed-out"
              className="hidden mt-2 text-xs text-cetus-ink-muted"
            >
              Sign in to submit a ranked result. You can still view today's
              ranking.
            </p>
            <div aria-live="polite" aria-atomic="true">
              <p
                ref={leaderboardLoadingRef}
                id="daily-leaderboard-loading"
                className="mt-3 text-sm text-cetus-ink-muted"
              >
                Loading ranking…
              </p>
              <p
                ref={leaderboardEmptyRef}
                id="daily-leaderboard-empty"
                className="hidden mt-3 text-sm text-cetus-ink-muted"
              >
                No ranked finishes yet.
              </p>
              <p
                ref={leaderboardUnavailableRef}
                id="daily-leaderboard-unavailable"
                className="hidden mt-3 text-sm text-cetus-ink-muted"
              >
                Ranking is temporarily unavailable.
              </p>
            </div>
            <div
              ref={leaderboardRowsRef}
              id="daily-leaderboard-rows"
              className="hidden mt-3 space-y-2"
            />
          </div>
        </div>
      }
      statsProps={{
        score: snapshot.projected.score,
        showTime: false,
        initialTime: 0,
        children: (
          <>
            {/* Legacy Time badge: GameStats' numeric time prop can't carry
                the m:ss clock string, so the badge is bespoke (same markup,
                idle text '0'). */}
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Time:{' '}
                <span
                  id="time-remaining"
                  className="font-mono text-cetus-accent"
                >
                  {snapshot.projected.timeText}
                </span>
                s
              </span>
            </Badge>
            <div className="font-mono text-cetus-accent border border-cetus-hairline rounded-lg px-4 py-2">
              Level: <span id="level">{snapshot.projected.level}</span>
            </div>
            <div className="font-mono text-cetus-accent border border-cetus-hairline rounded-lg px-4 py-2">
              Moves: <span id="moves">{snapshot.projected.moves}</span>
            </div>
            <div className="font-mono text-cetus-accent border border-cetus-hairline rounded-lg px-4 py-2">
              Crystals: <span id="crystals">{snapshot.projected.crystals}</span>
            </div>
          </>
        ),
      }}
      controls={
        <Card variant="glass" className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex space-x-2">
              {/* The legacy tri-state can't express the pending windows
                  (start: both hidden; restart: start hidden + end shown),
                  so the pair is styled directly. */}
              <Button
                id="start-btn"
                variant="primary"
                size="sm"
                style={
                  running || startPending || restartPending
                    ? { display: 'none' }
                    : undefined
                }
                onClick={startGame}
              >
                Start Game
              </Button>
              <Button
                id="end-btn"
                variant="outline"
                size="sm"
                style={
                  running || restartPending
                    ? { display: 'inline-flex' }
                    : { display: 'none' }
                }
                onClick={stopGame}
              >
                End Game
              </Button>
              <Button
                id="reset-btn"
                variant="outline"
                size="sm"
                onClick={() => initRef.current?.resetLevel()}
              >
                Reset
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
              <li>• Swipe or use arrow keys / WASD to slide</li>
              <li>• You keep sliding on ice until you hit a wall or rock</li>
              <li>• Stop on the green goal to clear the level</li>
              <li>• Avoid red holes — they reset the level</li>
              <li>• Collect cyan crystals for bonus points</li>
              <li>• Reset reloads the current level</li>
            </ul>
          </Card>

          {/* Scoring */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ SCORING
            </h3>
            <div className="space-y-2 text-sm text-cetus-ink">
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Level clear:</span>
                <span>200 × level</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">
                  At/under-par moves:
                </span>
                <span>×25 each step</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Crystal:</span>
                <span>+50</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cetus-ink-muted">Time bonus:</span>
                <span>×5 / sec under 6:00</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-cetus-ink-muted">
              Current sector:{' '}
              <span id="level-name">{snapshot.projected.levelName}</span>
            </p>
          </Card>

          {/* Daily Brief */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ DAILY BRIEF
            </h3>
            <p className="text-sm text-cetus-ink-muted">
              Five seeded stages reset at 00:00 UTC each day.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-cetus-ink-muted">
              <li>• Earn Clear, Efficient, and seeded Bonus stars.</li>
              <li>• Each optional star adds +100 points.</li>
              <li>• Finish the run within the 5:00 completion budget.</li>
              <li>• Play Again retries the same daily run and seed.</li>
            </ul>
          </Card>
        </>
      }
      overlayProps={{
        open: overlay !== null,
        score: overlay?.score ?? 0,
        defaultTitle: overlay?.title ?? WIN_TITLE,
        buttonText: playAgainLabel,
        onButtonClick: () => {
          void playAgain()
        },
      }}
      finalStats={
        <>
          {/* Run-final stars + expedition summary: initializer-imperative
              result rows over static markup (never state-driven). */}
          <div
            ref={runFinalRef}
            id="run-final-stage-result"
            className="hidden text-left text-sm text-cetus-ink"
          >
            <div
              id="run-final-heading"
              className="mb-2 font-mono text-cetus-accent"
            >
              Daily stars
            </div>
            <div id="run-final-clear">— Clear</div>
            <div id="run-final-efficient">— Efficient</div>
            <div id="run-final-bonus">— Bonus</div>
          </div>
          <div
            id="expedition-summary"
            className="hidden mt-4 text-left text-sm text-cetus-ink"
          >
            <div className="mb-2 font-mono text-cetus-accent">
              Expedition summary
            </div>
            <div className="space-y-1 text-xs text-cetus-ink-muted">
              <div>
                Seed:{' '}
                <span
                  id="expedition-summary-seed"
                  className="font-mono text-cetus-ink"
                >
                  —
                </span>
              </div>
              <div id="expedition-summary-progress">0 / 6 stages</div>
              <div id="expedition-summary-stars">0 / 18 stars</div>
              <div>
                Moves: <span id="expedition-summary-moves">0</span>
              </div>
              <div>
                Crystals: <span id="expedition-summary-crystals">0</span>
              </div>
              <div id="expedition-summary-attempts">Falls 0 · Resets 0</div>
              <div>
                Time: <span id="expedition-summary-time">0:00</span>
              </div>
            </div>
          </div>
          {/* Result actions: React-owned (legacy syncResultActions writers
              moved to playAgainLabel/showNewExpedition state). */}
          {/* `flex` (not inline-flex) pairs with `hidden`: Tailwind emits
              display utilities alphabetically, so `.hidden` must outrank the
              base class — inline-flex sorts after hidden and would keep the
              button visible. */}
          <Button
            id="new-expedition-btn"
            type="button"
            variant="outline"
            size="lg"
            className={cn('flex w-full', !showNewExpedition && 'hidden')}
            onClick={() => {
              void startNewExpedition()
            }}
          >
            New Expedition
          </Button>
          <Button
            id="change-mode-btn"
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={changeMode}
          >
            Change Mode
          </Button>
        </>
      }
    />
  )
}
