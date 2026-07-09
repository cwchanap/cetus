// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import IndexPage from './index.astro'

describe('homepage abyssal composition (behavioral)', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>
    let html: string

    beforeAll(async () => {
        container = await AstroContainer.create()
        html = await container.renderToString(IndexPage, {
            locals: { user: null, session: null },
        })
    })

    it('opts into the abyssal theme', () => {
        expect(html).toContain('theme-abyssal')
    })

    it('renders a hero vitrine with the Cetus wordmark', () => {
        expect(html).toContain('id="hero-vitrine"')
        expect(html).toContain('Cetus')
    })

    it('renders the hero heading with text-6xl class (not overridden by font shorthand)', () => {
        // Bug #2 regression guard: the font: shorthand resets font-size to 1em.
        // The hero heading must use individual font properties, not the font: shorthand.
        expect(html).toContain('text-6xl')
        expect(html).toContain('md:text-8xl')
        // The style must NOT use the font: shorthand (which resets font-size)
        expect(html).not.toMatch(/style="font:\s/)
        // It should use individual properties instead
        expect(html).toContain('font-style: italic')
        expect(html).toContain("font-family: 'Fraunces'")
    })

    it('renders exactly one h1 (the nav brand)', () => {
        const h1Matches = html.match(/<h1[\s>]/g)
        expect(h1Matches).toHaveLength(1)
    })

    it('renders the three depth zones', () => {
        expect(html).toContain('SHALLOW')
        expect(html).toContain('MID')
        expect(html).toContain('ABYSSAL')
    })

    it('uses SpecimenCard, not the old GameCard', () => {
        expect(html).toContain('specimen-card')
        expect(html).not.toContain('GameCard')
    })

    it('renders the value strip with the three promises', () => {
        expect(html).toContain('No login')
        expect(html).toContain('track your depths')
        expect(html).toContain('any screen')
    })

    it('keeps the #games legacy anchor for login redirect', () => {
        expect(html).toContain('id="games"')
    })

    it('uses cetus tokens for hero particles, not hardcoded hex', () => {
        // Bug #5 regression guard: particles must use tokens, not hex colors
        expect(html).toContain('var(--cetus-accent')
        expect(html).not.toContain('#1FE3C0')
        expect(html).not.toContain('#F2B33D')
    })
})
