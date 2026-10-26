import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { UserChallengeProgress } from '@cetus/shared/challenges'
import { Badge } from './ui/badge'
import { Card } from './ui/card'

/**
 * Dashboard daily-missions panel (HPA-379 Stage 4). View props derive
 * directly from the UserChallengeProgress DTO; the reset countdown and
 * refresh prompt are self-contained client behavior (no web services).
 */
export interface DailyMissionsPanelProps {
  challenges: UserChallengeProgress[]
  xp: number
  level: number
  xpProgress: number
  xpToNextLevel: number
  streak: number
  resetIn: number
}

// Difficulty colors
const difficultyColors: Record<string, string> = {
  easy: 'text-cetus-accent',
  medium: 'text-cetus-accent-2',
  hard: 'text-cetus-accent-3',
}

function formatCountdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `Resets in ${pad(hours)}:${pad(mins)}:${pad(secs)}`
}

export function DailyMissionsPanel({
  challenges,
  xp,
  level,
  xpProgress,
  xpToNextLevel,
  streak,
  resetIn,
}: DailyMissionsPanelProps) {
  const [seconds, setSeconds] = useState(resetIn)
  const [showRefreshPrompt, setShowRefreshPrompt] = useState(false)

  // Countdown: tick once per second until the daily reset.
  useEffect(() => {
    if (seconds <= 0) {
      return
    }
    const timer = setTimeout(() => setSeconds(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds])

  useEffect(() => {
    if (seconds === 0) {
      setShowRefreshPrompt(true)
    }
  }, [seconds])

  return (
    <Card variant="glass" className="p-6 mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <h3
            className="text-lg font-bold text-cetus-accent"
            style={{
              fontFamily: 'var(--cetus-display-font)',
              fontWeight: 'var(--cetus-display-weight)',
              fontStyle: 'var(--cetus-display-style)',
            }}
          >
            DAILY MISSIONS
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" size="sm" className="bg-cetus-accent-2/20">
            Level {level}
          </Badge>
          <span
            id="reset-timer"
            className="text-sm text-cetus-ink-muted"
            data-reset-in={resetIn}
          >
            {seconds > 0 ? formatCountdown(seconds) : 'Daily missions reset'}
          </span>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-cetus-ink-muted">XP Progress</span>
          <span className="text-cetus-accent">{xp} XP</span>
        </div>
        <div className="w-full bg-cetus-surface rounded-full h-2 overflow-hidden border border-cetus-hairline">
          <div
            className="h-full bg-cetus-accent transition-all duration-500"
            style={{ width: `${xpProgress}%` }}
          />
        </div>
        <div className="text-xs text-cetus-ink-muted mt-1">
          {xpToNextLevel} XP to Level {level + 1}
        </div>
      </div>

      {/* Challenge List */}
      <div className="space-y-4">
        {challenges.map(challenge => {
          const progress =
            challenge.targetValue && challenge.targetValue > 0
              ? Math.min(
                  100,
                  (challenge.currentValue / challenge.targetValue) * 100
                )
              : 0
          return (
            <div
              key={challenge.challengeId}
              className={`p-4 rounded-xl border transition-all ${
                challenge.completed
                  ? 'bg-cetus-accent/10 border-cetus-accent/30'
                  : 'bg-cetus-surface border border-cetus-hairline hover:border-cetus-accent/30'
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl">{challenge.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">
                      {challenge.name}
                    </span>
                    <span
                      className={`text-xs ${difficultyColors[challenge.difficulty]}`}
                    >
                      {challenge.difficulty.toUpperCase()}
                    </span>
                    {challenge.completed && (
                      <span className="text-green-400 text-sm">✓</span>
                    )}
                  </div>
                  <p className="text-sm text-cetus-ink-muted mb-2">
                    {challenge.description}
                  </p>

                  {!challenge.completed && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-cetus-surface rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-cetus-accent transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-cetus-ink-muted">
                        {challenge.currentValue}/{challenge.targetValue}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={`text-sm font-bold ${challenge.completed ? 'text-green-400' : 'text-cetus-accent'}`}
                  >
                    +{challenge.xpReward} XP
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Streak Display */}
      {streak > 0 && (
        <div className="mt-6 pt-4 border-t border-cetus-hairline flex items-center gap-2">
          <span className="text-orange-400">🔥</span>
          <span className="text-sm text-cetus-ink-muted">
            Challenge Streak:{' '}
            <span className="text-orange-400 font-bold">{streak} days</span>
          </span>
        </div>
      )}

      {/* Refresh prompt when the daily missions have reset. Portaled to
          document.body so `fixed` anchors to the viewport: showRefreshPrompt
          only turns true on the client, so this is SSR-safe. */}
      {showRefreshPrompt &&
        createPortal(
          <div
            id="mission-refresh-toast"
            role="alert"
            className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl bg-cetus-surface border border-cetus-hairline shadow-2xl shadow-cetus-accent/30 p-4 text-white backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">🔄</span>
              <div className="flex-1">
                <p className="font-semibold">Daily missions have reset</p>
                <p className="text-sm text-cetus-ink-muted mt-1">
                  New daily missions are available. Refresh to load the latest
                  set.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    id="mission-refresh-now"
                    className="px-3 py-1.5 rounded-lg bg-cetus-accent text-white text-sm font-semibold hover:bg-cetus-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cetus-accent/50"
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Refresh now
                  </button>
                  <button
                    id="mission-refresh-dismiss"
                    className="px-3 py-1.5 rounded-lg border border-cetus-hairline text-sm text-cetus-ink-muted hover:border-cetus-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cetus-accent/50"
                    type="button"
                    onClick={() => setShowRefreshPrompt(false)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </Card>
  )
}
