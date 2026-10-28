import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import type { QuickMathStats } from '@cetus/games/quick-math/game'
import { GameScreen } from '@/components/games/GameScreen'
import type { QuickMathInitResult } from '@/lib/games/quick-math/init'

/**
 * Quick Math displays no per-state badge fields React projects: the score /
 * time badges and the overlay final stats come from the session snapshot,
 * and the board-embedded session counters stay renderer-written (Sudoku's
 * #game-time precedent). The projector keeps a stable empty reference.
 */
interface QuickMathProjected {
  marker?: never
}

const EMPTY_PROJECTED: QuickMathProjected = {}

function createQuickMathProjector() {
  return (_state: BaseGameState): QuickMathProjected => EMPTY_PROJECTED
}

type WindowWithQuickMathGame = Window & {
  quickMathGame?: QuickMathInitResult
}

const INITIAL_TIME = 60

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_QUICK_MATH_SNAPSHOT: GameSessionSnapshot<QuickMathProjected> = {
  status: 'idle',
  score: 0,
  timeRemaining: INITIAL_TIME,
  projected: EMPTY_PROJECTED,
  result: null,
}

/**
 * Quick Math route island (HPA-393 Stage 2). React owns the shared buttons
 * and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.quickMathGame`. The answer input/submit button and the question
 * display stay initializer-driven (the QuickMathRenderer enables/focuses
 * them per question and disables them on end — bespoke input UX preserved
 * byte-for-byte); the board-embedded session counters also stay
 * renderer-written. Teardown disposes the session, runs the initializer
 * cleanup once and clears the debug handle only if it still points at this
 * instance.
 */
export default function QuickMathScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<QuickMathInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<QuickMathProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_QUICK_MATH_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<QuickMathProjected> | null = null
    let init: QuickMathInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initQuickMathFramework } =
        await import('@/lib/games/quick-math/init')
      if (disposed) {
        return
      }
      try {
        const result = await initQuickMathFramework(container)
        if (disposed) {
          result.cleanup()
          return
        }
        init = result
        initRef.current = result
        createdSession = createBaseGameSession(
          result.game,
          createQuickMathProjector()
        )
        ;(window as WindowWithQuickMathGame).quickMathGame = result
        setSession(createdSession)
      } catch (error) {
        console.error('Failed to initialize Quick Math game:', error)
        const questionEl = document.getElementById('question')
        if (questionEl) {
          questionEl.textContent = 'Failed to load game'
        }
        const inputEl = document.getElementById(
          'answer-input'
        ) as HTMLInputElement | null
        if (inputEl) {
          inputEl.placeholder = 'Game unavailable'
        }
        const submitBtn = document.getElementById(
          'submit-answer'
        ) as HTMLButtonElement | null
        if (submitBtn) {
          submitBtn.disabled = true
        }
      }
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithQuickMathGame).quickMathGame
      if (debugHandle === init) {
        delete (window as WindowWithQuickMathGame).quickMathGame
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
    void initRef.current?.game.end()
  }
  // Legacy play-again reset to idle (game.reset()); it never auto-restarted.
  const resetRun = () => {
    actions.reset()
  }

  const resultStats = snapshot.result?.stats as QuickMathStats | undefined

  return (
    <GameScreen
      gameId="quick-math"
      title="Quick Math"
      description="Solve as many math problems as you can in 60 seconds!"
      icon="🧮"
      board={
        <div
          ref={boardRef}
          id="quick-math-container"
          className="p-8 w-full max-w-lg"
        >
          <div className="flex flex-col items-center space-y-6">
            {/* Question Display */}
            <div className="text-center mb-6">
              <div
                className="text-6xl font-bold text-white mb-4 min-h-20 flex items-center justify-center cetus-wordmark cetus-wordmark--glow"
                style={{ fontFamily: 'var(--cetus-display-font)' }}
              >
                <span id="question">Ready?</span>
              </div>
              <div className="text-lg text-cetus-ink-muted">
                What's the answer?
              </div>
            </div>

            {/* Answer Input (enabled/focused/disabled by the renderer) */}
            <div className="w-full max-w-xs">
              <input
                id="answer-input"
                type="text"
                className="w-full px-4 py-3 text-2xl font-mono text-center bg-black/50 border-2 border-cetus-hairline rounded-lg focus:border-cetus-accent focus:outline-none text-white placeholder-cetus-ink-muted disabled:opacity-50"
                placeholder="Enter answer"
                disabled
                autoComplete="off"
              />
            </div>

            {/* Submit Button (enabled/disabled by the renderer) */}
            <Button id="submit-answer" variant="primary" size="lg" disabled>
              Submit Answer
            </Button>

            {/* Current Session Stats (renderer-written) */}
            <div className="flex space-x-6 text-sm mt-4">
              <div className="text-center">
                <div className="text-cetus-ink-muted">Questions</div>
                <div id="current-questions" className="text-white font-bold">
                  0
                </div>
              </div>
              <div className="text-center">
                <div className="text-cetus-ink-muted">Correct</div>
                <div id="current-correct" className="text-green-400 font-bold">
                  0
                </div>
              </div>
              <div className="text-center">
                <div className="text-cetus-ink-muted">Score</div>
                <div id="current-score" className="text-cetus-accent font-bold">
                  0
                </div>
              </div>
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
        /* Control card mirroring GameControls (showPause/showReset false,
           same markup) so #start-btn can START disabled: the island owns
           the run only after its async mount (dynamic import + renderer
           init), so an eager pre-hydration click would be silently lost —
           the gate makes Playwright's actionability wait deterministic
           (Mine Grid precedent). */
        <Card variant="glass" className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex space-x-2">
              <Button
                id="start-btn"
                variant="primary"
                size="sm"
                disabled={!session}
                style={running ? { display: 'none' } : undefined}
                onClick={startRun}
              >
                Start Game
              </Button>
              <Button
                id="end-btn"
                variant="outline"
                size="sm"
                style={running ? undefined : { display: 'none' }}
                onClick={handleEnd}
              >
                End Game
              </Button>
            </div>
          </div>
        </Card>
      }
      sidebarExtras={
        <>
          {/* Game Rules */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ GAME RULES
            </h3>
            <div className="space-y-3 text-sm text-cetus-ink">
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Solve math problems as fast as you can</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>60 seconds to get the highest score</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Each correct answer = 20 points</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Numbers range from 1 to 999</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Addition and subtraction only</span>
              </div>
            </div>
          </Card>

          {/* Tips */}
          <Card variant="glass" className="p-6">
            <h3 className="font-mono text-sm tracking-wide text-cetus-accent mb-4">
              ▸ TIPS
            </h3>
            <div className="space-y-3 text-sm text-cetus-ink">
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400 mt-0.5">💡</span>
                <span>Use mental math techniques for speed</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400 mt-0.5">💡</span>
                <span>Press Enter to submit your answer quickly</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400 mt-0.5">💡</span>
                <span>Don't worry about mistakes - speed matters!</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-yellow-400 mt-0.5">💡</span>
                <span>All subtraction results are positive</span>
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
                <span className="text-cetus-ink-muted">Submit Answer:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Enter
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Numbers Only:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  0-9
                </Badge>
              </div>
              <div className="pt-2 border-t border-cetus-hairline">
                <div className="text-cetus-ink-muted text-xs">
                  💡 Type your answer and press Enter for fastest gameplay
                </div>
              </div>
            </div>
          </Card>
        </>
      }
      overlayProps={{
        open: snapshot.status === 'finished',
        score: snapshot.result?.score ?? 0,
        defaultTitle: "TIME'S UP!",
        onButtonClick: resetRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Questions Answered:{' '}
            <span id="total-questions" className="text-cetus-accent">
              {resultStats?.totalQuestions ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Accuracy:{' '}
            <span id="accuracy" className="text-green-400">
              {resultStats ? `${resultStats.accuracy}%` : '0%'}
            </span>
          </div>
        </>
      }
    />
  )
}
