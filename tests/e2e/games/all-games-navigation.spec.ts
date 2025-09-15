import { test, expect } from '@playwright/test'

test.describe('Games Navigation and Basic Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
    })

    const games = [
        {
            title: 'Tetris Challenge',
            url: '/tetris',
            icon: '🔲',
            difficulty: 'Medium',
            duration: '5-15 minutes',
        },
        {
            title: 'Bubble Shooter',
            url: '/bubble-shooter',
            icon: '🫧',
            difficulty: 'Easy',
            duration: '10-20 minutes',
        },
        {
            title: 'Quick Math',
            url: '/quick-math',
            icon: '🧮',
            difficulty: 'Medium',
            duration: '1 minute',
        },
        {
            title: 'Memory Matrix',
            url: '/memory-matrix',
            icon: '🧠',
            difficulty: 'Hard',
            duration: '3-10 minutes',
        },
        {
            title: 'Word Scramble',
            url: '/word-scramble',
            icon: '📝',
            difficulty: 'Medium',
            duration: '1 minute',
        },
        {
            title: 'Reflex Coin Collection',
            url: '/reflex',
            icon: '⚡',
            difficulty: 'Medium',
            duration: '1 minute',
        },
        {
            title: 'Sudoku',
            url: '/sudoku',
            icon: '🧩',
            difficulty: 'Medium',
            duration: '5-20 minutes',
        },
    ]

    test('should display all available games on homepage', async ({ page }) => {
        // Check that all games are visible
        for (const game of games) {
            await expect(
                page.getByRole('heading', { name: game.title })
            ).toBeVisible()
            await expect(page.getByText(game.icon)).toBeVisible()
            await expect(page.getByText(game.difficulty)).toBeVisible()
            await expect(page.getByText(game.duration)).toBeVisible()
        }
    })

    test('should navigate to each game page via Play Now links', async ({
        page,
    }) => {
        for (const game of games) {
            // Find the game card and click its "Play Now" link
            const gameCard = page
                .locator(`h4:has-text("${game.title}")`)
                .locator('..')
            const playNowLink = gameCard.getByRole('link', { name: 'Play Now' })

            await expect(playNowLink).toBeVisible()
            await playNowLink.click()

            // Verify we're on the correct game page
            await expect(page).toHaveURL(game.url)

            // Verify the game page loads correctly with its title
            await expect(
                page.getByRole('heading', { name: game.title.toUpperCase() })
            ).toBeVisible()

            // Navigate back to home
            await page.goto('/')
        }
    })

    test('should display game descriptions correctly', async ({ page }) => {
        const gameDescriptions = [
            {
                title: 'Tetris Challenge',
                description: 'Classic block-stacking puzzle game',
            },
            {
                title: 'Bubble Shooter',
                description:
                    'Classic bubble shooter game with color matching mechanics',
            },
            {
                title: 'Quick Math',
                description:
                    'Fast-paced math challenge - solve as many problems as you can in 60 seconds',
            },
            {
                title: 'Memory Matrix',
                description:
                    'Test your memory by matching pairs of shapes in this grid-based puzzle game',
            },
            {
                title: 'Word Scramble',
                description:
                    'Unscramble words as fast as you can in this 60-second word puzzle challenge',
            },
            {
                title: 'Reflex Coin Collection',
                description:
                    'Test your reflexes by collecting coins and avoiding bombs in this fast-paced grid game',
            },
            {
                title: 'Sudoku',
                description:
                    'Classic number puzzle game - fill the grid so each row, column, and 3x3 box contains digits 1-9',
            },
        ]

        for (const game of gameDescriptions) {
            await expect(page.getByText(game.description)).toBeVisible()
        }
    })

    test('should have consistent navigation elements on all game pages', async ({
        page,
    }) => {
        for (const game of games) {
            await page.goto(game.url)

            // Check common navigation elements
            await expect(
                page.getByRole('link', { name: 'C CETUS' })
            ).toBeVisible()
            await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
            await expect(
                page.getByRole('button', { name: 'Login' })
            ).toBeVisible()

            // Check breadcrumb shows current game
            await expect(
                page.getByRole('link', { name: game.title })
            ).toBeVisible()
        }
    })

    test('should display game icons and emojis correctly', async ({ page }) => {
        for (const game of games) {
            const gameHeading = page.getByRole('heading', { name: game.title })
            const gameCard = gameHeading.locator('..')

            // Each game should have its icon/emoji visible
            await expect(gameCard.getByText(game.icon)).toBeVisible()
        }
    })

    test('should show difficulty levels correctly', async ({ page }) => {
        const difficultyLevels = ['Easy', 'Medium', 'Hard']

        for (const difficulty of difficultyLevels) {
            await expect(page.getByText(difficulty)).toBeVisible()
        }
    })

    test('should display estimated play times', async ({ page }) => {
        for (const game of games) {
            await expect(page.getByText(game.duration)).toBeVisible()
        }
    })

    test('should have working back navigation from all games', async ({
        page,
    }) => {
        for (const game of games) {
            await page.goto(game.url)

            // Navigate back using Home link
            await page.getByRole('link', { name: 'Home' }).click()
            await expect(page).toHaveURL('/')
            await expect(
                page.getByRole('heading', { name: 'SELECT YOUR GAME' })
            ).toBeVisible()
        }
    })

    test('should have working logo navigation from all games', async ({
        page,
    }) => {
        for (const game of games) {
            await page.goto(game.url)

            // Navigate back using logo
            await page.getByRole('link', { name: 'C CETUS' }).click()
            await expect(page).toHaveURL('/')
            await expect(
                page.getByRole('heading', { name: 'MINIGAMES' })
            ).toBeVisible()
        }
    })
})
