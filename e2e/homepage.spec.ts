import { test, expect } from '@playwright/test'
import { HomePage } from './pages/HomePage'

test.describe('Homepage', () => {
    test('renders the catalog landing with navigation', async ({ page }) => {
        const homePage = new HomePage(page)
        await homePage.goto()

        await expect(page).toHaveTitle(/Cetus/)
        await expect(homePage.navigation).toBeVisible()
        await expect(homePage.gamesSection).toBeVisible()
        await expect(
            page.getByRole('heading', { name: 'MINIGAMES' })
        ).toBeVisible()
        await expect(
            page.getByRole('heading', { name: 'OF THE FUTURE' })
        ).toBeVisible()
    })
})
