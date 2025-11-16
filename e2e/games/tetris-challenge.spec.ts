import { test, expect } from '@playwright/test'

test.describe('Tetris Challenge Game', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tetris')
    })

    test('should display tetris game page with correct layout', async ({
        page,
    }) => {
        // Check page title and heading
        await expect(page).toHaveTitle('Tetris Challenge - Cetus Minigames')
        await expect(
            page.getByRole('heading', { name: 'TETRIS CHALLENGE' })
        ).toBeVisible()

        // Check game description
        await expect(
            page.getByText(
                'Stack the blocks and clear lines in this classic puzzle game'
            )
        ).toBeVisible()

        // Check navigation breadcrumb
        await expect(
            page.getByRole('link', { name: 'Tetris Challenge' })
        ).toBeVisible()
        await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
    })

    test('should show initial game state correctly', async ({ page }) => {
        // Check initial score values using specific IDs
        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#level')).toHaveText('1')
        await expect(page.locator('#lines')).toHaveText('0')

        // Check initial statistics using correct IDs
        await expect(page.locator('#pieces-count')).toHaveText('0')
        await expect(page.locator('#singles-count')).toHaveText('0')
        await expect(page.locator('#doubles-count')).toHaveText('0')
        await expect(page.locator('#triples-count')).toHaveText('0')
        await expect(page.locator('#tetrises-count')).toHaveText('0')
    })

    test('should display game controls information', async ({ page }) => {
        // Check controls section is visible
        await expect(
            page.getByRole('heading', { name: 'CONTROLS' })
        ).toBeVisible()

        // Check all control mappings
        await expect(page.getByText('Move Left:')).toBeVisible()
        await expect(page.getByText('Move Right:')).toBeVisible()
        await expect(page.getByText('Soft Drop:')).toBeVisible()
        await expect(page.getByText('Hard Drop:')).toBeVisible()
        await expect(page.getByText('Rotate:')).toBeVisible()
        await expect(page.getByText('Pause:')).toBeVisible()

        // Check key indicators (use exact matching to avoid conflicts)
        await expect(page.getByText('←', { exact: true })).toBeVisible()
        await expect(page.getByText('→', { exact: true })).toBeVisible()
        await expect(page.getByText('↓', { exact: true })).toBeVisible()
        await expect(page.getByText('Space', { exact: true })).toBeVisible()
        await expect(page.getByText('↑', { exact: true })).toBeVisible()
        await expect(page.getByText('P', { exact: true })).toBeVisible()
    })

    test('should have functional game control buttons', async ({ page }) => {
        // Initial state should show Start button
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#pause-btn')).toBeVisible()
        await expect(page.locator('#reset-btn')).toBeVisible()

        // Start the game
        await page.locator('#start-btn').click()

        // Wait for game to actually start (canvas should be active)
        await page.waitForTimeout(1000)

        // Statistics should update (pieces count should increase)
        await expect(page.locator('#pieces-count')).toHaveText('1')
    })

    test('should handle pause and resume functionality', async ({ page }) => {
        // Start the game first
        await page.locator('#start-btn').click()
        await page.waitForTimeout(500)

        // Pause the game
        await page.locator('#pause-btn').click()
        await expect(page.locator('#pause-btn')).toContainText('Resume')

        // Resume the game
        await page.locator('#pause-btn').click()
        await expect(page.locator('#pause-btn')).toContainText('Pause')
    })

    test('should reset game state', async ({ page }) => {
        // Start and then pause to ensure game has begun
        await page.locator('#start-btn').click()
        await page.locator('#pause-btn').click()

        // Reset the game
        await page.locator('#reset-btn').click()

        // Verify game state is reset
        await expect(page.locator('#start-btn')).toBeVisible()
        await expect(page.locator('#score')).toHaveText('0')
        await expect(page.locator('#level')).toHaveText('1')
        await expect(page.locator('#lines')).toHaveText('0')
        await expect(page.locator('#pieces-count')).toHaveText('0')
    })

    test('should display next piece section', async ({ page }) => {
        await expect(
            page.getByRole('heading', { name: 'NEXT PIECE' })
        ).toBeVisible()
    })

    test('should display statistics section', async ({ page }) => {
        await expect(
            page.getByRole('heading', { name: 'STATISTICS' })
        ).toBeVisible()
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
