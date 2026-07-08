import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(
    resolve(process.cwd(), 'src/components/organisms/Organism.astro'),
    'utf-8'
)

describe('Organism renderer', () => {
    it('accepts an OrganismIdentity prop', () => {
        expect(src).toMatch(/identity:\s*OrganismIdentity/)
    })

    it('branches on all six shapes', () => {
        for (const shape of [
            'orb',
            'chain',
            'spiral',
            'frond',
            'cluster',
            'lattice',
        ]) {
            expect(src).toContain(`'${shape}'`)
        }
    })

    it('renders color via a data attribute, not color alone', () => {
        expect(src).toMatch(/data-color/)
    })

    it('supports the orbit ring variant', () => {
        expect(src).toContain('orbit')
    })
})
