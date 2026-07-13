import { test, expect, type Page } from '@playwright/test'

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
