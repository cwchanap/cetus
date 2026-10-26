import type { ReactNode } from 'react'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { cn } from '../lib/utils'

/**
 * Game HUD stats card (HPA-379 Stage 5). Presentational only: exposes the
 * `score` and `time-remaining` nodes that game scripts mutate imperatively,
 * so it must stay SSR-only (no hydration — React must never re-render the
 * subtrees the scripts own). `children` renders additional stats badges.
 * `gameId` is kept for page-call-site compatibility (unused presentation).
 */
export interface GameStatsProps {
  gameId?: string
  showScore?: boolean
  showTime?: boolean
  initialTime?: number
  className?: string
  children?: ReactNode
}

export function GameStats({
  showScore = true,
  showTime = true,
  initialTime = 60,
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
                  0
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
                  {initialTime}
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
