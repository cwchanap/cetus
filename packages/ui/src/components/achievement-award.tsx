import { useMemo, type CSSProperties, type KeyboardEvent } from 'react'
import type { AchievementNotification } from '@cetus/shared/achievements'
import { displayFontStyle } from '../lib/styles'
import './achievement-award.css'

/**
 * Single achievement-award card (HPA-379 Stage 4). Pure presentation:
 * rarity tokens come from the `data-rarity` CSS below, particles from the
 * card's `--particle-color`. Queueing and overlay ownership live in the
 * apps/web AppNotifications island.
 */
export interface AchievementAwardCardProps {
  achievement: AchievementNotification
  onDismiss: () => void
}

export function AchievementAwardCard({
  achievement,
  onDismiss,
}: AchievementAwardCardProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        animationDelay: `${Math.random() * 2}s`,
        animationDuration: `${1 + Math.random() * 1}s`,
        opacity: 0.3 + Math.random() * 0.7,
      })),
    [achievement.id]
  )

  const handleKeydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onDismiss()
    }
  }

  const cardStyle = {
    '--rarity-border': 'var(--rarity-color)',
    '--rarity-shadow': 'var(--rarity-shadow-color)',
    '--particle-color': 'var(--rarity-particle)',
    '--glow-color': 'var(--rarity-glow)',
    borderColor: 'var(--rarity-border)',
    boxShadow: '0 25px 50px -12px var(--rarity-shadow)',
  } as CSSProperties

  return (
    <div
      className="achievement-card relative bg-cetus-surface rounded-2xl border border-cetus-hairline p-8 text-center shadow-2xl transform transition-all duration-300 hover:scale-105 cursor-pointer w-96 min-h-[480px] flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-cetus-accent"
      style={cardStyle}
      data-card=""
      data-rarity={achievement.rarity}
      tabIndex={0}
      role="button"
      aria-label="Dismiss achievement"
      onClick={onDismiss}
      onKeyDown={handleKeydown}
    >
      {/* Particle Effects Container */}
      <div className="absolute inset-0 pointer-events-none" data-particles>
        {particles.map((particle, index) => (
          <div
            key={index}
            className="absolute w-1 h-1 rounded-full animate-ping"
            style={{
              backgroundColor: 'var(--particle-color)',
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDelay: particle.animationDelay,
              animationDuration: particle.animationDuration,
              opacity: particle.opacity,
            }}
          />
        ))}
      </div>

      {/* Achievement Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Achievement Icon */}
        <div className="mb-6 flex-shrink-0">
          <div className="relative inline-block">
            <div
              data-icon
              className="text-8xl mb-3 animate-bounce h-20 flex items-center justify-center"
            >
              {achievement.icon}
            </div>
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-50"
              style={{ backgroundColor: 'var(--glow-color)' }}
            />
          </div>
        </div>

        {/* Achievement Info */}
        <div className="space-y-3 flex-grow flex flex-col">
          {/* Achievement Unlocked Text */}
          <div className="font-mono text-xs tracking-widest text-cetus-accent uppercase mb-3 flex-shrink-0">
            ▸ ACHIEVEMENT UNLOCKED
          </div>

          {/* Achievement Name */}
          <h3
            className="font-bold text-2xl text-white mb-3 flex-shrink-0 min-h-[4rem] flex items-center justify-center px-3 leading-tight"
            style={displayFontStyle}
          >
            <span data-name className="line-clamp-2 break-words">
              {achievement.name}
            </span>
          </h3>

          {/* Achievement Description */}
          <div className="flex-grow flex items-center justify-center">
            <p
              data-description
              className="text-cetus-ink text-base leading-relaxed line-clamp-4 break-words px-3 max-h-24 overflow-hidden"
            >
              {achievement.description}
            </p>
          </div>

          {/* Rarity Badge */}
          <div className="flex justify-center mt-5 flex-shrink-0">
            <span
              data-rarity-badge
              className="rarity-badge px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wide border min-w-[100px]"
            >
              {achievement.rarity}
            </span>
          </div>
        </div>

        {/* Dismiss Instructions */}
        <div className="mt-8 text-sm text-cetus-ink-muted opacity-75 flex-shrink-0">
          Click anywhere to continue
        </div>
      </div>

      {/* Animated Border */}
      <div className="absolute inset-0 rounded-2xl border-2 border-transparent animate-pulse">
        <div
          className="absolute inset-0 rounded-2xl border-2 opacity-30"
          style={{ borderColor: 'var(--rarity-border)' }}
        />
      </div>
    </div>
  )
}
