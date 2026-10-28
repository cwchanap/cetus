import type { ReactNode } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { cn } from '../lib/utils'

/**
 * Game controls card (HPA-379 Stage 5). Presentational/SSR-safe by default:
 * exposes the `start-btn`, `end-btn` (hidden until the game starts),
 * `pause-btn` and `reset-btn` nodes that game scripts mutate imperatively.
 * Hydrated islands (HPA-393) may instead drive them via the optional
 * controlled props (`running`, `paused`, `onStart`, `onPause`, `onEnd`,
 * `onReset`); omitting them keeps the legacy markup and imperative-script
 * contract unchanged. `children` renders custom control extras.
 */
export interface GameControlsProps {
  showPause?: boolean
  showReset?: boolean
  showEnd?: boolean
  /** Tri-state run state: undefined keeps the legacy markup, true hides start/shows end, false the reverse. */
  running?: boolean
  /** true relabels the pause button to "Resume"; omit/false renders "Pause". */
  paused?: boolean
  onStart?: () => void
  onPause?: () => void
  onEnd?: () => void
  onReset?: () => void
  className?: string
  children?: ReactNode
}

export function GameControls({
  showPause = true,
  showReset = true,
  showEnd = true,
  running,
  paused,
  onStart,
  onPause,
  onEnd,
  onReset,
  className,
  children,
}: GameControlsProps) {
  // Tri-state `running`: undefined keeps the legacy imperative-script state
  // (start visible, end display:none); true/false drive a React-owned run.
  const startStyle = running === true ? { display: 'none' } : undefined
  const endStyle = running === true ? undefined : { display: 'none' }
  return (
    <Card variant="glass" className={cn('p-6', className)}>
      <div className="flex flex-col items-center space-y-4">
        {/* Game Controls */}
        <div className="flex space-x-2">
          <Button
            id="start-btn"
            variant="primary"
            size="sm"
            style={startStyle}
            onClick={onStart}
          >
            Start Game
          </Button>
          {showEnd && (
            <Button
              id="end-btn"
              variant="outline"
              size="sm"
              style={endStyle}
              onClick={onEnd}
            >
              End Game
            </Button>
          )}
          {showPause && (
            <Button
              id="pause-btn"
              variant="outline"
              size="sm"
              onClick={onPause}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
          )}
          {showReset && (
            <Button
              id="reset-btn"
              variant="outline"
              size="sm"
              onClick={onReset}
            >
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
