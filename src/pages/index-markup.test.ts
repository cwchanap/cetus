import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
    resolve(process.cwd(), 'src/pages/index.astro'),
    'utf-8'
)

describe('homepage abyssal composition', () => {
    it('opts into the abyssal theme', () => {
        expect(src).toMatch(/theme\s*=\s*['"]abyssal['"]/)
    })

    it('renders a hero vitrine of featured specimens', () => {
        expect(src).toContain('id="hero-vitrine"')
        expect(src).toContain('getFeaturedGames')
        expect(src).toMatch(/Cetus/) // wordmark
    })

    it('renders the three depth zones with mono labels', () => {
        expect(src).toContain('getGamesByDepth')
        expect(src).toContain("'shallow'")
        expect(src).toContain("'mid'")
        expect(src).toContain("'abyssal'")
        expect(src).toContain('DEPTH_LABELS')
    })

    it('uses SpecimenCard, not the old GameCard', () => {
        expect(src).toMatch(/import SpecimenCard/)
        expect(src).not.toContain('GameCard')
    })

    it('renders the value strip with the three promises', () => {
        expect(src).toContain('No login')
        expect(src).toContain('track your depths')
        expect(src).toContain('any screen')
    })

    it('removes the old hero / features / promo box', () => {
        expect(src).not.toContain('MINIGAMES OF THE FUTURE')
        expect(src).not.toContain('Compete for Glory')
        expect(src).not.toContain('FeatureCard')
        expect(src).not.toContain('text-holographic')
    })

    it('keeps Orbitron off the homepage', () => {
        expect(src).not.toMatch(/font-orbitron/)
    })
})
