import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'sci-fi' | 'glass' | 'elevated'
  brackets?: boolean
}

const cardVariants = {
  variant: {
    default: 'rounded-lg border bg-card text-card-foreground shadow-sm',
    'sci-fi':
      'group relative bg-cetus-surface rounded-2xl border border-cetus-hairline backdrop-blur-sm hover:border-cetus-accent/60 hover-glow-cyan transition-all duration-300',
    glass:
      'bg-cetus-surface rounded-2xl border border-cetus-hairline backdrop-blur-sm',
    elevated:
      'rounded-lg border bg-card text-card-foreground shadow-lg hover:shadow-xl transition-shadow duration-300',
  },
}

export function Card({
  variant = 'default',
  brackets = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        cardVariants.variant[variant],
        brackets && 'hud-bracket-host relative',
        className
      )}
      {...rest}
    >
      {brackets && (
        <>
          <span className="hud-bracket hud-bracket--tl" aria-hidden="true" />
          <span className="hud-bracket hud-bracket--tr" aria-hidden="true" />
          <span className="hud-bracket hud-bracket--bl" aria-hidden="true" />
          <span className="hud-bracket hud-bracket--br" aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  )
}
