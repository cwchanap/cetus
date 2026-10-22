import { test, expect } from '@playwright/test'
import { GAMES, getGameUrl } from '@cetus/shared/games'

const NAV_TARGETS = GAMES.filter(g => g.isActive).map(g => ({
    title: g.name,
    url: getGameUrl(g.id),
    id: g.id,
}))

// Field plate pages (tetris, bubble-shooter, bejeweled, 2048) swap the
// shared GamePage chrome for a bespoke header whose home link is the
// "← Catalogue" anchor (href="/#games").
const FIELD_PLATE_GAMES = new Set([
    'tetris',
    'bubble_shooter',
    'bejeweled',
    '2048',
])

test.describe('Game catalog navigation', () => {
    test('every specimen card on the homepage navigates to its game page', async ({
        page,
    }) => {
        for (const game of NAV_TARGETS) {
            await page.goto('/')
            // A specimen is an <a data-testid="specimen-card"> whose whole
            // vessel is the link (no separate "Play Now" link). Featured games
            // render twice (hero vitrine + their depth zone); both link to the
            // same URL, so the first match is fine.
            const card = page
                .getByTestId('specimen-card')
                .filter({ hasText: game.title })
                .first()
            await expect(card).toBeVisible()
            await card.click()
            await expect(page).toHaveURL(game.url)
        }
    })

    test('every game page has a working Home link back to the catalog', async ({
        page,
    }) => {
        for (const game of NAV_TARGETS) {
            await page.goto(game.url)
            if (FIELD_PLATE_GAMES.has(game.id)) {
                // Field plates gate the page behind the intro sheet; start
                // the dive to release the header, then follow its catalogue
                // link back home.
                await expect(page.locator('#start-btn')).toBeEnabled({
                    timeout: 10000,
                })
                await page.locator('#start-btn').click()
                await expect(page.locator('#field-sheet')).toBeHidden()
                await page.getByRole('link', { name: '← Catalogue' }).click()
                await expect(page).toHaveURL('/#games')
            } else {
                await page.getByRole('link', { name: 'Home' }).click()
                await expect(page).toHaveURL('/')
            }
            // The depth-zoned catalog is the homepage's landing marker.
            await expect(
                page.getByRole('heading', { name: 'SHALLOW' })
            ).toBeVisible()
        }
    })
})
