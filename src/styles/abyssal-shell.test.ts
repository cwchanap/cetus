import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8')
const css = read('src/styles/global.css')

describe('abyssal shell retints (remaining CSS overrides)', () => {
    it('retints the holographic wordmark to static Fraunces ink under abyssal', () => {
        expect(css).toContain('.theme-abyssal .text-holographic')
        expect(css).toContain('.theme-abyssal .font-orbitron')
    })

    it('retints cyan glows to teal under abyssal', () => {
        expect(css).toMatch(/\.theme-abyssal .glow-cyan/)
    })

    it('does NOT override gradients/borders/glass/nav-links/footer (token-swapped)', () => {
        expect(css).not.toContain('.theme-abyssal .bg-gradient-to-r')
        expect(css).not.toContain('.theme-abyssal .border-neon')
        expect(css).not.toContain('.theme-abyssal .bg-glass')
        expect(css).not.toContain('.theme-abyssal .nav-links')
        expect(css).not.toContain('.theme-abyssal footer')
    })
})
