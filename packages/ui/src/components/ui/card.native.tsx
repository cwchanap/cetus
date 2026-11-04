/// <reference types="react-native-css/types" />
import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'
import { cn } from '../../lib/utils'
import type { CardVariant } from '../../variants'

export interface CardProps extends Omit<ViewProps, 'children' | 'className'> {
  variant?: CardVariant
  brackets?: boolean
  className?: string
  children?: ReactNode
}

const cardVariants = {
  variant: {
    default:
      'rounded-lg border border-cetus-hairline bg-cetus-surface shadow-sm',
    'sci-fi': 'bg-cetus-surface rounded-2xl border border-cetus-hairline',
    glass: 'bg-cetus-surface rounded-2xl border border-cetus-hairline',
    elevated:
      'rounded-lg border border-cetus-hairline bg-cetus-surface shadow-lg',
  },
} satisfies {
  variant: Record<CardVariant, string>
}

const bracketBase = 'absolute w-3 h-3 border-cetus-accent'
const bracketCorners = [
  'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
  'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
  'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
  'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
]

export function Card({
  variant = 'default',
  brackets = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <View
      className={cn(
        cardVariants.variant[variant],
        brackets && 'relative',
        className
      )}
      {...rest}
    >
      {brackets &&
        bracketCorners.map(corner => (
          <View key={corner} className={cn(bracketBase, corner)} />
        ))}
      {children}
    </View>
  )
}
