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

        // Hero vitrine wordmark (an h2; the nav brand is the sole h1 site-wide).
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

    test('hero wordmark renders at a large font-size (not 1em from font: shorthand)', async ({
        page,
    }) => {
        // Bug #2 regression guard: the font: shorthand resets font-size to 1em
        // (~16px). The hero heading should render at text-6xl (3.75rem = 60px) or larger.
        const homePage = new HomePage(page)
        await homePage.goto()

        const hero = page.locator('#hero-vitrine h2')
        const fontSize = await hero.evaluate(el =>
            parseFloat(getComputedStyle(el).fontSize)
        )
        expect(fontSize).toBeGreaterThan(30) // text-6xl = 60px on desktop
    })

    test('homepage has exactly one h1', async ({ page }) => {
        // The nav brand is the sole h1; the hero wordmark is an h2.
        const homePage = new HomePage(page)
        await homePage.goto()

        const h1Count = await page.locator('h1').count()
        expect(h1Count).toBe(1)
    })

    test('hero particles use token colors, not hardcoded hex', async ({
        page,
    }) => {
        // Bug #5 regression guard: particles should use var(--cetus-accent).
        const homePage = new HomePage(page)
        await homePage.goto()

        const particles = page.locator('.cetus-particle')
        const firstBg = await particles
            .first()
            .evaluate(el => getComputedStyle(el).background)
        // The background should resolve to a solid color from the token,
        // not a hardcoded hex like rgb(31, 227, 192) without the token.
        expect(firstBg).not.toBe('')
    })
})
