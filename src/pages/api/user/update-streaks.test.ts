import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/pages/api/user/update-streaks'
import { updateAllUserStreaksForUTC } from '@/lib/server/db/queries'

vi.mock('@/lib/server/db/queries', () => ({
    updateAllUserStreaksForUTC: vi.fn(),
}))

describe('POST /api/user/update-streaks', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(updateAllUserStreaksForUTC).mockResolvedValue({
            usersUpdated: 3,
            streaksReset: 1,
        })
    })

    afterEach(() => {
        delete process.env.CRON_SECRET
    })

    it('returns 403 when secret is configured but header is missing', async () => {
        process.env.CRON_SECRET = 'secret-123'

        const request = new Request(
            'http://localhost/api/user/update-streaks',
            {
                method: 'POST',
            }
        )

        const response = await POST({ request, locals: {} } as any)

        expect(response.status).toBe(403)
        await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
        expect(updateAllUserStreaksForUTC).not.toHaveBeenCalled()
    })

    it('returns 403 when secret is configured but header is incorrect', async () => {
        process.env.CRON_SECRET = 'secret-123'

        const request = new Request(
            'http://localhost/api/user/update-streaks',
            {
                method: 'POST',
                headers: {
                    'x-cron-secret': 'wrong-secret',
                },
            }
        )

        const response = await POST({ request, locals: {} } as any)

        expect(response.status).toBe(403)
        await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
        expect(updateAllUserStreaksForUTC).not.toHaveBeenCalled()
    })

    it('runs streak update when secret header is valid', async () => {
        process.env.CRON_SECRET = 'secret-123'

        const request = new Request(
            'http://localhost/api/user/update-streaks',
            {
                method: 'POST',
                headers: {
                    'x-cron-secret': 'secret-123',
                },
            }
        )

        const response = await POST({ request, locals: {} } as any)

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            success: true,
            usersUpdated: 3,
            streaksReset: 1,
        })
        expect(updateAllUserStreaksForUTC).toHaveBeenCalledTimes(1)
    })

    it('returns 401 in development when no secret and no user', async () => {
        delete process.env.CRON_SECRET
        vi.stubEnv('CRON_SECRET', '')

        const request = new Request(
            'http://localhost/api/user/update-streaks',
            {
                method: 'POST',
            }
        )

        const response = await POST({ request, locals: {} } as any)

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({
            error: 'Unauthorized',
        })
        expect(updateAllUserStreaksForUTC).not.toHaveBeenCalled()

        vi.unstubAllEnvs()
    })

    it('allows authenticated user in development when no secret', async () => {
        delete process.env.CRON_SECRET
        vi.stubEnv('CRON_SECRET', '')

        const request = new Request(
            'http://localhost/api/user/update-streaks',
            {
                method: 'POST',
            }
        )

        const response = await POST({
            request,
            locals: { user: { id: 'user-123' } },
        } as any)

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            success: true,
            usersUpdated: 3,
            streaksReset: 1,
        })
        expect(updateAllUserStreaksForUTC).toHaveBeenCalledTimes(1)

        vi.unstubAllEnvs()
    })

    it('returns 500 when streak update throws', async () => {
        process.env.CRON_SECRET = 'secret-123'
        vi.mocked(updateAllUserStreaksForUTC).mockRejectedValue(
            new Error('db failure')
        )

        const request = new Request(
            'http://localhost/api/user/update-streaks',
            {
                method: 'POST',
                headers: {
                    'x-cron-secret': 'secret-123',
                },
            }
        )

        const response = await POST({ request, locals: {} } as any)

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({
            error: 'Internal server error',
        })
    })
})
