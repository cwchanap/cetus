import { test, expect } from '@playwright/test'

test.describe('Tetris Challenge', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tetris')
        // PixiJS init must complete before #start-btn's click handler attaches.
        await expect(page.locator('#tetris-container canvas')).toBeVisible({
            timeout: 10000,
        })
    })

    test('plays: starts game, spawns piece, pauses, and resets', async ({
        page,
    }) => {
        // Initial state
        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#pieces-count')).toHaveText('0')

        // Start: first piece spawns → pieces-count increments
        await page.locator('#start-btn').click()
        await expect(page.locator('#pieces-count')).toHaveText('1')

        // Pause toggles label
        await page.locator('#pause-btn').click()
        await expect(page.locator('#pause-btn')).toContainText('Resume')
        await page.locator('#pause-btn').click()
        await expect(page.locator('#pause-btn')).toContainText('Pause')

        // Reset returns to initial state
        await page.locator('#reset-btn').click()
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#pieces-count')).toHaveText('0')
        await expect(page.locator('#score')).toHaveText('0')
    })
})
