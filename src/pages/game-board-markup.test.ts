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

describe('Ice Slide Daily challenge markup', () => {
    it('keeps stable mode, HUD, and result selectors', () => {
        expect(iceSlideMarkup).toContain('id="ice-slide-mode-selector"')
        expect(iceSlideMarkup).toContain('value="campaign"')
        expect(iceSlideMarkup).toContain('value="daily"')
        expect(iceSlideMarkup).not.toContain('value="expedition"')
        expect(iceSlideMarkup).toContain('id="daily-meta"')
        expect(iceSlideMarkup).toContain('id="daily-date"')
        expect(iceSlideMarkup).toContain('id="daily-reset"')
        expect(iceSlideMarkup).toContain('id="daily-stage-progress"')
        expect(iceSlideMarkup).toContain('id="stage-clear-overlay"')
        expect(iceSlideMarkup).toContain('id="stage-clear-continue-btn"')
        expect(iceSlideMarkup).toContain('id="daily-final-stage-result"')
        expect(iceSlideMarkup).toContain('id="change-mode-btn"')
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
