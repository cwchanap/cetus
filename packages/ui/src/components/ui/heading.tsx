import type { CSSProperties, HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'
import { displayFontStyle } from '../../lib/styles'

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  variant?: 'default' | 'hero' | 'section' | 'subsection'
  align?: 'left' | 'center' | 'right'
  kicker?: string
}

const headingVariants = {
  default: 'font-semibold text-white',
  hero: 'cetus-wordmark--glow',
  section: 'text-white',
  subsection: 'font-semibold text-white',
}

const headingStyles: Record<string, CSSProperties | undefined> = {
  default: undefined,
  hero: displayFontStyle,
  section: displayFontStyle,
  subsection: undefined,
}

const sizeVariants = {
  1: 'text-6xl md:text-8xl',
  2: 'text-4xl md:text-5xl',
  3: 'text-3xl md:text-4xl',
  4: 'text-2xl md:text-3xl',
  5: 'text-xl md:text-2xl',
  6: 'text-lg md:text-xl',
}

const alignVariants = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export function Heading({
  level = 2,
  variant = 'default',
  align = 'left',
  kicker,
  className,
  children,
  ...rest
}: HeadingProps) {
  const classes = cn(
    headingVariants[variant],
    sizeVariants[level],
    alignVariants[align],
    className
  )

  // Cast keeps the dynamic heading level simple; h1-h6 share the same
  // attribute set.
  const Tag = `h${level}` as 'h1'

  return (
    <>
      {kicker && (
        <p className="font-mono text-xs tracking-widest text-cetus-ink-muted uppercase mb-2">
          {'▸ '}
          {kicker}
        </p>
      )}
      <Tag className={classes} style={headingStyles[variant]} {...rest}>
        {children}
      </Tag>
    </>
  )
}
