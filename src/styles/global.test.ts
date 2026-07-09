// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import Button from '@/components/ui/Button.astro'

const css = readFileSync(
    resolve(process.cwd(), 'src/styles/global.css'),
    'utf-8'
)

/** Extract the body of a CSS selector block. */
function extractBlock(source: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's')
    const match = source.match(re)
    return match ? match[1] : ''
}

/** Extract a token value from a CSS block. */
function tokenValue(block: string, token: string): string | null {
    const re = new RegExp(`--${token}:\\s*([^;]+);`)
    const match = block.match(re)
    return match ? match[1].trim() : null
}

const rootBlock = extractBlock(css, ':root')
const abyssalBlock = extractBlock(css, '.theme-abyssal')

describe('abyssal theme tokens (behavioral)', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>
    let buttonHtml: string

    beforeAll(async () => {
        container = await AstroContainer.create()
        buttonHtml = await container.renderToString(Button, {
            props: { variant: 'outline' },
            slots: { default: 'Test' },
        })
    })

    const tokens = [
        'cetus-accent',
        'cetus-accent-2',
        'cetus-btn-from',
        'cetus-btn-to',
        'cetus-page-bg',
        'cetus-surface',
        'cetus-hairline',
        'cetus-ink',
        'cetus-ink-muted',
    ]

    it('defines every cetus token in the default :root scope', () => {
        for (const t of tokens) {
            const val = tokenValue(rootBlock, t)
            expect(val, `--${t} should be defined in :root`).not.toBeNull()
            expect(val, `--${t} should have a non-empty value`).not.toBe('')
        }
    })

    it('defines every cetus token in the .theme-abyssal scope', () => {
        for (const t of tokens) {
            const val = tokenValue(abyssalBlock, t)
            expect(
                val,
                `--${t} should be defined in .theme-abyssal`
            ).not.toBeNull()
        }
    })

    it('maps cetus tokens into the Tailwind @theme inline block', () => {
        expect(css).toContain('--color-cetus-accent: var(--cetus-accent)')
        expect(css).toContain('--color-cetus-surface: var(--cetus-surface)')
        expect(css).toContain('--color-cetus-ink: var(--cetus-ink)')
        expect(css).toContain('--color-cetus-hairline: var(--cetus-hairline)')
    })

    it('defines a .theme-abyssal scope that overrides the accents', () => {
        expect(css).toMatch(/\.theme-abyssal[^{]*\{/)
    })

    it('overrides the sci-fi page background under abyssal scope', () => {
        expect(css).toMatch(/\.theme-abyssal[^{]*\.bg-sci-fi-dark/)
    })

    it('honors prefers-reduced-motion by disabling drift', () => {
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    })

    it('--cetus-page-bg in :root is a gradient (valid for background, NOT for text color)', () => {
        const val = tokenValue(rootBlock, 'cetus-page-bg')
        expect(val).toBeTruthy()
        // It should be a gradient — valid as background, invalid as color
        expect(val).toMatch(/gradient/)
    })

    it('--cetus-page-bg in .theme-abyssal is a solid color (valid for both bg and text)', () => {
        const val = tokenValue(abyssalBlock, 'cetus-page-bg')
        expect(val).toBeTruthy()
        // It should NOT be a gradient — solid color works as text color too
        expect(val).not.toMatch(/gradient/)
    })

    it('Bug #1 regression: Button outline does NOT use --cetus-page-bg as hover text color', () => {
        // --cetus-page-bg is a gradient in :root, which is invalid as a text color.
        // The rendered Button must use a solid token (text-background) instead.
        expect(buttonHtml).not.toContain('hover:text-[var(--cetus-page-bg)]')
        expect(buttonHtml).toContain('hover:text-background')
    })

    it('--cetus-surface and --cetus-hairline in :root use black-opacity (visible on light bg)', () => {
        const surface = tokenValue(rootBlock, 'cetus-surface')
        const hairline = tokenValue(rootBlock, 'cetus-hairline')
        // Bug #6 fix: root should use black-opacity, not white-opacity
        expect(surface).not.toMatch(/rgba\(255,\s*255,\s*255/)
        expect(hairline).not.toMatch(/rgba\(255,\s*255,\s*255/)
    })

    it('--cetus-surface and --cetus-hairline in .dark use white-opacity (visible on dark bg)', () => {
        const darkBlock = extractBlock(css, '.dark')
        const surface = tokenValue(darkBlock, 'cetus-surface')
        const hairline = tokenValue(darkBlock, 'cetus-hairline')
        expect(surface).toMatch(/rgba\(255,\s*255,\s*255/)
        expect(hairline).toMatch(/rgba\(255,\s*255,\s*255/)
    })
})
