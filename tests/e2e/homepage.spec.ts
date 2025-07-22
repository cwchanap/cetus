import { test, expect } from '@playwright/test'
import { HomePage } from './pages/HomePage'

test.describe('Homepage', () => {
    test('should display the homepage with navigation', async ({ page }) => {
        const homePage = new HomePage(page)
        await homePage.goto()

        // Check that the page loads successfully
        await expect(page).toHaveTitle(/Cetus/)

        // Check that the main navigation is present
        await expect(homePage.navigation).toBeVisible()

        // Check that the games section is present
        await expect(homePage.gamesSection).toBeVisible()

        // Check that the main heading is present
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()
        await expect(
            page.getByRole('heading', { name: 'OF THE FUTURE' })
        ).toBeVisible()
    })

    test('should have working game navigation links', async ({ page }) => {
        await page.goto('/')

        // Test navigation to different game pages using "Play Now" links
        const games = [
            { title: 'Tetris Challenge', url: '/tetris' },
            { title: 'Bubble Shooter', url: '/bubble-shooter' },
            { title: 'Quick Math', url: '/quick-math' },
            { title: 'Memory Matrix', url: '/memory-matrix' },
            { title: 'Word Scramble', url: '/word-scramble' },
        ]

        for (const game of games) {
            // Find the game card by title and then click its "Play Now" link
            const gameCard = page
                .locator(`text="${game.title}"`)
                .locator('..')
                .locator('..')
            const playNowLink = gameCard.locator('text="Play Now"')

            if (await playNowLink.isVisible()) {
                await playNowLink.click()
                await expect(page).toHaveURL(game.url)
                await page.goBack()
            }
        }
    })

    test('should have working main navigation links', async ({ page }) => {
        await page.goto('/')

        // Test main navigation links
        const navLinks = [
            { text: 'Games', shouldScrollTo: true },
            { text: 'About', shouldScrollTo: true },
            { text: 'Contact', shouldScrollTo: true },
        ]

        for (const link of navLinks) {
            const linkElement = page.locator(`nav >> text="${link.text}"`)
            if (await linkElement.isVisible()) {
                await linkElement.click()
                // These are anchor links that should scroll to sections, not navigate away
                await expect(page).toHaveURL('/#' + link.text.toLowerCase())
            }
        }
    })
})
