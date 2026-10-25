import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

// Kept as an exported props type for parity with the other primitives;
// it adds no members today.
export type ContainerProps = HTMLAttributes<HTMLDivElement>

export function Container({ className, children, ...rest }: ContainerProps) {
  return (
    <div className={cn('max-w-6xl mx-auto', className)} {...rest}>
      {children}
    </div>
  )
}
