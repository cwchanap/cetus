import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
    resolve(process.cwd(), 'src/layouts/AppLayout.astro'),
    'utf-8'
)

describe('AppLayout theme prop', () => {
    it('declares a theme prop with default and abyssal options', () => {
        expect(src).toMatch(
            /theme\??:\s*['"]default['"]\s*\|\s*['"]abyssal['"]/
        )
        expect(src).toMatch(/theme\s*=\s*['"]default['"]/)
    })

    it('applies theme-abyssal to the body conditionally', () => {
        expect(src).toContain('theme-abyssal')
        expect(src).toMatch(
            /theme\s*===\s*['"]abyssal['"]|theme\s*==\s*['"]abyssal['"]/
        )
    })

    it('loads Fraunces and JetBrains Mono', () => {
        expect(src).toContain('Fraunces')
        expect(src).toContain('JetBrains+Mono')
    })

    it('hides the sci-fi animated background and particles on the abyssal theme', () => {
        expect(src).toMatch(/theme !== ['"]abyssal['"]/)
    })
})
