import { test, expect } from '@playwright/test'

test.describe('2048', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/2048')
        // PixiJS init must complete before #start-btn's click handler attaches.
        await expect(page.locator('#game-2048-container canvas')).toBeVisible({
            timeout: 10000,
        })
    })

    test('plays: starts, accepts moves, ends, restarts', async ({ page }) => {
        // Initial: start visible, end hidden, score zero
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#score-display')).toHaveText('0')

        // Start the game → start hides, end shows
        await page.locator('#start-btn').click()
        await expect(page.locator('#start-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#end-btn')).toBeVisible()

        // Keyboard moves don't end the game immediately
        await page.keyboard.press('ArrowLeft')
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowRight')
        await page.keyboard.press('ArrowUp')
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)

        // End the game → overlay shows with final stats
        await page.locator('#end-btn').click()
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )
        await expect(page.locator('#final-score')).toBeVisible()
        await expect(page.locator('#restart-btn')).toBeVisible()

        // Restart from overlay returns to initial state
        await page.locator('#restart-btn').click()
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#score-display')).toHaveText('0')
    })
})
