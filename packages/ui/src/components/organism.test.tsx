import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { Organism } from './organism'
import type { OrganismIdentity } from '@cetus/shared/organisms'

type OrganismShape = OrganismIdentity['shape']

const SHAPES: OrganismShape[] = [
  'orb',
  'chain',
  'spiral',
  'frond',
  'cluster',
  'lattice',
]

// Ported from apps/web Organism.test.ts (HPA-379 Stage 2): the component
// moved to @cetus/ui, so its behavioral coverage moves with it.
const organismCss = readFileSync(resolve(__dirname, 'organism.css'), 'utf-8')

describe('Organism (behavioral)', () => {
  it('renders a div with the shape class and data-color attribute', () => {
    const { container } = render(
      <Organism identity={{ shape: 'orb', color: 'teal' }} />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('cetus-org--orb')
    expect(root.getAttribute('data-color')).toBe('teal')
    expect(root.getAttribute('aria-hidden')).toBe('true')
  })

  const SEGMENT_COUNTS: Record<OrganismShape, number | null> = {
    orb: null,
    chain: 7,
    spiral: null,
    frond: 5,
    cluster: 7,
    lattice: 9,
  }

  it.each(SHAPES)('renders the %s shape with its specific markup', shape => {
    const { container } = render(
      <Organism identity={{ shape, color: 'teal' }} />
    )
    expect((container.firstElementChild as HTMLElement).className).toContain(
      `cetus-org--${shape}`
    )
    const expected = SEGMENT_COUNTS[shape]
    if (expected !== null) {
      const matches = container.querySelectorAll('i')
      expect(matches).toHaveLength(expected)
    }
  })

  it('renders the orbit ring when orb flag is true', () => {
    const { container } = render(
      <Organism identity={{ shape: 'orb', color: 'teal', orb: true }} />
    )
    expect(container.querySelector('.cetus-org__orbit')).not.toBeNull()
    expect(container.firstElementChild?.getAttribute('data-orb')).toBe('true')
  })

  it('omits the orbit ring when orb flag is false', () => {
    const { container } = render(
      <Organism identity={{ shape: 'orb', color: 'teal' }} />
    )
    expect(container.querySelector('.cetus-org__orbit')).toBeNull()
    expect(container.firstElementChild?.hasAttribute('data-orb')).toBe(false)
  })

  it('renders the SVG spiral path for the spiral shape', () => {
    const { container } = render(
      <Organism identity={{ shape: 'spiral', color: 'amber' }} />
    )
    expect(container.querySelector('.cetus-org__spiral')).not.toBeNull()
    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('stroke-width')).toBe('1.5')
    expect(path?.getAttribute('stroke-linecap')).toBe('round')
  })

  it('forwards root DOM props (data-*) for Astro scoped-style matching', () => {
    const { container } = render(
      <Organism
        identity={{ shape: 'orb', color: 'teal' }}
        data-astro-cid-j7pv25f6=""
      />
    )
    expect(
      container.firstElementChild?.getAttribute('data-astro-cid-j7pv25f6')
    ).toBe('')
  })

  it('plain CSS keeps the color map, focus/hover glow, and reduced-motion guard', () => {
    // data-color -> --org custom prop resolution
    expect(organismCss).toContain(".cetus-org[data-color='teal']")
    expect(organismCss).toContain(".cetus-org[data-color='magenta']")
    // Ambient drift + reduced-motion disable
    expect(organismCss).toMatch(/cetus-drift 8s ease-in-out infinite/)
    expect(organismCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
