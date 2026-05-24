import { test, expect } from '@playwright/test'

test.describe('Authentication System', () => {
    test('should display login page with correct elements', async ({
        page,
    }) => {
        await page.goto('/login')

        await expect(page).toHaveTitle('Login - Cetus Gaming Platform')
        await expect(
            page.getByRole('heading', { name: 'PLAYER LOGIN' })
        ).toBeVisible()
        await expect(
            page.getByText('Access your gaming account with Google')
        ).toBeVisible()

        const googleButton = page.getByRole('button', {
            name: /continue with google/i,
        })
        await expect(googleButton).toHaveCount(1)
        await expect(googleButton).toBeVisible()
        await expect(
            page.getByRole('link', { name: 'Create one with Google' })
        ).toBeVisible()

        await expect(page.locator('input[type="email"]')).toHaveCount(0)
        await expect(page.locator('input[type="password"]')).toHaveCount(0)
        await expect(page.locator('#login-form')).toHaveCount(0)
        await expect(page.getByText('Remember me')).toHaveCount(0)
        await expect(page.getByText('Forgot password?')).toHaveCount(0)
        await expect(
            page.getByRole('button', { name: /login to play/i })
        ).toHaveCount(0)
    })

    test('should display signup page with correct elements', async ({
        page,
    }) => {
        await page.goto('/signup')

        await expect(page).toHaveTitle('Sign Up - Cetus Gaming Platform')
        await expect(
            page.getByRole('heading', { name: 'CREATE ACCOUNT' })
        ).toBeVisible()
        await expect(
            page.getByText('Join Cetus with your Google account')
        ).toBeVisible()

        const googleButton = page.getByRole('button', {
            name: /create account with google/i,
        })
        await expect(googleButton).toHaveCount(1)
        await expect(googleButton).toBeVisible()
        await expect(
            page.getByRole('link', { name: 'Continue with Google' })
        ).toBeVisible()

        await expect(page.locator('input[type="email"]')).toHaveCount(0)
        await expect(page.locator('input[type="password"]')).toHaveCount(0)
        await expect(page.locator('#signup-form')).toHaveCount(0)
        await expect(page.locator('#terms')).toHaveCount(0)
        await expect(page.locator('#confirmPassword')).toHaveCount(0)
        await expect(
            page.getByRole('button', { name: /create account$/i })
        ).toHaveCount(0)
        await expect(page.getByText('Terms of Service')).toHaveCount(0)
        await expect(page.getByText('Privacy Policy')).toHaveCount(0)
    })

    test('should navigate between login and signup pages', async ({ page }) => {
        await page.goto('/login')

        // Navigate to signup
        await page.getByRole('link', { name: 'Create one with Google' }).click()
        await expect(page).toHaveURL('/signup')
        await expect(
            page.getByRole('heading', { name: 'CREATE ACCOUNT' })
        ).toBeVisible()

        // Navigate back to login
        await page.getByRole('link', { name: 'Continue with Google' }).click()
        await expect(page).toHaveURL('/login')
        await expect(
            page.getByRole('heading', { name: 'PLAYER LOGIN' })
        ).toBeVisible()
    })

    test('should have consistent navigation on auth pages', async ({
        page,
    }) => {
        const authPages = ['/login', '/signup']

        for (const authPage of authPages) {
            await page.goto(authPage)

            // Check that main navigation is present
            await expect(
                page.getByRole('link', { name: 'C CETUS' })
            ).toBeVisible()
            await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
            await expect(
                page.getByRole('link', { name: 'Leaderboards' })
            ).toBeVisible()
            await expect(
                page.getByRole('button', { name: 'Login' }).first()
            ).toBeVisible()

            // Footer should be present
            await expect(
                page.getByText(
                    '© 2025 Cetus Games. Built for the future of gaming entertainment.'
                )
            ).toBeVisible()
        }
    })

    test('should navigate to login from homepage', async ({ page }) => {
        await page.goto('/')

        // Click login button in navigation
        await page.getByRole('button', { name: 'Login' }).first().click()
        await expect(page).toHaveURL('/login')
        await expect(
            page.getByRole('heading', { name: 'PLAYER LOGIN' })
        ).toBeVisible()
    })

    test('should navigate to login from game pages', async ({ page }) => {
        const gamePages = ['/tetris', '/quick-math', '/bubble-shooter']

        for (const gamePage of gamePages) {
            await page.goto(gamePage)

            // Click login button
            await page.getByRole('button', { name: 'Login' }).first().click()
            await expect(page).toHaveURL('/login')
            await expect(
                page.getByRole('heading', { name: 'PLAYER LOGIN' })
            ).toBeVisible()
        }
    })

    test('should have working logo navigation from auth pages', async ({
        page,
    }) => {
        const authPages = ['/login', '/signup']

        for (const authPage of authPages) {
            await page.goto(authPage)

            // Navigate home using logo
            await page.getByRole('link', { name: 'C CETUS' }).click()
            await expect(page).toHaveURL('/')
            await expect(
                page.getByRole('heading', { name: 'MINIGAMES' })
            ).toBeVisible()
        }
    })

    test('should maintain login state indicator', async ({ page }) => {
        // Navigate to different pages and verify login button is consistently available
        const pages = ['/', '/tetris', '/quick-math', '/login', '/signup']

        for (const pagePath of pages) {
            await page.goto(pagePath)

            // Login button should be present (indicating user is not logged in)
            await expect(
                page.getByRole('button', { name: 'Login' }).first()
            ).toBeVisible()
        }
    })
})
