import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
    resolve(process.cwd(), 'src/components/ui/SpecimenCard.astro'),
    'utf-8'
)

describe('SpecimenCard (Vessel)', () => {
    it('renders a link to the game url when available', () => {
        expect(src).toMatch(/import\s*\{[^}]*getGameUrl/)
        expect(src).toMatch(
            /href=\{available \? getGameUrl\(game\.id\) : undefined\}/
        )
    })

    it('renders the vessel (lid + neck + body)', () => {
        expect(src).toContain('vessel__lid')
        expect(src).toContain('vessel__neck')
        expect(src).toContain('vessel__body')
    })

    it('embeds the Organism component', () => {
        expect(src).toMatch(/import Organism/)
        expect(src).toMatch(/<Organism/)
    })

    it('shows catalog number, name, depth reading, difficulty dots', () => {
        expect(src).toContain('catalogNumber')
        expect(src).toContain('vessel__name')
        expect(src).toContain('DEPTH_LABELS')
        expect(src).toContain('difficulty-dots')
    })

    it('has no emoji icon and no Play Now pill', () => {
        expect(src).not.toContain('getGameIcon')
        expect(src).not.toContain('Play Now')
    })

    it('coming-soon state: omits href + marks aria-disabled when unavailable', () => {
        expect(src).toContain("available ? undefined : 'true'")
        expect(src).toMatch(/!available && 'opacity-50 pointer-events-none'/)
        // The empty vessel placeholder renders when the game has no organism
        // or is unavailable.
        expect(src).toContain('vessel__empty')
    })
})
