import type { ReactNode } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { cn } from '../lib/utils'

/**
 * Game controls card (HPA-379 Stage 5). Presentational only: exposes the
 * `start-btn`, `end-btn` (hidden until the game starts), `pause-btn` and
 * `reset-btn` nodes that game scripts mutate imperatively, so it must stay
 * SSR-only (no hydration). `children` renders custom control extras.
 * `gameId` is kept for page-call-site compatibility (unused presentation).
 */
export interface GameControlsProps {
  gameId?: string
  showPause?: boolean
  showReset?: boolean
  showEnd?: boolean
  className?: string
  children?: ReactNode
}

export function GameControls({
  showPause = true,
  showReset = true,
  showEnd = true,
  className,
  children,
}: GameControlsProps) {
  return (
    <Card variant="glass" className={cn('p-6', className)}>
      <div className="flex flex-col items-center space-y-4">
        {/* Game Controls */}
        <div className="flex space-x-2">
          <Button id="start-btn" variant="primary" size="sm">
            Start Game
          </Button>
          {showEnd && (
            <Button
              id="end-btn"
              variant="outline"
              size="sm"
              style={{ display: 'none' }}
            >
              End Game
            </Button>
          )}
          {showPause && (
            <Button id="pause-btn" variant="outline" size="sm">
              Pause
            </Button>
          )}
          {showReset && (
            <Button id="reset-btn" variant="outline" size="sm">
              Reset
            </Button>
          )}
        </div>

        {/* Custom control slot */}
        {children}
      </div>
    </Card>
  )
}
