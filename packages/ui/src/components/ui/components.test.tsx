import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { Button } from './button'
import { Card } from './card'
import { Badge } from './badge'
import { Heading } from './heading'
import { Avatar } from './avatar'
import { Container } from './container'
import { Section } from './section'
import { Pagination } from './pagination'

/**
 * Targeted RTL coverage for the @cetus/ui primitives (HPA-379 Stage 2).
 * Class-token parity is asserted in apps/web shell-tokens/global tests via
 * renderToStaticMarkup; these tests cover behavior those don't: variant
 * switching, root-prop forwarding (including data-astro-cid-* style
 * data-* attributes), structural extras (brackets, kicker) and pagination
 * boundary states.
 */

describe('Button', () => {
  it('renders the primary variant with its token gradient and glow', () => {
    const { getByRole } = render(<Button variant="primary">Play</Button>)
    const button = getByRole('button', { name: 'Play' })
    expect(button.className).toContain('from-[var(--cetus-btn-from)]')
    expect(button.className).toContain('hover:from-cetus-accent')
    expect(button.className).toContain('hover-glow-cyan')
  })

  it('applies size classes', () => {
    const { getByRole } = render(<Button size="lg">Big</Button>)
    expect(getByRole('button').className).toContain('h-11 rounded-md px-8')
  })

  it('forwards root DOM props (data-*) onto the button element', () => {
    const { getByRole } = render(
      <Button data-astro-cid-j7pv25f6="" data-testid="cta">
        Go
      </Button>
    )
    const button = getByRole('button')
    expect(button.getAttribute('data-astro-cid-j7pv25f6')).toBe('')
    expect(button.getAttribute('data-testid')).toBe('cta')
  })

  it('honors the disabled attribute', () => {
    const { getByRole } = render(<Button disabled>Locked</Button>)
    expect(getByRole('button')).toBeDisabled()
  })
})

describe('Card', () => {
  it('renders the sci-fi variant with cetus surface tokens', () => {
    const { getByText } = render(<Card variant="sci-fi">Content</Card>)
    expect(getByText('Content').className).toContain('bg-cetus-surface')
    expect(getByText('Content').className).toContain('border-cetus-hairline')
  })

  it('renders four HUD brackets when brackets is set', () => {
    const { container } = render(<Card brackets>Content</Card>)
    expect(container.querySelectorAll('.hud-bracket')).toHaveLength(4)
  })

  it('omits brackets by default', () => {
    const { container } = render(<Card>Content</Card>)
    expect(container.querySelectorAll('.hud-bracket')).toHaveLength(0)
  })
})

describe('Badge', () => {
  it('renders the success variant with cetus accent tokens', () => {
    const { getByText } = render(<Badge variant="success">Earned</Badge>)
    const badge = getByText('Earned')
    expect(badge.className).toContain('bg-cetus-accent/10')
    expect(badge.className).toContain('border-cetus-accent/30')
  })

  it('shares the destructive style between destructive and error variants', () => {
    const { getByText } = render(<Badge variant="error">Fail</Badge>)
    expect(getByText('Fail').className).toContain('text-cetus-accent-3')
  })
})

describe('Heading', () => {
  it('renders the requested heading level', () => {
    const { getByRole } = render(<Heading level={1}>Title</Heading>)
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Title')
  })

  it('renders a mono kicker paragraph before the heading', () => {
    const { container } = render(
      <Heading level={2} kicker="COMMAND">
        Dashboard
      </Heading>
    )
    const kicker = container.querySelector('p')
    expect(kicker?.textContent).toContain('▸ COMMAND')
    expect(kicker?.className).toContain('font-mono')
  })

  it('omits the kicker when not provided', () => {
    const { container } = render(<Heading level={2}>Plain</Heading>)
    expect(container.querySelector('p')).toBeNull()
  })
})

describe('Avatar', () => {
  it('renders the fallback initial when no src is given', () => {
    const { getByText } = render(<Avatar fallback="CC" />)
    expect(getByText('CC').style.fontFamily).toBe('var(--cetus-display-font)')
  })

  it('renders the image when src is provided', () => {
    const { getByAltText } = render(<Avatar src="/x.png" alt="Me" />)
    expect(getByAltText('Me').getAttribute('src')).toBe('/x.png')
  })
})

describe('Container / Section', () => {
  it('Container renders max-w-6xl mx-auto and forwards props', () => {
    const { getByText } = render(
      <Container id="shell" className="text-center">
        Body
      </Container>
    )
    const el = getByText('Body')
    expect(el.className).toContain('max-w-6xl mx-auto')
    expect(el.className).toContain('text-center')
    expect(el.getAttribute('id')).toBe('shell')
  })

  it('Section renders a section element with the requested variant', () => {
    const { getByText } = render(<Section variant="features">Feat</Section>)
    const el = getByText('Feat')
    expect(el.tagName).toBe('SECTION')
    expect(el.className).toContain('bg-gradient-to-b')
  })
})

describe('Pagination', () => {
  const base = { totalPages: 5, pageSize: 10, total: 50 }

  it('shows the info line and page links', () => {
    const { getByText, getAllByRole } = render(
      <Pagination {...base} currentPage={2} />
    )
    expect(getByText('Showing 11 to 20 of 50 achievements')).toBeTruthy()
    // 5 page links + prev + next (none disabled)
    expect(
      getAllByRole('button').filter(b => !(b as HTMLButtonElement).disabled)
    ).toHaveLength(7)
  })

  it('disables prev on the first page and next on the last page', () => {
    const { getByRole, getAllByRole, rerender } = render(
      <Pagination {...base} currentPage={1} />
    )
    expect(getByRole('button', { name: '←' })).toBeDisabled()
    expect(getByRole('button', { name: '→' })).toBeEnabled()

    rerender(<Pagination {...base} currentPage={5} />)
    expect(getByRole('button', { name: '→' })).toBeDisabled()
    // No nav links on the last page: only arrows + numbers remain buttons.
    expect(getAllByRole('button', { name: '→' })).toHaveLength(1)
  })

  it('marks the current page with the primary variant', () => {
    const { getByRole } = render(<Pagination {...base} currentPage={3} />)
    const current = getByRole('button', { name: '3' })
    expect(current.className).toContain('from-[var(--cetus-btn-from)]')
    const other = getByRole('button', { name: '2' })
    expect(other.className).not.toContain('from-[var(--cetus-btn-from)]')
  })

  it('builds hrefs from an absolute baseUrl when provided', () => {
    const { getByRole } = render(
      <Pagination
        {...base}
        currentPage={1}
        baseUrl="https://cetus.app/achievements"
      />
    )
    const next = getByRole('button', { name: '→' }).closest('a')
    expect(next?.getAttribute('href')).toBe(
      'https://cetus.app/achievements?page=2'
    )
  })

  it('hides the nav when totalPages is 1', () => {
    const { queryByRole } = render(
      <Pagination currentPage={1} totalPages={1} pageSize={10} total={5} />
    )
    expect(queryByRole('navigation')).toBeNull()
  })
})
