import { test, expect, type Page } from '@playwright/test'

async function ensureLoggedIn(page: Page): Promise<boolean> {
    await page.goto('/profile')

    if (!page.url().includes('/login')) {
        return true
    }

    await expect(page.getByText('PLAYER LOGIN')).toBeVisible()
    await expect(
        page.getByRole('button', { name: /continue with google/i })
    ).toBeVisible()

    return false
}

test.describe('Profile Activity Graph', () => {
    test('renders contributions grid for current year', async ({ page }) => {
        const loggedIn = await ensureLoggedIn(page)

        // Skip if authentication failed (common in CI without real DB)
        if (!loggedIn || page.url().includes('/login')) {
            test.skip()
            return
        }

        await expect(page).toHaveURL(/\/profile/)

        // Wait for activity cells to appear
        await page.waitForSelector('[data-testid="activity-cell"]', {
            timeout: 20000,
            state: 'attached',
        })
        const cells = page.locator('[data-testid="activity-cell"]')
        const count = await cells.count()
        expect(count).toBeGreaterThan(0)

        // Some month label should be visible
        const monthShort = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
        ]
        let anyMonthVisible = false
        for (const m of monthShort) {
            const el = page.getByText(m).first()
            if (await el.isVisible().catch(() => false)) {
                anyMonthVisible = true
                break
            }
        }
        expect(anyMonthVisible).toBeTruthy()

        // Verify activity cells render with proper styling
        // (not checking for non-zero counts since CI may have no game history)
        const hasStyledCells = await page.evaluate(() => {
            const cells = Array.from(
                document.querySelectorAll('[data-testid="activity-cell"]')
            )
            // Just verify cells have the expected class structure
            return cells.some(el => {
                const cls = el.getAttribute('class') || ''
                // Should have rounded corners and background styling
                return /rounded/.test(cls) && /bg-/.test(cls)
            })
        })
        expect(hasStyledCells).toBeTruthy()
    })

    test('can switch years using prev/next controls', async ({ page }) => {
        const loggedIn = await ensureLoggedIn(page)

        // Skip if authentication failed (common in CI without real DB)
        if (!loggedIn || page.url().includes('/login')) {
            test.skip()
            return
        }

        const currentYear = new Date().getUTCFullYear()

        // Navigate to profile with year param
        await page.goto(`/profile?year=${currentYear}`)

        // Verify we're still authenticated
        if (page.url().includes('/login')) {
            test.skip()
            return
        }

        await expect(page.getByTestId('activity-year')).toHaveText(
            String(currentYear)
        )
        await expect(page).toHaveURL(
            new RegExp(`/profile\\?year=${currentYear}$`)
        )

        // Go to previous year
        await page.click('[data-testid="year-prev"]')
        const prevYear = currentYear - 1

        // Check if we got redirected to login (session expired)
        if (page.url().includes('/login')) {
            test.skip()
            return
        }

        await expect(page.getByTestId('activity-year')).toHaveText(
            String(prevYear)
        )
        await expect(page).toHaveURL(new RegExp(`/profile\\?year=${prevYear}$`))

        // Grid should still render
        await page.waitForSelector('[data-testid="activity-cell"]', {
            timeout: 20000,
        })

        // Next should return to current year
        await page.click('[data-testid="year-next"]')

        if (page.url().includes('/login')) {
            test.skip()
            return
        }

        await expect(page.getByTestId('activity-year')).toHaveText(
            String(currentYear)
        )
        await expect(page).toHaveURL(
            new RegExp(`/profile\\?year=${currentYear}$`)
        )
    })
})
