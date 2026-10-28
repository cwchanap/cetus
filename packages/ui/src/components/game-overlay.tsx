import type { HTMLAttributes } from 'react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

/**
 * Game-over overlay shell (HPA-379 Stage 4). Presentational/SSR-safe by
 * default: games toggle visibility themselves and populate the final score
 * via the `scoreId` element. `children` renders custom final-stats markup.
 * Hydrated islands (HPA-393) may instead drive it via the optional
 * controlled props (`open`, `score`, `onButtonClick`); omitting them keeps
 * the legacy markup and imperative-script contract unchanged.
 */
export interface GameOverlayProps extends HTMLAttributes<HTMLDivElement> {
  id?: string
  titleId?: string
  scoreId?: string
  buttonId?: string
  buttonText?: string
  defaultTitle?: string
  showScore?: boolean
  /** Controlled visibility: true drops the `hidden` class; omit for script-owned toggling. */
  open?: boolean
  /** Controlled final score; omit to render the legacy literal 0. */
  score?: number
  /** Play-again click handler; omit for script-attached listeners. */
  onButtonClick?: () => void
}

export function GameOverlay({
  id = 'game-over-overlay',
  titleId = 'game-over-title',
  scoreId = 'final-score',
  buttonId = 'play-again-btn',
  buttonText = 'Play Again',
  defaultTitle = 'GAME OVER!',
  showScore = true,
  open,
  score,
  onButtonClick,
  className,
  children,
  ...rest
}: GameOverlayProps) {
  return (
    <div
      id={id}
      // `hidden` keeps `flex` intact under cn() (its own merge group), so
      // game scripts can classList.remove('hidden') to show the overlay.
      // Omitting it via `open` (not a class swap) keeps the merge group intact.
      className={cn(
        'fixed inset-0 bg-black/90 flex items-center justify-center z-50',
        !open && 'hidden',
        className
      )}
      {...rest}
    >
      <div className="text-center p-8">
        <h3
          id={titleId}
          className="text-3xl cetus-wordmark cetus-wordmark--glow mb-6"
        >
          {defaultTitle}
        </h3>

        {/* Final Stats */}
        <div className="space-y-4 mb-8">
          {showScore && (
            <div className="text-xl">
              Final Score:{' '}
              <span
                id={scoreId}
                className="font-mono text-2xl text-cetus-accent"
              >
                {score ?? 0}
              </span>
            </div>
          )}

          {/* Custom stats slot */}
          {children}
        </div>

        <Button
          id={buttonId}
          variant="primary"
          size="lg"
          onClick={onButtonClick}
        >
          {buttonText}
        </Button>
      </div>
    </div>
  )
}
