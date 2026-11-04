/// <reference types="react-native-css/types" />
import type { ReactNode } from 'react'
import { Text, type TextProps } from 'react-native'
import { cn } from '../../lib/utils'
import type { HeadingAlign, HeadingLevel, HeadingVariant } from '../../variants'

export interface HeadingProps extends Omit<
  TextProps,
  'children' | 'className'
> {
  level?: HeadingLevel
  variant?: HeadingVariant
  align?: HeadingAlign
  kicker?: string
  className?: string
  children?: ReactNode
}

const headingVariants = {
  default: 'font-semibold text-cetus-ink',
  hero: 'font-display font-bold text-cetus-ink',
  section: 'font-display font-bold text-cetus-ink',
  subsection: 'font-semibold text-cetus-ink',
} satisfies Record<HeadingVariant, string>

const sizeVariants = {
  1: 'text-6xl',
  2: 'text-4xl',
  3: 'text-3xl',
  4: 'text-2xl',
  5: 'text-xl',
  6: 'text-lg',
} satisfies Record<HeadingLevel, string>

const alignVariants = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} satisfies Record<HeadingAlign, string>

export function Heading({
  level = 2,
  variant = 'default',
  align = 'left',
  kicker,
  className,
  children,
  accessibilityRole = 'header',
  ...rest
}: HeadingProps) {
  const classes = cn(
    headingVariants[variant],
    sizeVariants[level],
    alignVariants[align],
    className
  )

  return (
    <>
      {kicker && (
        <Text className="font-sans text-xs font-semibold tracking-widest text-cetus-ink-muted uppercase mb-2">
          {'▸ '}
          {kicker}
        </Text>
      )}
      <Text accessibilityRole={accessibilityRole} className={classes} {...rest}>
        {children}
      </Text>
    </>
  )
}
