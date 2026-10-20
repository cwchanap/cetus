// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import GamePage from './GamePage.astro'
import GameTitle from './GameTitle.astro'
import GameBreadcrumb from './GameBreadcrumb.astro'
import GameOverlay from '@/components/GameOverlay.astro'

describe('Game wrapper restyle', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    it('GamePage renders a custom controls slot when provided', async () => {
        const html = await container.renderToString(GamePage, {
            props: {
                gameId: 'test',
                title: 'Test',
                description: 'Test desc',
                icon: '🎮',
            },
            slots: {
                'game-board': '<div id="board-mock"></div>',
                controls: '<button id="custom-control">Custom</button>',
            },
        })
        expect(html).toContain('id="custom-control"')
        // Default GameControls start button should NOT appear when slot is provided
        expect(html).not.toContain('id="start-btn"')
    })

    it('GamePage renders default GameControls when no controls slot', async () => {
        const html = await container.renderToString(GamePage, {
            props: {
                gameId: 'test',
                title: 'Test',
                description: 'Test desc',
                icon: '🎮',
            },
            slots: {
                'game-board': '<div id="board-mock"></div>',
            },
        })
        expect(html).toContain('id="start-btn"')
    })

    it('GamePage passes overlayTitle and overlayButtonText to GameOverlay', async () => {
        const html = await container.renderToString(GamePage, {
            props: {
                gameId: 'test',
                title: 'Test',
                description: 'Test desc',
                icon: '🎮',
                overlayTitle: 'CUSTOM OVERLAY TITLE',
                overlayButtonText: 'Custom Button Text',
            },
            slots: {
                'game-board': '<div id="board-mock"></div>',
            },
        })
        expect(html).toContain('CUSTOM OVERLAY TITLE')
        expect(html).toContain('Custom Button Text')
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
