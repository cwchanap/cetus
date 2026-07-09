// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import Organism from './Organism.astro'
import type { OrganismIdentity } from '@/lib/organisms'

type OrganismShape = OrganismIdentity['shape']

const SHAPES: OrganismShape[] = [
    'orb',
    'chain',
    'spiral',
    'frond',
    'cluster',
    'lattice',
]

describe('Organism renderer (behavioral)', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    it('renders a div with the shape class and data-color attribute', async () => {
        const html = await container.renderToString(Organism, {
            props: { identity: { shape: 'orb', color: 'teal' } },
        })
        expect(html).toContain('cetus-org--orb')
        expect(html).toMatch(/data-color="teal"/)
        expect(html).toContain('aria-hidden="true"')
    })

    it.each(SHAPES)(
        'renders the %s shape with its specific markup',
        async shape => {
            const html = await container.renderToString(Organism, {
                props: { identity: { shape, color: 'teal' } },
            })
            expect(html).toContain(`cetus-org--${shape}`)
        }
    )

    it('renders the orbit ring when orb flag is true', async () => {
        const html = await container.renderToString(Organism, {
            props: { identity: { shape: 'orb', color: 'teal', orb: true } },
        })
        expect(html).toContain('cetus-org__orbit')
        expect(html).toMatch(/data-orb="true"/)
    })

    it('omits the orbit ring when orb flag is false', async () => {
        const html = await container.renderToString(Organism, {
            props: { identity: { shape: 'orb', color: 'teal' } },
        })
        expect(html).not.toContain('cetus-org__orbit')
        expect(html).not.toMatch(/data-orb="true"/)
    })

    it('renders the SVG spiral path for the spiral shape', async () => {
        const html = await container.renderToString(Organism, {
            props: { identity: { shape: 'spiral', color: 'amber' } },
        })
        expect(html).toContain('cetus-org__spiral')
        expect(html).toContain('<svg')
        expect(html).toContain('<path')
    })

    it('renders chain segments for the chain shape', async () => {
        const html = await container.renderToString(Organism, {
            props: { identity: { shape: 'chain', color: 'magenta' } },
        })
        expect(html).toContain('cetus-org__chain')
        // chain renders 7 <i> segments
        const matches = html.match(/<i[\s/>]/g)
        expect(matches).toHaveLength(7)
    })
})
