import { test, expect } from '@playwright/test'

test.describe('Settings Page', () => {
    test('should redirect to login when not authenticated', async ({
        page,
    }) => {
        await page.goto('/settings')

        // Should redirect to login page with redirect param
        await expect(page).toHaveURL(/\/login\?redirect=.*settings/)
    })

    test('should have correct page title when accessing login redirect', async ({
        page,
    }) => {
        await page.goto('/settings')

        // After redirect, should be on login page
        await expect(page).toHaveTitle(/Login.*Cetus/)
    })
})

test.describe('Settings API', () => {
    test('GET /api/settings should return 401 when not authenticated', async ({
        request,
    }) => {
        const response = await request.get('/api/settings')

        expect(response.status()).toBe(401)

        const body = await response.json()
        expect(body.error).toBe('Unauthorized')
    })

    test('POST /api/settings should return 401 when not authenticated', async ({
        request,
    }) => {
        const response = await request.post('/api/settings', {
            data: {
                email_notifications: true,
            },
        })

        expect(response.status()).toBe(401)

        const body = await response.json()
        expect(body.error).toBe('Unauthorized')
    })
})
