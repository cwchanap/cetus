import { test, expect } from '@playwright/test'

const GAMES = [
    { title: 'Tetris Challenge', url: '/tetris' },
    { title: 'Bubble Shooter', url: '/bubble-shooter' },
    { title: 'Quick Math', url: '/quick-math' },
    { title: 'Memory Matrix', url: '/memory-matrix' },
    { title: 'Word Scramble', url: '/word-scramble' },
    { title: 'Reflex Coin Collection', url: '/reflex' },
    { title: 'Sudoku', url: '/sudoku' },
    { title: 'Bejeweled', url: '/bejeweled' },
    { title: 'Path Navigator', url: '/path-navigator' },
    { title: 'Evader', url: '/evader' },
    { title: '2048', url: '/2048' },
    { title: 'Snake', url: '/snake' },
] as const

test.describe('Game catalog navigation', () => {
    test('every game card on the homepage navigates to its game page', async ({
        page,
    }) => {
        for (const game of GAMES) {
            await page.goto('/')
            const card = page
                .getByTestId('game-card')
                .filter({ hasText: game.title })
            await expect(card).toBeVisible()
            await card.getByRole('link', { name: 'Play Now' }).click()
            await expect(page).toHaveURL(game.url)
        }
    })

    test('every game page has a working Home link back to the catalog', async ({
        page,
    }) => {
        for (const game of GAMES) {
            await page.goto(game.url)
            await page.getByRole('link', { name: 'Home' }).click()
            await expect(page).toHaveURL('/')
            await expect(
                page.getByRole('heading', { name: 'MINIGAMES' })
            ).toBeVisible()
        }
    })
})
