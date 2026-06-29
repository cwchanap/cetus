import { test, expect } from '@playwright/test'
import { GAMES, getGameUrl } from '../../src/lib/games'

const NAV_TARGETS = GAMES.filter(g => g.isActive).map(g => ({
    title: g.name,
    url: getGameUrl(g.id),
}))

test.describe('Game catalog navigation', () => {
    test('every game card on the homepage navigates to its game page', async ({
        page,
    }) => {
        for (const game of NAV_TARGETS) {
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
        for (const game of NAV_TARGETS) {
            await page.goto(game.url)
            await page.getByRole('link', { name: 'Home' }).click()
            await expect(page).toHaveURL('/')
            await expect(
                page.getByRole('heading', { name: 'MINIGAMES' })
            ).toBeVisible()
        }
    })
})
