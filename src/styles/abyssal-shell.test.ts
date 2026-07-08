import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8')
const css = read('src/styles/global.css')

describe('abyssal shell retints (CSS-override approach)', () => {
    it('retints the holographic wordmark to static Fraunces ink under abyssal', () => {
        expect(css).toContain('.theme-abyssal .text-holographic')
        expect(css).toContain('.theme-abyssal .font-orbitron')
    })

    it('retints neon borders, glass surfaces, and cyan glows under abyssal', () => {
        expect(css).toContain('.theme-abyssal .border-neon')
        expect(css).toContain('.theme-abyssal .bg-glass-strong')
        expect(css).toContain('.theme-abyssal .bg-glass')
        expect(css).toMatch(/\.theme-abyssal .glow-cyan/)
    })

    it('retints the shared gradient (nav logo + primary button) under abyssal', () => {
        expect(css).toContain('.theme-abyssal .bg-gradient-to-r')
    })

    it('retints navigation links and footer colors under abyssal', () => {
        expect(css).toContain('.theme-abyssal .nav-links a')
        expect(css).toContain('.theme-abyssal footer')
    })

    it('does NOT token-swap the shell components (regression guard)', () => {
        for (const f of [
            'src/components/ui/Button.astro',
            'src/components/ui/Card.astro',
            'src/components/ui/Navigation.astro',
            'src/components/ui/Footer.astro',
        ]) {
            expect(read(f)).not.toMatch(/cetus-/)
        }
    })
})
