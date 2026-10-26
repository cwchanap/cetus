import type { ChallengeUpdatesPayload } from '@cetus/shared/api-dto'
import './bounce-in.css'

/** One completed-challenge entry from the score submission payload. */
export type ChallengeCompleteChallenge =
  ChallengeUpdatesPayload['completedChallenges'][number]

/**
 * Single challenge-complete card (HPA-379 Stage 4). Pure presentation:
 * overlay, queueing and dismissal ownership live in the apps/web
 * AppNotifications island.
 */
export interface ChallengeCompleteCardProps {
  challenge: ChallengeCompleteChallenge
  levelUp: boolean
  newLevel?: number
  onContinue: () => void
}

export function ChallengeCompleteCard({
  challenge,
  levelUp,
  newLevel,
  onContinue,
}: ChallengeCompleteCardProps) {
  const showLevelUp = levelUp && newLevel !== undefined && newLevel !== null

  return (
    <div className="bg-cetus-surface rounded-2xl p-8 border border-cetus-hairline shadow-2xl shadow-cetus-accent/20 text-center animate-bounce-in">
      {/* XP Animation */}
      <div className="mb-4">
        <div className="text-5xl mb-2" id="challenge-icon">
          {challenge.icon}
        </div>
        <div
          className="text-2xl font-bold font-mono text-cetus-accent"
          id="xp-earned"
          aria-live="polite"
          role="status"
        >
          +{challenge.xpReward} XP
        </div>
      </div>

      {/* Challenge Info */}
      <h3
        className="text-xl font-bold text-white mb-2"
        style={{
          fontFamily: 'var(--cetus-display-font)',
          fontWeight: 'var(--cetus-display-weight)',
          fontStyle: 'var(--cetus-display-style)',
        }}
        id="challenge-name"
      >
        {challenge.name}
      </h3>
      <p className="text-cetus-ink-muted mb-6" id="challenge-description">
        {challenge.description}
      </p>

      {/* Level Up Badge (hidden by default) */}
      <div
        id="level-up-badge"
        className={`${showLevelUp ? '' : 'hidden '}mb-4 py-2 px-4 bg-cetus-accent-3 rounded-full inline-block animate-pulse`}
        role="status"
        aria-live="assertive"
      >
        <span className="text-white font-bold">
          🎉 LEVEL UP! Level <span id="new-level">{newLevel ?? 1}</span>
        </span>
      </div>

      {/* Continue button */}
      <div className="mt-6 flex justify-center">
        <button
          id="challenge-continue"
          className="px-5 py-2 rounded-full bg-cetus-accent text-white font-semibold shadow-lg shadow-cetus-accent/40 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cetus-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent transition"
          type="button"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>

      {/* Dismiss hint */}
      <p className="text-cetus-ink-muted text-sm mt-3">
        Click outside or press Esc to continue
      </p>
    </div>
  )
}
