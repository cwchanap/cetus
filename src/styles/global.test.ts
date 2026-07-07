import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(
    resolve(process.cwd(), 'src/styles/global.css'),
    'utf-8'
)

describe('abyssal theme tokens', () => {
    const tokens = [
        '--cetus-accent:',
        '--cetus-accent-2:',
        '--cetus-btn-from:',
        '--cetus-btn-to:',
        '--cetus-page-bg:',
        '--cetus-surface:',
        '--cetus-hairline:',
        '--cetus-ink:',
        '--cetus-ink-muted:',
    ]

    it('defines every cetus token in the default scope', () => {
        for (const t of tokens) {
            expect(css).toContain(t)
        }
    })

    it('maps cetus tokens into the Tailwind theme', () => {
        expect(css).toContain('--color-cetus-accent: var(--cetus-accent)')
        expect(css).toContain('--color-cetus-surface: var(--cetus-surface)')
        expect(css).toContain('--color-cetus-ink: var(--cetus-ink)')
        expect(css).toContain('--color-cetus-hairline: var(--cetus-hairline)')
    })

    it('defines a .theme-abyssal scope that overrides the accents', () => {
        expect(css).toMatch(/\.theme-abyssal[^{]*\{/)
        expect(css).toContain('/* abyssal accent scope */')
    })

    it('overrides the sci-fi page background under abyssal scope', () => {
        expect(css).toMatch(/\.theme-abyssal[^{]*\.bg-sci-fi-dark/)
    })

    it('honors prefers-reduced-motion by disabling drift', () => {
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    })
})
