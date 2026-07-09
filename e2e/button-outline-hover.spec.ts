import { test, expect } from '@playwright/test'

test.describe('Button outline hover (bug #1 regression)', () => {
    test('outline button uses dark hover text (slate-900), not theme-dependent background', async ({
        page,
    }) => {
        // Bug #1: hover:text-background resolves to --background which is white
        // in :root (light theme), making cyan fill + white text unreadable.
        // The fix uses hover:text-slate-900 (dark text, readable on cyan/teal
        // fill in all themes).
        await page.goto('/tetris')

        // Find an outline button (game pages have several)
        const outlineBtn = page
            .locator('button', { hasText: /start|play|pause|reset/i })
            .first()
        await expect(outlineBtn).toBeVisible()

        const cls = await outlineBtn.getAttribute('class')
        expect(cls).toContain('hover:text-slate-900')
        // Must NOT use --background token (white in light theme = unreadable)
        expect(cls).not.toContain('hover:text-background')
    })
})
