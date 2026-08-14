import { test, expect, type Page } from '@playwright/test'
import { ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS } from '../../src/lib/games/ice-slide/test-fixtures'

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
        await expect(modeInputs).toHaveCount(2)
        await expect(modeInputs.nth(0)).toBeEnabled()
        await expect(modeInputs.nth(1)).toBeEnabled()
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#game-status')).toBeVisible()
        await expect(page.locator('input[value="daily"]')).toBeFocused()
    })

    for (const mode of ['expedition', 'not-a-mode']) {
        test(`falls back to Campaign for mode=${mode}`, async ({ page }) => {
            await page.goto(`/ice-slide?mode=${mode}`)

            await expectIceSlideReadyAndIdle(page)
            await expect(page.locator('input[value="campaign"]')).toBeChecked()
            await expect(page.locator('#start-btn')).toBeVisible()
            await expect(page.locator('#game-status')).toBeVisible()
            await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
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
