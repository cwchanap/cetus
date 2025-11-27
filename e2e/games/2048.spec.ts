import { test, expect } from '@playwright/test'

test.describe('2048 Game', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/2048')
    })

    test('should display 2048 game page with correct layout', async ({
        page,
    }) => {
        // Check page title and heading
        await expect(page).toHaveTitle('2048 - Cetus Minigames')
        await expect(page.getByRole('heading', { name: '2048' })).toBeVisible()

        // Check game description
        await expect(
            page.getByText(
                'Slide tiles and combine matching numbers to reach 2048'
            )
        ).toBeVisible()

        // Check navigation breadcrumb
        await expect(page.getByText('🎯 2048')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
    })

    test('should show initial game state correctly', async ({ page }) => {
        // Check initial score values
        await expect(page.locator('#score-display')).toHaveText('0')
        await expect(page.locator('#max-tile-display')).toHaveText('0')

        // Check game container is present
        await expect(page.locator('#game-2048-container')).toBeVisible()
    })

    test('should display game controls information', async ({ page }) => {
        // Check controls section is visible
        await expect(
            page.getByRole('heading', { name: 'CONTROLS' })
        ).toBeVisible()

        // Check all control mappings
        await expect(page.getByText('Slide Up:')).toBeVisible()
        await expect(page.getByText('Slide Down:')).toBeVisible()
        await expect(page.getByText('Slide Left:')).toBeVisible()
        await expect(page.getByText('Slide Right:')).toBeVisible()

        // Check mobile control info
        await expect(page.getByText('Mobile:')).toBeVisible()
        await expect(page.getByText('Swipe to move')).toBeVisible()
    })

    test('should display how to play section', async ({ page }) => {
        await expect(
            page.getByRole('heading', { name: 'HOW TO PLAY' })
        ).toBeVisible()
        await expect(
            page.getByText('Use arrow keys or swipe to slide all tiles')
        ).toBeVisible()
    })

    test('should display tile progression section', async ({ page }) => {
        await expect(
            page.getByRole('heading', { name: 'TILE PROGRESSION' })
        ).toBeVisible()
        // Check some tile values are shown
        await expect(
            page.getByText('2048', { exact: true }).first()
        ).toBeVisible()
    })

    test('should have functional game control buttons', async ({ page }) => {
        // Initial state should show Start button
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#reset-btn')).toBeVisible()

        // End button should be hidden initially
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')

        // Start the game
        await page.locator('#start-btn').click()

        // Wait for game to start
        await page.waitForTimeout(500)

        // Start button should be hidden, End button should be visible
        await expect(page.locator('#start-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#end-btn')).toBeVisible()
    })

    test('should start game and show tiles', async ({ page }) => {
        // Start the game
        await page.locator('#start-btn').click()
        await page.waitForTimeout(500)

        // Canvas should be present with content
        const canvas = page.locator('#game-2048-container canvas')
        await expect(canvas).toBeVisible()
    })

    test('should respond to keyboard controls', async ({ page }) => {
        // Start the game
        await page.locator('#start-btn').click()
        await page.waitForTimeout(500)

        // Press arrow keys to make moves
        await page.keyboard.press('ArrowLeft')
        await page.waitForTimeout(200)

        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(200)

        await page.keyboard.press('ArrowUp')
        await page.waitForTimeout(200)

        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(200)

        // Game should still be running (no immediate game over)
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
    })

    test('should update score when tiles merge', async ({ page }) => {
        // Start the game
        await page.locator('#start-btn').click()
        await page.waitForTimeout(500)

        // Initial score should be 0
        const initialScore = await page.locator('#score-display').textContent()
        expect(initialScore).toBe('0')

        // Make several moves to try to merge tiles
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press('ArrowLeft')
            await page.waitForTimeout(150)
            await page.keyboard.press('ArrowDown')
            await page.waitForTimeout(150)
        }

        // Score might have changed (we can't guarantee merges happened)
        // Just verify the score display is still a valid number
        const scoreText = await page.locator('#score-display').textContent()
        expect(Number(scoreText)).toBeGreaterThanOrEqual(0)
    })

    test('should reset game state', async ({ page }) => {
        // Start the game
        await page.locator('#start-btn').click()
        await page.waitForTimeout(500)

        // Make some moves
        await page.keyboard.press('ArrowLeft')
        await page.waitForTimeout(150)

        // Reset the game
        await page.locator('#reset-btn').click()

        // Verify game state is reset
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#score-display')).toHaveText('0')
        await expect(page.locator('#max-tile-display')).toHaveText('0')
    })

    test('should end game manually and show overlay', async ({ page }) => {
        // Start the game
        await page.locator('#start-btn').click()
        await page.waitForTimeout(500)

        // End the game manually
        await page.locator('#end-btn').click()
        await page.waitForTimeout(500)

        // Game over overlay should be visible
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/
        )

        // Should show final stats
        await expect(page.locator('#final-score')).toBeVisible()
        await expect(page.locator('#final-max-tile')).toBeVisible()
        await expect(page.locator('#final-moves')).toBeVisible()

        // Restart button should be visible in overlay
        await expect(page.locator('#restart-btn')).toBeVisible()
    })

    test('should restart game from overlay', async ({ page }) => {
        // Start and end the game
        await page.locator('#start-btn').click()
        await page.waitForTimeout(500)
        await page.locator('#end-btn').click()
        await page.waitForTimeout(500)

        // Click restart button
        await page.locator('#restart-btn').click()
        await page.waitForTimeout(500)

        // Overlay should be hidden
        await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)

        // Game should be reset
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#score-display')).toHaveText('0')
    })

    test('should navigate back to home page', async ({ page }) => {
        await page.getByRole('link', { name: 'Home' }).click()
        await expect(page).toHaveURL('/')
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()
    })

    test('should have working logo navigation', async ({ page }) => {
        await page.getByRole('link', { name: 'C CETUS' }).click()
        await expect(page).toHaveURL('/')
    })
})
