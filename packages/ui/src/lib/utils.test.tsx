import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { cn } from './utils'

/**
 * Toolchain smoke test for the @cetus/ui jsdom Vitest project (HPA-379
 * Stage 1): proves React rendering via @testing-library/react works with
 * the shared jest-dom setup file and that cn() merges/conflicts resolve.
 * Stage 2 replaces this with real component tests.
 */
describe('cn (smoke)', () => {
  it('merges class values and resolves tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    const isHidden = Math.random() < 0 // runtime falsy, not a literal
    expect(cn('flex', isHidden && 'hidden', ['items-center'])).toBe(
      'flex items-center'
    )
    // `hidden` has its own merge group: it must not drop a display class
    // that game scripts restore via classList.remove('hidden').
    expect(cn('flex', 'hidden')).toBe('flex hidden')
    expect(cn('inline-flex items-center', 'hidden')).toBe(
      'inline-flex items-center hidden'
    )
  })

  it('renders a React element carrying cn-computed classes', () => {
    const { container } = render(
      <div className={cn('rounded-md', 'rounded-lg')}>cetus</div>
    )
    const el = container.firstElementChild
    expect(el).not.toBeNull()
    // twMerge keeps only the later conflicting class.
    expect(el?.classList.contains('rounded-lg')).toBe(true)
    expect(el?.classList.contains('rounded-md')).toBe(false)
  })
})
