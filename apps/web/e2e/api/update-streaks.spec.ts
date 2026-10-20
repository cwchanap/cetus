import { test, expect } from '@playwright/test'

// Helper to accept multiple expected status codes depending on env/config
function expectStatusOneOf(status: number, allowed: number[]) {
    if (!allowed.includes(status)) {
        throw new Error(
            `Unexpected status ${status}. Expected one of: ${allowed.join(', ')}`
        )
    }
}

test.describe('Update Streaks API', () => {
    test('POST without secret should be blocked (401 or 403)', async ({
        request,
    }) => {
        const res = await request.post('/api/user/update-streaks')
        expectStatusOneOf(res.status(), [401, 403])
        const body = await res.json().catch(() => ({}))
        expect(body).toHaveProperty('error')
    })

    test('POST with wrong secret should be forbidden when CRON_SECRET is set', async ({
        request,
    }) => {
        const res = await request.post('/api/user/update-streaks', {
            headers: { 'x-cron-secret': 'wrong-secret' },
        })
        // If CRON_SECRET is configured on the server, we expect 403.
        // If not configured (dev), the header is ignored and unauthenticated users will get 401.
        expectStatusOneOf(res.status(), [401, 403])
        const body = await res.json().catch(() => ({}))
        expect(body).toHaveProperty('error')
    })

    test('POST with correct secret should succeed when CRON_SECRET is available in env', async ({
        request,
    }) => {
        const cronSecret = process.env.CRON_SECRET
        if (!cronSecret) {
            test.skip(true, 'CRON_SECRET not provided to test environment')
        }

        const res = await request.post('/api/user/update-streaks', {
            headers: { 'x-cron-secret': cronSecret as string },
        })

        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body).toMatchObject({ success: true })
        expect(body).toHaveProperty('processed')
        expect(body).toHaveProperty('incremented')
        expect(body).toHaveProperty('reset')
    })
})
