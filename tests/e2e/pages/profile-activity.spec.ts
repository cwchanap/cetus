import { test, expect, type Page } from '@playwright/test'

async function ensureLoggedIn(page: Page) {
    await page.goto('/profile')
    if (page.url().includes('/login')) {
        // Fill using stable IDs
        await page.fill('#email', 'test@test.com')
        await page.fill('#password', 'testtest')
        await page.click('#login-form button[type="submit"]')
        // Give client-side auth time, then proceed
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 })
        } catch {
            // no-op: network may stay busy in dev; we'll proceed
        }
        // If still not authenticated, try creating the account once
        if (page.url().includes('/login')) {
            // If login didn't navigate, attempt to sign up the test user once
            await page.goto('/signup')
            await page.fill('#email', 'test@test.com')
            await page.fill('#password', 'testtest')
            await page.fill('#confirmPassword', 'testtest')
            const terms = page.locator('#terms')
            if (await terms.isVisible()) {
                await terms.check()
            }
            await page.click('#signup-form button[type="submit"]')
            // After signup, navigate to profile
            await page.goto('/profile')
        }
    }
    // Ensure we end up on the profile page
    await page.goto('/profile')
    await page.waitForURL('**/profile')
}

test.describe('Profile Activity Graph', () => {
    test('renders contributions grid for current year', async ({ page }) => {
        await ensureLoggedIn(page)

        await expect(page).toHaveURL(/\/profile\/?$/)

        // At least one activity cell exists (graph grid). Use direct cell wait to avoid container visibility flakiness on some engines.
        await page.waitForSelector('[data-testid="activity-cell"]', {
            timeout: 20000,
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

        // Verify at least one non-zero activity cell is highlighted (cyan background)
        const hasHighlightedNonZero = await page.evaluate(() => {
            const cells = Array.from(
                document.querySelectorAll('[data-testid="activity-cell"]')
            )
            return cells.some(el => {
                const title = el.getAttribute('title') || ''
                const match = title.match(/^(\d+)\s+activit/)
                const count = parseInt(match?.[1] ?? '0', 10)
                if (count <= 0) {
                    return false
                }
                const cls = el.getAttribute('class') || ''
                const bg = getComputedStyle(el).backgroundColor
                // Cyan highlight classes are used for >0 counts
                return /bg-cyan/.test(cls) && bg !== 'rgba(0, 0, 0, 0)'
            })
        })
        expect(hasHighlightedNonZero).toBeTruthy()
    })
})
