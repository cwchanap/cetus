import { test, expect } from '@playwright/test'

test.describe('Login Rewards API', () => {
    test('GET /api/login-rewards should return 401 when not authenticated', async ({
        request,
    }) => {
        const response = await request.get('/api/login-rewards')

        expect(response.status()).toBe(401)

        const body = await response.json()
        expect(body.error).toBe('Unauthorized')
    })

    test('POST /api/login-rewards/claim should return 401 when not authenticated', async ({
        request,
    }) => {
        const response = await request.post('/api/login-rewards/claim')

        expect(response.status()).toBe(401)

        const body = await response.json()
        expect(body.error).toBe('Unauthorized')
    })
})

test.describe('Dashboard with Login Rewards', () => {
    test('should redirect to login when accessing dashboard unauthenticated', async ({
        page,
    }) => {
        await page.goto('/dashboard')

        // Should redirect to login page
        await expect(page).toHaveURL(/\/login\?redirect=.*dashboard/)
    })
})
