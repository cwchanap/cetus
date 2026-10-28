import type { ReactNode } from 'react'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { cn } from '../lib/utils'

/**
 * Game HUD stats card (HPA-379 Stage 5). Presentational/SSR-safe by default:
 * exposes the `score` and `time-remaining` nodes that game scripts mutate
 * imperatively. Hydrated islands (HPA-393) may instead drive them via the
 * optional controlled `score`/`time` props; omitting them keeps the legacy
 * markup and imperative-script contract unchanged. `children` renders
 * additional stats badges.
 */
export interface GameStatsProps {
  showScore?: boolean
  showTime?: boolean
  initialTime?: number
  /** Controlled score; omit to render the legacy literal 0. */
  score?: number
  /** Controlled time; omit to render `initialTime`. */
  time?: number
  className?: string
  children?: ReactNode
}

export function GameStats({
  showScore = true,
  showTime = true,
  initialTime = 60,
  score,
  time,
  className,
  children,
}: GameStatsProps) {
  return (
    <Card variant="glass" className={cn('p-6', className)}>
      <div className="flex flex-col items-center space-y-4">
        {/* Game Status */}
        <div className="flex flex-wrap justify-center gap-4 mb-4">
          {showScore && (
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Score:{' '}
                <span id="score" className="font-mono text-cetus-accent">
                  {score ?? 0}
                </span>
              </span>
            </Badge>
          )}
          {showTime && (
            <Badge variant="outline" className="px-4 py-2">
              <span className="font-mono">
                Time:{' '}
                <span
                  id="time-remaining"
                  className="font-mono text-cetus-accent"
                >
                  {time ?? initialTime}
                </span>
                s
              </span>
            </Badge>
          )}

          {/* Additional stats slot */}
          {children}
        </div>
      </div>
    </Card>
  )
}
