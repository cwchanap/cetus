import { cn } from '../lib/utils'

/**
 * Game page breadcrumb (HPA-379 Stage 5). Presentational mono kicker strip:
 * `icon ▸ title` above a hairline. SSR-only.
 */
export interface GameBreadcrumbProps {
  icon: string
  title: string
  className?: string
}

export function GameBreadcrumb({
  icon,
  title,
  className,
}: GameBreadcrumbProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-cetus-hairline', className)}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <div className="font-mono text-xs tracking-wide text-cetus-accent">
            {icon} ▸ {title}
          </div>
        </div>
      </div>
    </div>
  )
}
