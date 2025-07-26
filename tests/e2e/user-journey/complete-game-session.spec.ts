import { test, expect } from '@playwright/test'
import { HomePage } from '../pages/HomePage'
import { TetrisPage, QuickMathPage } from '../pages/GamePage'

test.describe('Complete Game Session User Journey', () => {
    test('should complete a full gaming session from homepage to multiple games', async ({
        page,
    }) => {
        const homePage = new HomePage(page)
        const tetrisPage = new TetrisPage(page)
        const quickMathPage = new QuickMathPage(page)

        // Start from homepage
        await homePage.goto()
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()

        // Navigate to Tetris game
        await homePage.goToTetris()
        await expect(page).toHaveURL('/tetris')
        await expect(tetrisPage.gameTitle).toBeVisible()

        // Play Tetris briefly
        await tetrisPage.startGame()
        await page.waitForTimeout(1000)

        // Test pause/resume functionality
        await tetrisPage.pauseGame()
        await expect(tetrisPage.pauseButton).toContainText('Resume')
        await tetrisPage.resumeGame()
        await expect(tetrisPage.pauseButton).toContainText('Pause')

        // Reset Tetris game to return to initial state
        await tetrisPage.resetGame()
        await expect(tetrisPage.startButton).toBeVisible()

        // Navigate back to homepage
        await tetrisPage.navigateToHome()
        await expect(page).toHaveURL('/')
        await expect(
            page.getByRole('heading', { name: 'SELECT YOUR GAME' })
        ).toBeVisible()

        // Navigate to Quick Math game
        await homePage.goToQuickMath()
        await expect(page).toHaveURL('/quick-math')
        await expect(quickMathPage.gameTitle).toBeVisible()

        // Play Quick Math game
        await quickMathPage.startGame()
        await page.waitForTimeout(500)

        // Solve one math problem
        const correctAnswer = await quickMathPage.calculateCorrectAnswer()
        await quickMathPage.submitAnswer(correctAnswer.toString())

        // Verify score increased
        await expect(page.locator('#score')).toHaveText('20')

        // End Quick Math game
        await quickMathPage.endGame()
        await expect(quickMathPage.startGameButton).toBeVisible()

        // Return to homepage via logo
        await quickMathPage.navigateToHomeViaLogo()
        await expect(page).toHaveURL('/')
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()
    })

    test('should handle multiple game navigations correctly', async ({
        page,
    }) => {
        await page.goto('/')

        const games = [
            { name: 'Tetris Challenge', url: '/tetris' },
            { name: 'Quick Math', url: '/quick-math' },
            { name: 'Bubble Shooter', url: '/bubble-shooter' },
            { name: 'Memory Matrix', url: '/memory-matrix' },
        ]

        // Navigate through all games and back
        for (const game of games) {
            // Find and click the game's Play Now button
            const gameCard = page
                .locator(`h4:has-text("${game.name}")`)
                .locator('..')
            const playNowLink = gameCard.getByRole('link', { name: 'Play Now' })

            await playNowLink.click()
            await expect(page).toHaveURL(game.url)

            // Verify game page loaded
            await expect(
                page.getByRole('heading', { name: game.name.toUpperCase() })
            ).toBeVisible()

            // Navigate back to home
            await page.getByRole('link', { name: 'Home' }).click()
            await expect(page).toHaveURL('/')
        }
    })

    test('should maintain consistent navigation experience', async ({
        page,
    }) => {
        const gameUrls = [
            '/tetris',
            '/quick-math',
            '/bubble-shooter',
            '/memory-matrix',
        ]

        for (const gameUrl of gameUrls) {
            await page.goto(gameUrl)

            // Check that all navigation elements are present
            await expect(
                page.getByRole('link', { name: 'C CETUS' })
            ).toBeVisible()
            await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
            await expect(
                page.getByRole('button', { name: 'Login' })
            ).toBeVisible()

            // Test logo navigation
            await page.getByRole('link', { name: 'C CETUS' }).click()
            await expect(page).toHaveURL('/')

            // Navigate back to game for next iteration
            if (gameUrls.indexOf(gameUrl) < gameUrls.length - 1) {
                await page.goto(gameUrl)
            }
        }
    })

    test('should handle browser back/forward navigation correctly', async ({
        page,
    }) => {
        await page.goto('/')

        // Navigate to Tetris
        const homePage = new HomePage(page)
        await homePage.goToTetris()
        await expect(page).toHaveURL('/tetris')

        // Navigate to Quick Math
        await page.goto('/quick-math')
        await expect(page).toHaveURL('/quick-math')

        // Test browser back button
        await page.goBack()
        await expect(page).toHaveURL('/tetris')
        await expect(
            page.getByRole('heading', { name: 'TETRIS CHALLENGE' })
        ).toBeVisible()

        // Test browser forward button
        await page.goForward()
        await expect(page).toHaveURL('/quick-math')
        await expect(
            page.getByRole('heading', { name: 'QUICK MATH' })
        ).toBeVisible()

        // Navigate to home and test back button
        await page.goto('/')
        await page.goBack()
        await expect(page).toHaveURL('/quick-math')
    })

    test('should display correct game information on each page', async ({
        page,
    }) => {
        const gameInfo = [
            {
                url: '/tetris',
                title: 'TETRIS CHALLENGE',
                description:
                    'Stack the blocks and clear lines in this classic puzzle game',
                icon: '🔲',
            },
            {
                url: '/quick-math',
                title: 'QUICK MATH',
                description:
                    'Solve as many math problems as you can in 60 seconds!',
                icon: '🧮',
            },
        ]

        for (const game of gameInfo) {
            await page.goto(game.url)

            // Check game title and description
            await expect(
                page.getByRole('heading', { name: game.title })
            ).toBeVisible()
            await expect(page.getByText(game.description)).toBeVisible()

            // Check game icon in the breadcrumb area
            await expect(page.getByText(game.icon)).toBeVisible()
        }
    })
})
