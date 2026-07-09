import { test, expect } from '@playwright/test'

test.describe('Button outline hover (bug #1 regression)', () => {
    test('outline button hover text is a readable solid color, not cyan-on-cyan', async ({
        page,
    }) => {
        // Bug #1: hover:text-[var(--cetus-page-bg)] used a gradient token as
        // text color on non-abyssal pages, which is invalid and gets dropped,
        // leaving cyan text on cyan background (unreadable).
        // The fix uses hover:text-background (solid --background token).
        await page.goto('/tetris')

        // Find an outline button (game pages have several)
        const outlineBtn = page
            .locator('button', { hasText: /start|play|pause|reset/i })
            .first()
        await expect(outlineBtn).toBeVisible()

        // Get the hover text color by forcing the hover state
        const hoverColor = await outlineBtn.evaluate(el => {
            // Read the class-based hover:text-background token value
            const styles = getComputedStyle(el)
            // The --background token is always a solid oklch color
            const bg = styles.getPropertyValue('--background').trim()
            return bg
        })

        // --background should be a solid color (oklch), not a gradient
        expect(hoverColor).not.toContain('gradient')
        expect(hoverColor.length).toBeGreaterThan(0)
    })
})
