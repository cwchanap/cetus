// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import Navigation from '@/components/ui/Navigation.astro'
import Footer from '@/components/ui/Footer.astro'

const css = readFileSync(
    resolve(process.cwd(), 'src/styles/global.css'),
    'utf-8'
)

describe('abyssal shell retints (behavioral)', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>
    let navHtml: string
    let footerHtml: string

    beforeAll(async () => {
        container = await AstroContainer.create()
        navHtml = await container.renderToString(Navigation, {
            locals: { user: null },
        })
        footerHtml = await container.renderToString(Footer, {})
    })

    it('retints the holographic wordmark to static Fraunces ink under abyssal', () => {
        expect(css).toContain('.theme-abyssal .text-holographic')
        expect(css).toContain('.theme-abyssal .font-orbitron')
    })

    it('retints cyan glows to teal under abyssal', () => {
        expect(css).toMatch(/\.theme-abyssal\s+\.glow-cyan/)
    })

    it('does NOT override gradients/borders/glass/nav-links/footer (token-swapped)', () => {
        // These are handled via token swaps, not CSS overrides
        expect(css).not.toContain('.theme-abyssal .bg-gradient-to-r')
        expect(css).not.toContain('.theme-abyssal .border-neon')
        expect(css).not.toContain('.theme-abyssal .bg-glass')
        expect(css).not.toContain('.theme-abyssal .nav-links')
        expect(css).not.toMatch(/\.theme-abyssal\s+footer/)
    })

    it('Navigation renders with cetus tokens (not hardcoded cyan)', () => {
        // The nav logo gradient uses cetus-btn-from/to tokens
        expect(navHtml).toContain('cetus-btn-from')
        expect(navHtml).toContain('cetus-btn-to')
        expect(navHtml).not.toMatch(/from-cyan-400/)
    })

    it('Navigation logo is a span, not an h1 (avoids double-h1 on homepage)', () => {
        // Bug #4 fix: nav logo changed from h1 to span
        expect(navHtml).toContain('text-holographic')
        expect(navHtml).not.toMatch(/<h1/)
    })

    it('Footer renders with cetus hairline + ink-muted tokens', () => {
        expect(footerHtml).toContain('border-cetus-hairline')
        expect(footerHtml).toContain('text-cetus-ink-muted')
    })
})
