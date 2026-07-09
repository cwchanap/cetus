// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import Button from './Button.astro'
import Card from './Card.astro'
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

    it('Card sci-fi variant uses cetus surface + accent border', async () => {
        const html = await container.renderToString(Card, {
            props: { variant: 'sci-fi' },
            slots: { default: 'Content' },
        })
        expect(html).toContain('bg-cetus-surface')
        expect(html).toContain('border-neon')
        expect(html).toContain('hover:border-cetus-accent')
    })

    it('Navigation logo + links use cetus tokens', async () => {
        const html = await container.renderToString(Navigation, {})
        expect(html).toContain('cetus-btn-from')
        expect(html).toContain('text-cetus-ink-muted')
        expect(html).not.toMatch(/from-cyan-400/)
    })

    it('Footer uses cetus hairline + ink-muted', async () => {
        const html = await container.renderToString(Footer, {})
        expect(html).toContain('border-cetus-hairline')
        expect(html).toContain('text-cetus-ink-muted')
    })
})
