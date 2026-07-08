import { test, expect } from '@playwright/test'
import { HomePage } from './pages/HomePage'

test.describe('Homepage', () => {
    test('renders the abyssal catalog landing with navigation', async ({
        page,
    }) => {
        const homePage = new HomePage(page)
        await homePage.goto()

        await expect(page).toHaveTitle(/Cetus/)
        await expect(homePage.navigation).toBeVisible()
        await expect(homePage.catalogSection).toBeVisible()

        // Hero vitrine wordmark (scoped to #hero-vitrine to disambiguate from
        // the nav logo's "CETUS" h1).
        await expect(
            page
                .locator('#hero-vitrine')
                .getByRole('heading', { name: 'Cetus' })
        ).toBeVisible()

        // Depth-zoned catalog headers (SHALLOW / MID-WATER / ABYSSAL).
        await expect(
            page.getByRole('heading', { name: 'SHALLOW' })
        ).toBeVisible()
        await expect(
            page.getByRole('heading', { name: 'ABYSSAL' })
        ).toBeVisible()
    })
})
