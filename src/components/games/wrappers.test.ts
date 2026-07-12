// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import GameTitle from './GameTitle.astro'
import GameBreadcrumb from './GameBreadcrumb.astro'
import GameOverlay from '@/components/GameOverlay.astro'

const gamePageSource = readFileSync(
    resolve(process.cwd(), 'src/components/games/GamePage.astro'),
    'utf-8'
)

describe('Game wrapper restyle', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    it('GamePage source has a controls slot override', () => {
        expect(gamePageSource).toContain('name="controls"')
        expect(gamePageSource).toMatch(/Astro\.slots\.has\(['"]controls['"]\)/)
    })

    it('GamePage source has overlayTitle and overlayButtonText props', () => {
        expect(gamePageSource).toContain('overlayTitle')
        expect(gamePageSource).toContain('overlayButtonText')
    })

    it('GameTitle uses Fraunces token, not Orbitron', async () => {
        const html = await container.renderToString(GameTitle, {
            props: { title: 'Tetris', description: 'Stack blocks' },
        })
        expect(html).not.toMatch(/font-orbitron/)
        expect(html).not.toMatch(/text-holographic/)
        expect(html).toMatch(/cetus-wordmark/)
    })

    it('GameBreadcrumb uses mono kicker + cetus hairline', async () => {
        const html = await container.renderToString(GameBreadcrumb, {
            props: { icon: '🟦', title: 'Tetris' },
        })
        expect(html).toMatch(/font-mono/)
        expect(html).toContain('border-cetus-hairline')
        expect(html).not.toMatch(/text-cyan-400/)
    })

    it('GameOverlay uses Fraunces + mono score, not Orbitron', async () => {
        const html = await container.renderToString(GameOverlay, {
            slots: { default: 'Score: 100' },
        })
        expect(html).toMatch(/cetus-wordmark/)
        expect(html).toMatch(/font-mono/)
        expect(html).not.toMatch(/font-orbitron/)
        expect(html).not.toMatch(/text-cyan-400/)
    })
})
