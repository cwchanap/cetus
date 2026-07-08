import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'

const src = readFileSync(
    resolve(process.cwd(), 'src/pages/index.astro'),
    'utf-8'
)

describe('homepage abyssal composition', () => {
    it('opts into the abyssal theme', () => {
        expect(src).toMatch(/theme\s*=\s*['"]abyssal['"]/)
    })

    it('renders a hero vitrine of featured specimens', () => {
        expect(src).toContain('id="hero-vitrine"')
        expect(src).toContain('getFeaturedGames')
        expect(src).toMatch(/Cetus/) // wordmark
    })

    it('renders the three depth zones with mono labels', () => {
        expect(src).toContain('getGamesByDepth')
        expect(src).toContain("'shallow'")
        expect(src).toContain("'mid'")
        expect(src).toContain("'abyssal'")
        expect(src).toContain('DEPTH_LABELS')
    })

    it('uses SpecimenCard, not the old GameCard', () => {
        expect(src).toMatch(/import SpecimenCard/)
        expect(src).not.toContain('GameCard')
    })

    it('renders the value strip with the three promises', () => {
        expect(src).toContain('No login')
        expect(src).toContain('track your depths')
        expect(src).toContain('any screen')
    })

    it('removes the old hero / features / promo box', () => {
        expect(src).not.toContain('MINIGAMES OF THE FUTURE')
        expect(src).not.toContain('Compete for Glory')
        expect(src).not.toContain('FeatureCard')
        expect(src).not.toContain('text-holographic')
    })

    it('keeps Orbitron off the homepage', () => {
        expect(src).not.toMatch(/font-orbitron/)
    })

    // Regression guard: the hero wordmark H1 must keep its Tailwind size
    // classes (text-6xl md:text-8xl) and must NOT set font-size via the
    // `font:` shorthand in its inline style — that shorthand's <size> value
    // (e.g. 1em) overrides Tailwind utilities because inline styles win the
    // cascade, which previously rendered "Cetus" at 16px instead of 6xl/8xl.
    // DOM-level assertion: parse the rendered H1 and inspect attributes.
    it('hero H1 keeps Tailwind size classes and avoids a font: shorthand that pins font-size', () => {
        // Extract the <h1 ...>Cetus</h1> fragment from the source. The tag
        // spans multiple lines and "Cetus" is wrapped in whitespace, so allow
        // whitespace around the wordmark.
        const h1Match = src.match(/<h1[^>]*>\s*Cetus\s*<\/h1>/)
        expect(h1Match).not.toBeNull()
        const h1Html = h1Match![0]

        const { document } = new JSDOM(h1Html).window
        const h1 = document.querySelector('h1')
        expect(h1).not.toBeNull()

        const classList = Array.from(h1!.classList)
        expect(classList).toContain('text-6xl')
        expect(classList).toContain('md:text-8xl')

        const style = h1!.getAttribute('style') ?? ''
        // Reject any `font:` shorthand that carries a size component.
        // The shorthand form is `font: <style> <weight> <size>/<line-height> <family>`.
        // A bare `font:` with a size like `1em` or `16px` pins font-size and
        // beats the Tailwind utilities. Longhand (font-style, font-weight,
        // line-height, font-family) is safe because it omits font-size.
        const fontShorthandWithSize =
            /font:\s*[^;]*\b\d+(\.\d+)?(px|em|rem|%|vh|vw|pt|pc|in|cm|mm|q|ch|ex)\b/i
        expect(style).not.toMatch(fontShorthandWithSize)
    })
})
