import { test, expect } from '@playwright/test'

test.describe('Authentication System', () => {
    test('should display login page with correct elements', async ({
        page,
    }) => {
        await page.goto('/login')

        // Check page title and heading
        await expect(page).toHaveTitle('Login - Cetus Gaming Platform')
        await expect(
            page.getByRole('heading', { name: 'PLAYER LOGIN' })
        ).toBeVisible()

        // Check description
        await expect(
            page.getByText('Access your gaming account to continue')
        ).toBeVisible()

        // Check form elements
        await expect(
            page.getByRole('textbox', { name: 'Enter your username or email' })
        ).toBeVisible()
        await expect(
            page.getByRole('textbox', { name: 'Password' })
        ).toBeVisible()
        await expect(
            page.getByRole('checkbox', { name: 'Remember me' })
        ).toBeVisible()

        // Check buttons
        await expect(
            page.getByRole('button', { name: '🚀 Login to Play' })
        ).toBeVisible()
        await expect(
            page.getByRole('button', { name: '🌐 Continue with Google' })
        ).toBeVisible()

        // Check links
        await expect(
            page.getByRole('link', { name: 'Forgot password?' })
        ).toBeVisible()
        await expect(
            page.getByRole('link', { name: 'Sign up here' })
        ).toBeVisible()
    })

    test('should display signup page with correct elements', async ({
        page,
    }) => {
        await page.goto('/signup')

        // Check page title and heading
        await expect(page).toHaveTitle('Sign Up - Cetus Gaming Platform')
        await expect(
            page.getByRole('heading', { name: 'CREATE ACCOUNT' })
        ).toBeVisible()

        // Check description
        await expect(
            page.getByText('Join the future of gaming on Cetus')
        ).toBeVisible()

        // Check form elements
        await expect(
            page.getByRole('textbox', { name: 'Email Address' })
        ).toBeVisible()
        await expect(page.locator('#password')).toBeVisible()
        await expect(page.locator('#confirmPassword')).toBeVisible()
        await expect(
            page.getByRole('checkbox', {
                name: 'I agree to the Terms of Service and Privacy Policy',
            })
        ).toBeVisible()

        // Check buttons
        await expect(
            page.getByRole('button', { name: '🚀 Create Account' })
        ).toBeVisible()
        await expect(
            page.getByRole('button', { name: '🌐 Sign up with Google' })
        ).toBeVisible()

        // Check links
        await expect(
            page.getByRole('link', { name: 'Terms of Service' })
        ).toBeVisible()
        await expect(
            page.getByRole('link', { name: 'Privacy Policy' })
        ).toBeVisible()
        await expect(
            page.getByRole('link', { name: 'Sign in here' })
        ).toBeVisible()
    })

    test('should navigate between login and signup pages', async ({ page }) => {
        await page.goto('/login')

        // Navigate to signup
        await page.getByRole('link', { name: 'Sign up here' }).click()
        await expect(page).toHaveURL('/signup')
        await expect(
            page.getByRole('heading', { name: 'CREATE ACCOUNT' })
        ).toBeVisible()

        // Navigate back to login
        await page.getByRole('link', { name: 'Sign in here' }).click()
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
            await expect(
                page.getByRole('link', { name: 'Games' })
            ).toBeVisible()
            await expect(
                page.getByRole('link', { name: 'About' })
            ).toBeVisible()
            await expect(
                page.getByRole('link', { name: 'Contact' })
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

    test('should validate form fields on login page', async ({ page }) => {
        await page.goto('/login')

        // Try to submit empty form
        await page.getByRole('button', { name: '🚀 Login to Play' }).click()

        // Form should not submit (we can verify this by checking we're still on login page)
        await expect(page).toHaveURL('/login')

        // Check that form fields can be filled
        await page
            .getByRole('textbox', { name: 'Enter your username or email' })
            .fill('test@example.com')
        await page
            .getByRole('textbox', { name: 'Password' })
            .fill('testpassword')

        // Check remember me checkbox
        await page.getByRole('checkbox', { name: 'Remember me' }).check()
        await expect(
            page.getByRole('checkbox', { name: 'Remember me' })
        ).toBeChecked()
    })

    test('should validate form fields on signup page', async ({ page }) => {
        await page.goto('/signup')

        // Check that form fields can be filled
        await page
            .getByRole('textbox', { name: 'Email Address' })
            .fill('newuser@example.com')
        await page
            .getByRole('textbox', { name: 'Password' })
            .fill('newpassword123')
        await page
            .getByRole('textbox', { name: 'Confirm Password' })
            .fill('newpassword123')

        // Check terms checkbox
        await page
            .getByRole('checkbox', {
                name: 'I agree to the Terms of Service and Privacy Policy',
            })
            .check()
        await expect(
            page.getByRole('checkbox', {
                name: 'I agree to the Terms of Service and Privacy Policy',
            })
        ).toBeChecked()
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
