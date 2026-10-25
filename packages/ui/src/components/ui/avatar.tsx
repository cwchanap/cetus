import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'default' | 'lg' | 'xl'
  variant?: 'default' | 'cyan-purple' | 'purple-pink' | 'pink-cyan' | 'solid'
  src?: string
  alt?: string
  fallback?: string
}

const avatarVariants = {
  size: {
    sm: 'w-8 h-8',
    default: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20',
  },
  variant: {
    default: 'bg-gradient-to-r from-primary to-primary-foreground',
    'cyan-purple': 'bg-cetus-accent/20 ring-1 ring-cetus-accent/40',
    'purple-pink': 'bg-cetus-accent-2/20 ring-1 ring-cetus-accent-2/40',
    'pink-cyan': 'bg-cetus-accent-3/20 ring-1 ring-cetus-accent-3/40',
    solid: 'bg-muted',
  },
}

export function Avatar({
  size = 'default',
  variant = 'default',
  className,
  src,
  alt = 'Avatar',
  fallback,
  children,
  ...rest
}: AvatarProps) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110',
        avatarVariants.size[size],
        avatarVariants.variant[variant],
        className
      )}
      {...rest}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover rounded-full"
        />
      ) : fallback ? (
        <span
          className="text-white font-bold"
          style={{ fontFamily: 'var(--cetus-display-font)' }}
        >
          {fallback}
        </span>
      ) : (
        children
      )}
    </div>
  )
}
