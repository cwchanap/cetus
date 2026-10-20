// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import AppLayout from './AppLayout.astro'

describe('AppLayout theme prop (behavioral)', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    it('applies theme-abyssal to the body when theme="abyssal"', async () => {
        const html = await container.renderToString(AppLayout, {
            props: { theme: 'abyssal', title: 'Test' },
            locals: { user: null, session: null },
            slots: { default: '<p>content</p>' },
        })
        expect(html).toContain('theme-abyssal')
    })

    it('does NOT apply theme-abyssal when theme is default', async () => {
        const html = await container.renderToString(AppLayout, {
            props: { theme: 'default', title: 'Test' },
            locals: { user: null, session: null },
            slots: { default: '<p>content</p>' },
        })
        expect(html).not.toContain('theme-abyssal')
    })

    it('loads Fraunces and JetBrains Mono fonts under abyssal theme', async () => {
        const html = await container.renderToString(AppLayout, {
            props: { theme: 'abyssal', title: 'Test' },
            locals: { user: null, session: null },
            slots: { default: '<p>content</p>' },
        })
        expect(html).toContain('Fraunces')
        expect(html).toContain('JetBrains+Mono')
    })

    it('loads Orbitron and Inter fonts under default theme', async () => {
        const html = await container.renderToString(AppLayout, {
            props: { theme: 'default', title: 'Test' },
            locals: { user: null, session: null },
            slots: { default: '<p>content</p>' },
        })
        expect(html).toContain('Orbitron')
        expect(html).toContain('Inter')
        expect(html).not.toContain('Fraunces')
    })

    it('hides the sci-fi animated background on abyssal theme', async () => {
        const html = await container.renderToString(AppLayout, {
            props: { theme: 'abyssal', title: 'Test' },
            locals: { user: null, session: null },
            slots: { default: '<p>content</p>' },
        })
        // The sci-fi background (bg-gradient-radial) is conditionally rendered
        // only when theme !== 'abyssal', so it should be absent.
        // Note: animate-bounce appears in AchievementAward (always rendered),
        // so we only check for the sci-fi-specific bg-gradient-radial.
        expect(html).not.toContain('bg-gradient-radial')
    })

    it('does not render legacy sci-fi background even under default theme', async () => {
        // The animated-blob/particle blocks were removed entirely (not just
        // hidden for abyssal), so they are absent regardless of theme.
        const html = await container.renderToString(AppLayout, {
            props: { theme: 'default', title: 'Test' },
            locals: { user: null, session: null },
            slots: { default: '<p>content</p>' },
        })
        expect(html).not.toContain('bg-gradient-radial')
    })

    it('defaults to abyssal theme when no theme prop is passed', async () => {
        const html = await container.renderToString(AppLayout, {
            props: { title: 'Test' },
            locals: { user: null, session: null },
            slots: { default: '<p>content</p>' },
        })
        expect(html).toContain('theme-abyssal')
        expect(html).not.toContain('bg-gradient-radial')
        // Note: animate-bounce appears in AchievementAward (always rendered),
        // so it cannot be asserted absent here — see sibling test above.
    })
})
