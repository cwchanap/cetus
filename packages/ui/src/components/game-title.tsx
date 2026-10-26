import { cn } from '../lib/utils'

/**
 * Game page title block (HPA-379 Stage 5). Presentational only: the wordmark
 * heading and muted description rendered above the game board. SSR-only —
 * games never mutate these nodes after load.
 */
export interface GameTitleProps {
  title: string
  description: string
  className?: string
}

export function GameTitle({ title, description, className }: GameTitleProps) {
  return (
    <div className={cn('text-center mb-8', className)}>
      <h2 className="text-4xl md:text-5xl cetus-wordmark cetus-wordmark--glow mb-4">
        {title.toUpperCase()}
      </h2>
      <p className="text-cetus-ink-muted text-lg">{description}</p>
    </div>
  )
}
