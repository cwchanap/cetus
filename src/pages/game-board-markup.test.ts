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
const mineGridMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/mine-grid/index.astro'),
    'utf-8'
)
const gravityFlipMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/gravity-flip/index.astro'),
    'utf-8'
)
const asteroidDriftMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/asteroid-drift/index.astro'),
    'utf-8'
)
const chromaticTideMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/chromatic-tide/index.astro'),
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
    'mine-grid',
    'pattern-pulse',
    'gravity-flip',
    'potion-sorter',
    'signal-switch',
    'rhythm-reactor',
    'asteroid-drift',
    'chromatic-tide',
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

const patternPulseMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/pattern-pulse/index.astro'),
    'utf-8'
)

describe('Mine Grid page markup', () => {
    it('keeps the two-container board and root-level initializer', () => {
        expect(mineGridMarkup).toContain('id="mine-grid-container"')
        expect(mineGridMarkup).toContain('id="mine-grid-board"')
        expect(mineGridMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initMineGridGameFramework/
        )
    })
})

describe('Pattern Pulse page markup', () => {
    it('keeps the static pad board and root-level initializer', () => {
        expect(patternPulseMarkup).toContain('id="pattern-pulse-container"')
        expect(patternPulseMarkup).toContain('id="pattern-pulse-board"')
        expect(
            patternPulseMarkup.match(/data-pattern-pad="[0-3]"/g)
        ).toHaveLength(4)
        expect(patternPulseMarkup).toContain('id="pattern-status"')
        expect(patternPulseMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initPatternPulseGameFramework/
        )
    })
})

describe('Gravity Flip page markup', () => {
    it('keeps stable board controls and root-level initializer', () => {
        for (const id of [
            'gravity-flip-container',
            'gravity-flip-canvas',
            'flip-btn',
            'gravity-direction',
            'distance-traveled',
            'stars-collected',
            'flip-count',
            'world-speed',
            'final-outcome',
            'final-distance',
            'final-stars',
            'final-flips',
            'start-btn',
            'reset-btn',
        ]) {
            expect(gravityFlipMarkup).toContain(`id="${id}"`)
        }
        expect(gravityFlipMarkup).not.toContain('id="end-btn"')
        expect(gravityFlipMarkup).toContain('id="world-speed">—</span>')
        expect(gravityFlipMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initGravityFlipGameFramework/
        )
    })
})

describe('Asteroid Drift page markup', () => {
    it('keeps stable board, D-pad controls, and root-level initializer', () => {
        for (const id of [
            'asteroid-drift-container',
            'asteroid-drift-canvas',
            'asteroid-drift-status',
            'orbs-collected',
            'ship-speed',
            'asteroid-drift-dpad',
            'final-outcome',
            'final-survival',
            'final-orbs',
            'start-btn',
            'reset-btn',
        ]) {
            expect(asteroidDriftMarkup).toContain(`id="${id}"`)
        }
        const dpadButtons =
            asteroidDriftMarkup.match(/<button[^>]*data-direction=[^>]*>/g) ??
            []
        expect(dpadButtons).toHaveLength(4)
        for (const direction of ['up', 'left', 'down', 'right']) {
            expect(dpadButtons.join('\n')).toContain(
                `data-direction="${direction}"`
            )
        }
        for (const button of dpadButtons) {
            expect(button).toContain('type="button"')
            expect(button).toContain('tabindex="-1"')
            expect(button).toContain('aria-label=')
        }
        expect(asteroidDriftMarkup).toContain('slot="controls"')
        expect(asteroidDriftMarkup).not.toContain('id="end-btn"')
        expect(asteroidDriftMarkup).toContain('showPause={false}')
        expect(asteroidDriftMarkup).toContain('showEnd={false}')
        expect(asteroidDriftMarkup).toContain('showReset={true}')
        expect(asteroidDriftMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initAsteroidDriftGameFramework/
        )
    })

    it('bootstraps the framework after DOMContentLoaded', () => {
        const readyIndex = asteroidDriftMarkup.indexOf('DOMContentLoaded')
        const initCallIndex = asteroidDriftMarkup.indexOf(
            'initAsteroidDriftGameFramework()'
        )
        expect(readyIndex).toBeGreaterThan(-1)
        expect(initCallIndex).toBeGreaterThan(readyIndex)
    })
})

describe('Chromatic Tide page markup', () => {
    it('keeps the presentational board in the load-bearing named slot', () => {
        expect(chromaticTideMarkup).toContain('slot="game-board"')
        expect(chromaticTideMarkup).toContain('gameId="chromatic-tide"')
        expect(chromaticTideMarkup).toContain('initialTime={90}')
        expect(chromaticTideMarkup).toContain('showPause={false}')
        expect(chromaticTideMarkup).toContain('showEnd={false}')
        expect(chromaticTideMarkup).toContain('id="chromatic-tide-board"')
        expect(chromaticTideMarkup).toContain('id="chromatic-tide-status"')
        expect(chromaticTideMarkup).toContain('aria-live="polite"')
        expect(chromaticTideMarkup.match(/data-tide-color=/g)).toHaveLength(5)
        expect(chromaticTideMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initChromaticTideGameFramework/
        )

        const boardTag = chromaticTideMarkup.match(
            /<div[^>]*id="chromatic-tide-board"[^>]*>/
        )?.[0]
        expect(boardTag).toBeDefined()
        expect(boardTag).not.toContain('role="grid"')
        expect(boardTag).toContain('aria-hidden="true"')
    })
})

const potionSorterMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/potion-sorter/index.astro'),
    'utf-8'
)

const signalSwitchMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/signal-switch/index.astro'),
    'utf-8'
)
const rhythmReactorMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/rhythm-reactor/index.astro'),
    'utf-8'
)

describe('Signal Switch page markup', () => {
    it('keeps stable board, control, and final-stat ids with four lane gates', () => {
        for (const id of [
            'signal-switch-container',
            'signal-switch-canvas',
            'signal-switch-status',
            'gate-controls',
            'signal-switch-integrity',
            'signal-switch-combo',
            'signal-switch-safe-passes',
            'signal-switch-lanes',
            'signal-switch-speed',
            'final-outcome',
            'final-safe-passes',
            'final-crashes',
            'final-max-combo',
            'final-integrity',
            'start-btn',
            'reset-btn',
        ]) {
            expect(signalSwitchMarkup).toContain(`id="${id}"`)
        }
        expect(
            signalSwitchMarkup.match(/data-signal-lane="[0-3]"/g)
        ).toHaveLength(4)
        expect(signalSwitchMarkup).toContain('showPause={false}')
        expect(signalSwitchMarkup).toContain('showEnd={false}')
        expect(signalSwitchMarkup).not.toContain('id="end-btn"')
        expect(signalSwitchMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initSignalSwitchGameFramework/
        )
    })

    it('bootstraps the framework after DOMContentLoaded', () => {
        const readyIndex = signalSwitchMarkup.indexOf('DOMContentLoaded')
        const initCallIndex = signalSwitchMarkup.indexOf(
            'initSignalSwitchGameFramework()'
        )
        expect(readyIndex).toBeGreaterThan(-1)
        expect(initCallIndex).toBeGreaterThan(readyIndex)
    })
})

describe('Rhythm Reactor page markup', () => {
    it('keeps the board, lane controls, HUD, and final-stat ids', () => {
        const source = rhythmReactorMarkup
        expect(source).toContain('id="rhythm-reactor-controls"')
        expect(source.match(/data-rhythm-lane=/g)).toHaveLength(4)
        for (const id of [
            'rhythm-reactor-combo',
            'rhythm-reactor-hits',
            'rhythm-reactor-judgment',
            'rhythm-reactor-stability',
            'rhythm-reactor-status',
            'final-hits',
            'final-misses',
            'final-stray-presses',
            'final-perfect',
            'final-good',
            'final-max-combo',
            'final-accuracy',
            'final-stability',
        ]) {
            expect(source).toContain(`id="${id}"`)
        }
        expect(source).toContain('showPause={false}')
        expect(source).toContain('showEnd={false}')
        expect(source).toContain('showReset={true}')
        const readyIndex = source.indexOf('DOMContentLoaded')
        const initIndex = source.indexOf('initRhythmReactorGameFramework()')
        expect(readyIndex).toBeGreaterThanOrEqual(0)
        expect(initIndex).toBeGreaterThan(readyIndex)
    })
})

describe('Potion Sorter page markup', () => {
    it('keeps the tube board, dead-end undo, HUD ids, and root-level initializer', () => {
        expect(potionSorterMarkup).toContain('id="potion-sorter-container"')
        expect(potionSorterMarkup).toContain('id="potion-sorter-board"')
        expect(potionSorterMarkup).toContain('id="undo-btn"')
        expect(potionSorterMarkup).toContain('data-dead-end="false"')
        expect(potionSorterMarkup).toContain('id="potion-sorter-status"')
        expect(potionSorterMarkup).toContain('showPause={false}')
        expect(potionSorterMarkup).toContain('showEnd={false}')
        expect(potionSorterMarkup).toContain('initialTime={300}')
        expect(potionSorterMarkup).not.toContain('id="end-btn"')
        expect(potionSorterMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initPotionSorterGameFramework/
        )
        for (const id of [
            'easy-btn',
            'medium-btn',
            'hard-btn',
            'difficulty',
            'moves',
            'undos',
        ]) {
            expect(potionSorterMarkup).toContain(`id="${id}"`)
        }
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
