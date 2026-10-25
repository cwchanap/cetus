import { test, expect, type Page } from '@playwright/test'
import { signInTestUser } from './helpers/test-auth'

/**
 * Authenticated settings-page flows for the SettingsPreferences island
 * (HPA-379). Covers: seeded localStorage preferences mirroring into the
 * hydrated controls after a reload, client preference persistence, and a
 * failed server preference save reverting via React state (route
 * interception — no simulated clicks).
 */

const STORAGE_KEY = 'cetus_preferences'

/** Astro removes the `ssr` attribute from an island exactly when hydration
 * completes; SSR'd attributes would otherwise let pre-hydration assertions
 * and clicks race the island. */
async function waitForIslandsHydrated(page: Page) {
    await page.waitForFunction(
        () =>
            document.querySelectorAll('astro-island').length > 0 &&
            [...document.querySelectorAll('astro-island')].every(
                island => !island.hasAttribute('ssr')
            )
    )
}

test.describe('Settings preferences island (authenticated)', () => {
    test('mirrors seeded localStorage preferences into the controls after reload', async ({
        page,
    }) => {
        await signInTestUser(page)
        await page.goto('/settings')

        // Seed distinct client preferences, then reload so the island
        // hydrates from storage.
        await page.evaluate(
            key =>
                localStorage.setItem(
                    key,
                    JSON.stringify({
                        sound: {
                            masterVolume: 25,
                            sfxVolume: 45,
                            musicVolume: 65,
                            soundEnabled: false,
                        },
                        display: { reducedMotion: true },
                    })
                ),
            STORAGE_KEY
        )
        await page.reload()
        await waitForIslandsHydrated(page)

        await expect(page.locator('#sound-enabled')).toHaveAttribute(
            'aria-checked',
            'false'
        )
        await expect(page.locator('#master-volume')).toHaveValue('25')
        await expect(page.locator('#sfx-volume')).toHaveValue('45')
        await expect(page.locator('#music-volume')).toHaveValue('65')
        await expect(page.locator('#reduced-motion')).toHaveAttribute(
            'aria-checked',
            'true'
        )

        // Disabled sound greys out the volume controls…
        await expect(page.locator('#volume-controls')).toHaveClass(
            /pointer-events-none/
        )
        // …and the stored reduced-motion class is applied to the document.
        await expect(page.locator('html')).toHaveClass(/reduce-motion/)
    })

    test('client preference changes persist to localStorage', async ({
        page,
    }) => {
        await signInTestUser(page)
        await page.goto('/settings')
        await waitForIslandsHydrated(page)

        const soundToggle = page.locator('#sound-enabled')
        await expect(soundToggle).toHaveAttribute('aria-checked', 'true')

        await soundToggle.click()
        await expect(soundToggle).toHaveAttribute('aria-checked', 'false')

        const stored = await page.evaluate(
            key => JSON.parse(localStorage.getItem(key) ?? 'null'),
            STORAGE_KEY
        )
        expect(stored?.sound?.soundEnabled).toBe(false)

        // Slider round-trip: one change lands exactly once.
        const masterVolume = page.locator('#master-volume')
        await masterVolume.fill('35')
        await expect(masterVolume).toHaveValue('35')
        const storedAfterSlider = await page.evaluate(
            key => JSON.parse(localStorage.getItem(key) ?? 'null'),
            STORAGE_KEY
        )
        expect(storedAfterSlider?.sound?.masterVolume).toBe(35)
    })

    test('failed server preference save reverts the switch via React state', async ({
        page,
    }) => {
        await signInTestUser(page)
        // Interception is the clean way to simulate a failed save.
        await page.route('**/api/settings', route =>
            route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Server exploded' }),
            })
        )
        await page.goto('/settings')
        await waitForIslandsHydrated(page)

        const emailToggle = page.locator('#email-notifications')
        await expect(emailToggle).toHaveAttribute('aria-checked', 'true')

        await emailToggle.click()

        // The toast surfaces the server's message (visual failure state)…
        const status = page.locator('#save-status')
        await expect(status).toHaveText('Server exploded')
        await expect(status).not.toHaveAttribute('aria-hidden', 'true')
        // …and the toggle reverts through React state, not a simulated click.
        await expect(emailToggle).toHaveAttribute('aria-checked', 'true')
    })

    test('successful server preference save confirms and keeps the new value', async ({
        page,
    }) => {
        await signInTestUser(page)
        await page.goto('/settings')
        await waitForIslandsHydrated(page)

        const remindersToggle = page.locator('#challenge-reminders')
        await expect(remindersToggle).toHaveAttribute('aria-checked', 'true')

        await remindersToggle.click()

        const status = page.locator('#save-status')
        await expect(status).toHaveText('Saved!')
        await expect(remindersToggle).toHaveAttribute('aria-checked', 'false')
    })
})
