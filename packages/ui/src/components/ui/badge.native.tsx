/// <reference types="react-native-css/types" />
import { Children, type ReactNode } from 'react'
import { Text, View, type ViewProps } from 'react-native'
import { cn } from '../../lib/utils'
import type { BadgeSize, BadgeVariant } from '../../variants'

export interface BadgeProps extends Omit<ViewProps, 'children' | 'className'> {
  variant?: BadgeVariant
  size?: BadgeSize
  className?: string
  children?: ReactNode
}

const badgeVariants = {
  variant: {
    default: 'border-transparent bg-cetus-surface',
    secondary: 'border-transparent bg-cetus-canvas',
    destructive: 'bg-cetus-accent-3/10 border-cetus-accent-3/30',
    outline: 'border-cetus-hairline',
    success: 'bg-cetus-accent/10 border-cetus-accent/30',
    warning: 'bg-cetus-accent-2/10 border-cetus-accent-2/30',
    error: 'bg-cetus-accent-3/10 border-cetus-accent-3/30',
  },
  size: {
    default: 'px-3 py-1',
    sm: 'px-2.5 py-0.5',
    lg: 'px-4 py-1.5',
  },
} satisfies {
  variant: Record<BadgeVariant, string>
  size: Record<BadgeSize, string>
}

const textVariants = {
  variant: {
    default: 'text-cetus-ink',
    secondary: 'text-cetus-ink-muted',
    destructive: 'text-cetus-accent-3',
    outline: 'text-cetus-ink',
    success: 'text-cetus-accent',
    warning: 'text-cetus-accent-2',
    error: 'text-cetus-accent-3',
  },
  size: {
    default: 'text-xs',
    sm: 'text-xs',
    lg: 'text-sm',
  },
} satisfies {
  variant: Record<BadgeVariant, string>
  size: Record<BadgeSize, string>
}

export function Badge({
  variant = 'default',
  size = 'default',
  className,
  children,
  ...rest
}: BadgeProps) {
  const textClassName = cn(
    'font-sans tracking-wide',
    textVariants.variant[variant],
    textVariants.size[size]
  )
  const items = Children.toArray(children)
  const allScalar =
    items.length > 0 &&
    items.every(item => typeof item === 'string' || typeof item === 'number')
  return (
    <View
      className={cn(
        'flex-row items-center self-start rounded-full border',
        badgeVariants.variant[variant],
        badgeVariants.size[size],
        className
      )}
      {...rest}
    >
      {allScalar ? (
        <Text className={textClassName}>{children}</Text>
      ) : (
        items.map((item, index) =>
          typeof item === 'string' || typeof item === 'number' ? (
            <Text key={index} className={textClassName}>
              {item}
            </Text>
          ) : (
            item
          )
        )
      )}
    </View>
  )
}
