import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/pages/api/login-rewards/index'
import { getLoginRewardStatusForUser } from '@/lib/services/loginRewardService'

vi.mock('@/lib/services/loginRewardService', () => ({
    getLoginRewardStatusForUser: vi.fn(),
}))

describe('GET /api/login-rewards', () => {
    const mockUser = { id: 'user-123', name: 'Test User' }

    const mockStatus = {
        loginStreak: 3,
        currentCycleDay: 4,
        totalCycles: 0,
        totalConsecutiveDays: 3,
        todayReward: { day: 4, xp: 40 },
        alreadyClaimed: false,
        canClaim: true,
        nextMilestone: null,
        daysUntilMilestone: null,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getLoginRewardStatusForUser).mockResolvedValue(
            mockStatus as any
        )
    })

    it('should return 401 for unauthenticated requests', async () => {
        const locals = { user: null }
        const response = await GET({ locals } as any)

        expect(response.status).toBe(401)
    })

    it('should return login reward status for authenticated user', async () => {
        const locals = { user: mockUser }
        const response = await GET({ locals } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toMatchObject({
            loginStreak: 3,
            currentCycleDay: 4,
            totalCycles: 0,
            alreadyClaimed: false,
            canClaim: true,
        })
    })

    it('should call getLoginRewardStatusForUser with the user id', async () => {
        const locals = { user: mockUser }
        await GET({ locals } as any)

        expect(getLoginRewardStatusForUser).toHaveBeenCalledWith('user-123')
    })

    it('should return 500 on unexpected error', async () => {
        vi.mocked(getLoginRewardStatusForUser).mockRejectedValue(
            new Error('Service unavailable')
        )

        const locals = { user: mockUser }
        const response = await GET({ locals } as any)

        expect(response.status).toBe(500)
    })
})
