import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appRoot } from '@/test/app-root'

const reflexIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/ReflexScreen.tsx'),
    'utf-8'
)
const evaderIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/EvaderScreen.tsx'),
    'utf-8'
)
const circuitHackerIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/CircuitHackerScreen.tsx'),
    'utf-8'
)
const circuitHackerRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/circuit-hacker/index.astro'),
    'utf-8'
)
const satelliteSyncIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/SatelliteSyncScreen.tsx'),
    'utf-8'
)
const satelliteSyncRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/satellite-sync/index.astro'),
    'utf-8'
)
const bubbleShooterMarkup = readFileSync(
    resolve(appRoot, 'src/pages/bubble-shooter/index.astro'),
    'utf-8'
)
const iceSlideIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/IceSlideScreen.tsx'),
    'utf-8'
)
const iceSlideRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/ice-slide/index.astro'),
    'utf-8'
)
const mineGridIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/MineGridScreen.tsx'),
    'utf-8'
)
const mineGridRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/mine-grid/index.astro'),
    'utf-8'
)
const gravityFlipMarkup = readFileSync(
    resolve(appRoot, 'src/pages/gravity-flip/index.astro'),
    'utf-8'
)
const gravityFlipIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/GravityFlipScreen.tsx'),
    'utf-8'
)
const asteroidDriftMarkup = readFileSync(
    resolve(appRoot, 'src/pages/asteroid-drift/index.astro'),
    'utf-8'
)
const asteroidDriftIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/AsteroidDriftScreen.tsx'),
    'utf-8'
)
const chromaticTideIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/ChromaticTideScreen.tsx'),
    'utf-8'
)
const chromaticTideRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/chromatic-tide/index.astro'),
    'utf-8'
)

const fieldPlateGames = ['tetris', 'bubble-shooter', 'bejeweled', '2048']

describe('Game board page markup', () => {
    it('keeps Reflex and Evader default boards visible before start', () => {
        // Reflex's and Evader's boards (and their hidden-by-default
        // #game-status overlays) moved into their islands (HPA-393); the
        // markup lives in TSX now, so the class attribute is spelled
        // className.
        expect(reflexIslandMarkup).toMatch(
            /id="game-status"[^>]*className="[^"]*hidden/
        )
        expect(evaderIslandMarkup).toMatch(
            /id="game-status"[^>]*className="[^"]*hidden/
        )
    })
})

describe('Bubble Shooter rules copy', () => {
    it('sources rowAddInterval from config and reflects Tasks 4-6 mechanics', () => {
        expect(bubbleShooterMarkup).toMatch(
            /\{\s*rowAddInterval[^}]*\}\s*=\s*DEFAULT_BUBBLE_SHOOTER_CONFIG/
        )
        expect(bubbleShooterMarkup).toContain(
            'connection to the ceiling fall too'
        )
        expect(bubbleShooterMarkup).not.toContain(
            'New row appears after each shot'
        )
    })
})

describe('Ice Slide island markup', () => {
    it('keeps the thin route with the island import and no root script', () => {
        expect(iceSlideRouteMarkup).toContain(
            "import IceSlideScreen from '@/components/islands/games/IceSlideScreen'"
        )
        expect(iceSlideRouteMarkup).toContain('client:load')
        expect(iceSlideRouteMarkup).not.toMatch(/<script[^>]*>/)
    })

    it('keeps stable mode, HUD, and result selectors in the island', () => {
        // Board, mode selector, bespoke overlays/panels, result rows and
        // result-action ids moved into the island (HPA-393) with the class
        // attribute spelled className in TSX; every frozen id stays alive.
        const markup = iceSlideIslandMarkup
        expect(markup).toContain('id="ice-slide-mode-selector"')
        expect(markup).toContain('value="campaign"')
        expect(markup).toContain('value="daily"')
        expect(markup).toContain('value="expedition"')
        expect(markup).toContain('id="daily-meta"')
        expect(markup).toContain('id="daily-date"')
        expect(markup).toContain('id="daily-reset"')
        expect(markup).toContain('id="daily-stage-progress"')
        expect(markup).toContain('id="stage-clear-overlay"')
        expect(markup).toContain('id="stage-clear-continue-btn"')
        expect(markup).toContain('id="run-final-stage-result"')
        expect(markup).toContain('id="run-final-heading"')
        expect(markup).toContain('id="run-final-clear"')
        expect(markup).toContain('id="run-final-efficient"')
        expect(markup).toContain('id="run-final-bonus"')
        expect(markup).toContain('id="change-mode-btn"')
        expect(markup).toContain('id="expedition-route-choice-overlay"')
        expect(markup).toContain('id="expedition-safe-btn"')
        expect(markup).toContain('id="expedition-risk-btn"')
        expect(markup).toContain('id="expedition-undo-btn"')
        expect(markup).toMatch(
            /id="expedition-route-choice-overlay"[^>]*className="[^"]*hidden/
        )
        expect(markup).toMatch(
            /<Button id="expedition-safe-btn" type="button">/
        )
        expect(markup).toMatch(
            /<Button id="expedition-risk-btn" type="button">/
        )
        const expeditionStars = markup.match(
            /<span id="expedition-stars">([\s\S]*?)<\/span>/
        )?.[1]
        expect(expeditionStars).toBe('Stars 0 / —')
        expect(expeditionStars).not.toContain('/ 18')
        expect(markup).toContain('id="expedition-meta"')
        expect(markup).toContain('id="expedition-seed"')
        expect(markup).toContain('id="expedition-stage-progress"')
        expect(markup).toContain('id="expedition-stars"')
        expect(markup).toContain('id="expedition-attempts"')
        expect(markup).toContain('id="expedition-objective-clear"')
        expect(markup).toContain('id="expedition-objective-efficient"')
        expect(markup).toContain('id="expedition-objective-bonus"')
        expect(markup).toContain('id="expedition-summary"')
        expect(markup).toContain('id="expedition-summary-seed"')
        expect(markup).toContain('id="expedition-summary-progress"')
        expect(markup).toContain('id="expedition-summary-stars"')
        expect(markup).toContain('id="expedition-summary-moves"')
        expect(markup).toContain('id="expedition-summary-crystals"')
        expect(markup).toContain('id="expedition-summary-attempts"')
        expect(markup).toContain('id="expedition-summary-time"')
        expect(markup).toContain('id="new-expedition-btn"')
        expect(markup).toContain('id="daily-leaderboard"')
        expect(markup).toContain('id="daily-leaderboard-date"')
        expect(markup).toContain('id="daily-leaderboard-signed-out"')
        expect(markup).toContain('id="daily-leaderboard-loading"')
        expect(markup).toContain('id="daily-leaderboard-empty"')
        expect(markup).toContain('id="daily-leaderboard-unavailable"')
        expect(markup).toContain('id="daily-leaderboard-rows"')
    })
})

const patternPulseIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/PatternPulseScreen.tsx'),
    'utf-8'
)
const patternPulseRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/pattern-pulse/index.astro'),
    'utf-8'
)

const pathNavigatorIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/PathNavigatorScreen.tsx'),
    'utf-8'
)
const pathNavigatorRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/path-navigator/index.astro'),
    'utf-8'
)

describe('Path Navigator island markup', () => {
    it('keeps the board, level badge, and final-stat ids in the island and the route thin', () => {
        expect(pathNavigatorRouteMarkup).toContain(
            "import PathNavigatorScreen from '@/components/islands/games/PathNavigatorScreen'"
        )
        expect(pathNavigatorRouteMarkup).toContain('client:load')
        expect(pathNavigatorRouteMarkup).not.toMatch(/<script[^>]*>/)
        expect(pathNavigatorIslandMarkup).toContain(
            'id="path-navigator-container"'
        )
        for (const id of ['level', 'levels-completed', 'total-time']) {
            expect(pathNavigatorIslandMarkup).toContain(`id="${id}"`)
        }
        // Legacy GamePage props: pause/reset hidden, start/end pair only.
        expect(pathNavigatorIslandMarkup).toContain('showPause: false')
        expect(pathNavigatorIslandMarkup).toContain('showReset: false')
    })
})

describe('Mine Grid island markup', () => {
    it('keeps the two-container board in the island and the route thin', () => {
        expect(mineGridRouteMarkup).toContain(
            "import MineGridScreen from '@/components/islands/games/MineGridScreen'"
        )
        expect(mineGridRouteMarkup).toContain('client:load')
        expect(mineGridRouteMarkup).not.toMatch(/<script[^>]*>/)
        expect(mineGridIslandMarkup).toContain('id="mine-grid-container"')
        expect(mineGridIslandMarkup).toContain('id="mine-grid-board"')
    })
})

describe('Circuit Hacker island markup', () => {
    it('keeps the thin route with the island import and no root script', () => {
        expect(circuitHackerRouteMarkup).toContain(
            "import CircuitHackerScreen from '@/components/islands/games/CircuitHackerScreen'"
        )
        expect(circuitHackerRouteMarkup).toContain('client:load')
        expect(circuitHackerRouteMarkup).not.toMatch(/<script[^>]*>/)
    })

    it('keeps the canvas container, difficulty select, HUD, and final-stat ids in the island', () => {
        // Board, bespoke difficulty select + start/stop pair, error surface
        // and final-stat ids moved into the island (HPA-393) with the class
        // attribute spelled className in TSX.
        for (const id of [
            'game-canvas-container',
            'game-status',
            'game-error',
            'game-error-title',
            'game-error-message',
            'difficulty-select',
            'rotation-count',
            'start-btn',
            'stop-btn',
            'final-score',
            'final-time',
            'final-rotations',
        ]) {
            expect(circuitHackerIslandMarkup).toContain(`id="${id}"`)
        }
        // The frozen option values survive verbatim.
        for (const value of ['easy', 'medium', 'hard', 'expert']) {
            expect(circuitHackerIslandMarkup).toContain(`value="${value}"`)
        }
        // Legacy GamePage props preserved: no built-in score readout and
        // no shared end button — Circuit Hacker keeps its custom #stop-btn.
        expect(circuitHackerIslandMarkup).toContain('showScore: false')
        expect(circuitHackerIslandMarkup).not.toContain('id="end-btn"')
    })
})

describe('Satellite Sync island markup', () => {
    it('keeps the thin route with the island import and no root script', () => {
        expect(satelliteSyncRouteMarkup).toContain(
            "import SatelliteSyncScreen from '@/components/islands/games/SatelliteSyncScreen'"
        )
        expect(satelliteSyncRouteMarkup).toContain('client:load')
        expect(satelliteSyncRouteMarkup).not.toMatch(/<script[^>]*>/)
    })

    it('keeps the canvas container, HUD badges, error banner, and control ids in the island', () => {
        // Board, HUD badges (level/combo), error banner, start/end pair
        // and overlay ids moved into the island (HPA-393) with the class
        // attribute spelled className in TSX.
        for (const id of [
            'game-canvas-container',
            'game-status',
            'game-error',
            'level',
            'combo',
            'start-btn',
            'end-btn',
        ]) {
            expect(satelliteSyncIslandMarkup).toContain(`id="${id}"`)
        }
        // The frozen overlay contract: legacy GamePage props preserved
        // (overlayTitle, Play Again) and the built-in final-score span.
        expect(satelliteSyncIslandMarkup).toContain('MISSION COMPLETE!')
        expect(satelliteSyncIslandMarkup).toContain("TIME'S UP!")
        expect(satelliteSyncIslandMarkup).toContain("buttonText: 'Play Again'")
        // The manual end button returns to the pre-start prompt via the
        // seam's onIdle transition (no shared reset button).
        expect(satelliteSyncIslandMarkup).toContain('onIdle')
        expect(satelliteSyncIslandMarkup).not.toContain('id="reset-btn"')
    })
})

describe('Pattern Pulse island markup', () => {
    it('keeps the static pad board in the island and the route thin', () => {
        expect(patternPulseRouteMarkup).toContain(
            "import PatternPulseScreen from '@/components/islands/games/PatternPulseScreen'"
        )
        expect(patternPulseRouteMarkup).toContain('client:load')
        expect(patternPulseRouteMarkup).not.toMatch(/<script[^>]*>/)
        expect(patternPulseIslandMarkup).toContain(
            'id="pattern-pulse-container"'
        )
        expect(patternPulseIslandMarkup).toContain('id="pattern-pulse-board"')
        expect(
            patternPulseIslandMarkup.match(/data-pattern-pad="[0-3]"/g)
        ).toHaveLength(4)
        expect(patternPulseIslandMarkup).toContain('id="pattern-status"')
    })
})

describe('Gravity Flip island markup', () => {
    it('keeps the thin route with the island import and no root script', () => {
        expect(gravityFlipMarkup).toContain(
            "import GravityFlipScreen from '@/components/islands/games/GravityFlipScreen'"
        )
        expect(gravityFlipMarkup).toContain('client:load')
        expect(gravityFlipMarkup).not.toMatch(/<script[^>]*>/)
    })

    it('keeps stable board, control, HUD, and final-stat ids in the island', () => {
        // Board, HUD badges, bespoke flip button and final-stat ids moved
        // into the island (HPA-393) with the class attribute spelled
        // className in TSX.
        for (const id of [
            'gravity-flip-container',
            'gravity-flip-canvas',
            'gravity-flip-status',
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
            expect(gravityFlipIslandMarkup).toContain(`id="${id}"`)
        }
        expect(gravityFlipIslandMarkup).not.toContain('id="end-btn"')
        // Pre-hydration world speed keeps the legacy em-dash placeholder
        // (idle snapshot projection default).
        expect(gravityFlipIslandMarkup).toContain("speed: '—'")
    })
})

describe('Asteroid Drift island markup', () => {
    it('keeps the thin route with the island import and no root script', () => {
        expect(asteroidDriftMarkup).toContain(
            "import AsteroidDriftScreen from '@/components/islands/games/AsteroidDriftScreen'"
        )
        expect(asteroidDriftMarkup).toContain('client:load')
        expect(asteroidDriftMarkup).not.toMatch(/<script[^>]*>/)
    })

    it('keeps stable board, D-pad, HUD, and final-stat ids in the island', () => {
        // Board, HUD badges, D-pad controls and final-stat ids moved into
        // the island (HPA-393) with the class attribute spelled className
        // in TSX.
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
            expect(asteroidDriftIslandMarkup).toContain(`id="${id}"`)
        }
        const dpadButtons =
            asteroidDriftIslandMarkup.match(
                /<button[^>]*data-direction=[^>]*>/g
            ) ?? []
        expect(dpadButtons).toHaveLength(4)
        for (const direction of ['up', 'left', 'down', 'right']) {
            expect(dpadButtons.join('\n')).toContain(
                `data-direction="${direction}"`
            )
        }
        for (const button of dpadButtons) {
            expect(button).toContain('type="button"')
            expect(button).toContain('tabIndex={-1}')
            expect(button).toContain('aria-label=')
        }
        expect(asteroidDriftIslandMarkup).not.toContain('id="end-btn"')
    })
})

describe('Chromatic Tide island markup', () => {
    it('keeps the flood-fill board, color controls, and live status in the island and the route thin', () => {
        expect(chromaticTideRouteMarkup).toContain(
            "import ChromaticTideScreen from '@/components/islands/games/ChromaticTideScreen'"
        )
        expect(chromaticTideRouteMarkup).toContain('client:load')
        expect(chromaticTideRouteMarkup).not.toMatch(/<script[^>]*>/)
        expect(chromaticTideIslandMarkup).toContain('id="chromatic-tide-board"')
        expect(chromaticTideIslandMarkup).toContain(
            'id="chromatic-tide-status"'
        )
        expect(chromaticTideIslandMarkup).toContain('aria-live="polite"')
        expect(
            chromaticTideIslandMarkup.match(
                /color: '(teal|amber|magenta|ice|green)'/g
            )
        ).toHaveLength(5)
        expect(chromaticTideIslandMarkup).toContain('data-tide-color={color}')

        const boardTag = chromaticTideIslandMarkup.match(
            /<div[^>]*id="chromatic-tide-board"[^>]*>/
        )?.[0]
        expect(boardTag).toBeDefined()
        expect(boardTag).not.toContain('role="grid"')
        expect(boardTag).toContain('aria-hidden="true"')

        const colorsTag = chromaticTideIslandMarkup.match(
            /<div[^>]*id="chromatic-tide-colors"[^>]*>/
        )?.[0]
        expect(colorsTag).toBeDefined()
        expect(colorsTag).toContain('role="group"')
        expect(colorsTag).toContain('aria-label="Choose territory color"')
    })
})

const potionSorterIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/PotionSorterScreen.tsx'),
    'utf-8'
)
const potionSorterRouteMarkup = readFileSync(
    resolve(appRoot, 'src/pages/potion-sorter/index.astro'),
    'utf-8'
)

const signalSwitchIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/SignalSwitchScreen.tsx'),
    'utf-8'
)
const signalSwitchMarkup = readFileSync(
    resolve(appRoot, 'src/pages/signal-switch/index.astro'),
    'utf-8'
)
const rhythmReactorMarkup = readFileSync(
    resolve(appRoot, 'src/pages/rhythm-reactor/index.astro'),
    'utf-8'
)
const rhythmReactorIslandMarkup = readFileSync(
    resolve(appRoot, 'src/components/islands/games/RhythmReactorScreen.tsx'),
    'utf-8'
)

describe('Signal Switch island markup', () => {
    it('keeps the thin route with the island import and no root script', () => {
        expect(signalSwitchMarkup).toContain(
            "import SignalSwitchScreen from '@/components/islands/games/SignalSwitchScreen'"
        )
        expect(signalSwitchMarkup).toContain('client:load')
        expect(signalSwitchMarkup).not.toMatch(/<script[^>]*>/)
    })

    it('keeps stable board, control, and final-stat ids with four lane gates', () => {
        // Board, HUD badges, bespoke gate controls and final-stat ids moved
        // into the island (HPA-393) with the class attribute spelled
        // className in TSX.
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
            expect(signalSwitchIslandMarkup).toContain(`id="${id}"`)
        }
        // The bespoke lane-gate markers render from the four-entry rule
        // constant; the RTL test counts the rendered buttons, the e2e
        // asserts the runtime selector structure.
        expect(signalSwitchIslandMarkup).toContain('data-signal-lane={index}')
        expect(signalSwitchIslandMarkup).not.toContain('id="end-btn"')
    })
})

describe('Rhythm Reactor island markup', () => {
    it('keeps the thin route with the island import and no root script', () => {
        expect(rhythmReactorMarkup).toContain(
            "import RhythmReactorScreen from '@/components/islands/games/RhythmReactorScreen'"
        )
        expect(rhythmReactorMarkup).toContain('client:load')
        expect(rhythmReactorMarkup).not.toMatch(/<script[^>]*>/)
    })

    it('keeps the board, lane controls, HUD, and final-stat ids in the island', () => {
        // Board, HUD badges, bespoke lane controls and final-stat ids moved
        // into the island (HPA-393) with the class attribute spelled
        // className in TSX.
        const source = rhythmReactorIslandMarkup
        expect(source).toContain('id="rhythm-reactor-controls"')
        // The bespoke lane markers render from the four-entry lane list;
        // the RTL test counts the rendered buttons, the e2e asserts the
        // runtime selector structure (Signal Switch precedent).
        expect(source).toContain('data-rhythm-lane={index}')
        for (const id of [
            'rhythm-reactor-container',
            'rhythm-reactor-canvas',
            'rhythm-reactor-status',
            'rhythm-reactor-combo',
            'rhythm-reactor-hits',
            'rhythm-reactor-judgment',
            'rhythm-reactor-stability',
            'final-hits',
            'final-misses',
            'final-stray-presses',
            'final-perfect',
            'final-good',
            'final-max-combo',
            'final-accuracy',
            'final-stability',
            'start-btn',
            'reset-btn',
        ]) {
            expect(source).toContain(`id="${id}"`)
        }
        expect(source).not.toContain('id="end-btn"')
    })
})

describe('Potion Sorter island markup', () => {
    it('keeps the tube board, dead-end undo, and HUD ids in the island and the route thin', () => {
        expect(potionSorterRouteMarkup).toContain(
            "import PotionSorterScreen from '@/components/islands/games/PotionSorterScreen'"
        )
        expect(potionSorterRouteMarkup).toContain('client:load')
        expect(potionSorterRouteMarkup).not.toMatch(/<script[^>]*>/)
        expect(potionSorterIslandMarkup).toContain(
            'id="potion-sorter-container"'
        )
        expect(potionSorterIslandMarkup).toContain('id="potion-sorter-board"')
        expect(potionSorterIslandMarkup).toContain('id="undo-btn"')
        expect(potionSorterIslandMarkup).toContain('data-dead-end="false"')
        expect(potionSorterIslandMarkup).toContain('id="potion-sorter-status"')
        expect(potionSorterIslandMarkup).not.toContain('id="end-btn"')
        for (const id of [
            'easy-btn',
            'medium-btn',
            'hard-btn',
            'difficulty',
            'moves',
            'undos',
        ]) {
            expect(potionSorterIslandMarkup).toContain(`id="${id}"`)
        }
    })
})

describe('Field plate game pages', () => {
    for (const game of fieldPlateGames) {
        it(`${game} uses AppLayout with the field plate chrome`, () => {
            const src = readFileSync(
                resolve(appRoot, `src/pages/${game}/index.astro`),
                'utf-8'
            )
            expect(src).toMatch(/import AppLayout/)
            expect(src).toContain('data-field-plate')
            expect(src).toContain('slot="header"')
            expect(src).toContain('plate-header')
            expect(src).toContain('slot="notifications"')
            // Field plate pages replaced the shared GamePage chrome
            expect(src).not.toContain('GamePage')
        })
    }
})
