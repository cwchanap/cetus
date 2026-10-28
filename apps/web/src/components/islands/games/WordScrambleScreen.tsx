import { useEffect, useRef, useState } from 'react'
import {
  createBaseGameSession,
  useGameSession,
  type GameSession,
  type GameSessionSnapshot,
} from '@cetus/app-core'
import { Badge, Button, Card } from '@cetus/ui'
import type { BaseGameState } from '@cetus/games'
import type { WordScrambleStats } from '@cetus/games/word-scramble/frameworkTypes'
import { GameScreen } from '@/components/games/GameScreen'
import type { WordScrambleInitResult } from '@/lib/games/word-scramble/initFramework'

/**
 * Word Scramble displays no per-state badge fields React projects: the
 * score / time badges and the overlay final stats come from the session
 * snapshot, while the scrambled word, the answer input/submit/skip state
 * and the board-embedded session counters stay initializer-driven
 * (Quick Math precedent). The projector keeps a stable empty reference.
 */
interface WordScrambleProjected {
  marker?: never
}

const EMPTY_PROJECTED: WordScrambleProjected = {}

function createWordScrambleProjector() {
  return (_state: BaseGameState): WordScrambleProjected => EMPTY_PROJECTED
}

type WindowWithWordScrambleGame = Window & {
  wordScrambleGame?: WordScrambleInitResult
}

const INITIAL_TIME = 60

/** Stable null-session default so SSR markup matches the legacy route. */
const IDLE_WORD_SCRAMBLE_SNAPSHOT: GameSessionSnapshot<WordScrambleProjected> =
  {
    status: 'idle',
    score: 0,
    timeRemaining: INITIAL_TIME,
    projected: EMPTY_PROJECTED,
    result: null,
  }

/**
 * Word Scramble route island (HPA-393 Stage 2). React owns the shared
 * buttons and overlay via `useGameSession`; the effect imports the browser
 * initializer, mounts it on the board ref and publishes
 * `window.wordScrambleGame`. The word input, submit/skip buttons and the
 * scrambled-word display stay initializer-driven (enable/focus per
 * challenge, disable on end, Enter-to-submit and border feedback preserved
 * byte-for-byte). Teardown disposes the session, runs the initializer
 * cleanup (button/keyboard/unload listeners) once and clears the debug
 * handle only if it still points at this instance.
 */
export default function WordScrambleScreen() {
  const boardRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<WordScrambleInitResult | null>(null)
  const [session, setSession] =
    useState<GameSession<WordScrambleProjected> | null>(null)
  const { snapshot, actions } = useGameSession(
    session,
    IDLE_WORD_SCRAMBLE_SNAPSHOT
  )

  useEffect(() => {
    let disposed = false
    let createdSession: GameSession<WordScrambleProjected> | null = null
    let init: WordScrambleInitResult | null = null

    const mount = async () => {
      const container = boardRef.current
      if (!container) {
        return
      }
      const { initWordScrambleGameFramework } =
        await import('@/lib/games/word-scramble/initFramework')
      if (disposed) {
        return
      }
      try {
        const result = await initWordScrambleGameFramework(container)
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
          createWordScrambleProjector()
        )
        ;(window as WindowWithWordScrambleGame).wordScrambleGame = result
        setSession(createdSession)
      } catch (error) {
        console.error('Failed to initialize Word Scramble game:', error)
      }
    }
    void mount()

    return () => {
      disposed = true
      createdSession?.dispose()
      init?.cleanup()
      initRef.current = null
      const debugHandle = (window as WindowWithWordScrambleGame)
        .wordScrambleGame
      if (debugHandle === init) {
        delete (window as WindowWithWordScrambleGame).wordScrambleGame
      }
    }
  }, [])

  const running = snapshot.status === 'running' || snapshot.status === 'paused'
  // BaseGame.start() clears a completed run itself, so a single start
  // covers both first run and post-game-over restart (legacy start handler
  // did reset()+start() — equivalent on a finished run).
  const startRun = () => {
    actions.start()
  }
  const handleEnd = () => {
    void initRef.current?.endGame()
  }
  // Legacy play-again restarted immediately (reset + start).
  const restartRun = () => {
    initRef.current?.restart()
  }

  const resultStats = snapshot.result?.stats as WordScrambleStats | undefined

  return (
    <GameScreen
      gameId="word-scramble"
      title="Word Scramble"
      description="Unscramble words as fast as you can in 60 seconds!"
      icon="🔤"
      board={
        <div ref={boardRef} className="p-8 w-full max-w-lg">
          <div className="flex flex-col items-center space-y-6">
            {/* Scrambled Word Display */}
            <div className="text-center mb-6">
              <div className="text-lg text-cetus-ink-muted mb-2">
                Unscramble this word:
              </div>
              <div
                className="text-6xl font-bold text-white mb-4 min-h-20 flex items-center justify-center cetus-wordmark cetus-wordmark--glow"
                style={{ fontFamily: 'var(--cetus-display-font)' }}
              >
                <span id="scrambled-word">READY?</span>
              </div>
              <div className="text-sm text-cetus-ink-muted">
                <span
                  id="word-difficulty"
                  className="px-2 py-1 rounded bg-slate-800"
                ></span>
              </div>
            </div>

            {/* Answer Input (enabled/focused/disabled by the initializer) */}
            <div className="w-full max-w-xs">
              <input
                id="answer-input"
                type="text"
                className="w-full px-4 py-3 text-2xl font-mono text-center bg-black/50 border-2 border-cetus-hairline rounded-lg focus:border-cetus-accent focus:outline-none text-white placeholder-cetus-ink-muted disabled:opacity-50 transition-colors"
                placeholder="Your answer"
                disabled
                autoComplete="off"
              />
            </div>

            {/* Submit / Skip Buttons (enabled/disabled by the initializer) */}
            <div className="flex space-x-3">
              <Button id="submit-answer" variant="primary" size="lg" disabled>
                Submit Answer
              </Button>
              <Button id="skip-word" variant="outline" size="lg" disabled>
                Skip Word
              </Button>
            </div>

            {/* Current Session Stats (initializer-written) */}
            <div className="flex space-x-6 text-sm mt-4">
              <div className="text-center">
                <div className="text-cetus-ink-muted">Words</div>
                <div id="current-words" className="text-white font-bold">
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
      controlsProps={{
        showPause: false,
        showReset: false,
        running,
        onStart: startRun,
        onEnd: handleEnd,
      }}
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
                <span>Unscramble words as fast as you can</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>60 seconds to achieve the highest score</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Easy words = 10 points, Medium = 20, Hard = 30</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Quick answers earn bonus points</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400">✓</span>
                <span>Skip words if you're stuck</span>
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
                <span className="text-green-400">
                  Easy Words (3-4 letters):
                </span>
                <span className="font-bold">10 pts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-yellow-400">
                  Medium Words (5-6 letters):
                </span>
                <span className="font-bold">20 pts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-red-400">Hard Words (7+ letters):</span>
                <span className="font-bold">30 pts</span>
              </div>
              <div className="border-t border-cetus-hairline pt-3 mt-3">
                <div className="text-cetus-ink-muted text-xs mb-2">
                  Speed Bonuses:
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cetus-accent">Under 3 seconds:</span>
                  <span className="font-bold">+10 pts</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cetus-accent">Under 5 seconds:</span>
                  <span className="font-bold">+5 pts</span>
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
                <span className="text-cetus-ink-muted">Submit Answer:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Enter
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Skip Word:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  Button
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-cetus-ink-muted">Letters Only:</span>
                <Badge variant="outline" className="px-2 py-1 text-xs">
                  A-Z
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
        onButtonClick: restartRun,
      }}
      finalStats={
        <>
          <div className="text-lg text-cetus-ink">
            Words Attempted:{' '}
            <span id="total-words" className="text-cetus-accent">
              {resultStats?.totalWords ?? 0}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Accuracy:{' '}
            <span id="accuracy" className="text-green-400">
              {resultStats ? `${Math.round(resultStats.accuracy)}%` : '0%'}
            </span>
          </div>
          <div className="text-lg text-cetus-ink">
            Longest Word:{' '}
            <span id="longest-word" className="text-purple-400">
              {resultStats?.longestWord || 'None'}
            </span>
          </div>
        </>
      }
    />
  )
}
