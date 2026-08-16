import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const reflexMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/reflex/index.astro'),
    'utf-8'
)
const evaderMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/evader/index.astro'),
    'utf-8'
)
const circuitHackerMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/circuit-hacker/index.astro'),
    'utf-8'
)
const bubbleShooterMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/bubble-shooter/index.astro'),
    'utf-8'
)
const iceSlideMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/ice-slide/index.astro'),
    'utf-8'
)

const games = [
    'tetris',
    'bubble-shooter',
    'memory-matrix',
    'quick-math',
    'word-scramble',
    'reflex',
    'sudoku',
    'bejeweled',
    'path-navigator',
    'evader',
    '2048',
    'snake',
    'circuit-hacker',
    'satellite-sync',
    'ice-slide',
]

describe('Game board page markup', () => {
    it('keeps Reflex and Evader default boards visible before start', () => {
        expect(reflexMarkup).toMatch(/id="game-status"[^>]*class="[^"]*hidden/)
        expect(evaderMarkup).toMatch(/id="game-status"[^>]*class="[^"]*hidden/)
    })

    it('exposes the Circuit Hacker canvas container and difficulty select', () => {
        expect(circuitHackerMarkup).toContain('id="game-canvas-container"')
        expect(circuitHackerMarkup).toContain('id="difficulty-select"')
    })
})

describe('Bubble Shooter rules copy', () => {
    it('sources rowAddInterval from config and reflects Tasks 4-6 mechanics', () => {
        expect(bubbleShooterMarkup).toContain(
            'DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval'
        )
        expect(bubbleShooterMarkup).toContain(
            'Disconnected bubbles fall after a match'
        )
        expect(bubbleShooterMarkup).not.toContain(
            'New row appears after each shot'
        )
    })
})

describe('Ice Slide Daily and Expedition challenge markup', () => {
    it('keeps stable mode, HUD, and result selectors', () => {
        expect(iceSlideMarkup).toContain('id="ice-slide-mode-selector"')
        expect(iceSlideMarkup).toContain('value="campaign"')
        expect(iceSlideMarkup).toContain('value="daily"')
        expect(iceSlideMarkup).toContain('value="expedition"')
        expect(iceSlideMarkup).toContain('id="daily-meta"')
        expect(iceSlideMarkup).toContain('id="daily-date"')
        expect(iceSlideMarkup).toContain('id="daily-reset"')
        expect(iceSlideMarkup).toContain('id="daily-stage-progress"')
        expect(iceSlideMarkup).toContain('id="stage-clear-overlay"')
        expect(iceSlideMarkup).toContain('id="stage-clear-continue-btn"')
        expect(iceSlideMarkup).toContain('id="run-final-stage-result"')
        expect(iceSlideMarkup).toContain('id="run-final-heading"')
        expect(iceSlideMarkup).toContain('id="run-final-clear"')
        expect(iceSlideMarkup).toContain('id="run-final-efficient"')
        expect(iceSlideMarkup).toContain('id="run-final-bonus"')
        expect(iceSlideMarkup).toContain('id="change-mode-btn"')
        expect(iceSlideMarkup).toContain('id="expedition-route-choice-overlay"')
        expect(iceSlideMarkup).toContain('id="expedition-safe-btn"')
        expect(iceSlideMarkup).toContain('id="expedition-risk-btn"')
        expect(iceSlideMarkup).toContain('id="expedition-undo-btn"')
        expect(iceSlideMarkup).toMatch(
            /id="expedition-route-choice-overlay"[^>]*class="[^"]*hidden/
        )
        expect(iceSlideMarkup).toMatch(
            /<Button id="expedition-safe-btn" type="button">/
        )
        expect(iceSlideMarkup).toMatch(
            /<Button id="expedition-risk-btn" type="button">/
        )
        const expeditionStars = iceSlideMarkup.match(
            /<span id="expedition-stars">([\s\S]*?)<\/span>/
        )?.[1]
        expect(expeditionStars).toBe('Stars 0 / —')
        expect(expeditionStars).not.toContain('/ 18')
        expect(iceSlideMarkup).toContain('id="expedition-meta"')
        expect(iceSlideMarkup).toContain('id="expedition-seed"')
        expect(iceSlideMarkup).toContain('id="expedition-stage-progress"')
        expect(iceSlideMarkup).toContain('id="expedition-stars"')
        expect(iceSlideMarkup).toContain('id="expedition-attempts"')
        expect(iceSlideMarkup).toContain('id="expedition-objective-clear"')
        expect(iceSlideMarkup).toContain('id="expedition-objective-efficient"')
        expect(iceSlideMarkup).toContain('id="expedition-objective-bonus"')
        expect(iceSlideMarkup).toContain('id="expedition-summary"')
        expect(iceSlideMarkup).toContain('id="expedition-summary-seed"')
        expect(iceSlideMarkup).toContain('id="expedition-summary-progress"')
        expect(iceSlideMarkup).toContain('id="expedition-summary-stars"')
        expect(iceSlideMarkup).toContain('id="expedition-summary-moves"')
        expect(iceSlideMarkup).toContain('id="expedition-summary-crystals"')
        expect(iceSlideMarkup).toContain('id="expedition-summary-attempts"')
        expect(iceSlideMarkup).toContain('id="expedition-summary-time"')
        expect(iceSlideMarkup).toContain('id="new-expedition-btn"')
        expect(iceSlideMarkup).toContain('id="daily-leaderboard"')
        expect(iceSlideMarkup).toContain('id="daily-leaderboard-date"')
        expect(iceSlideMarkup).toContain('id="daily-leaderboard-signed-out"')
        expect(iceSlideMarkup).toContain('id="daily-leaderboard-loading"')
        expect(iceSlideMarkup).toContain('id="daily-leaderboard-empty"')
        expect(iceSlideMarkup).toContain('id="daily-leaderboard-unavailable"')
        expect(iceSlideMarkup).toContain('id="daily-leaderboard-rows"')
    })
})

describe('Game pages use GamePage wrapper', () => {
    for (const game of games) {
        it(`${game} imports and uses GamePage`, () => {
            const src = readFileSync(
                resolve(process.cwd(), `src/pages/${game}/index.astro`),
                'utf-8'
            )
            expect(src).toContain('GamePage')
            expect(src).toContain('slot="game-board"')
            // Should NOT import AppLayout directly anymore
            expect(src).not.toMatch(/import AppLayout/)
        })
    }
})
