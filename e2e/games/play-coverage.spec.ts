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

test.describe('Bubble Shooter', () => {
    test('starts and shows end-game overlay when ended', async ({ page }) => {
        await page.goto('/bubble-shooter')
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

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

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

        // The grid is populated only after the game starts.
        await expect(
            page
                .locator('#memory-matrix-container')
                .locator('button, [role="button"], div')
                .first()
        ).toBeVisible()

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Word Scramble', () => {
    test('starts, accepts input, ends', async ({ page }) => {
        await page.goto('/word-scramble')
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)
        await expect(page.locator('#end-btn')).toBeVisible()

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
    test('starts, ticks the timer, can be stopped', async ({ page }) => {
        await page.goto('/reflex')
        await expect(page.locator('#score')).toHaveText('0')

        // Reflex uses #stop-btn as its end button instead of #end-btn.
        await startGameWhenReady(page)
        await expect(page.locator('#stop-btn')).toBeVisible()

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

        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
    })
})

test.describe('Bejeweled', () => {
    test('starts and shows end-game overlay when ended', async ({ page }) => {
        await page.goto('/bejeweled')
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
    test('starts, ticks the timer, can be stopped', async ({ page }) => {
        await page.goto('/evader')
        await expect(page.locator('#score')).toHaveText('0')

        // Evader uses #stop-btn as its end button.
        await startGameWhenReady(page)
        await expect(page.locator('#stop-btn')).toBeVisible()

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
