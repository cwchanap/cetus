import { test, expect, type Page } from '@playwright/test'
import { signInTestUser } from '../helpers/test-auth'

/**
 * Representative flows for the achievements filter and leaderboard boards
 * islands (HPA-379). Achievements: the island preserves the former
 * hidden-input listener's game/page URL navigation semantics (full page
 * navigation by design). Leaderboard: the island swaps the displayed board
 * purely in React — no page reload and no hidden-class toggling of
 * Astro-owned nodes.
 */

test.describe('Achievements game filter island', () => {
    const waitForIslandsHydrated = (page: Page) =>
        page.waitForFunction(() =>
            [...document.querySelectorAll('astro-island')].every(
                island => !island.hasAttribute('ssr')
            )
        )

    test('navigates with ?game= semantics: page reset for "all", dropped otherwise', async ({
        page,
    }) => {
        await signInTestUser(page)
        await page.goto('/achievements')
        await waitForIslandsHydrated(page)

        const filter = page.locator('#game-filter-select')
        await expect(filter).toBeVisible()
        await expect(filter).toHaveValue('all')
        // "all" is the paginated view (135 achievements, 10 per page).
        await expect(page.locator('a[href*="page="]').first()).toBeVisible()

        // Selecting a concrete board drops the page param.
        await filter.selectOption('global')
        await expect(page).toHaveURL(/\/achievements\?game=global$/)
        // The island hydrates again on the freshly navigated page.
        await waitForIslandsHydrated(page)
        // Global board is small enough to be unpaginated.
        await expect(page.locator('a[href*="page="]')).toHaveCount(0)

        // Back to "all": game=all AND page=1 are both set.
        await filter.selectOption('all')
        await expect(page).toHaveURL(/\/achievements\?game=all&page=1$/)
        await expect(page.locator('a[href*="page="]').first()).toBeVisible()
    })

    test('reloading keeps the selected game from the URL', async ({ page }) => {
        await signInTestUser(page)
        await page.goto('/achievements?game=global')
        await waitForIslandsHydrated(page)

        await expect(page.locator('#game-filter-select')).toHaveValue('global')
    })
})

test.describe('Leaderboard boards island', () => {
    test('switches the displayed board in React without a reload', async ({
        page,
    }) => {
        await page.goto('/leaderboard')
        await page.waitForFunction(() =>
            [...document.querySelectorAll('astro-island')].every(
                island => !island.hasAttribute('ssr')
            )
        )

        const selector = page.locator('#game-selector')
        await expect(selector).toBeVisible()

        // Exactly one board renders (no hidden Astro-owned siblings).
        const defaultGame = await selector.inputValue()
        await expect(page.locator('[data-game-leaderboard]')).toHaveCount(1)
        await expect(page.locator('[data-game-id]')).toHaveCount(1)
        await expect(
            page.locator(`[data-game-id="${defaultGame}"]`)
        ).toBeVisible()

        // Mark the window; if the page reloaded the flag would vanish.
        await page.evaluate(() => {
            ;(
                window as unknown as { __islandNoReload: boolean }
            ).__islandNoReload = true
        })

        const otherGame = await selector
            .locator('option')
            .last()
            .getAttribute('value')
        if (!otherGame) {
            throw new Error('leaderboard selector has no options')
        }
        await selector.selectOption(otherGame)

        await expect(
            page.locator(`[data-game-id="${otherGame}"]`)
        ).toBeVisible()
        await expect(
            page.locator(`[data-game-id="${defaultGame}"]`)
        ).toHaveCount(0)
        expect(
            await page.evaluate(
                () =>
                    (window as unknown as { __islandNoReload?: boolean })
                        .__islandNoReload
            )
        ).toBe(true)
    })

    test('board content reflects the server-fetched data', async ({ page }) => {
        await page.goto('/leaderboard')

        // The header shows the selected game's name and an entries count.
        const heading = page.locator('[data-game-leaderboard] h3')
        await expect(heading).toContainText(/Leaderboard$/)
        await expect(
            page.locator('[data-game-leaderboard]').getByText(/entries/)
        ).toBeVisible()
    })
})
