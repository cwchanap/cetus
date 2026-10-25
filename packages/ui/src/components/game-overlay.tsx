import type { HTMLAttributes } from 'react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

/**
 * Game-over overlay shell (HPA-379 Stage 4). Presentational only: games
 * toggle visibility themselves and populate the final score via the
 * `scoreId` element. `children` renders custom final-stats markup.
 */
export interface GameOverlayProps extends HTMLAttributes<HTMLDivElement> {
  id?: string
  titleId?: string
  scoreId?: string
  buttonId?: string
  buttonText?: string
  defaultTitle?: string
  showScore?: boolean
}

export function GameOverlay({
  id = 'game-over-overlay',
  titleId = 'game-over-title',
  scoreId = 'final-score',
  buttonId = 'play-again-btn',
  buttonText = 'Play Again',
  defaultTitle = 'GAME OVER!',
  showScore = true,
  className,
  children,
  ...rest
}: GameOverlayProps) {
  return (
    <div
      id={id}
      className={cn(
        'fixed inset-0 bg-black/90 flex items-center justify-center hidden z-50',
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
                0
              </span>
            </div>
          )}

          {/* Custom stats slot */}
          {children}
        </div>

        <Button id={buttonId} variant="primary" size="lg">
          {buttonText}
        </Button>
      </div>
    </div>
  )
}
