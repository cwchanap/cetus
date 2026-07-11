// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import Button from './Button.astro'
import Card from './Card.astro'
import Heading from './Heading.astro'
import Badge from './Badge.astro'
import Navigation from './Navigation.astro'
import Footer from './Footer.astro'

describe('shell components use cetus tokens (behavioral)', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    it('Button primary uses the token gradient, not hardcoded cyan/purple', async () => {
        const html = await container.renderToString(Button, {
            props: { variant: 'primary' },
            slots: { default: 'Play' },
        })
        expect(html).toContain('from-[var(--cetus-btn-from)]')
        expect(html).toContain('to-[var(--cetus-btn-to)]')
        expect(html).not.toMatch(/from-cyan-500/)
        expect(html).not.toMatch(/to-purple-600/)
        // Hover restores the gradient shift (cyan-400 -> purple-500 via tokens)
        expect(html).toContain('hover:from-cetus-accent')
        expect(html).toContain('hover:to-cetus-accent-2')
        // Shadow restores the colored glow (purple-500 via token)
        expect(html).toContain('shadow-cetus-accent-2/25')
    })

    it('Button outline uses cetus-accent and a dark hover text color', async () => {
        const html = await container.renderToString(Button, {
            props: { variant: 'outline' },
            slots: { default: 'Cancel' },
        })
        expect(html).toContain('text-cetus-accent')
        expect(html).toContain('border-cetus-accent')
        // hover:text-slate-900 is always dark, readable on cyan/teal fill in
        // all themes (light, dark, abyssal).
        expect(html).toContain('hover:text-slate-900')
        // Must NOT use --background as hover text (white in :root = unreadable
        // on cyan fill in light theme).
        expect(html).not.toContain('hover:text-background')
        // Must NOT use --cetus-page-bg as text color (it's a gradient in :root)
        expect(html).not.toContain('hover:text-[var(--cetus-page-bg)]')
    })

    it('Card sci-fi variant uses cetus surface + hairline border', async () => {
        const html = await container.renderToString(Card, {
            props: { variant: 'sci-fi' },
            slots: { default: 'Content' },
        })
        expect(html).toContain('bg-cetus-surface')
        expect(html).toContain('border-cetus-hairline')
        expect(html).not.toContain('border-neon')
    })

    it('Heading hero uses Fraunces token font, not Orbitron', async () => {
        const html = await container.renderToString(Heading, {
            props: { variant: 'hero' },
            slots: { default: 'Title' },
        })
        expect(html).not.toMatch(/font-orbitron/)
        expect(html).not.toMatch(/text-holographic/)
    })

    it('Heading renders a mono kicker when kicker prop is provided', async () => {
        const html = await container.renderToString(Heading, {
            props: { variant: 'section', kicker: 'COMMAND' },
            slots: { default: 'Dashboard' },
        })
        expect(html).toContain('▸ COMMAND')
        expect(html).toMatch(/font-mono/)
    })

    it('Card glass variant uses cetus tokens, not border-neon', async () => {
        const html = await container.renderToString(Card, {
            props: { variant: 'glass' },
            slots: { default: 'Content' },
        })
        expect(html).toContain('bg-cetus-surface')
        expect(html).toContain('border-cetus-hairline')
        expect(html).not.toContain('border-neon')
        expect(html).not.toContain('bg-glass-strong')
    })

    it('Card brackets prop renders hud-bracket elements', async () => {
        const html = await container.renderToString(Card, {
            props: { variant: 'glass', brackets: true },
            slots: { default: 'Content' },
        })
        expect(html).toContain('hud-bracket')
    })

    it('Badge has font-mono tracking for HUD readout feel', async () => {
        const html = await container.renderToString(Badge, {
            props: { variant: 'outline' },
            slots: { default: 'Score' },
        })
        expect(html).toMatch(/font-mono/)
        expect(html).toMatch(/tracking/)
    })

    it('Navigation logo + links use cetus tokens', async () => {
        const html = await container.renderToString(Navigation, {})
        expect(html).toContain('from-cetus-accent')
        expect(html).toContain('to-cetus-accent-2')
        expect(html).toContain('shadow-cetus-accent/25')
        expect(html).toContain('text-cetus-ink-muted')
        expect(html).not.toMatch(/from-cyan-400/)
    })

    it('Navigation renders HUD chrome (brackets + gradient edge)', async () => {
        const html = await container.renderToString(Navigation, {})
        expect(html).toContain('nav-bracket--tl')
        expect(html).toContain('nav-bracket--br')
        expect(html).toContain('cetus-nav-edge')
    })

    it('Footer uses cetus hairline + footer-ink', async () => {
        const html = await container.renderToString(Footer, {})
        expect(html).toContain('border-cetus-hairline')
        expect(html).toContain('text-cetus-footer-ink')
    })

    it('Footer renders HUD chrome (gradient edge + system label)', async () => {
        const html = await container.renderToString(Footer, {})
        expect(html).toContain('cetus-footer-edge')
        expect(html).toContain('SYSTEM · CETUS NODE')
    })
})
