import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  variant?: 'default' | 'hero' | 'features' | 'cta'
}

const sectionVariants = {
  default: 'relative z-10 px-6 py-16',
  hero: 'relative z-10 px-6 py-16',
  features:
    'relative z-10 px-6 py-16 bg-gradient-to-b from-transparent to-slate-900/20',
  cta: 'relative z-10 px-6 py-16 bg-gradient-to-t from-transparent to-cyan-400/5',
}

export function Section({
  variant = 'default',
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section className={cn(sectionVariants[variant], className)} {...rest}>
      {children}
    </section>
  )
}
