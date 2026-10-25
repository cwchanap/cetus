import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { SpecimenCard } from './specimen-card'
import { GameID, type Game } from '@cetus/shared/games'

// Ported from apps/web SpecimenCard.test.ts (HPA-379 Stage 2): the component
// moved to @cetus/ui, so its behavioral coverage moves with it.
const specimenCss = readFileSync(
  resolve(__dirname, 'specimen-card.css'),
  'utf-8'
)

const activeGame: Game = {
  id: GameID.TETRIS,
  name: 'Tetris Challenge',
  description: 'Classic block-stacking puzzle',
  category: 'puzzle',
  difficulty: 'medium',
  tags: ['puzzle', 'blocks'],
  isActive: true,
  organism: { shape: 'lattice', color: 'teal' },
  depth: 'abyssal',
}

const inactiveGame: Game = {
  ...activeGame,
  id: GameID.CIRCUIT_HACKER,
  name: 'Circuit Hacker',
  isActive: false,
  organism: undefined,
  depth: undefined,
}

describe('SpecimenCard (behavioral)', () => {
  it('renders a link to the game url when active', () => {
    const { getByTestId } = render(
      <SpecimenCard game={activeGame} catalogNumber={1} />
    )
    const card = getByTestId('specimen-card')
    expect(card.getAttribute('href')).toBe('/tetris')
    expect(card.getAttribute('aria-disabled')).toBeNull()
  })

  it('renders the vessel structure (lid + neck + body)', () => {
    const { container } = render(
      <SpecimenCard game={activeGame} catalogNumber={1} />
    )
    expect(container.querySelector('.vessel__lid')).not.toBeNull()
    expect(container.querySelector('.vessel__neck')).not.toBeNull()
    expect(container.querySelector('.vessel__body')).not.toBeNull()
  })

  it('embeds the Organism component when game has organism', () => {
    const { container } = render(
      <SpecimenCard game={activeGame} catalogNumber={1} />
    )
    expect(container.querySelector('.cetus-org--lattice')).not.toBeNull()
  })

  it('renders catalog number, name, depth reading, and a difficulty power-bar', () => {
    const { getByTestId, getByText } = render(
      <SpecimenCard game={activeGame} catalogNumber={3} />
    )
    expect(getByText('[ N°·03 ]')).toBeTruthy()
    expect(getByText('Tetris Challenge')).toBeTruthy()
    const card = getByTestId('specimen-card')
    expect(card.querySelector('.power-bar')).not.toBeNull()
    expect(card.querySelector('.power-bar')?.getAttribute('aria-label')).toBe(
      'difficulty medium'
    )
    expect(getByText('DIFF·3')).toBeTruthy()
    expect(getByText('4000m+ · ABYSSAL')).toBeTruthy()
  })

  it('renders four HUD corner brackets and the vessel body', () => {
    const { container } = render(
      <SpecimenCard game={activeGame} catalogNumber={1} />
    )
    expect(container.querySelectorAll('.hud-bracket')).toHaveLength(4)
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'hud-bracket-host'
    )
  })

  it('renders SOON state (no DIFF label) for inactive games', () => {
    const { getByText, queryByText } = render(
      <SpecimenCard game={inactiveGame} catalogNumber={14} />
    )
    expect(getByText('SOON')).toBeTruthy()
    expect(queryByText(/^DIFF·/)).toBeNull()
  })

  it('renders the empty vessel placeholder when game has no organism', () => {
    const { container } = render(
      <SpecimenCard game={inactiveGame} catalogNumber={14} />
    )
    expect(container.querySelector('.vessel__empty')).not.toBeNull()
    expect(container.querySelector('.cetus-org--')).toBeNull()
  })

  it('marks inactive games with aria-disabled and reduced opacity', () => {
    const { getByTestId } = render(
      <SpecimenCard game={inactiveGame} catalogNumber={14} />
    )
    const card = getByTestId('specimen-card')
    expect(card.getAttribute('aria-disabled')).toBe('true')
    expect(card.className).toContain('opacity-50')
    expect(card.className).toContain('pointer-events-none')
  })

  it('omits href for inactive games', () => {
    const { getByTestId } = render(
      <SpecimenCard game={inactiveGame} catalogNumber={14} />
    )
    // aria-disabled="true" is set, href should be omitted entirely.
    // getGameUrl('circuit_hacker') -> '/circuit-hacker'.
    expect(getByTestId('specimen-card').getAttribute('href')).toBeNull()
  })

  it('defines a visible focus ring via :focus-visible with cetus-accent', () => {
    // The imported plain CSS must include a :focus-visible rule with an
    // outline using --cetus-accent (teal in abyssal, cyan-400 default).
    expect(specimenCss).toMatch(/focus-visible/)
    expect(specimenCss).toMatch(/outline/)
    expect(specimenCss).toContain('var(--cetus-accent)')
  })

  it('keeps the hover lift and its reduced-motion disable in plain CSS', () => {
    expect(specimenCss).toMatch(/\.vessel:hover\s*\{/)
    expect(specimenCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*transform:\s*none/
    )
  })

  it('forwards root DOM props (data-*) for Astro scoped-style matching', () => {
    const { getByTestId } = render(
      <SpecimenCard
        game={activeGame}
        catalogNumber={1}
        data-astro-cid-j7pv25f6=""
      />
    )
    expect(
      getByTestId('specimen-card').getAttribute('data-astro-cid-j7pv25f6')
    ).toBe('')
  })
})
