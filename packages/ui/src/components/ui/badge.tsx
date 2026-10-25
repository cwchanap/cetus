import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'success'
    | 'warning'
    | 'error'
  size?: 'default' | 'sm' | 'lg'
}

const destructiveStyle =
  'bg-cetus-accent-3/10 text-cetus-accent-3 border border-cetus-accent-3/30'

const badgeVariants = {
  variant: {
    default:
      'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
    secondary:
      'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: destructiveStyle,
    outline: 'text-foreground border border-cetus-hairline',
    success:
      'bg-cetus-accent/10 text-cetus-accent border border-cetus-accent/30',
    warning:
      'bg-cetus-accent-2/10 text-cetus-accent-2 border border-cetus-accent-2/30',
    error: destructiveStyle,
  },
  size: {
    default: 'px-3 py-1 text-xs',
    sm: 'px-2.5 py-0.5 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  },
}

export function Badge({
  variant = 'default',
  size = 'default',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-mono tracking-wide text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        badgeVariants.variant[variant],
        badgeVariants.size[size],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
