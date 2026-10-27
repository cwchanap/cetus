import { useEffect, useRef, type MouseEvent } from 'react'
import type {
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
} from '@cetus/shared/api-dto'
import { LOGIN_REWARD_CYCLE } from '@cetus/shared/loginRewards'
import { displayFontStyle } from '../lib/styles'
import { cn } from '../lib/utils'
import './login-reward-modal.css'

/**
 * Login-reward modal (HPA-379 Stage 4). Pure presentation: every visible
 * value derives from the @cetus/shared DTOs, and the claim/close actions
 * are owned by the apps/web island that mounts this component.
 */
export interface LoginRewardModalProps {
  status: LoginRewardStatusResponse | null
  open: boolean
  claimPhase: 'idle' | 'claiming' | 'success' | 'error'
  claimError: string | null
  claimResult: LoginRewardClaimResponse | null
  onClaim: () => void
  onClose: () => void
}

const rewardDayBaseClass =
  'relative flex flex-col items-center p-2 rounded-lg border transition-all'

export function LoginRewardModal({
  status,
  open,
  claimPhase,
  claimError,
  claimResult,
  onClaim,
  onClose,
}: LoginRewardModalProps) {
  const canClaim = status?.canClaim ?? false
  const showClaimButton = canClaim && claimPhase !== 'success'
  const showLevelUp =
    claimResult?.leveledUp === true && claimResult.newLevel !== undefined
  const milestone = claimResult?.milestoneBadge
  const todayReward = status?.todayReward ?? {
    icon: '🌟',
    xp: 10,
    description: 'Day 1 - Welcome back!',
  }

  const cardRef = useRef<HTMLDivElement | null>(null)

  // Focus the card when the modal opens (accessibility parity with the
  // previous controller).
  useEffect(() => {
    if (open) {
      cardRef.current?.focus()
    }
  }, [open])

  // Escape closes while open (document-level, like the previous controller).
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [open, onClose])

  // Dismiss whenever the click lands outside the card (backdrop or the
  // centering wrapper, which paints above the backdrop across the
  // viewport). Clicks inside the card are preserved.
  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
      onClose()
    }
  }

  return (
    <div
      id="login-reward-overlay"
      className={cn('fixed inset-0 z-50', !open && 'hidden')}
      aria-hidden={!open}
      onClick={handleOverlayClick}
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        data-overlay-backdrop="true"
      />
      <div className="relative flex items-center justify-center min-h-screen p-4">
        <div
          id="login-reward-card"
          ref={cardRef}
          className="relative max-w-lg w-full bg-cetus-surface border border-cetus-hairline rounded-2xl p-8 shadow-2xl shadow-cetus-accent/20 text-center animate-bounce-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-reward-title"
          tabIndex={-1}
        >
          {/* Header */}
          <div className="mb-6">
            <div className="text-5xl mb-3">🎁</div>
            <p className="font-mono text-xs tracking-widest text-cetus-ink-muted uppercase mb-2">
              ▸ DAILY REWARD
            </p>
            <h2
              id="login-reward-title"
              className="text-2xl font-bold text-white"
              style={displayFontStyle}
            >
              Daily Login Reward
            </h2>
            <p className="text-cetus-ink-muted mt-2">
              Welcome back! Claim your reward!
            </p>
          </div>

          {/* 7-day calendar */}
          <div className="grid grid-cols-7 gap-2 mb-6">
            {LOGIN_REWARD_CYCLE.map((reward, index) => {
              const claimed = status !== null && index < status.loginStreak
              const current =
                status !== null && index === status.loginStreak && canClaim
              return (
                <div
                  key={reward.day}
                  className={cn(
                    rewardDayBaseClass,
                    claimed && 'claimed',
                    current && 'current'
                  )}
                  data-reward-day={index}
                >
                  <span className="text-xs text-cetus-ink-muted mb-1">
                    Day {reward.day}
                  </span>
                  <span className="text-lg">{reward.icon}</span>
                  <span className="text-xs text-cetus-accent font-semibold">
                    +{reward.xp}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Current reward info */}
          <div
            id="current-reward-info"
            className="mb-6 py-4 px-6 bg-cetus-accent/10 rounded-xl border border-cetus-accent/30"
          >
            <div className="text-3xl mb-2" id="reward-icon">
              {todayReward.icon}
            </div>
            <div
              className="text-2xl font-bold font-mono text-cetus-accent"
              id="reward-xp"
              aria-live="polite"
            >
              +{todayReward.xp} XP
            </div>
            <p
              className="text-cetus-ink-muted text-sm mt-1"
              id="reward-description"
            >
              {todayReward.description}
            </p>
          </div>

          {/* Streak info */}
          <div className="flex justify-center gap-6 mb-6 text-sm">
            <div className="text-center">
              <div
                className="text-xl font-bold font-mono text-cetus-accent"
                id="streak-count"
              >
                {status?.currentCycleDay ?? 0}
              </div>
              <div className="text-cetus-ink-muted">Day Streak</div>
            </div>
            <div className="text-center">
              <div
                className="text-xl font-bold font-mono text-cetus-accent-3"
                id="cycles-count"
              >
                {status?.totalCycles ?? 0}
              </div>
              <div className="text-cetus-ink-muted">Cycles</div>
            </div>
            <div className="text-center" id="milestone-info">
              <div
                className="text-xl font-bold font-mono text-cetus-accent-3"
                id="days-to-milestone"
              >
                {status?.daysUntilMilestone ?? 7}
              </div>
              <div className="text-cetus-ink-muted">Days to 🏅</div>
            </div>
          </div>

          {/* Level up indicator (hidden by default) */}
          <div
            id="level-up-indicator"
            className={cn(
              'mb-4 py-2 px-4 bg-cetus-accent-3 rounded-full animate-pulse',
              // XOR: `hidden` loses to inline-block in Tailwind's
              // alphabetical display order, so emit exactly one.
              showLevelUp ? 'inline-block' : 'hidden'
            )}
          >
            <span className="text-white font-bold">
              🎉 LEVEL UP! Level{' '}
              <span id="new-level-display">
                {showLevelUp ? claimResult?.newLevel : 1}
              </span>
            </span>
          </div>

          {/* Milestone badge earned (hidden by default) */}
          <div
            id="milestone-earned"
            className={cn(
              'mb-4 py-3 px-4 bg-cetus-accent-2/20 rounded-xl border border-cetus-accent-2/30',
              !milestone && 'hidden'
            )}
          >
            <div className="text-2xl mb-1" id="milestone-icon">
              {milestone?.icon ?? '🏅'}
            </div>
            <div className="text-cetus-accent-2 font-bold" id="milestone-name">
              {milestone?.name ?? 'Weekly Warrior'}
            </div>
            <div
              className="text-cetus-ink-muted text-sm"
              id="milestone-description"
            >
              {milestone?.description ?? 'Achievement unlocked!'}
            </div>
          </div>

          {/* Claim button */}
          <div className="mt-6">
            <button
              id="claim-reward-btn"
              className={cn(
                'px-8 py-3 rounded-full bg-cetus-accent text-white font-bold text-lg shadow-lg shadow-cetus-accent/40 hover:shadow-cetus-accent/60 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-cetus-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cetus-surface transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
                !showClaimButton && 'hidden'
              )}
              type="button"
              disabled={claimPhase === 'claiming'}
              onClick={onClaim}
            >
              {claimPhase === 'claiming'
                ? 'Claiming...'
                : claimPhase === 'error'
                  ? claimError
                  : 'Claim Reward'}
            </button>
          </div>

          {/* Already claimed state (hidden by default) */}
          <div
            id="already-claimed"
            className={cn(
              'mt-6',
              canClaim && claimPhase !== 'success' && 'hidden'
            )}
          >
            <div className="text-green-400 font-semibold">✓ Claimed Today</div>
            <p className="text-cetus-ink-muted text-sm mt-1">
              Come back tomorrow!
            </p>
          </div>

          {/* Close button */}
          <button
            id="close-reward-modal"
            className="absolute top-4 right-4 text-cetus-ink-muted hover:text-white transition-colors"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Dismiss hint */}
          <p className="text-cetus-ink-muted text-xs mt-4">
            Press Esc or click outside to close
          </p>
        </div>
      </div>
    </div>
  )
}
