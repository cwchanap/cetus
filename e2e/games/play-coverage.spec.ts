import { test, expect, type Page } from '@playwright/test'
import { ASTEROID_DRIFT_RULES } from '../../src/lib/games/asteroid-drift/types'
import { selectGreedyChromaticTideColor } from '../../src/lib/games/chromatic-tide/test-fixtures'
import {
    CHROMATIC_TIDE_PALETTE,
    type ChromaticTideState,
} from '../../src/lib/games/chromatic-tide/types'
import { ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS } from '../../src/lib/games/ice-slide/test-fixtures'
import {
    ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS,
    createIceSlideExpeditionRunDefinition,
} from '../../src/lib/games/ice-slide/expedition'
import { parseGrid, slide } from '../../src/lib/games/ice-slide/physics'
import { SIGNAL_SWITCH_RULES } from '../../src/lib/games/signal-switch/types'
import { SIGNAL_SWITCH_BASE_PASS_POINTS } from '../../src/lib/games/signal-switch/scoring'
import type {
    Direction,
    GridPosition,
    IceSlideGameData,
    IceSlideRunDefinition,
    IceSlideState,
} from '../../src/lib/games/ice-slide/types'

/**
 * Two pinned 4-word seeds for deterministic Expedition crypto. The page
 * builds a 32-hex-char seed from the four words it draws on each fresh
 * Expedition start, so the override below returns these exact words for the
 * first two draws (first Expedition start, then New Expedition).
 */
const EXPEDITION_SEED_A_WORDS = [0x11111111, 0x22222222, 0x33333333, 0x44444444]
const EXPEDITION_SEED_B_WORDS = [0xaaaaaaaa, 0xbbbbbbbb, 0xcccccccc, 0xdddddddd]
const EXPEDITION_SEED_A_HEX = EXPEDITION_SEED_A_WORDS.map(word =>
    word.toString(16).padStart(8, '0')
).join('')
const EXPEDITION_SEED_B_HEX = EXPEDITION_SEED_B_WORDS.map(word =>
    word.toString(16).padStart(8, '0')
).join('')

/**
 * Breadth-first search over the same physics the page uses (parseGrid +
 * slide), producing a deterministic fall-free route for a generated stage.
 * Skipping `noop` and `hazard` outcomes mirrors `IceSlideGame.move`'s guard
 * behavior while avoiding falls entirely.
 */
function findExpeditionRoute(
    run: IceSlideRunDefinition,
    stageNumber: number
): readonly Direction[] {
    const stage = run.stages[stageNumber - 1]
    const grid = parseGrid({ id: stage.id, rows: stage.rows })
    let start: GridPosition | null = null
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            if (grid[row][col] === 'start') {
                start = { row, col }
            }
        }
    }
    if (!start) {
        throw new Error(`No start tile on ${run.seed} stage ${stageNumber}`)
    }
    const directions: Direction[] = ['N', 'E', 'S', 'W']
    const delta = (direction: Direction) => ({
        row: direction === 'N' ? -1 : direction === 'S' ? 1 : 0,
        col: direction === 'E' ? 1 : direction === 'W' ? -1 : 0,
    })
    const queue: Array<{
        pos: GridPosition
        path: Direction[]
        grid: ReturnType<typeof parseGrid>
    }> = [{ pos: start, path: [], grid: grid.map(row => [...row]) }]
    // Position-only visited set: crystals are consumed by slide() but do not
    // affect movement physics (they never block or redirect), so two paths
    // reaching the same position with different crystal states have identical
    // remaining routes. This keeps the BFS fast without tracking crystal state.
    const seen = new Set<string>([`${start.row},${start.col}`])
    let cursor = 0
    while (cursor < queue.length) {
        const current = queue[cursor]
        cursor++
        for (const direction of directions) {
            const nextGrid = current.grid.map(row => [...row])
            const outcome = slide(nextGrid, current.pos, delta(direction))
            if (outcome.kind !== 'moved') {
                continue
            }
            const key = `${outcome.end.row},${outcome.end.col}`
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            const path = [...current.path, direction]
            if (outcome.reachedGoal) {
                return path
            }
            queue.push({ pos: outcome.end, path, grid: nextGrid })
        }
        if (seen.size > 100_000) {
            break
        }
    }
    throw new Error(`No route found for ${run.seed} stage ${stageNumber}`)
}

const expeditionSeedARun = createIceSlideExpeditionRunDefinition(
    EXPEDITION_SEED_A_HEX
)
const expeditionSeedBRun = createIceSlideExpeditionRunDefinition(
    EXPEDITION_SEED_B_HEX
)
const expeditionRouteAStage1 = findExpeditionRoute(expeditionSeedARun, 1)
const expeditionRouteAStage2 = findExpeditionRoute(expeditionSeedARun, 2)
const expeditionRouteAStage3 = findExpeditionRoute(expeditionSeedARun, 3)

/**
 * One happy-path play test per game. Each game's "Start" listener attaches
 * inside an async init (PixiJS or dynamic import), so we retry the click
 * until the visible start-button state actually toggles. After that the
 * listener is wired and further input is reliable.
 */
async function startGameWhenReady(
    page: Page,
    startSelector: string = '#start-btn'
): Promise<void> {
    await expect(async () => {
        await page.locator(startSelector).click()
        await expect(page.locator(startSelector)).toHaveCSS('display', 'none', {
            timeout: 500,
        })
    }).toPass({ timeout: 10000 })
}

async function expectIceSlideReadyAndIdle(page: Page): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const handle = (
                        window as Window & {
                            iceSlideGame?: {
                                getGame: () => {
                                    getState: () => { status: string }
                                } | null
                            }
                        }
                    ).iceSlideGame
                    if (!handle) {
                        return 'initializing'
                    }
                    return handle.getGame()?.getState().status ?? 'idle'
                }),
            { timeout: 10000 }
        )
        .toBe('idle')
}

async function expectVisibleGameSurface(
    page: Page,
    selector: string
): Promise<void> {
    const surface = page.locator(selector).first()
    await expect(surface).toBeVisible({ timeout: 10000 })

    const box = await surface.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(100)
    expect(box?.height ?? 0).toBeGreaterThan(100)
}

async function expectStatusOverlayHidden(page: Page): Promise<void> {
    await expect(page.locator('#game-status')).toHaveCSS('display', 'none')
}

async function clickGameSurface(page: Page, selector: string): Promise<void> {
    const surface = page.locator(selector).first()
    const box = await surface.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(
        (box?.x ?? 0) + (box?.width ?? 0) / 2,
        (box?.y ?? 0) + (box?.height ?? 0) / 2
    )
}

/* eslint-disable curly */
type RhythmInputKind = 'click' | 'keyboard'

type RhythmPerfectResult = {
    state: {
        perfectHits: number
        goodHits: number
        misses: number
        strayPresses: number
        combo: number
        score: number
        stability: number
        lastJudgment: 'perfect' | 'good' | 'miss' | null
    }
    hud: {
        hits: string
        combo: string
        judgment: string
        stability: string
        score: string
    }
}

async function performPerfectRhythmInput(
    page: Page,
    kind: RhythmInputKind
): Promise<RhythmPerfectResult> {
    return page.evaluate(inputKind => {
        const game = (
            window as Window & {
                rhythmReactorGame?: {
                    game: {
                        reset(): void
                        start(): void
                        update(deltaSeconds: number): void
                        getState(): {
                            elapsedSeconds: number
                            pendingNotes: Array<{
                                laneIndex: 0 | 1 | 2 | 3
                                hitTimeSeconds: number
                            }>
                            perfectHits: number
                            goodHits: number
                            misses: number
                            strayPresses: number
                            combo: number
                            score: number
                            stability: number
                            lastJudgment: 'perfect' | 'good' | 'miss' | null
                        }
                    }
                }
            }
        ).rhythmReactorGame?.game
        if (!game) throw new Error('Rhythm Reactor debug handle not ready')

        game.reset()
        game.start()

        let state = game.getState()
        const note = state.pendingNotes[0]
        if (!note) throw new Error('Rhythm Reactor chart has no first note')

        const MAX_UPDATES = 1000
        let reached = false
        for (let step = 0; step < MAX_UPDATES; step += 1) {
            state = game.getState()
            const remaining = note.hitTimeSeconds - state.elapsedSeconds
            if (remaining <= 1e-9) {
                reached = true
                break
            }
            game.update(Math.min(0.1, remaining))
        }
        if (!reached) {
            throw new Error(
                `Rhythm Reactor did not reach first note within ${MAX_UPDATES} updates`
            )
        }

        if (inputKind === 'click') {
            const button = document.querySelector<HTMLButtonElement>(
                `[data-rhythm-lane="${note.laneIndex}"]`
            )
            if (!button) throw new Error('Rhythm lane button not found')
            button.click()
        } else {
            const keys = ['d', 'f', 'j', 'k'] as const
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: keys[note.laneIndex],
                    bubbles: true,
                })
            )
        }

        const result = game.getState()
        if (result.lastJudgment !== 'perfect') {
            throw new Error(
                `Expected Perfect, got ${result.lastJudgment ?? 'none'}`
            )
        }

        const text = (id: string): string =>
            document.getElementById(id)?.textContent?.trim() ?? ''

        return {
            state: {
                perfectHits: result.perfectHits,
                goodHits: result.goodHits,
                misses: result.misses,
                strayPresses: result.strayPresses,
                combo: result.combo,
                score: result.score,
                stability: result.stability,
                lastJudgment: result.lastJudgment,
            },
            hud: {
                hits: text('rhythm-reactor-hits'),
                combo: text('rhythm-reactor-combo'),
                judgment: text('rhythm-reactor-judgment'),
                stability: text('rhythm-reactor-stability'),
                score: text('score'),
            },
        }
    }, kind)
}
/* eslint-enable curly */

test.describe('Bubble Shooter', () => {
    test('renders, starts, accepts a shot, and shows end-game overlay', async ({
        page,
    }) => {
        await page.goto('/bubble-shooter')
        await expectVisibleGameSurface(page, '#game-container canvas')
        await expect(page.locator('#current-bubble')).toBeVisible()
        await expect(page.locator('#next-bubble')).toBeVisible()
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        await clickGameSurface(page, '#game-container canvas')

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#final-score')).toBeVisible()
    })
})

test.describe('Memory Matrix', () => {
    test('starts and reveals the card grid', async ({ page }) => {
        await page.goto('/memory-matrix')
        await expect(page.locator('#memory-board')).toBeVisible()

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        // The renderer creates 48 .memory-card elements (6×8 grid) during init.
        await expect(page.locator('#memory-board .memory-card')).toHaveCount(48)

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Word Scramble', () => {
    test('starts, accepts input, ends', async ({ page }) => {
        await page.goto('/word-scramble')
        const answerInput = page.locator('#answer-input')
        await expect(answerInput).toBeDisabled()
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()
        await expect(answerInput).toBeEnabled()

        // After start the timer should be ticking below the initial 60.
        await expect(page.locator('#time-remaining')).not.toHaveText('60', {
            timeout: 5000,
        })

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Reflex Coin Collection', () => {
    test('renders, starts, accepts canvas input, and can be stopped', async ({
        page,
    }) => {
        await page.goto('/reflex')
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expectStatusOverlayHidden(page)
        await expect(page.locator('#score')).toHaveText('0')

        // Reflex uses #stop-btn as its end button instead of #end-btn.
        await startGameWhenReady(page)
        await expect(page.locator('#stop-btn')).toBeVisible()

        await clickGameSurface(page, '#game-canvas-container canvas')

        // Timer must move off its starting value after start.
        await expect(page.locator('#time-remaining')).not.toHaveText('60', {
            timeout: 5000,
        })

        await page.locator('#stop-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Sudoku', () => {
    test('starts at chosen difficulty and ends with an overlay', async ({
        page,
    }) => {
        await page.goto('/sudoku')

        // Pick a difficulty first; its listener also attaches asynchronously,
        // so retry until the displayed difficulty reflects the selection.
        await expect(async () => {
            await page.locator('#easy-btn').click()
            await expect(page.locator('#difficulty')).toHaveText(/Easy/i, {
                timeout: 500,
            })
        }).toPass({ timeout: 10000 })

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()
        await expect(
            page.locator('#sudoku-container .sudoku-cell')
        ).toHaveCount(81)

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Bejeweled', () => {
    test('starts and shows end-game overlay when ended', async ({ page }) => {
        await page.goto('/bejeweled')
        await expectVisibleGameSurface(page, '#bejeweled-container canvas')
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Path Navigator', () => {
    test('starts and shows end-game overlay when ended', async ({ page }) => {
        await page.goto('/path-navigator')
        await expectVisibleGameSurface(page, '#path-navigator-container canvas')
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Evader', () => {
    test('renders, starts, accepts WASD input, and can be stopped', async ({
        page,
    }) => {
        await page.goto('/evader')
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expectStatusOverlayHidden(page)
        await expect(page.locator('#score')).toHaveText('0')

        // Evader uses #stop-btn as its end button.
        await startGameWhenReady(page)
        await expect(page.locator('#stop-btn')).toBeVisible()

        await page.keyboard.press('d')
        await page.keyboard.press('w')

        await expect(page.locator('#time-remaining')).not.toHaveText('60', {
            timeout: 5000,
        })

        await page.locator('#stop-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Snake', () => {
    test('starts, accepts arrow input, can be reset', async ({ page }) => {
        await page.goto('/snake')
        await expectVisibleGameSurface(page, '#snake-container canvas')
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        // Drive a couple of moves to prove keyboard wiring is active.
        await page.keyboard.press('ArrowRight')
        await page.keyboard.press('ArrowDown')

        // Reset returns to initial state with the start button visible again.
        await page.locator('#reset-btn').click()
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#score')).toHaveText('0')
    })
})

test.describe('Circuit Hacker', () => {
    test('renders, starts on the chosen difficulty, and can be stopped', async ({
        page,
    }) => {
        await page.goto('/circuit-hacker')
        // Pre-start: container and status prompt are visible, but no canvas
        // yet — unlike most games, Circuit Hacker sets PixiJS up inside
        // start(), not at page load.
        await expect(page.locator('#game-canvas-container')).toBeVisible()
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('#rotation-count')).toHaveText('0')
        await expect(page.locator('#time-remaining')).toHaveText('180')

        // Smaller grid renders faster and exercises the difficulty control.
        await page.locator('#difficulty-select').selectOption('easy')

        // Circuit Hacker uses #stop-btn as its end button.
        await startGameWhenReady(page)
        // Canvas is created during start(); wait for it to appear.
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expectStatusOverlayHidden(page)
        await expect(page.locator('#stop-btn')).toBeVisible()

        // Timer ticks off the initial value (easy = 120s) once the loop is running.
        await expect(page.locator('#time-remaining')).not.toHaveText('120', {
            timeout: 5000,
        })

        // Manual stop fails the run with reason 'manual' and shows the overlay.
        await page.locator('#stop-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Satellite Sync', () => {
    test('renders, starts, runs the timer, and can be ended', async ({
        page,
    }) => {
        await page.goto('/satellite-sync')
        // Pre-start: container and status prompt are visible, but no canvas
        // yet — Satellite Sync sets PixiJS up inside start(), not at load.
        await expect(page.locator('#game-canvas-container')).toBeVisible()
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#time-remaining')).toHaveText('60')

        await startGameWhenReady(page)
        // Canvas is created during start(); wait for it to appear.
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expectStatusOverlayHidden(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        // Timer ticks off the initial value once the loop is running.
        await expect(page.locator('#time-remaining')).not.toHaveText('60', {
            timeout: 5000,
        })

        // Manual end returns to the pre-start state. Unlike most games,
        // Satellite Sync only shows the game-over overlay on win/fail, not on
        // a manual stop — so we assert the start button comes back instead.
        await page.locator('#end-btn').click()
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
    })
})

test.describe('Ice Slide', () => {
    const DIRECTION_TO_KEY = {
        N: 'ArrowUp',
        E: 'ArrowRight',
        S: 'ArrowDown',
        W: 'ArrowLeft',
    } as const

    async function completeFrozenDaily(page: Page): Promise<void> {
        for (
            let stage = 0;
            stage < ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS.length;
            stage++
        ) {
            for (const direction of ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS[
                stage
            ]) {
                await page.keyboard.press(DIRECTION_TO_KEY[direction])
            }
            if (stage < ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS.length - 1) {
                await expect(page.locator('#stage-clear-overlay')).toBeVisible()
                await page.locator('#stage-clear-continue-btn').click()
            }
        }
        await expect(page.locator('#game-over-overlay')).toBeVisible()
    }

    /**
     * Override crypto.getRandomValues before navigation so each fresh
     * Expedition start draws the pinned 4-word seeds (first start = A, New
     * Expedition = B). Unrelated draws delegate to the native method, and
     * the expedition draw count is exposed for Retry Seed assertions.
     */
    async function installExpeditionCrypto(page: Page): Promise<void> {
        await page.addInitScript(
            (seeds: [number[], number[]]) => {
                const [seedA, seedB] = seeds
                const nativeGetRandomValues =
                    crypto.getRandomValues.bind(crypto)
                let expeditionCalls = 0
                crypto.getRandomValues = <
                    T extends ArrayBufferView<ArrayBuffer>,
                >(
                    array: T
                ): T => {
                    if (
                        array instanceof Uint32Array &&
                        array.length === 4 &&
                        (
                            array as unknown as {
                                __iceSlideExpeditionSeed?: boolean
                            }
                        ).__iceSlideExpeditionSeed === true
                    ) {
                        const words = expeditionCalls === 0 ? seedA : seedB
                        array.set(words)
                        expeditionCalls += 1
                        ;(
                            window as Window & {
                                __expeditionSeedCalls?: number
                            }
                        ).__expeditionSeedCalls = expeditionCalls
                        return array
                    }
                    return nativeGetRandomValues(array)
                }
            },
            [EXPEDITION_SEED_A_WORDS, EXPEDITION_SEED_B_WORDS] as [
                number[],
                number[],
            ]
        )
    }

    async function expeditionSeedCalls(page: Page): Promise<number> {
        return page.evaluate(() => {
            return (
                (window as Window & { __expeditionSeedCalls?: number })
                    .__expeditionSeedCalls ?? 0
            )
        })
    }

    async function expeditionRunKey(page: Page): Promise<string | null> {
        return page.evaluate(() => {
            const handle = (
                window as Window & {
                    iceSlideGame?: {
                        getGame: () => {
                            getState: () => { runKey: string }
                        } | null
                    }
                }
            ).iceSlideGame
            return handle?.getGame()?.getState().runKey ?? null
        })
    }

    async function expeditionState(page: Page): Promise<IceSlideState> {
        return page.evaluate(() => {
            const state = (
                window as Window & {
                    iceSlideGame?: {
                        getGame: () => {
                            getState: () => IceSlideState
                        } | null
                    }
                }
            ).iceSlideGame
                ?.getGame()
                ?.getState()
            if (!state) {
                throw new Error('Ice Slide game state is unavailable')
            }
            return state
        })
    }

    async function expeditionGameData(page: Page): Promise<IceSlideGameData> {
        return page.evaluate(() => {
            const data = (
                window as Window & {
                    iceSlideGame?: {
                        getGame: () => {
                            getGameData: () => IceSlideGameData
                        } | null
                    }
                }
            ).iceSlideGame
                ?.getGame()
                ?.getGameData()
            if (!data) {
                throw new Error('Ice Slide game data is unavailable')
            }
            return data
        })
    }

    async function pressRoute(
        page: Page,
        route: readonly Direction[]
    ): Promise<void> {
        for (const direction of route) {
            await page.keyboard.press(DIRECTION_TO_KEY[direction])
        }
    }

    /**
     * Start and wait for the canvas: the canvas only appears after the
     * async PixiJS setup, which is also what wires keyboard input. Input
     * sent before that is silently dropped, so tests that press keys (or
     * End a run) must wait for this signal first.
     */
    async function startExpeditionWhenReady(page: Page): Promise<void> {
        await startGameWhenReady(page)
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
    }

    async function reachExpeditionRouteChoiceAfterStage2(
        page: Page
    ): Promise<void> {
        await pressRoute(page, expeditionRouteAStage1)
        await expect(page.locator('#stage-clear-overlay')).toBeVisible()
        await page.locator('#stage-clear-continue-btn').click()
        await expect(page.locator('#expedition-stage-progress')).toContainText(
            'Stage 2 / 6'
        )

        await pressRoute(page, expeditionRouteAStage2)
        await expect(page.locator('#stage-clear-overlay')).toBeVisible()
        await page.locator('#stage-clear-continue-btn').click()
        await expect(
            page.locator('#expedition-route-choice-overlay')
        ).toBeVisible()
    }

    test('renders, starts, accepts a move, and can be ended', async ({
        page,
    }) => {
        await page.goto('/ice-slide')
        await expect(page.locator('#game-canvas-container')).toBeVisible()
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#moves')).toHaveText('0')
        await expect(page.locator('input[value="campaign"]')).toBeChecked()

        await startGameWhenReady(page)
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expectStatusOverlayHidden(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        // ArrowDown clears First Frost in one slide.
        await page.keyboard.press('ArrowDown')
        await expect(page.locator('#level')).toHaveText('2', { timeout: 5000 })
        await expect(page.locator('#score')).not.toHaveText('0')

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#start-btn')).toBeVisible()
    })

    test('restores mode controls after ending a zero-score Campaign run', async ({
        page,
    }) => {
        await page.goto('/ice-slide')
        await expectIceSlideReadyAndIdle(page)
        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)

        const campaignRadio = page.locator('input[value="campaign"]')
        const dailyRadio = page.locator('input[value="daily"]')
        await expect(campaignRadio).toBeEnabled()
        await expect(dailyRadio).toBeEnabled()
        await expect(campaignRadio).toBeFocused()

        await dailyRadio.check()
        await expect(dailyRadio).toBeChecked()
    })

    test('preselects Daily and exposes objectives before the first move', async ({
        page,
    }) => {
        await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
        await page.goto('/ice-slide?mode=daily')

        await expect(page.locator('input[value="daily"]')).toBeChecked()
        await startGameWhenReady(page)
        await expect(page.locator('#daily-meta')).toBeVisible()
        await expect(page.locator('#daily-date')).toHaveText('2026-08-12')
        await expect(page.locator('#daily-stage-progress')).toHaveText(
            /1\s*\/\s*5/
        )
        await expect(page.locator('#daily-objective-clear')).toContainText(
            'Clear'
        )
        await expect(page.locator('#daily-objective-efficient')).toContainText(
            'Efficient'
        )
        await expect(page.locator('#daily-objective-bonus')).not.toHaveText('')
    })

    test('Play Again preserves Daily identity across rollover and Change Mode stays idle', async ({
        page,
    }) => {
        await page.clock.setFixedTime(new Date('2026-08-12T23:59:59Z'))
        await page.goto('/ice-slide?mode=daily')
        await startGameWhenReady(page)
        await expect(page.locator('#daily-date')).toHaveText('2026-08-12')

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )

        await page.clock.setFixedTime(new Date('2026-08-13T00:00:01Z'))
        await page.locator('#play-again-btn').click()
        await expect(page.locator('#daily-date')).toHaveText('2026-08-12')
        await expect(page.locator('#end-btn')).toBeVisible()

        await page.locator('#end-btn').click()
        await page.locator('#change-mode-btn').click()

        const modeInputs = page.locator('#ice-slide-mode-selector input')
        await expect(modeInputs).toHaveCount(3)
        for (const value of ['campaign', 'daily', 'expedition']) {
            await expect(page.locator(`input[value="${value}"]`)).toBeEnabled()
        }
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('input[value="daily"]')).toBeFocused()
    })

    test('falls back to Campaign for an unknown mode query', async ({
        page,
    }) => {
        await page.goto('/ice-slide?mode=not-a-mode')

        await expectIceSlideReadyAndIdle(page)
        await expect(page.locator('input[value="campaign"]')).toBeChecked()
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
    })

    test('preselects Expedition from the query and stays idle until Start', async ({
        page,
    }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')

        await expectIceSlideReadyAndIdle(page)
        await expect(page.locator('input[value="expedition"]')).toBeChecked()
        await expect(page.locator('input[value="campaign"]')).not.toBeChecked()
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('#expedition-meta')).toHaveClass(/hidden/)
        await expect(page.locator('#daily-leaderboard')).toHaveClass(/hidden/)
        // Preselection alone must not draw an Expedition seed.
        await expect(await expeditionSeedCalls(page)).toBe(0)
    })

    test('Expedition Start shows meta, six stages, Stage 1 EASY, and hides the Daily leaderboard', async ({
        page,
    }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)

        await expect(page.locator('#expedition-meta')).toBeVisible()
        await expect(page.locator('#expedition-seed')).toHaveText(
            EXPEDITION_SEED_A_HEX
        )
        expect(await expeditionRunKey(page)).toBe(expeditionSeedARun.runKey)
        await expect(page.locator('#expedition-stage-progress')).toContainText(
            'Stage 1 / 6'
        )
        // The tier suffix only appears after the run's HUD sync.
        await expect(page.locator('#expedition-stage-progress')).toContainText(
            'EASY'
        )
        await expect(page.locator('#daily-leaderboard')).toHaveClass(/hidden/)
        await expect(page.locator('#end-btn')).toBeVisible()
    })

    test('immediate Expedition End shows a local summary, sends no score, and labels Play Again as Retry Seed', async ({
        page,
    }) => {
        let scoresRequests = 0
        await page.route('**/api/scores', async route => {
            scoresRequests += 1
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, newAchievements: [] }),
            })
        })
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#expedition-summary')).toBeVisible()
        await expect(page.locator('#expedition-summary-seed')).toHaveText(
            EXPEDITION_SEED_A_HEX
        )
        await expect(page.locator('#expedition-summary-progress')).toHaveText(
            '0 / 6 stages'
        )
        await expect(page.locator('#expedition-summary-stars')).toHaveText(
            '0 / 18 stars'
        )
        await expect(page.locator('#play-again-btn')).toHaveText('Retry Seed')
        await expect(page.locator('#new-expedition-btn')).toBeVisible()
        expect(scoresRequests).toBe(0)
    })

    test('Retry Seed preserves the seed and run key without a new crypto draw', async ({
        page,
    }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)
        await page.locator('#end-btn').click()
        await expect(page.locator('#play-again-btn')).toHaveText('Retry Seed')

        const seedBefore = await page
            .locator('#expedition-summary-seed')
            .textContent()
        const runKeyBefore = await expeditionRunKey(page)
        expect(await expeditionSeedCalls(page)).toBe(1)

        await page.locator('#play-again-btn').click()
        await expect(page.locator('#end-btn')).toBeVisible()
        await expect(page.locator('#expedition-seed')).toHaveText(
            EXPEDITION_SEED_A_HEX
        )
        const seedAfter = await page.locator('#expedition-seed').textContent()
        const runKeyAfter = await expeditionRunKey(page)
        expect(seedAfter).toBe(seedBefore)
        expect(runKeyAfter).toBe(runKeyBefore)
        // Retry Seed replays the same run; it must not draw a second seed.
        expect(await expeditionSeedCalls(page)).toBe(1)
    })

    test('New Expedition starts a fresh run with a new seed and run key', async ({
        page,
    }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)
        await page.locator('#end-btn').click()
        await expect(page.locator('#new-expedition-btn')).toBeVisible()

        await page.locator('#new-expedition-btn').click()
        await expect(page.locator('#end-btn')).toBeVisible()
        await expect(page.locator('#expedition-seed')).toHaveText(
            EXPEDITION_SEED_B_HEX
        )
        expect(await expeditionRunKey(page)).toBe(expeditionSeedBRun.runKey)
        expect(await expeditionSeedCalls(page)).toBe(2)
        await expect(page.locator('input[value="expedition"]')).toBeDisabled()
        await expect(page.locator('#daily-leaderboard')).toHaveClass(/hidden/)
    })

    test('Change Mode returns to an enabled three-radio selector', async ({
        page,
    }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)
        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )

        await page.locator('#change-mode-btn').click()
        const modeInputs = page.locator('#ice-slide-mode-selector input')
        await expect(modeInputs).toHaveCount(3)
        for (const value of ['campaign', 'daily', 'expedition']) {
            await expect(page.locator(`input[value="${value}"]`)).toBeEnabled()
        }
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('#expedition-meta')).toHaveClass(/hidden/)
    })

    test('submits a positive partial Expedition run without a competition key', async ({
        page,
    }) => {
        let scoresBody: Record<string, unknown> = {}
        let scoresRequests = 0
        await page.route('**/api/scores', async route => {
            scoresRequests += 1
            scoresBody = JSON.parse(route.request().postData() ?? '{}')
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, newAchievements: [] }),
            })
        })
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)

        // Clear stage 1 (non-final), Continue, then End on stage 2.
        await pressRoute(page, expeditionRouteAStage1)
        await expect(page.locator('#stage-clear-overlay')).toBeVisible()
        await page.locator('#stage-clear-continue-btn').click()
        await expect(page.locator('#expedition-stage-progress')).toContainText(
            'Stage 2 / 6'
        )

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect.poll(() => scoresRequests, { timeout: 10_000 }).toBe(1)
        expect(scoresBody).toMatchObject({
            context: {
                mode: 'expedition',
                rulesetVersion: 2,
            },
            gameData: {
                mode: 'expedition',
                solved: false,
                levelsCleared: expect.any(Number),
            },
        })
        expect(scoresBody.score).toBeGreaterThan(0)
        expect(
            (scoresBody.context as { competitionKey?: unknown }).competitionKey
        ).toBeUndefined()
    })

    test('locks input after a non-final Expedition clear until Continue', async ({
        page,
    }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)

        await pressRoute(page, expeditionRouteAStage1)
        await expect(page.locator('#stage-clear-overlay')).toBeVisible()
        const movesAfterClear = await page.locator('#moves').textContent()

        // Stage-clear holds input: arrow keys must not change the run.
        await page.keyboard.press('ArrowUp')
        await page.keyboard.press('ArrowRight')
        await expect(page.locator('#moves')).toHaveText(movesAfterClear ?? '0')
        await expect(page.locator('#stage-clear-overlay')).toBeVisible()

        await page.locator('#stage-clear-continue-btn').click()
        await expect(page.locator('#expedition-stage-progress')).toContainText(
            'Stage 2 / 6'
        )
        // The next stage accepts movement again.
        await pressRoute(page, expeditionRouteAStage2.slice(0, 1))
        await expect(page.locator('#moves')).not.toHaveText(
            movesAfterClear ?? '0'
        )
    })

    test('covers the Safe route and browser Undo state', async ({ page }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)

        await reachExpeditionRouteChoiceAfterStage2(page)
        const movesBeforeChoice = await page.locator('#moves').textContent()
        await page.keyboard.press('ArrowUp')
        await expect(page.locator('#moves')).toHaveText(
            movesBeforeChoice ?? '0'
        )

        await page.locator('#expedition-safe-btn').click()
        await expect(
            page.locator('#expedition-route-choice-overlay')
        ).toHaveClass(/hidden/)

        const beforeMove = await expeditionState(page)
        expect(beforeMove.levelIndex).toBe(2)
        expect(beforeMove.status).toBe('playing')
        expect(expeditionRouteAStage3.length).toBeGreaterThan(1)

        await pressRoute(page, expeditionRouteAStage3.slice(0, 1))
        const afterMove = await expeditionState(page)
        expect(afterMove.levelIndex).toBe(beforeMove.levelIndex)
        expect(afterMove.status).toBe('playing')
        expect(afterMove.player).not.toEqual(beforeMove.player)
        expect(afterMove.moves).toBe(beforeMove.moves + 1)
        await expect(page.locator('#expedition-undo-btn')).toBeEnabled()

        await page.locator('#expedition-undo-btn').click()
        const afterUndo = await expeditionState(page)
        expect(afterUndo.player).toEqual(beforeMove.player)
        expect(afterUndo.grid).toEqual(beforeMove.grid)
        expect(afterUndo.moves).toBe(afterMove.moves)
        expect(afterUndo.undoChargesAvailable).toBe(0)
        expect(afterUndo.undoChargesUsed).toBe(1)
        await expect(page.locator('#moves')).toHaveText(String(afterMove.moves))
        await expect(page.locator('#expedition-undo-btn')).toHaveText(
            'Undo (0)'
        )
        await expect(page.locator('#expedition-undo-btn')).toBeDisabled()
    })

    test('replays the Risk route deterministically on Retry Seed', async ({
        page,
    }) => {
        await installExpeditionCrypto(page)
        await page.goto('/ice-slide?mode=expedition')
        await startExpeditionWhenReady(page)
        const seedBefore =
            (await page.locator('#expedition-seed').textContent()) ?? ''

        await reachExpeditionRouteChoiceAfterStage2(page)
        await page.locator('#expedition-risk-btn').click()
        const firstRiskData = await expeditionGameData(page)
        expect(firstRiskData.routeChoices).toEqual(['risky'])
        expect(firstRiskData.stageObjectiveIds[2]).toHaveLength(2)
        expect(firstRiskData.stageScoreMultipliersBps[2]).toBe(
            ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS
        )
        const firstRiskSignature = firstRiskData.stageSignatures[2]
        const firstRiskObjectives = firstRiskData.stageObjectiveIds[2]

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#play-again-btn')).toHaveText('Retry Seed')
        await page.locator('#play-again-btn').click()
        await expect(page.locator('#end-btn')).toBeVisible()
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expect(page.locator('#expedition-seed')).toHaveText(seedBefore)

        await reachExpeditionRouteChoiceAfterStage2(page)
        const beforeReplayChoice = await expeditionGameData(page)
        expect(beforeReplayChoice.routeChoices).toEqual([])

        await page.locator('#expedition-risk-btn').click()
        const replayedRiskData = await expeditionGameData(page)
        expect(replayedRiskData.routeChoices).toEqual(['risky'])
        expect(replayedRiskData.stageObjectiveIds[2]).toEqual(
            firstRiskObjectives
        )
        expect(replayedRiskData.stageSignatures[2]).toBe(firstRiskSignature)
        expect(replayedRiskData.stageScoreMultipliersBps[2]).toBe(
            ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS
        )
    })

    for (const mode of ['campaign', 'daily'] as const) {
        test(`${mode} does not expose Expedition route choices or Undo`, async ({
            page,
        }) => {
            await page.goto(`/ice-slide?mode=${mode}`)
            await startGameWhenReady(page)
            await expect(
                page.locator('#expedition-route-choice-overlay')
            ).toHaveClass(/hidden/)
            await expect(page.locator('#expedition-meta')).toHaveClass(/hidden/)
            await expect(page.locator('#expedition-undo-btn')).toBeHidden()
        })
    }

    test('loads the active Daily ranking and renders the empty + signed-out states', async ({
        page,
    }) => {
        await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
        await page.route('**/api/leaderboard?*', async route => {
            expect(route.request().url()).toContain(
                'competitionKey=ice-slide%3Adaily%3A2026-08-12%3Ag1%3Ar1'
            )
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    gameId: 'ice_slide',
                    gameName: 'Ice Slide',
                    viewerAuthenticated: false,
                    leaderboard: [],
                }),
            })
        })

        await page.goto('/ice-slide?mode=daily')

        await expect(page.locator('#daily-leaderboard-empty')).toBeVisible()
        await expect(
            page.locator('#daily-leaderboard-signed-out')
        ).toBeVisible()
    })

    test('renders a ranked Daily row and highlights the viewer', async ({
        page,
    }) => {
        await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
        await page.route('**/api/leaderboard?*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    gameId: 'ice_slide',
                    gameName: 'Ice Slide',
                    viewerAuthenticated: true,
                    leaderboard: [
                        {
                            rank: 1,
                            name: 'Pilot',
                            score: 4321,
                            elapsedSeconds: 87,
                            totalMoves: 31,
                            isCurrentUser: true,
                        },
                    ],
                }),
            })
        })

        await page.goto('/ice-slide?mode=daily')

        const rows = page.locator('#daily-leaderboard-rows')
        await expect(rows).toBeVisible()
        const rowText = (await rows.textContent()) ?? ''
        expect(rowText).toContain('#1')
        expect(rowText).toContain('Pilot')
        expect(rowText).toContain('4,321')
        expect(rowText).toContain('1:27')
        expect(rowText).toContain('31')
        expect(rowText).toContain('YOU')
    })

    test('shows unavailable for a leaderboard failure without blocking Daily play', async ({
        page,
    }) => {
        await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
        await page.route('**/api/leaderboard?*', route =>
            route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'Scoped leaderboard is unavailable',
                    code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
                }),
            })
        )

        await page.goto('/ice-slide?mode=daily')

        await expect(
            page.locator('#daily-leaderboard-unavailable')
        ).toBeVisible()
        await startGameWhenReady(page)
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expect(page.locator('#end-btn')).toBeVisible()
        await expect(page.locator('#game-error')).toHaveClass(/hidden/)
    })

    test('refreshes the Daily ranking on a successful submit using the captured key', async ({
        page,
    }) => {
        await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
        const leaderboardRequests: string[] = []
        await page.route('**/api/leaderboard?*', route => {
            leaderboardRequests.push(route.request().url())
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    gameId: 'ice_slide',
                    gameName: 'Ice Slide',
                    viewerAuthenticated: false,
                    leaderboard: [],
                }),
            })
        })
        let scoresBody: Record<string, unknown> = {}
        await page.route('**/api/scores', async route => {
            scoresBody = JSON.parse(route.request().postData() ?? '{}')
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, newAchievements: [] }),
            })
        })

        await page.goto('/ice-slide?mode=daily')
        await expect(page.locator('#daily-leaderboard-empty')).toBeVisible()

        // Init has already fired one leaderboard request (Daily selected at
        // load). The Start handler fires a second one for the captured runKey
        // once the run begins, so wait for that Start-triggered request to
        // land before capturing the pre-submit baseline. Otherwise the
        // final count assertion could pass on the Start request alone, even
        // if onScoreSaved stopped refreshing the leaderboard.
        const afterStart = leaderboardRequests.length
        await startGameWhenReady(page)
        await expectVisibleGameSurface(page, '#game-canvas-container canvas')
        await expect
            .poll(() => leaderboardRequests.length, { timeout: 10_000 })
            .toBeGreaterThan(afterStart)

        const beforeSubmit = leaderboardRequests.length
        await completeFrozenDaily(page)

        await expect
            .poll(() => leaderboardRequests.length, { timeout: 10_000 })
            .toBeGreaterThan(beforeSubmit)
        expect(leaderboardRequests[leaderboardRequests.length - 1]).toContain(
            'competitionKey=ice-slide%3Adaily%3A2026-08-12%3Ag1%3Ar1'
        )
        expect(scoresBody).toMatchObject({
            context: {
                mode: 'daily',
                competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
                rulesetVersion: 1,
            },
        })
        expect((scoresBody.gameData as { solved?: boolean }).solved).toBe(true)
    })

    test('suppresses a delayed leaderboard response after switching to Campaign', async ({
        page,
    }) => {
        await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
        let resolveDaily: (() => void) | undefined
        await page.route('**/api/leaderboard?*', async route => {
            await new Promise<void>(resolve => {
                resolveDaily = resolve
            })
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    gameId: 'ice_slide',
                    gameName: 'Ice Slide',
                    viewerAuthenticated: false,
                    leaderboard: [],
                }),
            })
        })

        await page.goto('/ice-slide?mode=daily')
        await expect.poll(() => resolveDaily, { timeout: 10_000 }).toBeDefined()
        await page.locator('input[value="campaign"]').check()

        await expect(page.locator('#daily-leaderboard')).toHaveClass(/hidden/)
        resolveDaily?.()
        await expect(page.locator('#daily-leaderboard')).toHaveClass(/hidden/)
        await expect(page.locator('#daily-leaderboard-rows')).toBeEmpty()
    })
})

test.describe('Mine Grid', () => {
    test('starts on Easy and exercises flag then reveal', async ({ page }) => {
        await page.goto('/mine-grid')
        await expect(page.locator('#mine-grid-board')).toBeVisible()

        await page.locator('#easy-btn').click()
        await expect(page.locator('#difficulty')).toHaveText(/Easy/i)
        await startGameWhenReady(page)

        await page.locator('#flag-mode-btn').click()
        const firstHidden = page
            .locator('#mine-grid-board .mine-grid-cell[data-state="hidden"]')
            .first()
        await firstHidden.click()
        await expect(
            page.locator(
                '#mine-grid-board .mine-grid-cell[data-state="flagged"]'
            )
        ).toHaveCount(1)

        await page.locator('#reveal-mode-btn').click()
        await page
            .locator('#mine-grid-board .mine-grid-cell[data-state="hidden"]')
            .first()
            .click()

        await page.locator('#reset-btn').click()
        await expect(
            page.locator(
                '#mine-grid-board .mine-grid-cell[data-state="hidden"]'
            )
        ).toHaveCount(64)
    })
})

test.describe('Pattern Pulse', () => {
    test('completes one random sequence and accepts a numeric shortcut', async ({
        page,
    }: {
        page: Page
    }) => {
        await page.goto('/pattern-pulse')
        await expect(page.locator('#pattern-pulse-board')).toBeVisible()
        await startGameWhenReady(page)

        const readState = () =>
            page.evaluate(() => {
                const handle = (
                    window as Window & {
                        patternPulseGame?: {
                            getState: () => {
                                phase: string
                                sequence: number[]
                                inputIndex: number
                            }
                        }
                    }
                ).patternPulseGame
                if (!handle) {
                    throw new Error('Pattern Pulse debug handle not ready')
                }
                return handle.getState()
            })

        await expect.poll(async () => (await readState()).phase).toBe('input')
        const first = (await readState()).sequence
        for (const pad of first) {
            await page.locator(`[data-pattern-pad="${pad}"]`).click()
        }
        await expect(page.locator('#completed-rounds')).toHaveText('1')

        await expect.poll(async () => (await readState()).phase).toBe('input')
        const second = (await readState()).sequence
        await page.keyboard.press(String(second[0] + 1))
        await expect.poll(async () => (await readState()).inputIndex).toBe(1)

        await page.locator('#reset-btn').click()
        await expect(page.locator('#pattern-status')).toHaveText('READY')
        await expect(page.locator('#sequence-length')).toHaveText('3')
    })
})

test.describe('Potion Sorter', () => {
    // Authored Easy preset, bottom→top per tube (levels.ts easy).
    const EASY_INITIAL_TUBES = [
        ['cyan', 'magenta', 'amber', 'cyan'],
        ['magenta', 'amber', 'cyan', 'magenta'],
        ['amber', 'cyan', 'magenta', 'amber'],
        [],
        [],
    ]

    // The renderer keeps .potion-layer spans in tube-array order (index 0
    // renders at the bottom), so DOM order reads bottom→top per tube. Static
    // placeholder spans beyond a tube's fill are [hidden] and excluded.
    const readBoard = (page: Page) =>
        page.evaluate(() =>
            Array.from(
                document.querySelectorAll(
                    '#potion-sorter-board [data-tube-index]:not([hidden])'
                )
            ).map(tube =>
                Array.from(
                    tube.querySelectorAll('.potion-layer:not([hidden])')
                ).map(layer => layer.getAttribute('data-liquid') ?? '')
            )
        )

    // Difficulty listeners attach inside the async init, so retry until the
    // HUD difficulty reflects the selection (same pattern as Sudoku).
    const selectDifficulty = async (page: Page, label: string) => {
        await expect(async () => {
            await page.locator(`#${label.toLowerCase()}-btn`).click()
            await expect(page.locator('#difficulty')).toHaveText(label, {
                timeout: 500,
            })
        }).toPass({ timeout: 10000 })
    }

    test('Easy pour+undo restores the board, Reset idles, solve shows overlay, Play Again resets', async ({
        page,
    }) => {
        await page.goto('/potion-sorter')
        await expect(page.locator('#potion-sorter-board')).toBeVisible()
        await selectDifficulty(page, 'Easy')

        await startGameWhenReady(page)

        // One pour, then undo it: moves stay cumulative, board restores.
        await page.locator('[data-tube-index="0"]').click()
        await page.locator('[data-tube-index="3"]').click()
        await page.locator('#undo-btn').click()
        await expect(page.locator('#moves')).toHaveText('1')
        await expect(page.locator('#undos')).toHaveText('1')
        expect(await readBoard(page)).toEqual(EASY_INITIAL_TUBES)

        // Reset returns to idle with the exact Easy duration showing.
        await page.locator('#reset-btn').click()
        await expect(page.locator('#moves')).toHaveText('0')
        await expect(page.locator('#undos')).toHaveText('0')
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#time-remaining')).toHaveText('180')

        // The authored Easy preset solves in exactly these 10 pours.
        await startGameWhenReady(page)
        const easySolution: Array<[number, number]> = [
            [0, 3],
            [2, 0],
            [1, 2],
            [1, 3],
            [0, 1],
            [2, 0],
            [2, 3],
            [1, 2],
            [0, 1],
            [0, 3],
        ]
        for (const [source, destination] of easySolution) {
            await page.locator(`[data-tube-index="${source}"]`).click()
            await page.locator(`[data-tube-index="${destination}"]`).click()
        }

        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#final-difficulty')).toHaveText('Easy')
        await expect(page.locator('#final-moves')).toHaveText('10')
        const finalScore = Number(
            await page.locator('#final-score').textContent()
        )
        expect(finalScore).toBeGreaterThan(0)
        await expect(page.locator('#final-time')).toHaveText(/^\d{2}:\d{2}$/)

        // Play Again = Reset-to-idle: exact 180 on the clock, no racy
        // "timer is not decrementing" assertion.
        await page.locator('#play-again-btn').click()
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#time-remaining')).toHaveText('180')
        await expect(page.locator('#difficulty')).toHaveText('Easy')
        await expect(page.locator('#easy-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        await expect(page.locator('#moves')).toHaveText('0')
        await expect(page.locator('#undos')).toHaveText('0')
        expect(await readBoard(page)).toEqual(EASY_INITIAL_TUBES)
    })

    test('Hard renders nine wrapped idle tubes at 375×812 without overflow', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto('/potion-sorter')
        await selectDifficulty(page, 'Hard')

        const tubes = page.locator('[data-tube-index]')
        await expect(tubes).toHaveCount(9)

        const firstBox = await tubes.nth(0).boundingBox()
        const lastBox = await tubes.nth(8).boundingBox()
        expect(firstBox).not.toBeNull()
        expect(lastBox).not.toBeNull()
        expect(lastBox!.y).toBeGreaterThan(firstBox!.y)

        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth >
                    document.documentElement.clientWidth
            )
        ).toBe(false)
    })
})

test.describe('Gravity Flip', () => {
    test('loses to the authored spike and Play Again re-arms a fresh run', async ({
        page,
    }) => {
        await page.goto('/gravity-flip')
        await expectVisibleGameSurface(page, '#gravity-flip-canvas canvas')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')

        await startGameWhenReady(page)
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/,
            { timeout: 8000 }
        )
        await expect(page.locator('#game-over-title')).toHaveText(
            'GRAVITY LOST'
        )
        await expect(page.locator('#final-outcome')).toHaveText('Collision')

        await page.locator('#play-again-btn').click()
        await expect(page.locator('#start-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')

        await expect
            .poll(() =>
                page.evaluate(() =>
                    Boolean(
                        (
                            window as Window & {
                                gravityFlipGame?: {
                                    getGame(): {
                                        getState(): {
                                            gameStarted: boolean
                                        }
                                    }
                                }
                            }
                        ).gravityFlipGame
                            ?.getGame()
                            .getState().gameStarted &&
                            document
                                .getElementById('game-over-overlay')
                                ?.classList.contains('hidden')
                    )
                )
            )
            .toBe(true)
    })
})

test.describe('Signal Switch', () => {
    type SignalSwitchSnapshot = {
        safePasses: number
        combo: number
        score: number
        integrity: number
        isGameOver: boolean
    }

    /**
     * Bounded model advancement through the exposed debug handle: drives
     * game.update(0.1) until either one safe pass or game over. The hard
     * iteration cap sits well above the 90s run's ~900-step worst case.
     */
    async function advanceSignalSwitchRun(
        page: Page,
        stopOn: 'safe-pass' | 'game-over'
    ): Promise<SignalSwitchSnapshot> {
        return page.evaluate(stop => {
            const game = (
                window as Window & {
                    signalSwitchGame?: {
                        game: {
                            update: (deltaSeconds: number) => void
                            getState: () => SignalSwitchSnapshot
                        }
                    }
                }
            ).signalSwitchGame?.game
            if (!game) {
                throw new Error('Signal Switch debug handle not ready')
            }
            const MAX_UPDATES = 1000
            for (let step = 0; step < MAX_UPDATES; step += 1) {
                const state = game.getState()
                if (
                    stop === 'safe-pass'
                        ? state.safePasses >= 1
                        : state.isGameOver
                ) {
                    return state
                }
                game.update(0.1)
            }
            throw new Error(
                `Signal Switch run never reached ${stop} within ${MAX_UPDATES} updates`
            )
        }, stopOn)
    }

    test('safe pass scores, Reset restarts clean, three mismatches fail, Play Again re-arms', async ({
        page,
    }) => {
        await page.route('**/api/scores', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, newAchievements: [] }),
            })
        })

        const totalLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.length
        const startingLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
            unlockAt => unlockAt <= 0
        ).length

        await page.goto('/signal-switch')
        await expectVisibleGameSurface(page, '#signal-switch-canvas canvas')

        // Idle HUD values derive from the frozen rules constants.
        await expect(page.locator('#signal-switch-integrity')).toHaveText(
            String(SIGNAL_SWITCH_RULES.startingIntegrity)
        )
        await expect(page.locator('#signal-switch-lanes')).toHaveText(
            `${startingLanes} / ${totalLanes}`
        )

        // Teaching action: lane 1 opens Cyan, first drone arrives Magenta.
        await startGameWhenReady(page)
        await page.locator('[data-signal-lane="0"]').click()
        await advanceSignalSwitchRun(page, 'safe-pass')

        await expect(page.locator('#signal-switch-safe-passes')).toHaveText('1')
        await expect(page.locator('#signal-switch-combo')).toHaveText('1')
        await expect(page.locator('#score')).toHaveText(
            String(SIGNAL_SWITCH_BASE_PASS_POINTS)
        )
        await expect(page.locator('#signal-switch-integrity')).toHaveText(
            String(SIGNAL_SWITCH_RULES.startingIntegrity)
        )

        // Reset then Start; leaving every gate Cyan makes all generated
        // drones mismatch (spawn excludes the lane's current signal), so the
        // third crossing ends the run deterministically.
        await page.locator('#reset-btn').click()
        await startGameWhenReady(page)

        const failed = await advanceSignalSwitchRun(page, 'game-over')
        expect(failed.integrity).toBe(0)

        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#game-over-title')).toHaveText('SIGNAL LOST')
        await expect(page.locator('#final-outcome')).toHaveText(
            'Systems failed'
        )
        await expect(page.locator('#final-integrity')).toHaveText('0')

        // Play Again starts a clean run immediately.
        await page.locator('#play-again-btn').click()
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
        await expect(page.locator('#signal-switch-integrity')).toHaveText(
            String(SIGNAL_SWITCH_RULES.startingIntegrity)
        )
        await expect(page.locator('#signal-switch-safe-passes')).toHaveText('0')
        await expect(page.locator('[data-signal-lane="0"]')).toContainText(
            'Cyan'
        )
    })

    test('renders four reachable gates at 375×812 without horizontal overflow', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto('/signal-switch')

        const totalLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.length
        const gates = page.locator('#gate-controls [data-signal-lane]')
        await expect(gates).toHaveCount(totalLanes)
        for (let index = 0; index < totalLanes; index += 1) {
            await expect(gates.nth(index)).toBeVisible()
        }

        expect(
            await page.evaluate(
                () => document.scrollingElement?.scrollWidth ?? Infinity
            )
        ).toBeLessThanOrEqual(375)

        for (let index = 0; index < totalLanes; index += 1) {
            const box = await gates.nth(index).boundingBox()
            expect(box).not.toBeNull()
            expect(box!.x).toBeGreaterThanOrEqual(0)
            expect(box!.x + box!.width).toBeLessThanOrEqual(375)
        }

        const canvas = page.locator('#signal-switch-canvas canvas')
        await expect(canvas).toBeVisible()
        const canvasBox = await canvas.boundingBox()
        expect(canvasBox).not.toBeNull()
        expect(canvasBox!.width).toBeLessThanOrEqual(375)
        expect(canvasBox!.height).toBeGreaterThan(0)
    })
})

test.describe('Rhythm Reactor', () => {
    test('covers idle, delegated perfect inputs, reset, end, and Play Again', async ({
        page,
    }) => {
        await page.route('**/api/scores', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, newAchievements: [] }),
            })
        })

        await page.goto('/rhythm-reactor')
        await expectVisibleGameSurface(page, '#rhythm-reactor-canvas canvas')

        const laneButtons = page.locator(
            '#rhythm-reactor-controls [data-rhythm-lane]'
        )
        await expect(laneButtons).toHaveCount(4)
        for (let index = 0; index < 4; index += 1) {
            await expect(laneButtons.nth(index)).toBeVisible()
        }

        const rhythmStatIds = [
            '#rhythm-reactor-combo',
            '#rhythm-reactor-hits',
            '#rhythm-reactor-judgment',
            '#rhythm-reactor-stability',
        ] as const
        for (const statId of rhythmStatIds) {
            await expect(page.locator(statId)).toBeVisible()
        }

        await expect(page.locator('#time-remaining')).toHaveText('60')
        await expect(page.locator('#rhythm-reactor-hits')).toHaveText('0')
        await expect(page.locator('#rhythm-reactor-combo')).toHaveText('0')
        await expect(page.locator('#rhythm-reactor-judgment')).toHaveText(
            'READY'
        )
        await expect(page.locator('#rhythm-reactor-stability')).toHaveText('60')

        await startGameWhenReady(page)
        for (let index = 0; index < 4; index += 1) {
            await expect(laneButtons.nth(index)).toBeEnabled()
        }

        const clickResult = await performPerfectRhythmInput(page, 'click')
        expect(clickResult).toEqual({
            state: {
                perfectHits: 1,
                goodHits: 0,
                misses: 0,
                strayPresses: 0,
                combo: 1,
                score: 100,
                stability: 64,
                lastJudgment: 'perfect',
            },
            hud: {
                hits: '1',
                combo: '1',
                judgment: 'PERFECT',
                stability: '64',
                score: '100',
            },
        })

        await page.locator('#reset-btn').click()
        await expect(page.locator('#time-remaining')).toHaveText('60')
        await expect(page.locator('#rhythm-reactor-hits')).toHaveText('0')
        await expect(page.locator('#rhythm-reactor-combo')).toHaveText('0')
        await expect(page.locator('#rhythm-reactor-judgment')).toHaveText(
            'READY'
        )
        await expect(page.locator('#rhythm-reactor-stability')).toHaveText('60')
        await expect(page.locator('#start-btn')).toBeVisible()

        const keyboardResult = await performPerfectRhythmInput(page, 'keyboard')
        expect(keyboardResult).toEqual({
            state: {
                perfectHits: 1,
                goodHits: 0,
                misses: 0,
                strayPresses: 0,
                combo: 1,
                score: 100,
                stability: 64,
                lastJudgment: 'perfect',
            },
            hud: {
                hits: '1',
                combo: '1',
                judgment: 'PERFECT',
                stability: '64',
                score: '100',
            },
        })

        await page.evaluate(async () => {
            const game = (
                window as Window & {
                    rhythmReactorGame?: {
                        game: {
                            end(): Promise<void>
                        }
                    }
                }
            ).rhythmReactorGame?.game
            if (!game) {
                throw new Error('Rhythm Reactor debug handle not ready')
            }
            await game.end()
        })

        await expect(page.locator('#game-over-overlay')).toBeVisible()
        await expect(page.locator('#final-hits')).toHaveText('1')
        await expect(page.locator('#final-stray-presses')).toHaveText('0')

        await page.locator('#play-again-btn').click()
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
        await expect(page.locator('#start-btn')).toHaveCSS('display', 'none')
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const game = (
                        window as Window & {
                            rhythmReactorGame?: {
                                game: { getState(): { isActive: boolean } }
                            }
                        }
                    ).rhythmReactorGame?.game
                    return game?.getState().isActive ?? false
                })
            )
            .toBe(true)
    })

    test('renders lanes and stats at 375×812 without horizontal overflow', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto('/rhythm-reactor')

        const laneButtons = page.locator(
            '#rhythm-reactor-controls [data-rhythm-lane]'
        )
        await expect(laneButtons).toHaveCount(4)
        await page.locator('#rhythm-reactor-controls').scrollIntoViewIfNeeded()
        for (let index = 0; index < 4; index += 1) {
            const lane = laneButtons.nth(index)
            await expect(lane).toBeVisible()
            const box = await lane.boundingBox()
            expect(box).not.toBeNull()
            expect(box!.x).toBeGreaterThanOrEqual(0)
            expect(box!.y).toBeGreaterThanOrEqual(0)
            expect(box!.x + box!.width).toBeLessThanOrEqual(375)
            expect(box!.y + box!.height).toBeLessThanOrEqual(812)
        }

        const rhythmStatIds = [
            '#rhythm-reactor-combo',
            '#rhythm-reactor-hits',
            '#rhythm-reactor-judgment',
            '#rhythm-reactor-stability',
        ] as const
        for (const statId of rhythmStatIds) {
            const stat = page.locator(statId)
            await expect(stat).toBeVisible()
            expect(await stat.boundingBox()).not.toBeNull()
        }

        expect(
            await page.evaluate(
                () => document.scrollingElement?.scrollWidth ?? Infinity
            )
        ).toBeLessThanOrEqual(375)

        const canvas = page.locator('#rhythm-reactor-canvas canvas')
        await expect(canvas).toBeVisible()
        const canvasBox = await canvas.boundingBox()
        expect(canvasBox).not.toBeNull()
        expect(canvasBox!.width).toBeLessThanOrEqual(375)
        expect(canvasBox!.height).toBeGreaterThan(0)
    })
})

type AsteroidDriftSnapshot = {
    isActive: boolean
    outcome: string
    asteroids: number
    orbsCollected: number
    held: string[]
    player: {
        x: number
        y: number
        velocityX: number
        velocityY: number
    }
}

/**
 * Read the live run through the window.asteroidDriftGame debug handle.
 * Throws while the async init is still pending so expect.poll retries
 * until the handle exists.
 */
async function readAsteroidDrift(page: Page): Promise<AsteroidDriftSnapshot> {
    return page.evaluate(() => {
        const handle = (
            window as Window & {
                asteroidDriftGame?: {
                    getState: () => {
                        isActive: boolean
                        outcome: string
                        asteroids: unknown[]
                        orbsCollected: number
                        player: {
                            x: number
                            y: number
                            velocityX: number
                            velocityY: number
                        }
                    }
                    getGame: () => { pressedDirections: Set<string> }
                }
            }
        ).asteroidDriftGame
        if (!handle) {
            throw new Error('Asteroid Drift debug handle not ready')
        }
        const state = handle.getState()
        return {
            isActive: state.isActive,
            outcome: state.outcome,
            asteroids: state.asteroids.length,
            orbsCollected: state.orbsCollected,
            held: Array.from(handle.getGame().pressedDirections),
            player: state.player,
        }
    })
}

/**
 * The RNG-free intro asteroid spawns past the right edge at center Y and
 * reaches a stationary centered player after travelling (half canvas +
 * spawn offset) px at the initial speed. Padding covers frame pacing and
 * the rAF-clock vs simulation-clock skew.
 */
const ASTEROID_DRIFT_INTRO_TRAVEL_SECONDS =
    (ASTEROID_DRIFT_RULES.canvasWidth / 2 +
        ASTEROID_DRIFT_RULES.asteroidSpawnPadding +
        ASTEROID_DRIFT_RULES.introAsteroidRadius) /
    ASTEROID_DRIFT_RULES.asteroidInitialSpeed

test.describe('Asteroid Drift', () => {
    test('idle ship waits centered, the deterministic intro asteroid ends the run, and Play Again restarts fresh', async ({
        page,
    }) => {
        let scoresRequests = 0
        let scoresBody: Record<string, unknown> = {}
        await page.route('**/api/scores', async route => {
            scoresRequests += 1
            scoresBody = JSON.parse(route.request().postData() ?? '{}')
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, newAchievements: [] }),
            })
        })

        await page.goto('/asteroid-drift')
        await expectVisibleGameSurface(page, '#asteroid-drift-canvas canvas')
        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#orbs-collected')).toHaveText('0')
        await expect(page.locator('#time-remaining')).toHaveText(
            String(ASTEROID_DRIFT_RULES.duration)
        )

        // Idle: run inactive, arena empty, ship centered at rest.
        await expect
            .poll(async () => (await readAsteroidDrift(page)).isActive, {
                timeout: 10000,
            })
            .toBe(false)
        const idle = await readAsteroidDrift(page)
        expect(idle.asteroids).toBe(0)
        expect(idle.player.x).toBe(ASTEROID_DRIFT_RULES.canvasWidth / 2)
        expect(idle.player.y).toBe(ASTEROID_DRIFT_RULES.canvasHeight / 2)
        expect(idle.player.velocityX).toBe(0)

        await startGameWhenReady(page)
        const started = await readAsteroidDrift(page)
        expect(started.isActive).toBe(true)
        // Only the deterministic intro asteroid exists at the opening.
        expect(started.asteroids).toBe(1)

        // No movement input: the intro asteroid wins the run.
        await expect
            .poll(
                async () => {
                    const state = await readAsteroidDrift(page)
                    return !state.isActive && state.outcome === 'collision'
                },
                {
                    timeout: Math.ceil(
                        (ASTEROID_DRIFT_INTRO_TRAVEL_SECONDS + 5) * 1000
                    ),
                }
            )
            .toBe(true)

        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#game-over-title')).toHaveText('SHIP LOST')
        await expect(page.locator('#final-outcome')).toHaveText('Collision')
        await expect(page.locator('#final-orbs')).toHaveText('0')
        const finalScore = Number(
            await page.locator('#final-score').textContent()
        )
        const finalSurvival = Number(
            await page.locator('#final-survival').textContent()
        )
        expect(finalScore).toBeGreaterThan(0)
        expect(finalSurvival).toBeGreaterThan(0)
        expect(finalSurvival).toBeLessThan(ASTEROID_DRIFT_RULES.duration)

        await expect.poll(() => scoresRequests, { timeout: 10000 }).toBe(1)
        expect(scoresBody).toMatchObject({
            gameId: 'asteroid_drift',
            gameData: { survivedFullRun: false },
        })
        expect(scoresBody.score).toBeGreaterThan(0)

        // Play Again immediately arms a fresh, active, centered run.
        await page.locator('#play-again-btn').click()
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
        await expect(page.locator('#start-btn')).toHaveCSS('display', 'none')
        await expect
            .poll(
                async () => {
                    const state = await readAsteroidDrift(page)
                    return (
                        state.isActive &&
                        state.asteroids === 1 &&
                        state.player.x ===
                            ASTEROID_DRIFT_RULES.canvasWidth / 2 &&
                        state.player.velocityX === 0
                    )
                },
                { timeout: 5000 }
            )
            .toBe(true)
    })
})

test.describe('Asteroid Drift (mobile)', () => {
    // isMobile + hasTouch flip the pointer/hover media features so the
    // touch D-pad (hidden for fine pointers) renders like on a phone.
    test.use({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
    })

    test('D-pad pointer holds thrust with momentum at 375×812', async ({
        page,
    }) => {
        await page.goto('/asteroid-drift')

        // No horizontal overflow on the narrow viewport.
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth
            )
        ).toBe(true)

        // All four D-pad buttons are visible and inside the viewport.
        const dpad = page.locator('#asteroid-drift-dpad')
        await expect(dpad).toBeVisible()
        await expect(dpad.locator('button[data-direction]')).toHaveCount(4)
        const buttonCenter = async (direction: string) => {
            const button = dpad.locator(`[data-direction="${direction}"]`)
            await expect(button).toBeVisible()
            const box = await button.boundingBox()
            expect(box).not.toBeNull()
            expect(box!.x).toBeGreaterThanOrEqual(0)
            expect(box!.y).toBeGreaterThanOrEqual(0)
            expect(box!.x + box!.width).toBeLessThanOrEqual(375)
            expect(box!.y + box!.height).toBeLessThanOrEqual(812)
            return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
        }

        // Responsive canvas: CSS width fits the viewport and height scales
        // from the intrinsic aspect ratio (no frozen pixel dimensions).
        const canvas = page.locator('#asteroid-drift-canvas canvas')
        await expect(canvas).toBeVisible()
        const canvasBox = await canvas.boundingBox()
        expect(canvasBox).not.toBeNull()
        expect(canvasBox!.width).toBeLessThanOrEqual(375)
        expect(canvasBox!.height).toBeGreaterThan(0)

        await startGameWhenReady(page)

        // Real pointer input via CDP touch dispatch: press-and-hold sends
        // genuine pointerdown/pointerup events, including simultaneous
        // multi-point holds a single mouse cannot express.
        const client = await page.context().newCDPSession(page)
        const touchPress = (points: Array<{ x: number; y: number }>) =>
            client.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: points,
            })
        const touchRelease = () =>
            client.send('Input.dispatchTouchEvent', {
                type: 'touchEnd',
                touchPoints: [],
            })

        // Hold right: velocity and position turn positive.
        await touchPress([await buttonCenter('right')])
        await expect
            .poll(async () => (await readAsteroidDrift(page)).player.x, {
                timeout: 5000,
            })
            .toBeGreaterThan(ASTEROID_DRIFT_RULES.canvasWidth / 2)

        // Release right: the held direction disappears immediately while
        // momentum keeps the velocity briefly positive.
        await touchRelease()
        const momentum = await readAsteroidDrift(page)
        expect(momentum.held).not.toContain('right')
        expect(momentum.player.velocityX).toBeGreaterThan(0)

        // Diagonal: up+right held together reports both directions.
        await touchPress([
            await buttonCenter('up'),
            await buttonCenter('right'),
        ])
        await expect
            .poll(async () => (await readAsteroidDrift(page)).held.sort(), {
                timeout: 5000,
            })
            .toEqual(['right', 'up'])

        // Release both cleanly.
        await touchRelease()
        await expect
            .poll(async () => (await readAsteroidDrift(page)).held, {
                timeout: 5000,
            })
            .toEqual([])
    })
})

async function readChromaticTide(page: Page): Promise<ChromaticTideState> {
    return page.evaluate(() => {
        const handle = (
            window as Window & {
                chromaticTideGame?: {
                    getState: () => ChromaticTideState
                }
            }
        ).chromaticTideGame
        if (!handle) {
            throw new Error('Chromatic Tide debug handle not ready')
        }
        return handle.getState()
    })
}

test.describe('Chromatic Tide', () => {
    test('greedy clicks clear the board, Play Again resets, and a number key moves', async ({
        page,
    }) => {
        await page.route('**/api/scores', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, newAchievements: [] }),
            })
        })
        await page.goto('/chromatic-tide')
        await expectVisibleGameSurface(page, '#chromatic-tide-board')
        await startGameWhenReady(page)

        const started = await readChromaticTide(page)
        const initialCapturedCells = started.initialCapturedCells
        const maxMoves = 144 - initialCapturedCells

        for (let move = 0; move < maxMoves; move += 1) {
            const state = await readChromaticTide(page)
            if (state.outcome === 'cleared') {
                break
            }
            const color = selectGreedyChromaticTideColor(
                state.board,
                state.territoryColor
            )
            await page
                .locator(`[data-tide-color="${color}"]`)
                .click({ position: { x: 8, y: 20 } })
        }

        await expect
            .poll(async () => (await readChromaticTide(page)).outcome)
            .toBe('cleared')
        await expect(page.locator('#game-over-overlay')).toBeVisible()
        await expect(page.locator('#final-outcome')).toHaveText('Cleared')
        await expect(page.locator('#final-captured')).toHaveText('144 / 144')
        await expect(page.locator('#captured')).toHaveText('144 / 144')

        await page.locator('#play-again-btn').click()
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
        await expect(page.locator('#start-btn')).toBeVisible()
        const replay = await readChromaticTide(page)
        expect(replay.isActive).toBe(false)
        expect(replay.outcome).toBe('playing')
        expect(replay.movesUsed).toBe(0)
        expect(replay.capturedCells).toBe(replay.initialCapturedCells)
        expect(replay.capturedCells).toBeLessThan(144)
        await expect(page.locator('#captured')).toHaveText(
            `${replay.capturedCells} / 144`
        )

        await startGameWhenReady(page)
        const restarted = await readChromaticTide(page)
        const keyboardColorIndex = CHROMATIC_TIDE_PALETTE.findIndex(
            color => color !== restarted.territoryColor
        )
        expect(keyboardColorIndex).toBeGreaterThanOrEqual(0)
        await page.keyboard.press(String(keyboardColorIndex + 1))
        await expect(page.locator('#moves')).toHaveText('1')
    })
})

test.describe('Chromatic Tide (mobile)', () => {
    test.use({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
    })

    test('supports touch, live status, and a non-overflowing phone layout', async ({
        page,
    }) => {
        await page.goto('/chromatic-tide')
        await startGameWhenReady(page)
        await expectVisibleGameSurface(page, '#chromatic-tide-board')

        const status = page.locator('#chromatic-tide-status')
        await expect(status).toHaveCount(1)
        await expect(status).toHaveAttribute('aria-live', 'polite')

        const started = await readChromaticTide(page)
        const currentButton = page.locator(
            `[data-tide-color="${started.territoryColor}"]`
        )
        await expect(currentButton).toBeEnabled()
        await expect(currentButton).toHaveAttribute('aria-pressed', 'true')

        const nextColor = CHROMATIC_TIDE_PALETTE.find(
            color => color !== started.territoryColor
        )
        expect(nextColor).toBeDefined()
        const nextButton = page.locator(`[data-tide-color="${nextColor}"]`)
        await nextButton.tap()

        await expect(page.locator('#moves')).toHaveText('1')
        await expect(nextButton).toBeEnabled()
        await expect(nextButton).toHaveAttribute('aria-pressed', 'true')
        await expect(status).toContainText(`Territory ${nextColor}`)
        await expect(status).toContainText(/, \d+ of 144 captured, 1 move\./)

        const overflow = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            controlsWidth:
                document.getElementById('chromatic-tide-colors')?.scrollWidth ??
                0,
            controlsClientWidth:
                document.getElementById('chromatic-tide-colors')?.clientWidth ??
                0,
        }))
        expect(overflow.documentWidth).toBeLessThanOrEqual(
            overflow.viewportWidth
        )
        expect(overflow.controlsWidth).toBeLessThanOrEqual(
            overflow.controlsClientWidth
        )
    })
})
