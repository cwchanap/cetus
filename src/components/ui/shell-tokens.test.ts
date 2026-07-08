import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8')

describe('shell components use cetus tokens (not hardcoded cyan/purple)', () => {
    it('Button primary uses the token gradient, not from-cyan-500', () => {
        const s = read('src/components/ui/Button.astro')
        expect(s).not.toMatch(/from-cyan-500/)
        expect(s).toContain('from-[var(--cetus-btn-from)]')
        expect(s).toContain('to-[var(--cetus-btn-to)]')
        expect(s).not.toMatch(/to-purple-600/)
    })

    it('Button outline uses cetus-accent, not text-cyan-400', () => {
        const s = read('src/components/ui/Button.astro')
        expect(s).not.toMatch(/text-cyan-400/)
        expect(s).toContain('text-cetus-accent')
        expect(s).toContain('border-cetus-accent')
    })

    it('Card sci-fi variant uses cetus surface/hairline/accent', () => {
        const s = read('src/components/ui/Card.astro')
        expect(s).toContain('bg-cetus-surface')
        expect(s).toContain('border-cetus-hairline')
        expect(s).toContain('hover:border-cetus-accent')
    })

    it('Navigation logo + links use cetus tokens', () => {
        const s = read('src/components/ui/Navigation.astro')
        expect(s).not.toMatch(/from-cyan-400/)
        expect(s).toContain('cetus-btn-from')
        expect(s).toContain('text-cetus-ink-muted')
    })

    it('Footer uses cetus hairline + ink-muted', () => {
        const s = read('src/components/ui/Footer.astro')
        expect(s).toContain('border-cetus-hairline')
        expect(s).toContain('text-cetus-ink-muted')
    })
})
