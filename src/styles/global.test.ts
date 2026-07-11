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

    it('defines .hud-bracket rules in global scope (not just SpecimenCard)', () => {
        expect(css).toContain('.hud-bracket {')
        expect(css).toContain('.hud-bracket--tl {')
        expect(css).toContain('.hud-bracket--tr {')
        expect(css).toContain('.hud-bracket--bl {')
        expect(css).toContain('.hud-bracket--br {')
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
        'cetus-footer-ink',
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

    it('defines --cetus-accent-3 in :root (purple-500 default; shared shell safety)', () => {
        const val = tokenValue(rootBlock, 'cetus-accent-3')
        expect(val).toMatch(/oklch\(\s*0\.627\s+0\.265\s+303\.9\s*\)/)
    })

    it('overrides --cetus-accent-3 to electric magenta under .theme-abyssal', () => {
        const val = tokenValue(abyssalBlock, 'cetus-accent-3')
        expect(val).toBe('#ff3d8a')
    })

    it('brightens abyssal --cetus-accent and --cetus-accent-2', () => {
        expect(tokenValue(abyssalBlock, 'cetus-accent')).toBe('#22f5d0')
        expect(tokenValue(abyssalBlock, 'cetus-accent-2')).toBe('#ffc24a')
    })

    it('maps --cetus-accent-3 into the Tailwind @theme inline block', () => {
        expect(css).toContain('--color-cetus-accent-3: var(--cetus-accent-3)')
    })

    it('adds the scanline overlay under .theme-abyssal', () => {
        expect(css).toMatch(/\.theme-abyssal::after\s*\{/)
        expect(css).toContain('repeating-linear-gradient')
    })

    it('covers new HUD animations in the reduced-motion media query', () => {
        const mqIndex = css.indexOf('@media (prefers-reduced-motion: reduce)')
        const afterMq = css.slice(mqIndex)
        const blockMatch = afterMq.match(/\{([\s\S]*)\}/)
        const block = blockMatch ? blockMatch[1] : ''
        // New animated selectors must appear inside the reduced-motion block.
        expect(block).toMatch(/cetus-grid-horizon/)
        expect(block).toMatch(/cetus-cursor/)
        expect(block).toMatch(/cetus-strip__line/)
        expect(block).toMatch(/cetus-scanline/)
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

    it('reduced-motion media query disables animation and transition', () => {
        const mqIndex = css.indexOf('@media (prefers-reduced-motion: reduce)')
        expect(mqIndex).toBeGreaterThan(-1)
        // Extract everything from the media query to the end of the file,
        // then find the closing brace of the media query block.
        const afterMq = css.slice(mqIndex)
        const blockMatch = afterMq.match(/\{([\s\S]*)\}/)
        expect(blockMatch).not.toBeNull()
        const block = blockMatch ? blockMatch[1] : ''
        // The media query must set animation: none and transition: none
        // on drift/particle/specimen elements, not just exist as a selector.
        expect(block).toMatch(/animation:\s*none/)
        expect(block).toMatch(/transition:\s*none/)
        // Hover transforms must also be disabled.
        expect(block).toMatch(/transform:\s*none/)
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

    it('Bug #1 regression: Button outline hover text is dark, not gradient or theme-white', () => {
        // --cetus-page-bg is a gradient in :root, invalid as a text color.
        // --background is white in :root, unreadable on cyan fill in light theme.
        // The fix uses hover:text-slate-900 (always dark, readable on cyan/teal).
        expect(buttonHtml).not.toContain('hover:text-[var(--cetus-page-bg)]')
        expect(buttonHtml).not.toContain('hover:text-background')
        expect(buttonHtml).toContain('hover:text-slate-900')
    })

    it('--cetus-surface and --cetus-hairline in :root use black-opacity (visible on light bg)', () => {
        const surface = tokenValue(rootBlock, 'cetus-surface')
        const hairline = tokenValue(rootBlock, 'cetus-hairline')
        // Bug #6 fix: root should use black-opacity, not white-opacity
        expect(surface).not.toMatch(/rgba\(255,\s*255,\s*255/)
        expect(hairline).not.toMatch(/rgba\(255,\s*255,\s*255/)
    })

    it('--cetus-surface in .dark uses white-opacity (visible on dark bg)', () => {
        const darkBlock = extractBlock(css, '.dark')
        const surface = tokenValue(darkBlock, 'cetus-surface')
        expect(surface).toMatch(/rgba\(255,\s*255,\s*255/)
    })

    it('--cetus-hairline is NOT overridden in .dark (inherits root slate-700/50)', () => {
        const darkBlock = extractBlock(css, '.dark')
        const hairline = tokenValue(darkBlock, 'cetus-hairline')
        // The original Footer border was border-slate-700/50 — a static class,
        // same in light and dark. The token should not be overridden in .dark
        // so it inherits the root value (slate-700/50) for parity.
        expect(hairline).toBeNull()
    })

    // Parity guard: :root token values must equal the exact Tailwind v4 colors
    // they replace, so non-abyssal pages are byte-identical to before
    // tokenization. If a token value drifts, this test catches it.
    it(':root cetus token values match the exact Tailwind v4 colors they replace', () => {
        const cases: Array<[string, string]> = [
            ['cetus-accent', 'oklch(0.789 0.154 211.53)'], // cyan-400
            ['cetus-accent-2', 'oklch(0.627 0.265 303.9)'], // purple-500
            ['cetus-btn-from', 'oklch(0.715 0.143 215.221)'], // cyan-500
            ['cetus-btn-to', 'oklch(0.558 0.288 302.321)'], // purple-600
            ['cetus-ink-muted', 'oklch(0.872 0.01 258.338)'], // gray-300
            ['cetus-footer-ink', 'oklch(0.707 0.022 257.328)'], // gray-400
            ['cetus-hairline', 'oklch(0.372 0.028 257.286 / 0.5)'], // slate-700/50
        ]
        for (const [token, expected] of cases) {
            const val = tokenValue(rootBlock, token)
            expect(val, `--${token} should equal ${expected}`).toBe(expected)
        }
    })
})
