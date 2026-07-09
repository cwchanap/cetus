// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import SpecimenCard from './SpecimenCard.astro'
import { GameID, type Game } from '@/lib/games'

const activeGame: Game = {
    id: GameID.TETRIS,
    name: 'Tetris Challenge',
    description: 'Classic block-stacking puzzle',
    category: 'puzzle',
    difficulty: 'medium',
    tags: ['puzzle', 'blocks'],
    isActive: true,
    organism: { shape: 'lattice', color: 'teal' },
    depth: 'abyssal',
}

const inactiveGame: Game = {
    ...activeGame,
    id: GameID.CIRCUIT_HACKER,
    name: 'Circuit Hacker',
    isActive: false,
    organism: undefined,
    depth: undefined,
}

describe('SpecimenCard (behavioral)', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    it('renders a link to the game url when active', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: activeGame, catalogNumber: 1 },
        })
        expect(html).toMatch(/href="\/tetris"/)
        expect(html).not.toMatch(/aria-disabled="true"/)
    })

    it('renders the vessel structure (lid + neck + body)', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: activeGame, catalogNumber: 1 },
        })
        expect(html).toContain('vessel__lid')
        expect(html).toContain('vessel__neck')
        expect(html).toContain('vessel__body')
    })

    it('embeds the Organism component when game has organism', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: activeGame, catalogNumber: 1 },
        })
        expect(html).toContain('cetus-org')
        expect(html).toContain('cetus-org--lattice')
    })

    it('renders catalog number, name, depth reading, and difficulty dots', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: activeGame, catalogNumber: 3 },
        })
        expect(html).toContain('N°·03')
        expect(html).toContain('Tetris Challenge')
        expect(html).toContain('difficulty-dots')
        expect(html).toContain('aria-label="difficulty medium"')
    })

    it('renders the empty vessel placeholder when game has no organism', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: inactiveGame, catalogNumber: 14 },
        })
        expect(html).toContain('vessel__empty')
        expect(html).not.toContain('cetus-org--')
    })

    it('marks inactive games with aria-disabled and reduced opacity', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: inactiveGame, catalogNumber: 14 },
        })
        expect(html).toMatch(/aria-disabled="true"/)
        expect(html).toContain('opacity-50')
        expect(html).toContain('pointer-events-none')
    })

    it('omits href for inactive games', async () => {
        const html = await container.renderToString(SpecimenCard, {
            props: { game: inactiveGame, catalogNumber: 14 },
        })
        // aria-disabled="true" is set, href should not point to a game URL
        expect(html).not.toMatch(/href="\/games\//)
    })
})
