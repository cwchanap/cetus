// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createContainer } from '@/test/createContainer'
import {
    GameBreadcrumb,
    GameControls,
    GameOverlay,
    GameStats,
    GameTitle,
} from '@cetus/ui'
import GamePage from './GamePage.astro'

describe('Game wrapper restyle', () => {
    let container: Awaited<ReturnType<typeof createContainer>>

    beforeAll(async () => {
        container = await createContainer()
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

    it('GamePage renders SSR-only React wrappers (no hydration directive)', async () => {
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
        // Game HUD contract nodes the game scripts mutate imperatively.
        expect(html).toContain('id="score"')
        expect(html).toContain('id="time-remaining"')
        expect(html).toContain('id="pause-btn"')
        expect(html).toContain('id="reset-btn"')
        // End button hidden by default, like the game scripts expect.
        expect(html).toMatch(/id="end-btn"[^>]*style="display:none"/)
        // Astro must not hydrate the wrappers into game HUD islands: the
        // only astro-island on the page is AppLayout's AppNotifications.
        expect(html.match(/<astro-island/g)?.length ?? 0).toBe(1)
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

    it('GameTitle uses Fraunces token, not Orbitron', () => {
        const html = renderToStaticMarkup(
            createElement(GameTitle, {
                title: 'Tetris',
                description: 'Stack blocks',
            })
        )
        expect(html).toContain('TETRIS')
        expect(html).toContain('Stack blocks')
        expect(html).not.toMatch(/font-orbitron/)
        expect(html).not.toMatch(/text-holographic/)
        expect(html).toMatch(/cetus-wordmark/)
    })

    it('GameBreadcrumb uses mono kicker + cetus hairline', () => {
        const html = renderToStaticMarkup(
            createElement(GameBreadcrumb, { icon: '🟦', title: 'Tetris' })
        )
        expect(html).toMatch(/font-mono/)
        expect(html).toContain('border-cetus-hairline')
        expect(html).toContain('▸ Tetris')
        expect(html).not.toMatch(/text-cyan-400/)
    })

    it('GameStats exposes score and time-remaining with defaults', () => {
        const html = renderToStaticMarkup(createElement(GameStats, {}))
        expect(html).toContain('id="score"')
        expect(html).toContain('id="time-remaining"')
        expect(html).toContain('>60<')
        expect(html).toMatch(/Score:/)
        expect(html).toMatch(/Time:/)
    })

    it('GameStats can hide score or time and renders additional stats', () => {
        const html = renderToStaticMarkup(
            createElement(
                GameStats,
                { showScore: false, initialTime: 90 },
                createElement('span', { id: 'extra-stat' }, 'Extra')
            )
        )
        expect(html).not.toContain('id="score"')
        expect(html).toContain('id="time-remaining"')
        expect(html).toContain('>90<')
        expect(html).toContain('id="extra-stat"')
    })

    it('GameControls exposes start/end/pause/reset with visibility defaults', () => {
        const html = renderToStaticMarkup(createElement(GameControls, {}))
        expect(html).toContain('id="start-btn"')
        expect(html).toContain('Start Game')
        expect(html).toMatch(/id="end-btn"[^>]*style="display:none"/)
        expect(html).toContain('End Game')
        expect(html).toContain('id="pause-btn"')
        expect(html).toContain('Pause')
        expect(html).toContain('id="reset-btn"')
        expect(html).toContain('Reset')
    })

    it('GameControls can hide individual buttons', () => {
        const html = renderToStaticMarkup(
            createElement(GameControls, {
                showPause: false,
                showReset: false,
                showEnd: false,
            })
        )
        expect(html).toContain('id="start-btn"')
        expect(html).not.toContain('id="end-btn"')
        expect(html).not.toContain('id="pause-btn"')
        expect(html).not.toContain('id="reset-btn"')
    })

    it('GameOverlay uses Fraunces + mono score, not Orbitron', () => {
        const html = renderToStaticMarkup(
            createElement(GameOverlay, null, 'Score: 100')
        )
        expect(html).toMatch(/cetus-wordmark/)
        expect(html).toMatch(/font-mono/)
        expect(html).toContain('id="game-over-overlay"')
        expect(html).toContain('id="play-again-btn"')
        // tailwind-merge must not drop `flex` in favor of `hidden` — games
        // show the overlay via classList.remove('hidden').
        const overlayClass = html.match(
            /id="game-over-overlay"[^>]*class="([^"]*)"/
        )?.[1]
        expect(overlayClass).toContain('flex')
        expect(overlayClass).toContain('hidden')
        expect(html).toContain('Score: 100')
        expect(html).not.toMatch(/font-orbitron/)
        expect(html).not.toMatch(/text-cyan-400/)
    })
})
